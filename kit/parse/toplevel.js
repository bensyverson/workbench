// Finds which runtime lambdas reach outside themselves to a binding the program declares at its top level (a helper
// function, a constant). Those lambdas cannot be re-evaluated from `String(fn)` alone: the closure is lost, so the
// M1 pipeline has to handle them separately and parse coverage over them is not like-for-like. A Definition API host
// uses `topLevelNames`, `topLevelBindings` and `buildTimeNames` to gather a Program file's module scope
// (kit/define/README.md, "Module scope"). No Node built-ins.
//
// The file is parsed as an ES module (module.js, the vendored acorn) and read from its syntax tree. A file that
// does not parse is a ScanError: a host must not vouch for a declaration it could not read, and a module that does
// not parse does not load either.

import { parseModule, blank } from "./module.js";
import { freeNames, children, patternNames } from "./freenames.js";

/** @typedef {any} N  an acorn node */

/**
 * A file the scan cannot read: it does not parse as a module (a name declared twice, with `binding` set, is the one
 * case it can name). A host that vouches for a helper by its declaration must refuse rather than keep any.
 */
export class ScanError extends Error {
  /** @param {string} reason @param {number} line  the 1-based line of the error @param {string | null} [binding]  the name declared twice, if that is it */
  constructor(reason, line, binding = null) {
    super(`the top-level scan could not read this file: ${reason} (line ${line}), so it vouches for none of its declarations`);
    this.name = "ScanError";
    this.binding = binding;
    this.line = line;
  }
}

/** @param {unknown} e  what the parser threw @returns {ScanError} */
function scanError(e) {
  if (e instanceof RangeError) return new ScanError("it is nested too deeply to parse", 1);
  if (!(e instanceof SyntaxError)) throw e;
  const line = /** @type {{ loc?: { line: number } }} */ (e).loc?.line ?? 1;
  const reason = e.message.replace(/\s*\(\d+:\d+\)$/, "");
  const dup = /^Identifier '(.+)' has already been declared$/.exec(reason);
  return dup ? new ScanError(`'${dup[1]}' is declared twice, which a module cannot do`, line, dup[1]) : new ScanError(`it does not parse as a module: ${reason}`, line);
}

/** @param {string} text @returns {N} */
function parse(text) {
  try { return parseModule(text); } catch (e) { throw scanError(e); }
}

/**
 * One name a scope binds below or at the top level.
 * @typedef {object} Binding_
 * @property {string} name
 * @property {"decl" | "param" | "fn" | "class" | "catch"} kind
 * @property {boolean} top  declared by a statement of the program itself (not in a block, loop head or function)
 * @property {N | null} owner  the innermost function it belongs to
 * @property {boolean} build  inside build code (see `buildTimeShadows`)
 */

/**
 * `outer` maps each function to the innermost function around it (null at the top level); `fns` lists them all.
 * @typedef {{ program: N, records: Binding_[], holds: Set<N>, outer: Map<N, N | null>, fns: N[] }} Analysis
 */

/** @type {{ text: string, analysis: Analysis } | null} */
let last = null;

/**
 * Every name the file binds, in source order, with where; and which functions hold another function.
 * @param {string} text
 * @returns {Analysis}
 */
