// Planted faults: small, deliberate defects in one backend's input or output, to see whether the harness notices.
// A fault edits a private copy of the lowered Kernels or the text a backend emitted (see `Plant` in pipeline.js);
// the interpreter always runs the original.

/** @import { Kernels, Plant } from "./pipeline.js" */
/** @import { Expr, Stmt } from "../ir/ir.js" */

/**
 * @typedef {object} IrFault
 * @property {(k: Kernels) => void} ir  Edits the copy in place; throws when no node matches.
 * @property {string[]} sites  The source text of each node edited, filled in by `ir`.
 */

/**
 * Every expression of a statement list, outermost first, in source order.
 * @param {Stmt[]} body
 * @returns {Generator<Expr>}
 */
function* stmtExprs(body) {
  for (const s of body) {
    switch (s.k) {
      case "let": if (s.value) yield* walk(s.value); break;
      case "set": case "do": case "push": yield* walk(s.value); break;
      case "store": yield* walk(s.place.recv); yield* walk(s.value); break;
      case "return": if (s.value) yield* walk(s.value); break;
      case "if": yield* walk(s.test); yield* stmtExprs(s.then); yield* stmtExprs(s.else); break;
      case "for": yield* walk(s.init); yield* walk(s.test); yield* stmtExprs(s.update); yield* stmtExprs(s.body); break;
      case "each": yield* walk(s.list); yield* stmtExprs(s.body); break;
      default: break;
    }
  }
}

/**
 * @param {Expr} e
 * @returns {Generator<Expr>}
 */
function* walk(e) {
  yield e;
  switch (e.k) {
    case "op": case "helper": for (const a of e.args) yield* walk(a); break;
    case "cond": yield* walk(e.test); yield* walk(e.then); yield* walk(e.else); break;
    case "call": if (e.recv) yield* walk(e.recv); for (const a of e.args) yield* walk(a); break;
    case "method": yield* walk(e.recv); for (const a of e.args) yield* walk(a); break;
    case "struct": for (const f of Object.values(e.fields)) yield* walk(f); break;
    case "field": yield* walk(e.of); break;
    case "index": yield* walk(e.of); yield* walk(e.index); break;
    case "array": case "vec": for (const i of e.items) yield* walk(i); break;
    case "load": yield* walk(e.place.recv); break;
    default: break;
  }
}

/**
 * Builds an IR fault: finds the `nth` expression of `kernel` ("pixel", or a helper's name) that `match` accepts and
 * applies `edit` to it.
 * @param {string} kernel
 * @param {(e: any) => boolean} match
 * @param {number} nth
 * @param {(e: any) => void} edit
 * @returns {IrFault}
 */
function irFault(kernel, match, nth, edit) {
  /** @type {string[]} */
  const sites = [];
  return {
    sites,
    ir: (k) => {
      const target = kernel === "pixel" ? k.pixel : k.helpers[kernel];
      if (!target) throw new Error(`no kernel named ${kernel}`);
      const found = [...stmtExprs(target.body)].filter(match);
      if (found.length <= nth) throw new Error(`fault in ${kernel}: matched no node at index ${nth} (it only has ${found.length})`);
      const e = found[nth];
      sites.push(target.src.slice(e.span[0], e.span[1]));
      edit(e);
    },
  };
}

/**
 * Changes an operator: the `nth` node `match` accepts gets operator `to`.
 * @param {string} kernel
 * @param {(e: any) => boolean} match
 * @param {string} to  An IR operator.
 * @param {number} [nth]
 */
export function swapOperator(kernel, match, to, nth = 0) {
  return irFault(kernel, (e) => e.k === "op" && match(e), nth, (e) => { e.op = to; });
}

/**
 * Changes a number literal: `by` is added to it, and the result rounded to an f32 as the IR requires.
 * @param {string} kernel
 * @param {(e: any) => boolean} match
 * @param {number} by
 * @param {number} [nth]
 */
