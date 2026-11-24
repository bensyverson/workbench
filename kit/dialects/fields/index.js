// The fields Dialect: a small language for per-pixel color. What it means (types, intrinsics
// with each target's spelling, the pixel Iteration Space, targets), how a Program is written
// (`field`), and how one is lowered (`lowerField`). The Dialect's own numbers are f32:
// a bare literal is an f32 (`numberType`), and operators take their meaning from the types.

import { INTRINSICS } from "./intrinsics.js";
import { LIBRARY } from "./library.js";
import { VECTORS } from "./types.js";

export { field } from "./grammar.js";
export { lowerField } from "./program.js";
export { fieldsEnvironment, paramType, UNIFORMS } from "./environment.js";
export { INTRINSICS } from "./intrinsics.js";
export { LIBRARY, libraryFor } from "./library.js";
export * from "./types.js";

/** The Dialect as data, for the backends and tools that read what it declares. */
export const FIELDS_DIALECT = Object.freeze({
  name: "fields",
  /** The type of a number literal where nothing else gives it one. */
  numberType: /** @type {const} */ ("f32"),
  types: VECTORS,
  /** Where a Kernel runs: over each pixel, from its position to a color, with no effects. */
  domains: { pixel: { args: { uv: "vec2", u: "Uniforms" }, returns: "color", pure: true } },
  intrinsics: INTRINSICS,
  library: LIBRARY,
  /**
   * What each target accepts, and how its output is compared with the reference: the shape `defineDialect`
   * resolves `exact()` and `tolerance(figure)` to. The GLSL figure is the largest absolute difference allowed in
   * any color component (a quarter of an 8-bit step), measured on one GPU: see `project/2026-11-23-m2-findings.md`.
   */
  targets: {
    js: { accepts: "*", compare: { kind: /** @type {const} */ ("exact") } },
    glsl: { accepts: { domains: ["pixel"] }, compare: { kind: /** @type {const} */ ("tolerance"), figure: 1e-3 } },
  },
});
