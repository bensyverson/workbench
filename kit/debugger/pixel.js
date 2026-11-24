// Where a pixel is and what a run sees: the convention the GLSL backend documents (uv is
// gl_FragCoord.xy / resolution, y up from the lower left, sampled at each pixel's center), and
// the uniforms a Program's params give.

/** @import { FieldProgram } from "../dialects/fields/decls.js" */

/**
 * The uv of the pixel in column `i` and row `j` counted from the bottom, of a `w` by `h` canvas.
 * @param {number} i
 * @param {number} j
 * @param {number} w
 * @param {number} h
 * @returns {[number, number]}
 */
export function pixelUv(i, j, w, h) {
  return [(i + 0.5) / w, (j + 0.5) / h];
}

/**
 * The pixel (column, and row from the bottom) a uv falls in, clamped to the canvas.
 * @param {number[]} uv
 * @param {number} w
 * @param {number} h
 * @returns {{ i: number, j: number }}
 */
export function pixelOfUv(uv, w, h) {
  const clamp = (/** @type {number} */ n, /** @type {number} */ size) => Math.min(size - 1, Math.max(0, Math.floor(n * size)));
  return { i: clamp(uv[0], w), j: clamp(uv[1], h) };
}

/**
 * The uniforms object a pixel lambda reads as `u`: each param's default, `t` (0) and `aspect` (1), then `overrides`.
 * @param {FieldProgram} program
 * @param {Record<string, unknown>} [overrides]
 * @returns {Record<string, unknown>}
 */
export function uniformsFor(program, overrides = {}) {
  /** @type {Record<string, unknown>} */
  const u = { t: 0, aspect: 1 };
  for (const [name, p] of Object.entries(program.params)) u[name] = p.value;
  return { ...u, ...overrides };
}
