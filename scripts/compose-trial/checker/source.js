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

/** @param {string} text @returns {FileScan} */
export function scanFile(text) {
  const lines = text.split("\n");
  /** @type {Map<string, TopDecl>} */
  const decls = new Map();
  /** @type {number[]} */
  const statements = [];
  /** @type {Import[]} */
  const imports = [];
  lines.forEach((l, i) => {
    const line = i + 1;
    if (/^[A-Za-z_$]/.test(l)) statements.push(line);
    const d = /^(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(.*)$/.exec(l);
    if (d) decls.set(d[1], { name: d[1], line, rhs: d[2] });
    const destructured = /^(?:export\s+)?(?:const|let|var)\s*[{[]([^}\]]*)[}\]]\s*=\s*(.*)$/.exec(l);
    if (destructured) {
      for (const part of destructured[1].split(",")) {
        const name = part.split(":").pop()?.split("=")[0].trim();
        if (name && /^[A-Za-z_$][\w$]*$/.test(name)) decls.set(name, { name, line, rhs: destructured[2] });
      }
    }
  });
  const IMPORT = /^import\s*(?:\{([^}]*)\}|\*\s+as\s+([\w$]+)|([\w$]+))?\s*(?:from\s*)?["']([^"']+)["']/gm;
  for (const m of text.matchAll(IMPORT)) {
    const line = text.slice(0, m.index).split("\n").length;
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
