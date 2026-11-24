// The lexical layer under toplevel.js's scan: `blank` turns a program's comments, strings, regex literals and
// template text into spaces in place, so what is left is code and brackets at their own offsets. No Node built-ins.
//
// The one hard question a lexer without a parser has is whether a `/` starts a regex literal or is division.
// It is a regex where an expression may start: after an operator, an opening bracket, a comma or a keyword such
// as `return`, and also after a `)` that closes an `if`, `while`, `for` or `with` head and after a `}` that
// closes a block statement (`if (q) {}` then `/x/.test(s)`), but not after one that closes an object literal or
// a function expression's body. So `blank` keeps a stack of the brackets open, by kind, and remembers what each
// closed. Names are Unicode (ID_Start, ID_Continue), and `of` is a keyword only directly inside a `for` head.

/** One name, as source text for a `u` regex. */
export const ID = "[\\p{ID_Start}$_][\\p{ID_Continue}$\\u200C\\u200D]*";
/** A whole string that is one name. */
export const IDENT = new RegExp(`^${ID}$`, "u");
/** Lookbehind: not just after a name character, as a `u` regex. */
export const NOT_AFTER_NAME = "(?<![\\p{ID_Continue}$\\u200C\\u200D])";
/** One UTF-16 unit of a name. A surrogate half counts: outside strings and comments an astral character is a name's. */
const NAME_UNIT = /[\p{ID_Continue}$‌‍\uD800-\uDFFF]/u;
/** One UTF-16 unit a name may start with. */
const NAME_START = /[\p{ID_Start}$_\uD800-\uDFFF]/u;

/** @param {string | undefined} c */
export const isNameUnit = (c) => c !== undefined && NAME_UNIT.test(c);

/** Words after which a `/` starts a regex literal and a `{` an object literal (save `else` and `do`). */
const BEFORE_EXPRESSION = new Set(["return", "typeof", "case", "do", "else", "in", "new", "delete", "void", "throw", "instanceof", "yield", "await"]);
/** Words whose `(…)` is a statement's head, after which a `/` starts a regex. */
const HEADS = new Set(["if", "while", "for", "with"]);

/**
 * An open bracket: `(` (with whether it is a statement head, a `for` head, or a function's parameters and of
 * which kind of function), `[`, `{` (with whether it is a block, after whose `}` a regex may start) or a
 * template's `${`.
 * @typedef {{ kind: "(", head: boolean, forHead: boolean, fn: "decl" | "expr" | null } | { kind: "[" } | { kind: "{", block: boolean } | { kind: "${" }} Bracket
 */

/**
 * The source with every comment, string, regex literal and template literal's text replaced by spaces (a
 * string or regex keeps a `"` at each end, a template a backtick; a template's `${` becomes ` (` and its `}` a
 * `)`), the same length as the source, so an offset into it is an offset into the source. A line break in a
 * block comment is kept.
 * @param {string} src
 */
export function blank(src) {
  const out = /** @type {string[]} */ ([]);
  /** @type {Bracket[]} */
  const stack = [];
  /** The offsets of each `)` and `}` after which a `/` starts a regex. */
  const regexAfter = new Set();
  /** The offset of each `)` that closes a function's parameters, and which kind of function. */
  const fnClose = /** @type {Map<number, "decl" | "expr">} */ (new Map());
  /** @param {number} from @param {number} to @param {string} [ends]  a character for each end */
  const fill = (from, to, ends) => {
    for (let k = from; k < to; k++) out.push(ends && (k === from || k === to - 1) ? ends : "\n\r".includes(src[k]) && !ends ? src[k] : " ");
  };
  /** Template text from `i` (just after a backtick or a `}`) to its next `${` or closing backtick. @param {number} i */
  const templateText = (i) => {
    let j = i;
    while (j < src.length && src[j] !== "`" && !(src[j] === "$" && src[j + 1] === "{")) j += src[j] === "\\" ? 2 : 1;
    for (let k = i; k < Math.min(j, src.length); k++) out.push(" ");
    if (src[j] === "$") { stack.push({ kind: "${" }); out.push(" ", "("); return j + 2; }
    if (j < src.length) out.push("`");
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
    if (c === "/" && regexMayStart(out, stack, regexAfter)) {
      const j = regexEnd(src, i);
      if (j > i) { fill(i, j, '"'); i = j; continue; }
    }
    if (c === "`") { out.push("`"); i = templateText(i + 1); continue; }
    const top = stack[stack.length - 1];
    if (c === "}" && top?.kind === "${") {
      stack.pop();
      out.push(")");
      i = templateText(i + 1);
      continue;
    }
    if (c === "(") stack.push(paren(out));
    else if (c === "[") stack.push({ kind: "[" });
    else if (c === "{") stack.push({ kind: "{", block: braceIsBlock(out, stack, fnClose) });
    else if (c === ")" && top?.kind === "(") {
      stack.pop();
      if (top.head) regexAfter.add(out.length);
      if (top.fn) fnClose.set(out.length, top.fn);
    } else if (c === "]" && top?.kind === "[") stack.pop();
    else if (c === "}" && top?.kind === "{") {
      stack.pop();
      if (top.block) regexAfter.add(out.length);
    }
    // a closer of another kind closes nothing: the scan misread something before it, and a stack keeps the damage local
    out.push(c);
    i++;
  }
  return out.join("").slice(0, src.length);
}

