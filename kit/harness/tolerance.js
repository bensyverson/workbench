// How far the GLSL target may stray from the reference interpreter. It belongs to the GLSL target (the fields
// Dialect's `targets.glsl.compare` says only "tolerance"); it lives here until it moves to the Dialect's `targets.glsl.compare` declaration (Ben's ruling, M3 leaf JsWK1s).

/**
 * The largest absolute difference allowed in any color component, in the unit range of a `color`: a quarter of
 * an 8-bit step (1/255 is 3.9e-3). Measured on Apple's GPU through WebKit, where the standard cases stray by at
 * most 2.2e-4 (4.6 times under this figure) and `swirl` and `bulge` not at all; the evidence, the headroom
 * and what a larger figure would cost are in `project/2026-11-23-m2-findings.md`.
 */
export const GLSL_TOLERANCE = 1e-3;