export function nudgeConstant(kernel, match, by, nth = 0) {
  return irFault(kernel, (e) => e.k === "num" && match(e), nth, (e) => { e.v = Math.fround(e.v + by); });
}

/**
 * Reads another component: the `nth` component read `match` accepts reads `to` instead.
 * @param {string} kernel
 * @param {(e: any) => boolean} match
 * @param {string} to
 * @param {number} [nth]
 */
export function swizzle(kernel, match, to, nth = 0) {
  return irFault(kernel, (e) => e.k === "field" && match(e), nth, (e) => { e.name = to; });
}

/**
 * A text fault: replaces the `nth` occurrence of `find` in what a backend emitted. Leaves the text alone when it
 * is not there, which `prepare` reports as an unplanted fault.
 * @param {string} _label  Documents the call site (the edit is `find` to `replacement`).
 * @param {string} find
 * @param {string} replacement
 * @param {number} [nth]
 * @returns {(text: string) => string}
 */
export function replaceText(_label, find, replacement, nth = 0) {
  return (text) => {
    let at = -1;
    for (let i = 0; i <= nth; i++) {
      at = text.indexOf(find, at + 1);
      if (at < 0) return text;
    }
    return text.slice(0, at) + replacement + text.slice(at + find.length);
  };
}

/**
 * One planted fault of the recorded list.
 * @typedef {object} Fault
 * @property {string} id
 * @property {"operator" | "constant" | "swizzle" | "rounding" | "spelling"} kind
 * @property {"swirl" | "bulge" | "domain-warp"} case  The program (and so the grid and sets) it is run over.
 * @property {string} what  What was changed, in the author's terms.
 * @property {Array<"js" | "glsl">} targets  The backends it can be planted in.
 * @property {(target: "js" | "glsl") => Plant & { sites?: string[] }} make
 * @property {Partial<Record<"js" | "glsl", string>>} [escapes]  Where the fault is expected to go unnoticed, and why.
 */

/**
 * An IR fault, planted in either backend.
 * @param {Omit<Fault, "targets" | "make"> & { fault: () => IrFault }} f
 * @returns {Fault}
 */
function ir(f) {
  const { fault, ...rest } = f;
  return { ...rest, targets: ["js", "glsl"], make: (target) => { const x = fault(); return { target, ir: x.ir, sites: x.sites }; } };
}

/**
 * A text fault, with its own edit for each backend that has the construct.
 * @param {Omit<Fault, "targets" | "make"> & { js?: (t: string) => string, glsl?: (t: string) => string }} f
 * @returns {Fault}
 */
function text(f) {
  const { js, glsl, ...rest } = f;
  /** @type {Array<"js" | "glsl">} */
  const targets = [...(js ? /** @type {const} */ (["js"]) : []), ...(glsl ? /** @type {const} */ (["glsl"]) : [])];
  return { ...rest, targets, make: (target) => ({ target, text: /** @type {(t: string) => string} */ (target === "js" ? js : glsl) }) };
}

const vec = (/** @type {any} */ e) => typeof e.t === "object";
const num = (/** @type {number} */ v) => (/** @type {any} */ e) => Math.abs(e.v - v) < 1e-6;
const isOp = (/** @type {string} */ op) => (/** @type {any} */ e) => e.op === op;