function analyze(text) {
  if (last?.text === text) return last.analysis;
  const program = parse(text);
  /** @type {Binding_[]} */
  const records = [];
  /** @type {Set<N>} */
  const holds = new Set();
  /** @type {Map<N, N | null>} */
  const outer = new Map();
  /** @type {N[]} */
  const stack = [];
  /** @typedef {{ owner: N | null, build: boolean }} Ctx */
  const outside = { owner: null, build: false };
  const add = (/** @type {string[]} */ names, /** @type {Binding_["kind"]} */ kind, /** @type {boolean} */ top, /** @type {Ctx} */ c) => {
    for (const name of names) records.push({ name, kind, top, owner: c.owner, build: c.build });
  };

  /**
   * A function. `role` is "top" for a top-level declaration or a top-level declarator's function (not build code:
   * a helper's names count only when it holds another function), "export" for `export default`'s (its block body
   * is build code), and "inner" for any other (build code, including a method's).
   * @param {N} f @param {Ctx} c @param {"top" | "export" | "inner"} role
   */
  function fn(f, c, role) {
    for (const g of stack) holds.add(g);
    outer.set(f, stack.at(-1) ?? null);
    const block = f.type !== "ArrowFunctionExpression" && role === "inner";
    const params = { owner: f, build: c.build || block };
    if (block && f.id) add([f.id.name], "fn", false, params);
    add(f.params.flatMap(patternNames), "param", false, params);
    stack.push(f);
    for (const p of f.params) visit(p, params);
    visit(f.body, { owner: f, build: params.build || (role === "export" && f.body.type === "BlockStatement") });
    stack.pop();
  }

  /** @param {N} node @param {Ctx} c */
  function visit(node, c) {
    switch (node.type) {
      case "FunctionDeclaration": case "FunctionExpression": case "ArrowFunctionExpression": fn(node, c, "inner"); return;
      case "VariableDeclaration": for (const d of node.declarations) add(patternNames(d.id), "decl", false, c); break;
      case "CatchClause": add(patternNames(node.param), "catch", false, c); break;
      case "ClassDeclaration": case "ClassExpression": if (node.id) add([node.id.name], "class", false, c); break;
    }
    for (const k of children(node)) visit(k, c);
  }

  /** A statement of the program itself. @param {N} s */
  function top(s) {
    switch (s.type) {
      case "ExportNamedDeclaration": if (s.declaration) top(s.declaration); return;
      case "ExportDefaultDeclaration": {
        const d = s.declaration;
        if (d.type === "FunctionDeclaration" && d.id) add([d.id.name], "fn", true, outside);
        if (d.type === "FunctionDeclaration" || d.type === "FunctionExpression" || d.type === "ArrowFunctionExpression") fn(d, outside, "export");
        else visit(d, outside);
        return;
      }
      case "FunctionDeclaration": add([s.id.name], "fn", true, outside); fn(s, outside, "top"); return;
      case "ClassDeclaration": for (const k of children(s)) if (k !== s.id) visit(k, outside); return;
      case "VariableDeclaration":
        for (const d of s.declarations) {
          add(patternNames(d.id), "decl", true, outside);
          visit(d.id, outside);
          if (d.init?.type === "FunctionExpression") fn(d.init, outside, "top");
          else if (d.init) visit(d.init, outside);
        }
        return;
      default: visit(s, outside);
    }
  }

  try { for (const s of program.body) top(s); } catch (e) { throw scanError(e); }
  last = { text, analysis: { program, records, holds, outer, fns: [...outer.keys()] } };
  return last.analysis;
}

/**
 * The names a program declares at its top level (a statement of the program itself, however it is indented): every
 * name a `const`, `let` or `var` binds (destructuring included), and each function declaration's name. A loop's
 * variable, a block's declarations and classes and imports are not listed. Throws a ScanError for a file that does
 * not parse.
 * @param {string} code
 * @returns {string[]}
 */
export function topLevelNames(code) {
  return analyze(code).records.filter((r) => r.top).map((r) => r.name);
}

/**
 * @typedef {object} Binding
 * @property {string} name
 * @property {"const" | "let"} keyword
 * @property {string} init  The initializer's source text as written, from its first to its last character of code
 *   (comments around it and parens wrapping all of it left out), so an arrow's is what `String(fn)` gives.
 */

/** The statements of the program that declare things, with `export` taken off. @param {string} code @returns {N[]} */
function topStatements(code) {
  return analyze(code).program.body.flatMap((/** @type {N} */ s) => (s.type === "ExportNamedDeclaration" ? (s.declaration ? [s.declaration] : []) : s.type === "ExportDefaultDeclaration" ? [s.declaration] : [s]));
}

/**
 * Each plain-named `const` and `let` a program declares at its top level, with its initializer's source. A
 * `const a = 1, b = 2` gives two. Destructuring declarations, `var`, declarations without a value and functions
 * are not listed (`topLevelFunctions` lists functions). Throws a ScanError for a file that does not parse, a name
 * declared twice included: these initializers vouch for helpers.
 * @param {string} code
 * @returns {Binding[]}
 */
