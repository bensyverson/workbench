// Finds which runtime lambdas reach outside themselves to a binding the program
// declares at its top level (a helper function, a constant). Those lambdas cannot be
// re-evaluated from `String(fn)` alone: the closure is lost, so the M1 pipeline has to
// handle them separately and parse coverage over them is not like-for-like. A
// Definition API host uses `topLevelNames`, `topLevelBindings` and `buildTimeNames` to
// gather a Program file's module scope (kit/define/README.md, "Module scope"). No Node
// built-ins.
//
// This is a lexical scan, not a parser. It first blanks every comment, string, regex
// literal and template text (keeping a template's `${}` expressions), so what is left is
// code and brackets at their own offsets; the top level is bracket depth 0. A statement
// without a `;` ends at a line break that the next line cannot continue (the next line
// starts with a name, and the line before does not end in an operator or a comma). A
// `/` starts a regex literal where an expression may start (after an operator, an
// opening bracket, a comma or a keyword such as `return`), else it is division.

const IDENT = /^[A-Za-z_$][\w$]*$/;
/** Words after which a `/` starts a regex literal, not a division. */
const BEFORE_REGEX = new Set(["return", "typeof", "case", "do", "else", "in", "of", "new", "delete", "void", "throw", "instanceof", "yield", "await"]);

/**
 * The source with every comment, string, regex literal and template literal's text replaced by spaces (a
 * string or regex keeps a `"` at each end; a template's `${` becomes ` (` and its `}` a `)`), the same length as
 * the source, so an offset into it is an offset into the source. A line break in a block comment is kept.
 * @param {string} src
 */
export function blank(src) {
  const out = /** @type {string[]} */ ([]);
  /** @type {number[]} */
  const templateDepth = []; // the brace depth at which each open `${` was entered
  let depth = 0;
  /** @param {number} from @param {number} to @param {string} [ends]  a character for each end */
  const fill = (from, to, ends) => {
    for (let k = from; k < to; k++) out.push(ends && (k === from || k === to - 1) ? ends : "\n\r".includes(src[k]) && !ends ? src[k] : " ");
  };
  /** Template text from `i` (just after a backtick or a `}`) to its next `${` or closing backtick. @param {number} i */
  const templateText = (i) => {
    let j = i;
    while (j < src.length && src[j] !== "`" && !(src[j] === "$" && src[j + 1] === "{")) j += src[j] === "\\" ? 2 : 1;
    for (let k = i; k < Math.min(j, src.length); k++) out.push(" ");
    if (src[j] === "$") { templateDepth.push(depth); out.push(" ", "("); return j + 2; }
    if (j < src.length) out.push('"');
    return j + 1;
  };
  let i = 0;
  while (i < src.length) {
    const c = src[i], d = src[i + 1];
    if (c === "/" && d === "/") { let j = i; while (j < src.length && src[j] !== "\n") j++; fill(i, j); i = j; continue; }
    if (c === "/" && d === "*") { const e = src.indexOf("*/", i + 2); const j = e < 0 ? src.length : e + 2; fill(i, j); i = j; continue; }
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < src.length && src[j] !== c && src[j] !== "\n") j += src[j] === "\\" ? 2 : 1;
      j = src[j] === c ? j + 1 : Math.min(j, src.length); // an unclosed string ends at its line
      fill(i, j, '"');
      i = j;
      continue;
    }
    if (c === "/" && regexMayStart(out)) {
      const j = regexEnd(src, i);
      if (j > i) { fill(i, j, '"'); i = j; continue; }
    }
    if (c === "`") { out.push('"'); i = templateText(i + 1); continue; }
    if (c === "}" && templateDepth.length && templateDepth[templateDepth.length - 1] === depth) {
      templateDepth.pop();
      out.push(")");
      i = templateText(i + 1);
      continue;
    }
    if (c === "{") depth++;
    if (c === "}") depth--;
    out.push(c);
    i++;
  }
  return out.join("").slice(0, src.length);
}

/** Whether a `/` after the code so far starts a regex literal. @param {string[]} out */
function regexMayStart(out) {
  let k = out.length - 1;
  while (k >= 0 && /\s/.test(out[k])) k--;
  if (k < 0) return true;
  const p = out[k];
  if (/[\w$]/.test(p)) {
    let w = "";
    while (k >= 0 && /[\w$]/.test(out[k])) w = out[k--] + w;
    return BEFORE_REGEX.has(w);
  }
  return !")]}\"".includes(p);
}

/**
 * The offset after the regex literal (and its flags) that starts at `i`, or `i` when no regex closes on its line.
 * @param {string} s @param {number} i
 */
function regexEnd(s, i) {
  let inClass = false;
  for (let j = i + 1; j < s.length; j++) {
    const c = s[j];
    if (c === "\n") return i;
    if (c === "\\") { j++; continue; }
    if (c === "[") inClass = true;
    else if (c === "]") inClass = false;
    else if (c === "/" && !inClass) {
      j++;
      while (j < s.length && /[\w$]/.test(s[j])) j++;
      return j;
    }
  }
  return i;
}