/** The recorded faults. Each says what it changed; `escapes` says where it is expected to go unnoticed, and why. */
export const FAULTS = /** @type {Fault[]} */ ([
  // operators
  ir({ id: "swirl-offset-sign", kind: "operator", case: "swirl", what: "`uv * 150 - c` becomes `uv * 150 + c`", fault: () => swapOperator("pixel", (e) => e.op === "sub" && vec(e), "add") }),
  ir({ id: "swirl-lens-inverted", kind: "operator", case: "swirl", what: "`dist < R` becomes `dist > R`", fault: () => swapOperator("pixel", isOp("lt"), "gt") }),
  ir({ id: "swirl-twist-sum", kind: "operator", case: "swirl", what: "`d.x * s + d.y * co` becomes `d.x * s - d.y * co`", fault: () => swapOperator("pixel", (e) => e.op === "add" && e.args[0]?.op === "mul" && e.args[1]?.op === "mul", "sub") }),
  ir({ id: "pmod-sign", kind: "operator", case: "swirl", what: "pmod's `x - n * floor(x / n)` becomes `x + n * floor(x / n)`", fault: () => swapOperator("pmod", isOp("sub"), "add") }),
  ir({ id: "bulge-scale", kind: "operator", case: "bulge", what: "`d * k` becomes `d / k`", fault: () => swapOperator("pixel", (e) => e.op === "mul" && vec(e) && e.args[1]?.k === "local" && e.args[1].name === "k", "div") }),
  ir({ id: "fbm-accumulate", kind: "operator", case: "domain-warp", what: "fbm's `v + a * vnoise(q, s)` becomes `v - a * vnoise(q, s)`", fault: () => swapOperator("fbm", (e) => e.op === "add" && e.args[1]?.op === "mul", "sub") }),
  ir({ id: "vnoise-smooth", kind: "operator", case: "domain-warp", what: "vnoise's smoothing `f * f * (3 - 2 * f)` becomes `f + f * (3 - 2 * f)`", fault: () => swapOperator("vnoise", (e) => e.op === "mul" && vec(e) && e.args[0]?.op === "mul", "add") }),
  ir({ id: "grey-offset", kind: "operator", case: "domain-warp", what: "the grey palette's `f - 0.2` becomes `f + 0.2`", fault: () => swapOperator("pixel", (e) => e.op === "sub" && e.args[1]?.v !== undefined && Math.abs(e.args[1].v - 0.2) < 1e-6, "add") }),
  // constants
  ir({ id: "swirl-radius", kind: "constant", case: "swirl", what: "the lens radius `63` becomes `63.5`", fault: () => nudgeConstant("pixel", num(63), 0.5) }),
  ir({ id: "grid-red-large", kind: "constant", case: "swirl", what: "the grid's red `0.886` becomes `0.89` (4e-3 higher)", fault: () => nudgeConstant("grid", num(0.886), 0.004) }),
  ir({ id: "grid-red-small", kind: "constant", case: "swirl", what: "the grid's red `0.886` becomes `0.8865` (5e-4 higher, under the tolerance)", fault: () => nudgeConstant("grid", num(0.886), 0.0005), escapes: { glsl: "5e-4 is under the declared tolerance (1e-3), so no GLSL comparison can tell it from rounding noise; the JS pair, which is exact, catches it" } }),
  ir({ id: "bulge-strength", kind: "constant", case: "bulge", what: "the bulge's `0.75` becomes `0.8`", fault: () => nudgeConstant("pixel", num(0.75), 0.05) }),
  ir({ id: "fbm-lacunarity", kind: "constant", case: "domain-warp", what: "the octave scale `2.02` becomes `2.03`", fault: () => nudgeConstant("fbm", num(2.02), 0.01) }),
  ir({ id: "warp-drift", kind: "constant", case: "domain-warp", what: "the drift `0.03 * t` becomes `0.031 * t`", fault: () => nudgeConstant("pixel", num(0.03), 0.001) }),
  ir({ id: "fog-base-small", kind: "constant", case: "domain-warp", what: "the fog palette's darkest red `0.051` becomes `0.0515` (5e-4 higher, under the tolerance)", fault: () => nudgeConstant("pixel", num(0.051), 0.0005), escapes: { glsl: "5e-4 is under the declared tolerance (1e-3); the JS pair catches it" } }),
  ir({ id: "marble-vein", kind: "constant", case: "domain-warp", what: "the marble vein exponent `6` becomes `7`", fault: () => nudgeConstant("pixel", num(6), 1) }),
  // swizzles
  ir({ id: "swirl-rotate-x", kind: "swizzle", case: "swirl", what: "the first `d.x` of the rotation reads `d.y`", fault: () => swizzle("pixel", (e) => e.name === "x", "y") }),
  ir({ id: "warp-p-y", kind: "swizzle", case: "domain-warp", what: "`uv.y` in `p` reads `uv.x`", fault: () => swizzle("pixel", (e) => e.name === "y" && e.of.name === "uv", "x") }),
  ir({ id: "fog-r-component", kind: "swizzle", case: "domain-warp", what: "the fog palette's `abs(r.x)` reads `r.y`", fault: () => swizzle("pixel", (e) => e.name === "x" && e.of.name === "r", "y") }),
  ir({ id: "vnoise-hash-y", kind: "swizzle", case: "domain-warp", what: "vnoise's corner hash `ihash(i.x, i.y, s)` reads `i.x` twice", fault: () => swizzle("vnoise", (e) => e.name === "y", "x") }),
  // rounding and spelling, in what a backend emitted
  text({ id: "js-drop-rounding-position", kind: "rounding", case: "domain-warp", what: "JS: `uv[0] * scale` is no longer rounded to f32", js: replaceText("p.x rounding", "let p = [Math.fround(uv[0] * Math.fround(u.scale))", "let p = [(uv[0] * Math.fround(u.scale))") }),
  text({ id: "js-drop-rounding-seed", kind: "rounding", case: "domain-warp", what: "JS: `u.seed * 3` is no longer rounded to f32", js: replaceText("seed rounding", "let s = Math.fround(Math.fround(u.seed) * 3);", "let s = (Math.fround(u.seed) * 3);"), escapes: { js: "an equivalent mutant: the seed is a whole number, so its triple is exactly an f32 and rounding it changes nothing" } }),
  text({ id: "js-drop-rounding-all", kind: "rounding", case: "domain-warp", what: "JS: no `Math.fround` anywhere in the program (every f32 operation computed in doubles)", js: (t) => t.replaceAll("Math.fround(", "(") }),
  text({ id: "js-drop-rounding-all-swirl", kind: "rounding", case: "swirl", what: "JS: no `Math.fround` anywhere in the program, in swirl", js: (t) => t.replaceAll("Math.fround(", "("), escapes: { js: "swirl's output is one of four constant colors, so rounding noise in the coordinates changes it only for a pixel within an ulp of a threshold, and the 74-pixel grid has none (the swirl and bulge runs are blind to rounding by construction; domain-warp, whose output is smooth, is not)" } }),
  text({ id: "sin-as-cos", kind: "spelling", case: "swirl", what: "the `sin(th)` intrinsic is spelled as cos", js: replaceText("sin", "Math.sin(", "Math.cos("), glsl: replaceText("sin", "sin(", "cos(") }),
  text({ id: "floor-as-ceil", kind: "spelling", case: "swirl", what: "pmod's `floor` is spelled as ceil", js: replaceText("floor", "Math.floor(", "Math.ceil("), glsl: replaceText("floor", "floor(", "ceil(") }),
  text({ id: "glsl-hash-constant", kind: "constant", case: "domain-warp", what: "GLSL: the hash's final multiplier `0x846ca68bu` loses its low bit", glsl: replaceText("ihash", "0x846ca68bu", "0x846ca68au") }),
  text({ id: "glsl-mediump", kind: "spelling", case: "domain-warp", what: "GLSL: `precision highp float` becomes `mediump`", glsl: replaceText("precision", "precision highp float;", "precision mediump float;"), escapes: { glsl: "on this renderer (Apple GPU through WebKit) mediump behaves as full 32-bit floats: the worst difference, 2.06e-4, is the unplanted run's; a property of this GPU, not of GLSL (a GPU that really halves mediump was not available to test)" } }),
]);
