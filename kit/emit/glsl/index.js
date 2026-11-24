// The GLSL backend: a pure Kernel over a Dialect's `pixel` space, as a GLSL ES 3.00 fragment shader.
// Capability check, then the LIR (kit/lir) and its verifier, then text with a line map.

import { lowerToLir } from "../../lir/index.js";
import { capabilityDiagnostics } from "./capabilities.js";
import { reachableHelpers } from "../../query/index.js";
import { emitProgram, showLineMap, RESOLUTION, OUTPUT } from "./emit.js";
import { glslType } from "./text.js";

export { showLineMap, RESOLUTION, OUTPUT };

/** @import { Kernel, Type } from "../../ir/ir.js" */
/** @import { LProgram, LirDiagnostic, Spelling } from "../../lir/lir.js" */
/** @import { LineOrigin } from "./emit.js" */

/**
 * What to emit: the entry Kernel, the helpers it may call, and the uniform objects' members.
 * @typedef {object} ShaderSource
 * @property {string} name
 * @property {Kernel} kernel  The pixel Kernel.
 * @property {Kernel[]} helpers  Helper functions of the program (not its constants: those are baked in at each use).
 * @property {Record<string, Record<string, Type>>} uniforms  By object name, the members of each object a Kernel may read as uniforms.
 */

/**
 * What the backend reads of a Dialect: how it spells each intrinsic in GLSL, and what its `glsl` target accepts.
 * @typedef {object} GlslDialect
 * @property {Record<string, { glsl: Spelling }>} intrinsics
 * @property {{ glsl?: { accepts: "*" | { domains: string[] } } }} targets
 */

/**
 * One uniform the host sets before drawing.
 * @typedef {object} UniformInfo
 * @property {string} glsl  The identifier in the shader.
 * @property {string} param  The Dialect's name for it.
 * @property {string} kind  The GLSL type: `float`, `int`, `bool`, `vec2`…
 * @property {string[]} [options]  For a choice, the options in order; the uniform is the index of the one chosen.
 */

/**
 * @typedef {object} GlslResult
 * @property {string | null} source  The fragment shader; null when the target refused the Kernel.
 * @property {LineOrigin[]} lines  One entry per line of `source`.
 * @property {UniformInfo[]} uniforms  Every uniform to set, in declaration order, besides `resolution`.
 * @property {string} resolution  The `vec2` uniform the host sets to the canvas size in pixels (`uv` is the fragment coordinate over it).
 * @property {string} output  The `vec4` the shader writes.
 * @property {LProgram | null} program  The verified LIR the text was written from.
 * @property {LirDiagnostic[]} diagnostics  Why the Kernel was refused, in the proposal's capability words.
 */

/**
 * Emits `source` as a fragment shader, or says why the target cannot take it.
 *
 * Conventions, which the comparison harness shares: `uv` is `gl_FragCoord.xy / resolution`, so it is the unit square
 * with y up and the origin at the lower left, sampled at each pixel's center (`(i + 0.5) / width`, as the book's
 * `uv` is); and the color is written as `vec4(color, 1.0)`, with no color-space conversion.
 * @param {ShaderSource} source
 * @param {GlslDialect} dialect
 * @returns {GlslResult}
 */
export function emitGlsl(source, dialect) {
  const refused = (/** @type {LirDiagnostic[]} */ diagnostics) => ({ source: null, lines: [], uniforms: [], resolution: RESOLUTION, output: OUTPUT, program: null, diagnostics });
  const accepts = dialect.targets.glsl?.accepts;
  if (!accepts) return refused([{ code: "T001", kernel: source.kernel.name, span: null, message: "The Dialect declares no `glsl` target, so no kernel of it can go there." }]);
  const unsupported = capabilityDiagnostics(source.kernel, source.helpers, accepts === "*" ? "*" : accepts, new Set(Object.keys(source.uniforms)));
  if (unsupported.length) return refused(unsupported);
  const { program, diagnostics } = lowerToLir(
    { name: source.name, main: source.kernel, helpers: reachableHelpers(source.kernel, source.helpers), uniforms: source.uniforms },
    { spell: (fn) => dialect.intrinsics[fn]?.glsl ?? null },
  );
  if (!program) return refused(diagnostics.map(sentence));
  if (program.main.params.length !== 1 || glslType(program.main.params[0].t) !== "vec2") {
    return refused([{ code: "T001", kernel: source.kernel.name, span: source.kernel.span, message: `Target \`glsl\` cannot take \`${source.kernel.name}\`: a pixel kernel takes its position (a vec2) and its uniforms, and this takes ${program.main.params.map((p) => glslType(p.t)).join(", ") || "neither"}.` }]);
  }
  const { source: text, lines } = emitProgram(program);
  const uniforms = program.uniforms.map((u) => ({ glsl: u.name, param: u.source, kind: glslType(u.t), ...(u.options ? { options: u.options } : {}) }));
  return { source: text, lines, uniforms, resolution: RESOLUTION, output: OUTPUT, program, diagnostics: [] };
}

/**
 * A lowering diagnostic in the capability message's words: the target, the kernel, why.
 * @param {LirDiagnostic} d
 * @returns {LirDiagnostic}
 */
function sentence(d) {
  if (d.code.startsWith("W")) return { ...d, message: `The GLSL backend made invalid LIR: ${d.message}` };
  return { ...d, message: `Target \`glsl\` cannot take \`${d.kernel}\`: ${d.message}.` };
}

/**
 * What a Dialect's lowering of one Program gives the backend: its pixel Kernel, the helper functions beside
 * it, and the members of its uniform objects. (A structural view of `FieldLowering`, so this module names no Dialect.)
 * @param {{ kernel: Kernel | null, helpers: Array<{ kind: string, result: { kernel: Kernel | null } }>, environment: { objects: Record<string, { members: Record<string, { kind: string, t?: Type }> }> } }} lowering
 * @returns {ShaderSource}
 */
export function fromLowering(lowering) {
  if (!lowering.kernel) throw new Error("the program did not lower, so there is no kernel to emit");
  /** @type {Record<string, Record<string, Type>>} */
  const uniforms = {};
  for (const [owner, o] of Object.entries(lowering.environment.objects)) {
    const members = Object.entries(o.members).filter(([, m]) => m.kind === "value" && m.t !== undefined);
    if (members.length) uniforms[owner] = Object.fromEntries(members.map(([n, m]) => [n, /** @type {Type} */ (m.t)]));
  }
  const helpers = lowering.helpers.filter((h) => h.kind === "fn" && h.result.kernel).map((h) => /** @type {Kernel} */ (h.result.kernel));
  return { name: lowering.kernel.name, kernel: lowering.kernel, helpers, uniforms };
}
