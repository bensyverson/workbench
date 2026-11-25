// Finds which runtime lambdas reach outside themselves to a binding the program
// declares at its top level (a helper function, a constant). Those lambdas cannot be
// re-evaluated from `String(fn)` alone: the closure is lost, so the M1 pipeline has to
// handle them separately and parse coverage over them is not like-for-like. A
// Definition API host uses `topLevelNames`, `topLevelBindings` and `buildTimeNames` to
// gather a Program file's module scope (kit/define/README.md, "Module scope"). No Node
// built-ins.
//
// This is a lexical scan, not a parser. It first blanks every comment, string, regex
// literal and template text (keeping a template's `${}` expressions; blank.js, which
// decides where a `/` starts a regex), so what is left is code and brackets at their own
// offsets; the top level is no bracket open, brackets matched by kind. A statement
// without a `;` ends at a line break that the next line cannot continue (the next line
// starts with a name, a string or a number, and the line before does not end in an
// operator or a comma).

import { blank, lineEnds, startsStatement, isNameUnit, ID, IDENT, NOT_AFTER_NAME } from "./blank.js";

export { blank };

/** Each closing bracket's opener. */
const OPENER = /** @type {Record<string, string>} */ ({ ")": "(", "]": "[", "}": "{" });

/**
 * A scan that found a name declared twice at a program's top level where the language allows it once (a
 * `const` or `let` beside another declaration of it). A module cannot declare a `const` twice, so
 * the scan misread the file (or the file does not load): neither declaration can be trusted, and a host that
 * vouches for a helper by its declaration must refuse rather than keep either.
 */
