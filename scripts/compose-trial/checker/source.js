// A light reading of a candidate file's text: its top-level declarations, its statement starts and its
// imports. Lambdas are parsed properly (lambdas.js); the file as a whole only needs these, so a line scan
// is enough: top-level code starts at column 0, as in every program the references show.

/**
 * @typedef {object} TopDecl
 * @property {string} name
 * @property {number} line
 * @property {string} rhs  the text after `=` on the declaring line
 */

/**
 * @typedef {object} Import
 * @property {string} from
 * @property {number} line
 * @property {Map<string, string>} names  local name → exported name
 */

/**
 * @typedef {object} FileScan
 * @property {Map<string, TopDecl>} decls
 * @property {number[]} statements  the lines (1-based) on which a top-level statement starts
 * @property {Import[]} imports
 */

/**
 * `text` with every comment and the inside of every string blanked to spaces (newlines and offsets kept), so
 * a search does not match text that is not code.
 * @param {string} text
 */
export function blank(text) {
  let out = "";
  for (let i = 0; i < text.length;) {
    const c = text[i], n = text[i + 1];
    if (c === "/" && n === "/") {
      const e = text.indexOf("\n", i);
      const end = e < 0 ? text.length : e;
      out += " ".repeat(end - i);
      i = end;
    } else if (c === "/" && n === "*") {
      const e = text.indexOf("*/", i + 2);
      const end = e < 0 ? text.length : e + 2;
      out += text.slice(i, end).replace(/[^\n]/g, " ");
      i = end;
    } else if (c === '"' || c === "'" || c === "`") {
      let j = i + 1;
      while (j < text.length && text[j] !== c && !(c !== "`" && text[j] === "\n")) j += text[j] === "\\" ? 2 : 1;
      out += c + text.slice(i + 1, j).replace(/[^\n]/g, " ") + (text[j] === c ? c : "");
      i = j + 1;
    } else { out += c; i++; }
  }
  return out;
}

/**
 * The rest of the line where the right-hand side of a declaration begins, skipping line breaks and comments
 * after the `=`.
 * @param {string} text @param {string} code  `text` blanked @param {number} from  the offset just past the `=`
 */
function rhsFrom(text, code, from) {
  let p = from;
  while (p < code.length && /\s/.test(code[p])) p++;
  const e = text.indexOf("\n", p);
  return text.slice(p, e < 0 ? text.length : e);
}

/** The 1-based line holding offset `i`. @param {string} text @param {number} i */
const lineAt = (text, i) => text.slice(0, i).split("\n").length;

/** @param {string} text @returns {FileScan} */
export function scanFile(text) {
  const lines = text.split("\n");
  const code = blank(text);
  let offset = 0;
  const starts = lines.map((l) => { const o = offset; offset += l.length + 1; return o; });
  /** @type {Map<string, TopDecl>} */
  const decls = new Map();
  /** @type {number[]} */
  const statements = [];
  /** @type {Import[]} */
  const imports = [];
  lines.forEach((l, i) => {
    const line = i + 1;
    if (/^[A-Za-z_$]/.test(l)) statements.push(line);
    const d = /^(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=(?!=)/.exec(l);
    if (d) decls.set(d[1], { name: d[1], line, rhs: rhsFrom(text, code, starts[i] + d[0].length) });
    const destructured = /^(?:export\s+)?(?:const|let|var)\s*[{[]([^}\]]*)[}\]]\s*=\s*(.*)$/.exec(l);
    if (destructured) {
      for (const part of destructured[1].split(",")) {
        const name = part.split(":").pop()?.split("=")[0].trim();
        if (name && /^[A-Za-z_$][\w$]*$/.test(name)) decls.set(name, { name, line, rhs: destructured[2] });
      }
    }
  });
  // A match counts only where its keyword is code (not inside a comment or a string).
  /** @param {RegExpMatchArray} m @param {string} kw */
  const isCode = (m, kw) => code.startsWith(kw, (m.index ?? 0) + m[0].indexOf(kw));
  const EXPORT_FROM = /^[ \t]*export\s*(?:\*(?:\s+as\s+[\w$]+)?|\{[^}]*\})\s*from\s*["']([^"']+)["']/gm;
  for (const m of text.matchAll(EXPORT_FROM)) {
    if (isCode(m, "export")) imports.push({ from: m[1], line: lineAt(text, m.index ?? 0), names: new Map() });
  }
  const DYNAMIC = /(?<![\w$.])import\s*\(\s*(["'])([^"']+)\1\s*[,)]/g;
  for (const m of text.matchAll(DYNAMIC)) {
    if (isCode(m, "import")) imports.push({ from: m[2], line: lineAt(text, m.index ?? 0), names: new Map() });
  }
  const IMPORT = /^[ \t]*import\s*(?:\{([^}]*)\}|\*\s+as\s+([\w$]+)|([\w$]+))?\s*(?:from\s*)?["']([^"']+)["']/gm;
  for (const m of text.matchAll(IMPORT)) {
    if (!isCode(m, "import")) continue;
    const line = lineAt(text, m.index ?? 0);
    /** @type {Map<string, string>} */
    const names = new Map();
    for (const spec of (m[1] ?? "").split(",")) {
      const [exported, local] = spec.split(/\s+as\s+/).map((s) => s.trim());
      if (exported) names.set(local ?? exported, exported);
    }
    if (m[2]) names.set(m[2], "*");
    if (m[3]) names.set(m[3], "default");
    imports.push({ from: m[4], line, names });
  }
  return { decls, statements, imports };
}

/**
 * The top-level const a value made at `line` is bound to: the declaration that starts the statement holding
 * that line, if its right-hand side begins with `factory(`.
 * @param {FileScan} scan @param {number} line @param {string} factory
 * @returns {TopDecl | null}
 */
export function bindingAt(scan, line, factory) {
  const start = scan.statements.filter((s) => s <= line).pop();
  if (start === undefined) return null;
  for (const d of scan.decls.values()) if (d.line === start && new RegExp(`^${factory}\\s*\\(`).test(d.rhs)) return d;
  return null;
}

/**
 * The source of the argument list of the first `.method(` call on a line, or null.
 * @param {string} lineText @param {string} method
 */
export function callArgs(lineText, method) {
  const at = lineText.indexOf(`.${method}(`);
  if (at < 0) return null;
  let depth = 0;
  const start = at + method.length + 2;
  for (let i = start - 1; i < lineText.length; i++) {
    const ch = lineText[i];
    if (ch === "(" || ch === "[" || ch === "{") depth++;
    else if (ch === ")" || ch === "]" || ch === "}") { depth--; if (depth === 0) return lineText.slice(start, i); }
  }
  return null;
}