/**
 * Whether the line break at `j` in blanked code ends a statement: the next line starts with a name, and the
 * code before the break does not end in an operator, a comma or an opening bracket.
 * @param {string} b @param {number} j
 */
function lineEnds(b, j) {
  let n = j + 1;
  while (n < b.length && /\s/.test(b[n])) n++;
  if (!/[A-Za-z_$]/.test(b[n] ?? "")) return false;
  let p = j - 1;
  while (p >= 0 && /\s/.test(b[p])) p--;
  return p < 0 || !/[=+\-*/%&|^!?:<>,.([{~]/.test(b[p]);
}

/**
 * The declaration whose declarators start at `i` in blanked code (just after `const`, `let` or `var`): each
 * declarator's text range and where its initializer starts, and where the declaration ends (a `;`, a closing
 * bracket, a statement-ending line break, or `of` / `in` in a loop head, at its own bracket depth).
 * @param {string} b @param {number} i
 * @returns {{ declarators: Array<{ from: number, eq: number, to: number }>, end: number }}
 */
function declaration(b, i) {
  /** @type {Array<{ from: number, eq: number, to: number }>} */
  const declarators = [];
  let depth = 0, from = i, eq = -1, j = i;
  for (; j < b.length; j++) {
    const c = b[j];
    if ("([{".includes(c)) depth++;
    else if (")]}".includes(c)) { if (depth === 0) break; depth--; }
    else if (depth > 0) continue;
    else if (c === ";") break;
    else if (c === "\n" && lineEnds(b, j)) break;
    else if (c === ",") { declarators.push({ from, eq, to: j }); from = j + 1; eq = -1; }
    else if (c === "=" && eq < 0 && b[j + 1] !== "=" && b[j + 1] !== ">" && !"=!<>".includes(b[j - 1])) eq = j;
    else if (eq < 0 && /\s/.test(b[j - 1] ?? "") && /^(?:of|in)(?![\w$])/.test(b.slice(j, j + 3))) break;
  }
  declarators.push({ from, eq, to: j });
  return { declarators, end: j };
}

/**
 * The names a binding pattern binds: a name, or an object or array pattern with rest elements, renamed keys
 * and defaults (a default's value binds nothing).
 * @param {string} p  blanked pattern text
 * @returns {string[]}
 */
export function patternNames(p) {
  const s = p.trim();
  if (s.startsWith("...")) return patternNames(s.slice(3));
  if (s.startsWith("{") || s.startsWith("[")) {
    const close = matching(s, 0);
    const inner = s.slice(1, close);
    const parts = splitTopLevel(inner).map((x) => x.trim()).filter(Boolean);
    if (s[0] === "[") return parts.flatMap(patternNames);
    return parts.flatMap((part) => {
      if (part.startsWith("...")) return patternNames(part);
      const colon = indexAtDepth0(part, ":");
      return patternNames(colon < 0 ? part : part.slice(colon + 1));
    });
  }
  const eq = indexAtDepth0(s, "=");
  const name = (eq < 0 ? s : s.slice(0, eq)).trim();
  return IDENT.test(name) ? [name] : [];
}

/** The index of the bracket that closes the one at `i`. @param {string} s @param {number} i */
function matching(s, i) {
  let depth = 0;
  for (let j = i; j < s.length; j++) {
    if ("([{".includes(s[j])) depth++;
    else if (")]}".includes(s[j]) && --depth === 0) return j;
  }
  return s.length;
}

/** The first index of `ch` outside brackets, or -1. @param {string} s @param {string} ch */
function indexAtDepth0(s, ch) {
  let depth = 0;
  for (let j = 0; j < s.length; j++) {
    if ("([{".includes(s[j])) depth++;
    else if (")]}".includes(s[j])) depth--;
    else if (depth === 0 && s[j] === ch) return j;
  }
  return -1;
}

/**
 * Each declaration keyword at bracket depth 0 of blanked code, as a token: where it starts and ends.
 * @param {string} b
 * @returns {Array<{ word: string, at: number, end: number }>}
 */
function topLevelKeywords(b) {
  /** @type {Array<{ word: string, at: number, end: number }>} */
  const out = [];
  let depth = 0;
  for (let j = 0; j < b.length; j++) {
    const c = b[j];
    if ("([{".includes(c)) { depth++; continue; }
    if (")]}".includes(c)) { depth--; continue; }
    if (depth !== 0 || !/[a-z]/.test(c) || /[\w$.]/.test(b[j - 1] ?? "")) continue;
    const m = /^(?:const|let|var|function)(?![\w$])/.exec(b.slice(j, j + 9));
    if (m) out.push({ word: m[0], at: j, end: j + m[0].length });
    while (j + 1 < b.length && /[\w$]/.test(b[j + 1])) j++;
  }
  return out;
}

/**
 * Whether a `function` keyword at `at` starts a statement (a declaration), not a function expression: nothing
 * but `export`, `default`, `async`, a `;`, a `}` or a statement-ending line break comes before it.
 * @param {string} b @param {number} at
 */
function startsStatement(b, at) {
  let p = at - 1;
  for (;;) {
    while (p >= 0 && /[ \t]/.test(b[p])) p--;
    if (p < 0 || b[p] === ";" || b[p] === "}") return true;
    if (b[p] === "\n" || b[p] === "\r") return lineEnds(b, p) || !/\S/.test(b.slice(0, p));
    const w = /(?:export|default|async)$/.exec(b.slice(Math.max(0, p - 6), p + 1));
    if (!w || /[\w$]/.test(b[p - w[0].length] ?? "")) return false;
    p -= w[0].length;
  }
}

/**
 * @typedef {object} Binding
 * @property {string} name
 * @property {"const" | "let"} keyword
 * @property {string} init  The initializer's source text, exactly as written.
 */

/**
 * Each plain-named `const` and `let` a program declares at its top level, with its initializer's
 * source. A `const a = 1, b = 2` gives two. Destructuring declarations, `var` and functions are
 * not listed.
 * @param {string} code
 * @returns {Binding[]}
 */
export function topLevelBindings(code) {
  const b = blank(code);
  /** @type {Binding[]} */
  const out = [];
  for (const k of topLevelKeywords(b)) {
    if (k.word !== "const" && k.word !== "let") continue;
    for (const d of declaration(b, k.end).declarators) {
      if (d.eq < 0) continue;
      const name = b.slice(d.from, d.eq).trim();
      if (IDENT.test(name)) out.push({ name, keyword: /** @type {"const" | "let"} */ (k.word), init: code.slice(d.eq + 1, d.to).trim() });
    }
  }
  return out;
}

/**
 * The names a program declares at its top level (bracket depth 0, however indented): every name a
 * `const`, `let` or `var` binds (destructuring included), and each function declaration's name.
 * Classes and imports are not listed.
 * @param {string} code
 * @returns {string[]}
 */
export function topLevelNames(code) {
  const b = blank(code);
  /** @type {string[]} */
  const names = [];
  for (const k of topLevelKeywords(b)) {
    if (k.word === "function") {
      if (!startsStatement(b, k.at)) continue;
      const m = /^\s*\*?\s*([A-Za-z_$][\w$]*)/.exec(b.slice(k.end));
      if (m) names.push(m[1]);
    } else names.push(...declaredNames(b, k.end));
  }
  return names;
}

/** Every name a declaration whose declarators start at `i` binds. @param {string} b @param {number} i */
const declaredNames = (b, i) => declaration(b, i).declarators.flatMap((d) => patternNames(b.slice(d.from, d.eq < 0 ? d.to : d.eq)));

/**
 * The names a program declares only below its top level: `const`/`let`/`var` inside a block or function,
 * function names and parameters, arrow parameters, loop and `catch` variables. A Definition API host passes
 * them to the builder, so a Runtime Lambda that reads one (a closure over a build-time local) is told that it
 * cannot see it, rather than that the name is unknown. Like the rest of this scan it errs toward listing: a
 * name declared only inside another lambda is listed too.
 * @param {string} code
 * @returns {string[]}
 */
export function buildTimeNames(code) {
  const s = blank(code);
  /** @type {Set<string>} */
  const names = new Set();
  const params = (/** @type {string} */ list) => { for (const part of splitTopLevel(list)) for (const n of patternNames(part)) names.add(n); };
  for (const m of s.matchAll(/(?<![\w$.])(?:const|let|var)\s+/g)) for (const n of declaredNames(s, (m.index ?? 0) + m[0].length)) names.add(n);
  for (const m of s.matchAll(/\bfunction\b\s*\*?\s*([A-Za-z_$][\w$]*)?\s*\(([^()]*)\)/g)) { if (m[1]) names.add(m[1]); params(m[2]); }
  for (const m of s.matchAll(/\(([^()]*)\)\s*=>/g)) params(m[1]);
  for (const m of s.matchAll(/(?<![\w$.])([A-Za-z_$][\w$]*)\s*=>/g)) names.add(m[1]);
  for (const m of s.matchAll(/\bcatch\s*\(([^()]*)\)/g)) params(m[1]);
  const top = new Set(topLevelNames(code));
  return [...names].filter((n) => !top.has(n));
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
  const s = blank(src);
  /** @type {Set<string>} */
  const locals = new Set();
  for (const m of s.matchAll(/(?<![\w$.])(?:const|let|var)\s+/g)) for (const n of declaredNames(s, (m.index ?? 0) + m[0].length)) locals.add(n);
  for (const m of s.matchAll(/\(([^()]*)\)\s*=>/g)) {
    for (const part of splitTopLevel(m[1])) for (const n of patternNames(part)) locals.add(n);
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
