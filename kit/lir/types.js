// The LIR's types: f32, i32, bool, float vectors and the sampler. Small enough to compare and print by hand.

/** @import { LType } from "./lir.js" */

/**
 * @param {unknown} t
 * @returns {t is { vec: 2 | 3 | 4 }}
 */
export const isVec = (t) => typeof t === "object" && t !== null && "vec" in t && (t.vec === 2 || t.vec === 3 || t.vec === 4) && Object.keys(t).length === 1;

/**
 * Whether `t` is a type the LIR holds.
 * @param {unknown} t
 * @returns {t is LType}
 */
export const isLType = (t) => t === "f32" || t === "i32" || t === "bool" || t === SAMPLER || isVec(t);

/** The sampler type: a uniform or parameter only, passed whole to a call. */
export const SAMPLER = "sampler";

/**
 * @param {LType} a
 * @param {LType} b
 */
export const sameLType = (a, b) => (typeof a === "string" || typeof b === "string" ? a === b : a.vec === b.vec);

/**
 * The type as a short name: `f32`, `vec3`.
 * @param {unknown} t
 * @returns {string}
 */
export const showLType = (t) => (isVec(t) ? `vec${t.vec}` : typeof t === "string" ? t : JSON.stringify(t));

/** The names a vector's components may be read by, in order. */
export const COMPONENTS = "xyzw";
