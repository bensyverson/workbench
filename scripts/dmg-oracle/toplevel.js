// Finds which runtime lambdas reach outside themselves to a binding the program
// declares at its top level (a helper function, a constant). Those lambdas cannot be
// re-evaluated from `String(fn)` alone: the closure is lost, so the M1 pipeline has to
// handle them separately and parse coverage over them is not like-for-like.
//
// This is a lexical scan, not a parser, and it errs toward flagging: it can report a
// reference that is really a shadowing local, never miss a real one it can see. The
// flat local scope means a parameter of an inner arrow hides a same-named top-level
// binding everywhere in the lambda (a possible miss, not seen in the 22 presets).

const IDENT = /[A-Za-z_$][\w$]*/y;

/**
 * Replaces comments and string/regex-free literal text with spaces, keeping `${}` expressions
 * of template literals, so identifiers inside strings are never read as references.
 * @param {string} src
 */
function stripLiterals(src) {
  let out = "";
  /** @type {number[]} */
  const templateDepth = []; // brace depth at which each open `${` was entered
  let depth = 0;
  for (let i = 0; i < src.length; i++) {
    const c = src[i], d = src[i + 1];
    if (c === "/" && d === "/") { while (i < src.length && src[i] !== "\n") i++; out += "\n"; continue; }
    if (c === "/" && d === "*") { const e = src.indexOf("*/", i + 2); i = e < 0 ? src.length : e + 1; out += " "; continue; }
    if (c === '"' || c === "'") {
      i++;
      while (i < src.length && src[i] !== c) { if (src[i] === "\\") i++; i++; }
      out += '""';
      continue;
    }
    if (c === "`" || (c === "}" && templateDepth.length && templateDepth[templateDepth.length - 1] === depth)) {
      if (c === "}") templateDepth.pop();
      i++;
      while (i < src.length && src[i] !== "`" && !(src[i] === "$" && src[i + 1] === "{")) { if (src[i] === "\\") i++; i++; }
      if (src[i] === "$") { templateDepth.push(depth); out += " ( "; i++; } else out += " ";
      continue;
    }
    if (c === "{") depth++;
    if (c === "}") depth--;
    out += c;
  }
  return out;
}

/**
 * The identifiers a binding pattern declares, starting at `i` in `s`: a plain name, or a
 * balanced `[...]` / `{...}` pattern (object keys before `:` are not bindings).
 * @param {string} s
 * @param {number} i
 * @returns {{ names: string[], end: number }}
 */
function bindingAt(s, i) {
  while (/\s/.test(s[i] ?? "")) i++;
  IDENT.lastIndex = i;
  const plain = IDENT.exec(s);
  if (plain) return { names: [plain[0]], end: i + plain[0].length };
  if (s[i] !== "[" && s[i] !== "{") return { names: [], end: i };
  let depth = 0, j = i;
  for (; j < s.length; j++) {
    if ("[{(".includes(s[j])) depth++;
    else if ("]})".includes(s[j])) { depth--; if (depth === 0) { j++; break; } }
  }
  const inner = s.slice(i, j);
  const names = [...inner.matchAll(/(?<![\w$.])([A-Za-z_$][\w$]*)(?![\w$])(?!\s*:)/g)].map((m) => m[1]);
  return { names, end: j };
}

/**
 * Every name a declaration statement starting after its keyword at `i` binds, including
 * later declarators (`let a = 1, b = 2`). Stops at `;` or a closing bracket at depth 0.
 * @param {string} s
 * @param {number} i
 */
function declaredNames(s, i) {
  const first = bindingAt(s, i);
  const names = [...first.names];
  let depth = 0;
  for (let j = first.end; j < s.length; j++) {
    const c = s[j];
    if ("([{".includes(c)) depth++;
    else if (")]}".includes(c)) { if (depth === 0) break; depth--; }
    else if (c === ";" && depth === 0) break;
    else if (c === "," && depth === 0) { const b = bindingAt(s, j + 1); names.push(...b.names); j = Math.max(j, b.end - 1); }
    else if (depth === 0 && /\b(?:of|in)\b/.test(s.slice(j, j + 3)) && /\s/.test(s[j - 1] ?? "")) break;
  }
  return names;
}

/**
 * The names a program declares at its top level (column 0): const, let, var and function.
 * @param {string} code
 * @returns {string[]}
 */
export function topLevelNames(code) {
  const s = stripLiterals(code);
  /** @type {string[]} */
  const names = [];
  for (const m of s.matchAll(/^(?:export\s+)?(?:async\s+)?(const|let|var|function\*?)\s+/gm)) {
    const at = (m.index ?? 0) + m[0].length;
    if (m[1].startsWith("function")) names.push(...bindingAt(s, at).names);
    else names.push(...declaredNames(s, at));
  }
  return names;
}

/**
 * Which of `names` the lambda source `src` refers to, in the order `names` lists them.
 * Property names (`self.cell`), object keys (`{ cell: 1 }`), text in strings and comments, and
 * names the lambda itself declares (parameters, let/const/var, loop variables) do not count.
 * @param {string} src
 * @param {string[]} names
 * @returns {string[]}
 */
export function topLevelRefs(src, names) {
  const s = stripLiterals(src);
  /** @type {Set<string>} */
  const locals = new Set();
  for (const m of s.matchAll(/\b(?:const|let|var)\s+/g)) for (const n of declaredNames(s, (m.index ?? 0) + m[0].length)) locals.add(n);
  for (const m of s.matchAll(/\(([^()]*)\)\s*=>/g)) {
    for (const part of splitTopLevel(m[1])) for (const n of bindingAt(part, 0).names) locals.add(n);
  }
  for (const m of s.matchAll(/(?<![\w$.])([A-Za-z_$][\w$]*)\s*=>/g)) locals.add(m[1]);
  const wanted = new Set(names);
  /** @type {Set<string>} */
  const found = new Set();
  for (const m of s.matchAll(/(?<![\w$])[A-Za-z_$][\w$]*/g)) {
    const id = m[0], at = m.index ?? 0;
    if (!wanted.has(id) || locals.has(id)) continue;
    const before = s.slice(0, at).trimEnd();
    if (before.endsWith(".") && !before.endsWith("...")) continue; // member access
    if (/^\s*:/.test(s.slice(at + id.length)) && /[{,]$/.test(before)) continue; // object key
    found.add(id);
  }
  return names.filter((n, i) => found.has(n) && names.indexOf(n) === i);
}

/**
 * Splits on commas outside brackets.
 * @param {string} s
 */
function splitTopLevel(s) {
  /** @type {string[]} */
  const parts = [];
  let depth = 0, from = 0;
  for (let i = 0; i < s.length; i++) {
    if ("([{".includes(s[i])) depth++;
    else if (")]}".includes(s[i])) depth--;
    else if (s[i] === "," && depth === 0) { parts.push(s.slice(from, i)); from = i + 1; }
  }
  parts.push(s.slice(from));
  return parts;
}