/** The offset of the last character of code before `end` in `out`, or -1. @param {string[]} out @param {number} end */
function lastCode(out, end = out.length) {
  let k = end - 1;
  while (k >= 0 && /\s/.test(out[k])) k--;
  return k;
}

/**
 * The name that ends at `k` in `out` (where `out[k]` is a name unit): the word, and the offset of the last
 * character of code before it.
 * @param {string[]} out @param {number} k
 */
function wordAt(out, k) {
  let w = "";
  while (k >= 0 && isNameUnit(out[k])) w = out[k--] + w;
  return { word: w, before: lastCode(out, k + 1) };
}

/** The word just before the code up to `end`, when it is a name not read as a property (`o.if`), else "". @param {string[]} out @param {number} [end] */
function keywordBefore(out, end = out.length) {
  const k = lastCode(out, end);
  if (k < 0 || !isNameUnit(out[k])) return { word: "", before: k };
  const w = wordAt(out, k);
  return out[w.before] === "." ? { word: "", before: w.before } : w;
}

/** A `(` about to open after the code so far: whether it is a statement head, a `for` head, a function's parameters. @param {string[]} out @returns {Bracket} */
function paren(out) {
  const { word, before } = keywordBefore(out);
  const forAwait = word === "await" && keywordBefore(out, before + 1).word === "for";
  return { kind: "(", head: HEADS.has(word) || forAwait, forHead: word === "for" || forAwait, fn: functionKind(out) };
}

/**
 * Whether the code so far ends in the head of a function, `function`, `function name`, `function*` or
 * `function* name`, and if so whether that function is a declaration (a statement) or an expression.
 * @param {string[]} out @returns {"decl" | "expr" | null}
 */
function functionKind(out) {
  let k = lastCode(out);
  let w = k >= 0 && isNameUnit(out[k]) ? wordAt(out, k) : null;
  if (w && w.word !== "function") { k = w.before; w = null; }
  if (!w) {
    if (out[k] === "*") k = lastCode(out, k);
    if (k < 0 || !isNameUnit(out[k])) return null;
    w = wordAt(out, k);
    if (w.word !== "function") return null;
  }
  if (out[w.before] === ".") return null;
  return statementStartsAt((i) => out[i], k - "function".length + 1) ? "decl" : "expr";
}

/**
 * Whether the `:` at `k` follows a label: a name at the start of a statement (nothing, a `;`, a `{` or a `}`
 * before it), as in `l: {`, not `k ? x : {` or `case x:`.
 * @param {string[]} out @param {number} k
 */
function isLabel(out, k) {
  const e = lastCode(out, k);
  if (e < 0 || !isNameUnit(out[e])) return false;
  const { before } = wordAt(out, e);
  return before < 0 || ";{}".includes(out[before]);
}

/**
 * Whether a `{` after the code so far opens a block (a statement's, a function's or a class's body), after whose
 * `}` a regex may start, rather than an object literal or a function expression's body.
 * @param {string[]} out @param {Bracket[]} stack @param {Map<number, "decl" | "expr">} fnClose
 */
