// Running one Case through the three evaluators and comparing them pairwise. The GLSL half needs a way to run
// shaders, which the caller supplies as `render` (a page driven by sleepy, in scripts/shader-diff): this module
// builds the jobs and reads the results, and knows nothing of how they run.

import { prepare, uniformValues } from "./pipeline.js";
import { evaluateGrid } from "./evaluate.js";
import { compare, rgbOf } from "./compare.js";
import { locate } from "./locate.js";
import { GLSL_TOLERANCE } from "./tolerance.js";

/** @import { Case } from "./cases.js" */
/** @import { Comparison, Shape } from "./compare.js" */
/** @import { Location } from "./locate.js" */
/** @import { Plant, Pipeline } from "./pipeline.js" */
/** @import { ShaderJob } from "./gl.js" */

/**
 * Runs shader jobs somewhere with a GPU and returns their pixels (RGBA float, row 0 at the bottom) or a compile error.
 * @typedef {(jobs: ShaderJob[]) => Promise<Array<{ id: string, error: string | null, sets: Float32Array[] }>>} Render
 */

/**
 * One pair's result: how the two compared, and where the worst difference came from.
 * @typedef {Comparison & { at: Location | null, tolerance: number }} PairResult
 */

/**
 * @typedef {object} CaseResult
 * @property {string} name
 * @property {Shape} shape
 * @property {PairResult} jsVsInterp  Held to identical bits.
 * @property {PairResult | null} glslVsInterp  Held to `tolerance`; null when no `render` was given, or when the shader did not build.
 * @property {PairResult | null} glslVsJs
 * @property {string | null} glslError  Why the shader did not compile, link or run.
 * @property {boolean} planted  False when a fault given to `prepare` changed nothing: the run is then no evidence.
 */

/**
 * The job that runs a pipeline's shader over a case's sets.
 * @param {Pipeline} p
 * @param {Case} c
 * @param {string} id
 * @returns {ShaderJob}
 */
export function shaderJob(p, c, id) {
  return {
    id,
    source: /** @type {string} */ (p.glsl.source),
    width: c.width,
    height: c.height,
    resolution: p.glsl.resolution,
    uniforms: p.glsl.uniforms.map((u) => ({ glsl: u.glsl, kind: u.kind })),
    sets: c.sets.map((s) => uniformValues(p, s.values).gl),
  };
}

/**
 * @param {Pipeline} p
 * @param {Case} c
 * @param {Comparison} cmp
 * @returns {PairResult}
 */
function withLocation(p, c, cmp, tolerance = 0) {
  const at = !cmp.exact || cmp.worst.diff > 0 ? locate(p, cmp.worst.pixel, c.width, c.height, uniformValues(p, c.sets[cmp.worst.set].values).host) : null;
  return { ...cmp, at, tolerance };
}

/**
 * The reference interpreter's pixels over every set of `c` (the slow part of a run, so a caller that runs many
 * pipelines of one case computes it once).
 * @param {Pipeline} p
 * @param {Case} c
 * @returns {Float32Array[]}
 */
export function referencePixels(p, c) {
  return c.sets.map((s) => evaluateGrid((uv, u) => p.interp(uv, u), c.width, c.height, uniformValues(p, s.values).host));
}

/**
 * The emitted JS function's pixels against the reference, held to identical bits.
 * @param {Pipeline} p
 * @param {Case} c
 * @param {Float32Array[]} ref
 * @returns {{ js: Float32Array[], pair: PairResult }}
 */
export function compareJs(p, c, ref) {
  const js = c.sets.map((s) => evaluateGrid((uv, u) => p.js(uv, u), c.width, c.height, uniformValues(p, s.values).host));
  return { js, pair: withLocation(p, c, compare(ref, js, shapeOf(c), 0)) };
}

/**
 * The shader's pixels (an RGBA readback per set) against another evaluator's, within `tolerance`.
 * @param {Pipeline} p
 * @param {Case} c
 * @param {Float32Array[]} ref  The evaluator's pixels (rgb).
 * @param {Float32Array[]} readback  The shader's (RGBA).
 * @param {number} tolerance
 * @returns {{ gl: Float32Array[], pair: PairResult }}
 */
export function compareGlsl(p, c, ref, readback, tolerance) {
  const gl = readback.map(rgbOf);
  return { gl, pair: withLocation(p, c, compare(ref, gl, shapeOf(c), tolerance), tolerance) };
}

/**
 * @param {Case} c
 * @returns {Shape}
 */
function shapeOf(c) {
  return { width: c.width, height: c.height, labels: c.sets.map((s) => s.label) };
}

/**
 * Runs `c` and compares. With a fault planted in one target the interpreter stays the reference, so the pair that
 * holds the faulty target is the one expected to differ.
 * @param {Case} c
 * @param {{ render?: Render, tolerance?: number, plant?: Plant, id?: string }} [options]
 * @returns {Promise<CaseResult>}
 */
export async function runCase(c, options = {}) {
  const tolerance = options.tolerance ?? GLSL_TOLERANCE;
  const p = prepare(c.program, options.plant);
  const ref = referencePixels(p, c);
  const { js, pair: jsVsInterp } = compareJs(p, c, ref);
  /** @type {CaseResult} */
  const result = { name: c.name, shape: shapeOf(c), jsVsInterp, glslVsInterp: null, glslVsJs: null, glslError: null, planted: p.planted };
  if (!options.render) return result;
  const [shader] = await options.render([shaderJob(p, c, options.id ?? c.name)]);
  if (shader.error) return { ...result, glslError: shader.error };
  const vsInterp = compareGlsl(p, c, ref, shader.sets, tolerance);
  result.glslVsInterp = vsInterp.pair;
  result.glslVsJs = withLocation(p, c, compare(js, vsInterp.gl, shapeOf(c), tolerance), tolerance);
  return result;
}
