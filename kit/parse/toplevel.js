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
 * not listed. A name declared twice where one of the two is a `const` or `let` throws a ScanError: a
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
  const s = blank(code);
  /** @type {Set<string>} */
  const names = new Set();
  const params = (/** @type {string} */ list) => { for (const part of splitTopLevel(list)) for (const n of patternNames(part)) names.add(n); };
  for (const m of s.matchAll(DECL)) for (const n of declaredNames(s, (m.index ?? 0) + m[0].length)) names.add(n);
  for (const m of s.matchAll(FUNCTION)) { if (m[1]) names.add(m[1]); params(m[2]); }
  for (const m of s.matchAll(/\(([^()]*)\)\s*=>/g)) params(m[1]);
  for (const m of s.matchAll(ARROW_PARAM)) names.add(m[1]);
  for (const m of s.matchAll(CATCH)) params(m[1]);
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
