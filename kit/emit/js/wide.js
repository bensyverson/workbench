// f32 and vector emission: which types need rounding, the vector runtime the emitted code
// carries as its own prelude, and how an intrinsic's JS spelling becomes a call.

/** @import { Type } from "../../ir/ir.js" */

/**
 * What the emitter needs of an intrinsic: its JS spelling (a call template with `$0`, `$1` for the
 * arguments, and optionally the source it needs defined first) and whether it applies per component.
 * The fields Dialect's `Intrinsic` has this shape.
 * @typedef {object} JsIntrinsic
 * @property {{ call: string, prelude?: string }} js
 * @property {boolean} [componentwise]
 */

/**
 * @typedef {object} EmitOptions
 * @property {Record<string, JsIntrinsic>} [intrinsics]  A Dialect's intrinsics, by the name a Kernel calls.
 */

/**
 * What one emission collects: the options, and the prelude it has needed so far.
 * @typedef {object} Cx
 * @property {Record<string, JsIntrinsic>} intrinsics
 * @property {Set<string>} prelude
 */

/** @param {Type} t */
export const isVec = (t) => typeof t === "object" && "vec" in t;
/** @param {Type} t */
export const isF32 = (t) => t === "f32";
/** A vector of f32s, which every operation must round componentwise. @param {Type} t */
export const isF32Vec = (t) => typeof t === "object" && "vec" in t && t.of === "f32";
/** Whether a value of `t` needs more than JavaScript's operators: an f32 or any vector. @param {Type} t */
export const isWide = (t) => isF32(t) || isVec(t);

/** The component names, in order: `.x` is index 0. */
export const COMPONENTS = "xyzw";

/**
 * The vector runtime, by the name emitted code calls it. A vector is an array of its components, as
 * the reference interpreter has it. These do the double operation and nothing else: rounding to f32
 * is the emitter's, once per node, which is what makes an f32 operation "the double operation rounded once".
 * @type {Record<string, string>}
 */
const RUNTIME = {
  $fv: "const $fv = (v) => v.map(Math.fround);",
  $vadd: "const $vadd = (a, b) => a.map((x, i) => x + b[i]);",
  $vsub: "const $vsub = (a, b) => a.map((x, i) => x - b[i]);",
  $vmul: "const $vmul = (a, b) => (Array.isArray(a) ? (Array.isArray(b) ? a.map((x, i) => x * b[i]) : a.map((x) => x * b)) : b.map((y) => a * y));",
  $vdiv: "const $vdiv = (a, b) => (Array.isArray(b) ? a.map((x, i) => x / b[i]) : a.map((x) => x / b));",
  $vneg: "const $vneg = (a) => a.map((x) => -x);",
  $vpos: "const $vpos = (a) => a.map((x) => +x);",
  // Applies a scalar function to each component of its vector arguments; a scalar argument is passed whole.
  $cw: "const $cw = (f, ...args) => Array.from({ length: args.find(Array.isArray).length }, (_, i) => f(...args.map((a) => (Array.isArray(a) ? a[i] : a))));",
};

/** The runtime function for a vector operator. */
const VECTOR_OPS = /** @type {Record<string, string>} */ ({ add: "$vadd", sub: "$vsub", mul: "$vmul", div: "$vdiv", neg: "$vneg", pos: "$vpos" });

/**
 * Notes that the emitted code needs `name` from the runtime, and returns it.
 * @param {Cx} cx
 * @param {string} name
 */
export function need(cx, name) {
  cx.prelude.add(RUNTIME[name]);
  return name;
}

/**
 * `s`, the source of a value of type `t`, rounded to that type: `Math.fround` for an f32, `$fv`
 * for a vector of f32s. Anything else is as it was.
 * @param {Cx} cx
 * @param {Type} t
 * @param {string} s
 */
export function round(cx, t, s) {
  if (isF32(t)) return `Math.fround(${s})`;
  if (isF32Vec(t)) return `${need(cx, "$fv")}(${s})`;
  return s;
}

/**
 * A vector operator over its operand sources: the runtime's, which decides by the operands' shapes
 * just as the interpreter does. Null for an operator that has no vector form.
 * @param {Cx} cx
 * @param {string} op
 * @param {string[]} args
 * @returns {string | null}
 */
export function vectorOp(cx, op, args) {
  const f = VECTOR_OPS[op];
  return f ? `${need(cx, f)}(${args.join(", ")})` : null;
}

/**
 * A call to an intrinsic, spelled as the Dialect spells it for JavaScript. A componentwise
 * intrinsic given a vector runs per component, the template as the body of a function of its arguments.
 * @param {Cx} cx
 * @param {string} name
 * @param {JsIntrinsic} spelling
 * @param {Array<{ src: string, t: Type, simple: boolean }>} args  Each argument's source and whether repeating it is harmless.
 * @returns {string}
 */
export function intrinsicCall(cx, name, spelling, args) {
  const { call, prelude } = spelling.js;
  if (prelude) cx.prelude.add(prelude.trimEnd());
  if (spelling.componentwise && args.some((a) => isVec(a.t))) {
    const names = args.map((_, i) => `a${i}`);
    return `${need(cx, "$cw")}((${names.join(", ")}) => ${fill(name, call, names, names.map(() => true))}, ${args.map((a) => a.src).join(", ")})`;
  }
  return fill(name, call, args.map((a) => a.src), args.map((a) => a.simple));
}

/**
 * Puts the arguments into a call template.
 * @param {string} name
 * @param {string} template
 * @param {string[]} srcs
 * @param {boolean[]} simple
 */
function fill(name, template, srcs, simple) {
  const uses = /** @type {number[]} */ ([]);
  const out = template.replace(/\$(\d+)/g, (_, d) => {
    const i = Number(d);
    if (i >= srcs.length) throw new Error(`${name}: its JS spelling takes argument $${i}, but the call has ${srcs.length}`);
    uses[i] = (uses[i] ?? 0) + 1;
    if (uses[i] > 1 && !simple[i]) throw new Error(`${name}: its JS spelling uses argument $${i} more than once, which would evaluate it twice`);
    return srcs[i];
  });
  return out;
}