export function topLevelBindings(code) {
  /** @type {Binding[]} */
  const out = [];
  for (const s of topStatements(code)) {
    if (s.type !== "VariableDeclaration" || s.kind === "var") continue;
    for (const d of s.declarations) if (d.id.type === "Identifier" && d.init) out.push({ name: d.id.name, keyword: s.kind, init: code.slice(d.init.start, d.init.end) });
  }
  return out;
}

/**
 * Each function declaration a program has at its top level, with its whole text from `function` (or `async`) to the
 * closing `}` (`export` before it left out), which is what `String(fn)` gives. A host vouches for a
 * function-declaration helper with it, as it does for an arrow with `topLevelBindings`' `init`. Async functions and
 * generators are listed too (the Definition API refuses them by name). Throws a ScanError as `topLevelBindings`
 * does.
 * @param {string} code
 * @returns {Array<{ name: string, init: string }>}
 */
export function topLevelFunctions(code) {
  return topStatements(code).filter((s) => s.type === "FunctionDeclaration" && s.id).map((s) => ({ name: s.id.name, init: code.slice(s.start, s.end) }));
}

/**
 * A function declaration's text as the arrow function that means the same: `function f(a, b) { … }` is
 * `(a, b) => { … }`. Refused (with its reason) are async functions, generators, a function with no name and
 * text that is no function declaration; whether the body is in the subset is the parser's to say.
 * @param {string} text  a function declaration as `String(fn)` writes it
 * @returns {{ arrow: string } | { error: string }}
 */
export function functionAsArrow(text) {
  const notOne = { error: "the text is not a function declaration" };
  /** @type {N} */
  let tree;
  try { tree = parseModule(`(${text}\n)`); } catch { return notOne; }
  const only = tree.body.length === 1 && tree.body[0].type === "ExpressionStatement" && tree.body[0].end === text.length + 3 ? tree.body[0].expression : null;
  if (!only) return notOne;
  if (only.async) return { error: "an async function is not a Runtime Lambda" };
  if (only.type !== "FunctionExpression") return notOne;
  const code = blank(text);
  const start = only.start - 1;
  if (code.slice(0, start).trim() !== "") return notOne;
  if (only.generator) return { error: "a generator is not a Runtime Lambda" };
  if (!only.id) return { error: "a function declaration needs a name" };
  const open = code.indexOf("(", only.id.end - 1);
  let close = open, depth = 0;
  for (let i = open; i < code.length; i++) {
    if (code[i] === "(") depth++;
    else if (code[i] === ")" && --depth === 0) { close = i; break; }
  }
  return { arrow: `${text.slice(open, close + 1)} => ${text.slice(only.body.start - 1, only.body.end - 1)}` };
}

/** Whether the names in `r` count as build code names of the file: see `buildTimeShadows`. @param {Analysis} a @param {Binding_} r */
const countsAsBuild = (a, r) => !r.top && (r.build || r.owner === null || a.holds.has(r.owner));

/**
 * The names a program declares only below its top level: `const`/`let`/`var` inside a block or function, function
 * names and parameters, arrow parameters, loop and `catch` variables, class names. A Definition API host passes
 * them to the builder, so a Runtime Lambda that reads one (a closure over a build-time local) is told that it
 * cannot see it, rather than that the name is unknown. A name declared only inside another lambda is listed too.
 * @param {string} code
 * @returns {string[]}
 */
export function buildTimeNames(code) {
  const a = analyze(code);
  const top = new Set(a.records.filter((r) => r.top).map((r) => r.name));
  return [...new Set(a.records.filter((r) => !r.top).map((r) => r.name))].filter((n) => !top.has(n));
}