function braceIsBlock(out, stack, fnClose) {
  const k = lastCode(out);
  if (k < 0) return true;
  const p = out[k];
  if (p === ")") return fnClose.get(k) !== "expr";
  if (p === ">" && out[k - 1] === "=") return true; // an arrow's body: an arrow is never an operand of `/`
  if (";{}\"`]".includes(p)) return true;
  if (p === ":") {
    const top = stack[stack.length - 1];
    if (top === undefined) return isLabel(out, k); // a top-level `l: {`, not a ternary's `: {`
    return top.kind === "{" && top.block; // `case 1: {` or a label in a block, not `{ a: {`
  }
  if (isNameUnit(p)) {
    const { word } = wordAt(out, k);
    if (word === "of") return false; // `for (x of {…})`; `of {` is no statement
    return !BEFORE_EXPRESSION.has(word) || word === "else" || word === "do";
  }
  return false;
}

/**
 * Whether a `/` after the code so far starts a regex literal.
 * @param {string[]} out @param {Bracket[]} stack @param {Set<number>} regexAfter
 */
function regexMayStart(out, stack, regexAfter) {
  const k = lastCode(out);
  if (k < 0) return true;
  const p = out[k];
  if (isNameUnit(p)) {
    const { word, before } = wordAt(out, k);
    if (out[before] === ".") return false; // `o.typeof / 2`: a keyword as a property name is a value
    const top = stack[stack.length - 1];
    if (word === "of") return top?.kind === "(" && top.forHead; // `of` is a keyword only in a for head
    return BEFORE_EXPRESSION.has(word);
  }
  if ((p === "+" || p === "-") && out[k - 1] === p) return false; // `i++ / 2`: a postfix operator ends a value
  if (p === ")" || p === "}") return regexAfter.has(k);
  return !"]\"`".includes(p);
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
      while (j < s.length && isNameUnit(s[j])) j++;
      return j;
    }
  }
  return i;
}

/**
 * Whether the line break at `j` in blanked code ends a statement: the next line starts with a name, a string or
 * a number (not a template, which would make a tagged template, nor an operator or a bracket), and the code
 * before the break does not end in an operator, a comma or an opening bracket.
 * @param {string} b @param {number} j
 */
export function lineEnds(b, j) {
  let n = j + 1;
  while (n < b.length && /\s/.test(b[n])) n++;
  const next = b[n] ?? "";
  // `++` and `--` after a line break are prefix operators, a restricted production: the statement before ends
  const prefixStep = (next === "+" || next === "-") && b[n + 1] === next;
  if (!prefixStep && !NAME_START.test(next) && next !== '"' && !/[0-9]/.test(next)) return false;
  let p = j - 1;
  while (p >= 0 && /\s/.test(b[p])) p--;
  if (prefixStep && p > 0 && (b[p] === "+" || b[p] === "-") && b[p - 1] === b[p]) return true; // `i++` ends a value
  return p < 0 || !/[=+\-*/%&|^!?:<>,.([{~]/.test(b[p]);
}

/**
 * Whether a `function` keyword at `at` starts a statement (a declaration), not a function expression: nothing
 * but `export`, `default`, `async`, a `;`, a `{`, a `}` or a statement-ending line break comes before it.
 * @param {string} b @param {number} at
 */
export function startsStatement(b, at) {
  return statementStartsAt((i) => b[i], at);
}

/**
 * startsStatement over a reader of single characters, so `blank` can ask of its output array without joining
 * it: only the text just before `at` is read.
 * @param {(i: number) => string} ch @param {number} at
 */
function statementStartsAt(ch, at) {
  let p = at - 1;
  for (;;) {
    while (p >= 0 && /[ \t]/.test(ch(p))) p--;
    if (p < 0 || ch(p) === ";" || ch(p) === "}" || ch(p) === "{") return true;
    if (ch(p) === "\n" || ch(p) === "\r") {
      while (p >= 0 && /\s/.test(ch(p))) p--;
      return p < 0 || !/[=+\-*/%&|^!?:<>,.([~]/.test(ch(p)); // a line break ends the statement before, as lineEnds has it
    }
    const from = Math.max(0, p - 6); // the longest of the three words is 7 characters
    const w = /(?:export|default|async)$/.exec(Array.from({ length: p + 1 - from }, (_, q) => ch(from + q)).join(""));
    if (!w || isNameUnit(ch(p - w[0].length))) return false;
    p -= w[0].length;
  }
}
