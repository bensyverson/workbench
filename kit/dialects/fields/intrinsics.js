// The fields Dialect's intrinsics: each one's signature, how each target spells it, and a
// reference implementation on numbers for the interpreter. A signature with a type variable
// (`T`) is one operation over f32s and vectors alike: `numeric` limits what `T` may be, and
// `componentwise` says the reference applies per component. Library functions written in the
// Runtime Subset (library.js) are not here: they lower like helpers and reach every target.

/** @import { Type } from "../../ir/ir.js" */
/** @import { Intrinsic } from "./decls.js" */

import { CALLS } from "./calls.js";

const T = /** @type {Type} */ ({ tvar: "T" });
const F = /** @type {Type} */ ("f32");

/**
 * Spells one JS call template.
 * @param {string} js
 * @param {string} glsl
 * @param {{ js?: string, glsl?: string }} [prelude]
 */
const spell = (js, glsl, prelude = {}) => ({
  js: { call: js, ...(prelude.js ? { prelude: prelude.js } : {}) },
  glsl: { call: glsl, ...(prelude.glsl ? { prelude: prelude.glsl } : {}) },
});

/**
 * A scalar intrinsic over f32s.
 * @param {number} n
 * @param {Intrinsic["ref"]} ref
 * @param {string} js
 * @param {string} glsl
 * @param {{ js?: string }} [prelude]
 * @returns {Intrinsic}
 */
const scalar = (n, ref, js, glsl, prelude) => ({ sig: { params: Array(n).fill(F), returns: F, effects: [] }, ref, ...spell(js, glsl, prelude) });

/**
 * An intrinsic over any number or vector `T`, applied per component, whose arguments after `lead` are f32.
 * @param {number} lead  How many leading arguments are `T`.
 * @param {number} rest  How many trailing f32 arguments.
 * @param {Intrinsic["ref"]} ref
 * @param {string} js
 * @param {string} glsl
 * @param {{ js?: string }} [prelude]
 * @returns {Intrinsic}
 */
const generic = (lead, rest, ref, js, glsl, prelude) => ({
  sig: { params: [...Array(lead).fill(T), ...Array(rest).fill(F)], returns: T, effects: [], numeric: "number" },
  ref, componentwise: true, ...spell(js, glsl, prelude),
});

const clamp01 = (/** @type {number} */ x) => Math.max(0, Math.min(1, x));

/** The book's own integer hash (04-noise/domain-warp), whole, as its JS spelling. */
const IHASH_JS = `function ihash(x, y, s) {
  let h = (Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(s | 0, 0x9e3779b1)) >>> 0;
  h ^= h >>> 16; h = Math.imul(h, 0x7feb352d); h ^= h >>> 15; h = Math.imul(h, 0x846ca68b); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
`;

/** The same hash in GLSL ES 3.00: `uint` arithmetic wraps as Math.imul does, and `int(x)` truncates as `x | 0` does within int32. */
const IHASH_GLSL = `float ihash(float x, float y, float s) {
  uint h = (uint(int(x)) * 0x27d4eb2du) ^ (uint(int(y)) * 0x165667b1u) ^ (uint(int(s)) * 0x9e3779b1u);
  h ^= h >> 16u; h *= 0x7feb352du; h ^= h >> 15u; h *= 0x846ca68bu; h ^= h >> 16u;
  return float(h) / 4294967296.0;
}
`;

/** The Dialect's intrinsics, by the name a lambda calls. */
export const INTRINSICS = /** @type {Record<string, Intrinsic>} */ ({
  floor: generic(1, 0, Math.floor, "Math.floor($0)", "floor($0)"),
  fract: generic(1, 0, (x) => x - Math.floor(x), "fract($0)", "fract($0)", { js: "const fract = (x) => x - Math.floor(x);" }),
  abs: generic(1, 0, Math.abs, "Math.abs($0)", "abs($0)"),
  min: generic(2, 0, Math.min, "Math.min($0, $1)", "min($0, $1)"),
  max: generic(2, 0, Math.max, "Math.max($0, $1)", "max($0, $1)"),
  clamp: generic(1, 2, (x, lo, hi) => Math.min(Math.max(x, lo), hi), "clamp($0, $1, $2)", "clamp($0, $1, $2)", { js: "const clamp = (x, lo, hi) => Math.min(Math.max(x, lo), hi);" }),
  mix: generic(2, 1, (a, b, t) => a + (b - a) * t, "mix($0, $1, $2)", "mix($0, $1, $2)", { js: "const mix = (a, b, t) => a + (b - a) * t;" }),
  sin: scalar(1, Math.sin, "Math.sin($0)", "sin($0)"),
  cos: scalar(1, Math.cos, "Math.cos($0)", "cos($0)"),
  sqrt: scalar(1, Math.sqrt, "Math.sqrt($0)", "sqrt($0)"),
  pow: scalar(2, Math.pow, "Math.pow($0, $1)", "pow($0, $1)"),
  atan2: scalar(2, Math.atan2, "Math.atan2($0, $1)", "atan($0, $1)"),
  smoothstep: scalar(3, (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); }, "smoothstep($0, $1, $2)", "smoothstep($0, $1, $2)",
    { js: "const smoothstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };" }),
  // The one reduction: the length of a vector. The reference takes the components, however many.
  length: { sig: { params: [T], returns: F, effects: [], numeric: "vector" }, ref: Math.hypot, ...spell("length($0)", "length($0)", { js: "const length = (v) => Math.hypot(...v);" }) },
  // The operators as calls (vadd, vsub, vmul, vdiv, vscale, vneg), for H3's call style.
  ...CALLS,
  // Integer hashing without an integer type (the 2026-11-23 ruling): the arguments are whole f32s.
  ihash: { sig: { params: [F, F, F], returns: F, effects: [] }, ref: (x, y, s) => {
    let h = (Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(s | 0, 0x9e3779b1)) >>> 0;
    h ^= h >>> 16; h = Math.imul(h, 0x7feb352d); h ^= h >>> 15; h = Math.imul(h, 0x846ca68b); h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }, ...spell("ihash($0, $1, $2)", "ihash($0, $1, $2)", { js: IHASH_JS, glsl: IHASH_GLSL }) },
});