/**
 * The names a file declares at its top level and again in the export's build code (a loop's `k` beside a top-level
 * `k`, a function inside the export that shares a top-level function's name). A lambda's text cannot say which one
 * it reads, and the kit resolves it to the top-level one, so the host passes these and a lambda that reads one is
 * refused. Build code is the export's block body and every function the file writes with the `function` keyword
 * below its top level or as a method (their parameters, locals and nested functions); beyond it, a name counts when
 * the function that binds it (a parameter, a local) holds another function, wherever that function is written: a
 * `const` arrow exported by name, a build-time callback in the export's expression, an IIFE. The tree cannot say
 * which nested function is a Runtime Lambda handed to the builder and which is a helper's callback, so any nested
 * function counts; this fails closed, so a top-level helper whose parameter shares a top-level name and holds a
 * callback is listed too, and so is a Runtime Lambda's own parameter when the lambda holds a query callback
 * (`(p, dt) => p.items.some((q) => q.x > dt)` lists `dt`), unless the caller names that lambda in `compiled`. A
 * function that holds no function (a lambda's or a helper's own parameter) never counts. The export's own parameter
 * counts when the export holds a function (it may then hold a lambda that reads the name) and never otherwise (no
 * lambda can read it).
 *
 * `compiled` is the source text of functions the caller knows are compiled rather than run (kit/define passes the
 * Runtime Lambdas it was handed, issue `JYmuWM`). A function whose text, from its first character to its last (what
 * `String(fn)` gives), is one of them binds nothing here, nor does any function or block inside it: its names belong
 * to its own text. Only a text the file writes as exactly one function excludes it; a text written twice, or written
 * only as something else (a string, part of an expression), excludes nothing, so the scan stays fail closed.
 * @param {string} code
 * @param {string[]} [compiled]
 * @returns {string[]}
 */
export function buildTimeShadows(code, compiled = []) {
  const a = analyze(code);
  const top = new Set(a.records.filter((r) => r.top).map((r) => r.name));
  const skip = compiledFunctions(a, code, compiled);
  return [...new Set(a.records.filter((r) => countsAsBuild(a, r) && top.has(r.name) && !within(a, r.owner, skip)).map((r) => r.name))];
}

/** The functions the file writes exactly once with a text in `compiled`. @param {Analysis} a @param {string} code @param {string[]} compiled */
function compiledFunctions(a, code, compiled) {
  if (compiled.length === 0) return new Set();
  const wanted = new Set(compiled);
  /** @type {Map<string, N[]>} */
  const byText = new Map();
  for (const f of a.fns) {
    const t = code.slice(f.start, f.end);
    if (wanted.has(t)) byText.set(t, [...(byText.get(t) ?? []), f]);
  }
  return new Set([...byText.values()].filter((fs) => fs.length === 1).map((fs) => fs[0]));
}

/** Whether function `f` is one of `skip` or inside one. @param {Analysis} a @param {N | null} f @param {Set<N>} skip */
function within(a, f, skip) {
  for (let g = f; g; g = a.outer.get(g) ?? null) if (skip.has(g)) return true;
  return false;
}

/**
 * The part of `buildTimeNames` the file binds as a `const`, `let` or `var` or a `catch` parameter below its top
 * level, with no parameters or function names: what a lambda may have read as a build-time local although
 * another lambda has a parameter of the same name.
 * @param {string} code
 * @returns {string[]}
 */
export function buildTimeBindings(code) {
  const a = analyze(code);
  const top = new Set(a.records.filter((r) => r.top).map((r) => r.name));
  return [...new Set(a.records.filter((r) => (r.kind === "decl" || r.kind === "catch") && !r.top).map((r) => r.name))].filter((n) => !top.has(n));
}

/**
 * Which of `names` the lambda source `src` (an expression: an arrow or a function) reads from outside itself, in
 * the order `names` lists them. Property names (`self.cell`), object keys (`{ cell: 1 }`), text in strings and
 * comments, and names the lambda itself declares in a scope that holds the read (parameters, `let`, `const`, `var`,
 * loop and `catch` variables) do not count. Throws a ScanError for text that is not one expression.
 * @param {string} src
 * @param {string[]} names
 * @returns {string[]}
 */
export function topLevelRefs(src, names) {
  const wrapped = `(${src}\n)`;
  /** @type {N} */
  let tree;
  try { tree = parseModule(wrapped); } catch (e) { throw scanError(e); }
  if (tree.body.length !== 1 || tree.body[0].type !== "ExpressionStatement" || tree.body[0].end !== wrapped.length) throw new ScanError("it is not one expression", 1);
  /** @type {Set<string>} */
  let free;
  try { free = freeNames(tree.body[0].expression); } catch (e) { throw scanError(e); }
  return names.filter((n, i) => free.has(n) && names.indexOf(n) === i);
}
