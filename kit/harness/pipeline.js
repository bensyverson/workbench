// One fields Program through the three evaluators the harness compares: the reference interpreter,
// the emitted JS, and the emitted GLSL (as text; running it is gl.js's job). A planted fault is
// applied to one target's copy of the lowered Kernels, so the others stay the reference.

import { emitKernel, emitHelpers, instantiate } from "../emit/js/index.js";
import { emitGlsl, fromLowering } from "../emit/glsl/index.js";
import { run } from "../interp/index.js";
import { lowerField, INTRINSICS, FIELDS_DIALECT } from "../dialects/fields/index.js";

/** @import { Kernel } from "../ir/ir.js" */
/** @import { FieldProgram } from "../dialects/fields/decls.js" */
/** @import { GlslResult } from "../emit/glsl/index.js" */

/**
 * The Kernels of one Program: its pixel Kernel and the helpers beside it, by name.
 * @typedef {{ pixel: Kernel, helpers: Record<string, Kernel> }} Kernels
 */

/**
 * A planted fault: it edits the Kernels one target is built from (`ir`), the text that target emitted
 * (`text`, called once per emitted function with its name), or both. `target` is the backend that gets it;
 * the interpreter always runs the lowered Kernels as they are.
 * @typedef {object} Plant
 * @property {"js" | "glsl"} target
 * @property {(k: Kernels) => void} [ir]  Edits a private copy in place.
 * @property {(text: string, name: string) => string} [text]
 */

/**
 * @typedef {object} Pipeline
 * @property {FieldProgram} program
 * @property {Kernels} kernels  As lowered (what the interpreter runs).
 * @property {(uv: number[], u: Record<string, unknown>, onNode?: (e: import("../interp/interp.d.ts").NodeEvent) => void) => number[]} interp
 * @property {(uv: number[], u: Record<string, unknown>) => number[]} js
 * @property {{ source: string, lines: Array<{ span: [number, number], start: { line: number, column: number } }> }} jsEmitted  The pixel function's source and its line map.
 * @property {GlslResult} glsl
 * @property {boolean} planted  Whether the fault's edit changed anything of its target.
 */

/**
 * Lowers `program` and builds its three evaluators.
 * @param {FieldProgram} program
 * @param {Plant} [plant]
 * @returns {Pipeline}
 */
export function prepare(program, plant) {
  const lowered = lowerField(program);
  const diagnostics = [lowered.pixel, ...lowered.helpers.map((h) => h.result)].flatMap((r) => r.diagnostics);
  if (!lowered.kernel || diagnostics.length) throw new Error(`${program.name} did not lower: ${diagnostics.map((d) => d.message).join("; ")}`);
  /** @type {Kernels} */
  const kernels = { pixel: lowered.kernel, helpers: {} };
  for (const h of lowered.helpers) if (h.kind === "fn" && h.result.kernel) kernels.helpers[h.name] = h.result.kernel;

  /** @param {"js" | "glsl"} target */
  const copyFor = (target) => {
    if (plant?.target !== target || !plant.ir) return kernels;
    const c = /** @type {Kernels} */ (structuredClone(kernels));
    plant.ir(c);
    return c;
  };
  const options = { intrinsics: INTRINSICS };
  const textFor = (/** @type {"js" | "glsl"} */ target, /** @type {string} */ s, /** @type {string} */ name) => (plant?.target === target && plant.text ? plant.text(s, name) : s);
  let planted = false;

  const jk = copyFor("js");
  const pieces = [emitKernel(jk.pixel, options), ...Object.values(jk.helpers).map((h) => emitKernel(h, options))].map((e) => {
    const source = textFor("js", e.source, e.name);
    const prelude = e.prelude.map((p) => textFor("js", p, e.name));
    if (source !== e.source || prelude.some((p, i) => p !== e.prelude[i])) planted = true;
    return { ...e, source, prelude };
  });
  const jsEmitted = { source: pieces[0].source, lines: pieces[0].lines };
  const fn = instantiate(pieces[0], emitHelpers(pieces.slice(1)));

  const gk = copyFor("glsl");
  const base = fromLowering({ ...lowered, kernel: gk.pixel, helpers: Object.entries(gk.helpers).map(([name, kernel]) => ({ name, kind: "fn", result: { kernel } })) });
  const glsl = emitGlsl(base, FIELDS_DIALECT);
  if (glsl.source === null) throw new Error(`${program.name}: the GLSL target refused it: ${glsl.diagnostics.map((d) => d.message).join("; ")}`);
  if (plant?.target === "glsl" && plant.text) {
    const edited = plant.text(glsl.source, program.name);
    if (edited !== glsl.source) { glsl.source = edited; planted = true; }
  }
  if (plant?.target === "glsl" && plant.ir && JSON.stringify(gk) !== JSON.stringify(kernels)) planted = true;
  if (plant?.target === "js" && plant.ir && JSON.stringify(jk) !== JSON.stringify(kernels)) planted = true;

  return {
    program,
    kernels,
    interp: (uv, u, onNode) => /** @type {number[]} */ (run(kernels.pixel, [uv, u], { helpers: kernels.helpers, intrinsics: INTRINSICS, ...(onNode ? { onNode } : {}) })),
    js: (uv, u) => /** @type {number[]} */ (fn(uv, u)),
    jsEmitted,
    glsl,
    planted,
  };
}

/**
 * The values of one param set as the interpreter and the JS function take them (a choice by name), and as the
 * shader takes them (a choice by option index, a toggle as a boolean), keyed by uniform name.
 * @param {Pipeline} p
 * @param {Record<string, number | string | boolean>} values  Every uniform of the program: its params, `t` and `aspect`.
 * @returns {{ host: Record<string, unknown>, gl: Record<string, number | boolean> }}
 */
export function uniformValues(p, values) {
  /** @type {Record<string, number | boolean>} */
  const gl = {};
  for (const u of p.glsl.uniforms) {
    const v = values[u.param];
    if (v === undefined) throw new Error(`${p.program.name}: no value for uniform '${u.param}'`);
    if (u.options) {
      const i = u.options.indexOf(/** @type {string} */ (v));
      if (i < 0) throw new Error(`${p.program.name}: '${String(v)}' is not an option of '${u.param}'`);
      gl[u.glsl] = i;
    } else gl[u.glsl] = /** @type {number | boolean} */ (v);
  }
  return { host: { ...values }, gl };
}