export class ScanError extends Error {
  /** @param {string} name @param {number} line  the 1-based line of the second declaration */
  constructor(name, line) {
    super(`the top-level scan found '${name}' declared twice (again at line ${line}), which a module cannot do: it misread this file, so it vouches for none of its declarations`);
    this.name = "ScanError";
    this.binding = name;
    this.line = line;
  }
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
  /** @type {string[]} */
  const open = [];
  let from = i, eq = -1, j = i;
  for (; j < b.length; j++) {
    const c = b[j];
    if ("([{".includes(c)) open.push(c);
    else if (c in OPENER) { if (!open.length) break; if (open[open.length - 1] === OPENER[c]) open.pop(); }
    else if (open.length) continue;
    else if (c === ";") break;
    else if (c === "\n" && lineEnds(b, j)) break;
    else if (c === ",") { declarators.push({ from, eq, to: j }); from = j + 1; eq = -1; }
    else if (c === "=" && eq < 0 && b[j + 1] !== "=" && b[j + 1] !== ">" && !"=!<>".includes(b[j - 1])) eq = j;
    // `of` / `in` after a binding ends a loop head's declaration; as the binding itself (`const of = 2`) it is a name
    else if (eq < 0 && /\s/.test(b[j - 1] ?? "") && /\S/.test(b.slice(from, j)) && /^(?:of|in)$/.test(b.slice(j, j + 2)) && !isNameUnit(b[j + 2])) break;
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
 * Each declaration keyword at the top level of blanked code (no bracket open), as a token: where it starts and ends.
 * @param {string} b
 * @returns {Array<{ word: string, at: number, end: number }>}
 */
function topLevelKeywords(b) {
  /** @type {Array<{ word: string, at: number, end: number }>} */
  const out = [];
  /** @type {string[]} */
  const open = [];
  for (let j = 0; j < b.length; j++) {
    const c = b[j];
    if ("([{".includes(c)) { open.push(c); continue; }
    // a closer of another kind than the open bracket closes nothing (the scan misread what came before it)
    if (c in OPENER) { if (open[open.length - 1] === OPENER[c]) open.pop(); continue; }
    if (open.length || !isNameUnit(c) || isNameUnit(b[j - 1]) || b[j - 1] === ".") continue;
    const m = /^(?:const|let|var|function)/.exec(b.slice(j, j + 8));
    if (m && !isNameUnit(b[j + m[0].length])) out.push({ word: m[0], at: j, end: j + m[0].length });
    while (j + 1 < b.length && isNameUnit(b[j + 1])) j++;
  }
  return out;
}

/**
 * @typedef {object} Binding
 * @property {string} name
 * @property {"const" | "let"} keyword
 * @property {string} init  The initializer's source text as written, from its first to its last character of code
 *   (comments around it and parens wrapping all of it left out), so an arrow's is what `String(fn)` gives.
 */

/**
 * The initializer between `from` and `to`, from its first to its last character of code in the blanked text `b`
 * (so without the comments around it) and without parens that wrap all of it.
 * @param {string} code @param {string} b @param {number} from @param {number} to
 */
function initText(code, b, from, to) {
  for (;;) {
    while (from < to && /\s/.test(b[from])) from++;
    while (to > from && /\s/.test(b[to - 1])) to--;
    if (b[from] !== "(" || matching(b, from) !== to - 1) return code.slice(from, to);
    from++;
    to--;
  }
}

/**
 * Each plain-named `const` and `let` a program declares at its top level, with its initializer's
 * source. A `const a = 1, b = 2` gives two. Destructuring declarations, `var` and functions are
 * not listed (`topLevelFunctions` lists functions). A name declared twice where one of the two is a `const` or `let` throws a ScanError: a
 * program cannot do that, so the scan misread it, and these initializers vouch for helpers.
 * @param {string} code
 * @returns {Binding[]}
 */
export function topLevelBindings(code) {
  const b = blank(code);
  refuseRedeclared(code, topLevelDecls(b));
  /** @type {Binding[]} */
  const out = [];
  for (const k of topLevelKeywords(b)) {
    if (k.word !== "const" && k.word !== "let") continue;
    for (const d of declaration(b, k.end).declarators) {
      if (d.eq < 0) continue;
      const name = b.slice(d.from, d.eq).trim();
      if (IDENT.test(name)) out.push({ name, keyword: /** @type {"const" | "let"} */ (k.word), init: initText(code, b, d.eq + 1, d.to) });
    }
  }
  return out;
}

/**
 * Each function declaration a program has at its top level, with its whole text from `function` to the closing
 * `}` (`export` before it left out), which is what `String(fn)` gives. A host vouches for a function-declaration
 * helper with it, as it does for an arrow with `topLevelBindings`' `init`. Async functions and generators are
 * listed too (the Definition API refuses them by name). Throws a ScanError as `topLevelBindings` does.
 * @param {string} code
 * @returns {Array<{ name: string, init: string }>}
 */
export function topLevelFunctions(code) {
  const b = blank(code);
  refuseRedeclared(code, topLevelDecls(b));
  /** @type {Array<{ name: string, init: string }>} */
  const out = [];
  for (const k of topLevelKeywords(b)) {
    if (k.word !== "function" || !startsStatement(b, k.at)) continue;
    const f = FN_NAME.exec(b.slice(k.end));
    const open = f ? b.indexOf("(", k.end) : -1;
    const close = open < 0 ? -1 : matching(b, open);
    const brace = close < 0 ? -1 : b.indexOf("{", close);
    if (f && brace >= 0 && /^\s*$/.test(b.slice(close + 1, brace))) out.push({ name: f[1], init: code.slice(k.at, matching(b, brace) + 1) });
  }
  return out;
}

/**
 * A function declaration's text as the arrow function that means the same: `function f(a, b) { … }` is
 * `(a, b) => { … }`. Refused (with its reason) are async functions, generators, a function with no name and
 * text that is no function declaration; whether the body is in the subset is the parser's to say.
 * @param {string} text  a function declaration as `String(fn)` writes it
 * @returns {{ arrow: string } | { error: string }}
 */
export function functionAsArrow(text) {
  const b = blank(text);
  if (/^\s*async\b/.test(b)) return { error: "an async function is not a Runtime Lambda" };
  const m = /^\s*function(?![\p{ID_Continue}$])\s*(\*)?\s*/u.exec(b);
  if (!m) return { error: "the text is not a function declaration" };
  if (m[1]) return { error: "a generator is not a Runtime Lambda" };
  const n = FN_NAME.exec(b.slice(m[0].length));
  if (!n) return { error: "a function declaration needs a name" };
  const open = b.indexOf("(", m[0].length);
  const close = matching(b, open);
  const brace = b.indexOf("{", close);
  if (open < 0 || close >= b.length || brace < 0 || !/^\s*$/.test(b.slice(close + 1, brace)) || matching(b, brace) !== b.trimEnd().length - 1) return { error: "the text is not a function declaration" };
  return { arrow: `${text.slice(open, close + 1)} => ${text.slice(brace, b.trimEnd().length)}` };
}

/**
 * The names a program declares at its top level (no bracket open, however indented): every name a
 * `const`, `let` or `var` binds (destructuring included), and each function declaration's name.
 * Classes and imports are not listed.
 * @param {string} code
 * @returns {string[]}
 */
export function topLevelNames(code) {
  return topLevelDecls(blank(code)).map((d) => d.name);
}

/** A function declaration's name, after its keyword. */
const FN_NAME = new RegExp(`^\\s*\\*?\\s*(${ID})`, "u");

/**
 * Each name the top level of blanked code declares, with the keyword that declares it and where that is.
 * @param {string} b
 * @returns {Array<{ name: string, word: string, at: number }>}
 */
function topLevelDecls(b) {
  /** @type {Array<{ name: string, word: string, at: number }>} */
  const out = [];
  for (const k of topLevelKeywords(b)) {
    if (k.word === "function") {
      if (!startsStatement(b, k.at)) continue;
      const m = FN_NAME.exec(b.slice(k.end));
      if (m) out.push({ name: m[1], word: k.word, at: k.at });
    } else for (const name of declaredNames(b, k.end)) out.push({ name, word: k.word, at: k.at });
  }
  return out;
}

/**
 * Throws a ScanError at the first name declared again where one of its declarations is a `const` or `let`
 * (`var` and function declarations may repeat in a script).
 * @param {string} code @param {Array<{ name: string, word: string, at: number }>} decls
 */
function refuseRedeclared(code, decls) {
  /** @type {Map<string, string[]>} */
  const words = new Map();
  for (const d of decls) {
    const before = words.get(d.name) ?? [];
    if (before.length && [...before, d.word].some((w) => w === "const" || w === "let")) throw new ScanError(d.name, code.slice(0, d.at).split("\n").length);
    words.set(d.name, [...before, d.word]);
  }
}

/** Every name a declaration whose declarators start at `i` binds. @param {string} b @param {number} i */
const declaredNames = (b, i) => declaration(b, i).declarators.flatMap((d) => patternNames(b.slice(d.from, d.eq < 0 ? d.to : d.eq)));

/** Not just after a name character or a `.`, as a `u` regex lookbehind. */
const NOT_AFTER_NAME_OR_DOT = "(?<![\\p{ID_Continue}$\\u200C\\u200D.])";
/** A `const`, `let` or `var` keyword, up to its first declarator. */
const DECL = new RegExp(`${NOT_AFTER_NAME_OR_DOT}(?:const|let|var)\\s+`, "gu");
/** A function's keyword, its name if any and its parameter list (without nested parens). */
const FUNCTION = new RegExp(`${NOT_AFTER_NAME}function(?![\\p{ID_Continue}$])\\s*\\*?\\s*(${ID})?\\s*\\(([^()]*)\\)`, "gu");
/** An arrow's single unparenthesized parameter. */
const ARROW_PARAM = new RegExp(`${NOT_AFTER_NAME_OR_DOT}(${ID})\\s*=>`, "gu");
/** A `catch` clause's parameter. */
const CATCH = new RegExp(`${NOT_AFTER_NAME}catch\\s*\\(([^()]*)\\)`, "gu");
/** Every name. */
const NAME = new RegExp(`${NOT_AFTER_NAME}${ID}`, "gu");

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
  const top = new Set(topLevelNames(code));
  return [...belowTopLevel(code)].filter((n) => !top.has(n));
}

/**
 * The names a file declares at its top level and again in the export's build code (a loop's `k` beside a top-level
 * `k`, a function inside the export that shares a top-level function's name). A lambda's text cannot say which one
 * it reads, and the kit resolves it to the top-level one, so the host passes these and a lambda that reads one is
 * refused. Build code is the export's block body (with the locals, loop and `catch` variables and nested functions'
 * parameters in it) and the methods the file declares; a top-level helper's parameters, a Runtime Lambda's
 * parameters (an arrow in the export's expression, as `.update((p, dt) => …)`) and the export's own parameters
 * are not. Like `buildTimeNames`, it errs toward listing: an arrow inside a block body counts.
 * @param {string} code
 * @returns {string[]}
 */
export function buildTimeShadows(code) {
  const top = new Set(topLevelNames(code));
  return [...buildCodeNames(code)].filter((n) => top.has(n));
}

/** @typedef {{ from: number, to: number }} Extent */

/** The index of the bracket that opens the one that closes at `i`, or -1. @param {string} s @param {number} i */
function matchingBack(s, i) {
  let depth = 0;
  for (let j = i; j >= 0; j--) {
    if (")]}".includes(s[j])) depth++;
    else if ("([{".includes(s[j]) && --depth === 0) return j;
  }
  return -1;
}

/** Where the expression that starts at `i` ends: a `,`, `;` or closing bracket outside its own brackets. @param {string} s @param {number} i */
function expressionEnd(s, i) {
  let depth = 0;
  for (let j = i; j < s.length; j++) {
    if ("([{".includes(s[j])) depth++;
    else if (")]}".includes(s[j])) { if (depth-- === 0) return j; }
    else if (depth === 0 && (s[j] === "," || s[j] === ";")) return j;
  }
  return s.length;
}

/** Words that precede `(…) {` without making a method. */
const NOT_METHOD = new Set(["if", "for", "while", "switch", "catch", "with", "function", "return", "typeof", "new", "else", "do", "await", "yield", "in", "of"]);

/**
 * The names the export's build code and the file's methods declare (see `buildTimeShadows`), in blanked-text terms.
 * @param {string} code
 * @returns {Set<string>}
 */
function buildCodeNames(code) {
  const s = blank(code);
  const atTop = new Set(topLevelKeywords(s).map((k) => k.at));
  /** @type {Array<{ at: number, names: string[], owner?: Extent }>} */
  const found = [];
  /** Every function, arrow and method: the extent of its parameters and body. @type {Extent[]} */
  const functions = [];
  /** @type {Extent[]} */
  const blocks = [];
  /** @type {Extent[]} */
  const arrows = [];
  /** @type {Map<number, Extent>} */
  const exportBlock = new Map();
  const add = (/** @type {number} */ at, /** @type {string[]} */ names, /** @type {Extent | undefined} */ owner = undefined) => found.push({ at, names, owner });
  const params = (/** @type {string} */ list) => splitTopLevel(list).flatMap(patternNames);

  for (const m of s.matchAll(DECL)) if (!atTop.has(m.index ?? 0)) add(m.index ?? 0, declaredNames(s, (m.index ?? 0) + m[0].length));
  for (const m of s.matchAll(new RegExp(`${NOT_AFTER_NAME}catch\\s*\\(`, "gu"))) {
    const open = (m.index ?? 0) + m[0].length - 1;
    add(m.index ?? 0, params(s.slice(open + 1, matching(s, open))));
  }
  for (const m of s.matchAll(new RegExp(`${NOT_AFTER_NAME}function(?![\\p{ID_Continue}$])\\s*\\*?\\s*(${ID})?\\s*\\(`, "gu"))) {
    const at = m.index ?? 0, open = at + m[0].length - 1, close = matching(s, open);
    const brace = s.indexOf("{", close);
    const extent = { from: at, to: brace < 0 ? s.length : matching(s, brace) };
    functions.push(extent);
    if (atTop.has(at)) { add(at, params(s.slice(open + 1, close)), extent); continue; } // a top-level helper's parameters count only if it holds a nested function
    add(at, [...(m[1] ? [m[1]] : []), ...params(s.slice(open + 1, close))], extent);
    blocks.push(extent);
  }
  // methods: `name(params) {` that is not a statement head, a function or a call
  for (const m of s.matchAll(new RegExp(`${NOT_AFTER_NAME}(${ID})\\s*\\(`, "gu"))) {
    const at = m.index ?? 0, open = at + m[0].length - 1;
    if (NOT_METHOD.has(m[1]) || /(?:function\s*\*?|\.)\s*$/.test(s.slice(0, at))) continue;
    const close = matching(s, open), brace = /^\s*\{/.exec(s.slice(close + 1));
    if (!brace) continue;
    const end = matching(s, close + brace[0].length);
    add(at, params(s.slice(open + 1, close)), { from: at, to: end });
    blocks.push({ from: at, to: end });
    functions.push({ from: at, to: end });
  }
  for (let i = s.indexOf("=>"); i >= 0; i = s.indexOf("=>", i + 2)) {
    let j = i - 1;
    while (j >= 0 && /\s/.test(s[j])) j--;
    let from = j, list = "";
    if (s[j] === ")") { from = matchingBack(s, j); list = s.slice(from + 1, j); }
    else { while (from > 0 && isNameUnit(s[from - 1])) from--; list = s.slice(from, j + 1); }
    let k = i + 2;
    while (/\s/.test(s[k] ?? "")) k++;
    const to = s[k] === "{" ? matching(s, k) : expressionEnd(s, k);
    if (from >= 0) { arrows.push({ from, to }); functions.push({ from, to }); add(from, params(list), { from, to }); if (s[k] === "{") exportBlock.set(from, { from: k, to }); }
  }
  // the export: a block body is build code; an expression body is lambdas and builder calls
  const ex = new RegExp(`${NOT_AFTER_NAME}export\\s+default(?![\\p{ID_Continue}$])\\s*`, "u").exec(s);
  if (ex) {
    let i = ex.index + ex[0].length;
    const fn = /^function(?![\p{ID_Continue}$])\s*\*?\s*(?:[\p{ID_Start}$_][\p{ID_Continue}$]*)?\s*\(/u.exec(s.slice(i));
    if (fn) { const brace = s.indexOf("{", matching(s, i + fn[0].length - 1)); if (brace >= 0) blocks.push({ from: brace, to: matching(s, brace) }); }
    else { const a = arrows.find((x) => x.from === i); if (a && exportBlock.has(a.from)) blocks.push(/** @type {Extent} */ (exportBlock.get(a.from))); }
  }
  // a position is build code when the innermost block or free-standing arrow around it is a block
  const free = arrows.filter((a) => !blocks.some((b) => b.from <= a.from && a.to <= b.to));
  const inside = (/** @type {Extent} */ e, /** @type {number} */ at) => e.from <= at && at <= e.to;
  const isBuild = (/** @type {number} */ at) => {
    const block = blocks.filter((b) => inside(b, at)).sort((a, b) => b.from - a.from)[0];
    if (!block) return false;
    const lambda = free.filter((a) => inside(a, at)).sort((a, b) => b.from - a.from)[0];
    return !lambda || lambda.from < block.from;
  };
  /** @type {Set<string>} */
  const names = new Set();
  // a name bound in a function that holds another function is one a Runtime Lambda inside it can read, wherever
  // the function is (a const arrow, an exported name, a build-time callback, an IIFE); the scan cannot tell a
  // Runtime Lambda from a helper callback, so any nested function counts. A binder with none (a lambda's or a
  // helper's own parameter) is harmless: nothing can close over it.
  const holdsFunction = (/** @type {Extent} */ e) => functions.some((f) => f.from > e.from && f.to <= e.to);
  const innermost = (/** @type {number} */ at) => functions.filter((f) => inside(f, at)).sort((a, b) => b.from - a.from)[0];
  for (const f of found) {
    const owner = f.owner ?? innermost(f.at);
    if (isBuild(f.at) || !owner || holdsFunction(owner)) for (const n of f.names) names.add(n);
  }
  return names;
}

/**
 * Every name declared below the top level (a top-level declaration's own name is not one, but its parameters are).
 * @param {string} code
 * @returns {Set<string>}
 */
function belowTopLevel(code) {
  const s = blank(code);
  /** @type {Set<string>} */
  const names = new Set();
  const params = (/** @type {string} */ list) => { for (const part of splitTopLevel(list)) for (const n of patternNames(part)) names.add(n); };
  const atTop = new Set(topLevelKeywords(s).map((k) => k.at));
  for (const m of s.matchAll(DECL)) if (!atTop.has(m.index ?? 0)) for (const n of declaredNames(s, (m.index ?? 0) + m[0].length)) names.add(n);
  for (const m of s.matchAll(FUNCTION)) { if (m[1] && !atTop.has(m.index ?? 0)) names.add(m[1]); params(m[2]); }
  for (const m of s.matchAll(/\(([^()]*)\)\s*=>/g)) params(m[1]);
  for (const m of s.matchAll(ARROW_PARAM)) names.add(m[1]);
  for (const m of s.matchAll(CATCH)) params(m[1]);
  return names;
}

/**
 * The part of `buildTimeNames` the file binds as a `const`, `let` or `var` or a `catch` parameter below its top
 * level, with no parameters or function names: what a lambda may have read as a build-time local although
 * another lambda has a parameter of the same name.
 * @param {string} code
 * @returns {string[]}
 */
export function buildTimeBindings(code) {
  const s = blank(code);
  /** @type {Set<string>} */
  const names = new Set();
  for (const m of s.matchAll(DECL)) for (const n of declaredNames(s, (m.index ?? 0) + m[0].length)) names.add(n);
  for (const m of s.matchAll(CATCH)) for (const part of splitTopLevel(m[1])) for (const n of patternNames(part)) names.add(n);
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
  for (const m of s.matchAll(DECL)) for (const n of declaredNames(s, (m.index ?? 0) + m[0].length)) locals.add(n);
  for (const m of s.matchAll(/\(([^()]*)\)\s*=>/g)) {
    for (const part of splitTopLevel(m[1])) for (const n of patternNames(part)) locals.add(n);
  }
  for (const m of s.matchAll(ARROW_PARAM)) locals.add(m[1]);
  const wanted = new Set(names);
  /** @type {Set<string>} */
  const found = new Set();
  for (const m of s.matchAll(NAME)) {
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
