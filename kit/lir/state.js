// What one lowering to the LIR carries: its diagnostics, the preludes and uniforms it has
// collected, the helpers it has lowered, and, per kernel, the names it gave each variable.

import { showType } from "../ir/types.js";

/** @import { Kernel, Type, Span } from "../ir/ir.js" */
/** @import { LType, LUniform, LKernel, LirDiagnostic, Spelling } from "./lir.js" */

/**
 * What lowering needs besides the Kernels.
 * @typedef {object} LirInput
 * @property {string} name  The program's name.
 * @property {Kernel} main  The entry Kernel.
 * @property {Kernel[]} helpers  The helper Kernels it may call, by `name`; the ones it reaches are lowered.
 * @property {Record<string, Record<string, Type>>} uniforms  By object name, the members a uniform object has: `Uniforms: { angle: "f32" }`.
 */

/**
 * @typedef {object} LirOptions
 * @property {(fn: string) => Spelling | null} spell  How the target spells the intrinsic a Kernel calls, or null for none.
 */

export class State {
  /**
   * @param {LirInput} input
   * @param {LirOptions} options
   */
  constructor(input, options) {
    this.input = input;
    this.spell = options.spell;
    /** @type {LirDiagnostic[]} */
    this.diagnostics = [];
    /** @type {Map<string, string>} */
    this.preludes = new Map();
    /** The Kernel behind each helper name. @type {Map<string, Kernel>} */
    this.kernels = new Map();
    /** The function name each Kernel got, by its core name. @type {Map<string, string>} */
    this.fnNames = new Map();
    /** The program's uniforms by `Owner.member`. @type {Map<string, LUniform>} */
    this.uniforms = new Map();
    /** Helpers lowered, callee first. @type {LKernel[]} */
    this.order = [];
    /** @type {Set<string>} */
    this.visiting = new Set();
    /** @type {Set<string>} */
    this.done = new Set();
    /** Lowers the helper of this name (unless it already is), so the helpers come out callee first; set by `lowerToLir`. @type {(name: string) => void} */
    this.lowerHelper = () => {};
  }
}

/** One Kernel being lowered. */
export class Ctx {
  /**
   * @param {State} state
   * @param {Kernel} kernel
   */
  constructor(state, kernel) {
    this.state = state;
    this.kernel = kernel;
    /** Each variable of the Kernel, by core name: its name and type in the LIR. @type {Map<string, { name: string, t: LType | null }>} */
    this.vars = new Map();
    /** The parameters that are uniform objects, by name: `u` in `(uv, u) => …`. @type {Map<string, string>} */
    this.uniformParams = new Map();
    /** The names in use in this Kernel: the functions', the intrinsics it calls, and each variable's. @type {Set<string>} */
    this.taken = new Set();
  }

  /**
   * Reports why this Kernel cannot lower. Read after "Target `glsl` cannot take `<kernel>`:", so it starts with "it".
   * @param {"R001" | "R002" | "R003" | "R004" | "R005"} code
   * @param {string} message
   * @param {Span | null} span
   */
  report(code, message, span) {
    this.state.diagnostics.push({ code, message, kernel: this.kernel.name, span });
  }

  /**
   * The LIR type of a core type, or null (reported) when it has none.
   * @param {Type} t
   * @param {Span | null} span
   * @param {string} what  What holds it, for the message.
   * @returns {LType | null}
   */
  type(t, span, what) {
    if (t === "f32" || t === "bool") return t;
    if (t === "f64" || (typeof t === "object" && "vec" in t && t.of === "f64")) return this.f64(what, span);
    if (typeof t === "object" && "vec" in t) return { vec: t.vec };
    if (typeof t === "object" && "enum" in t && t.declared) return "i32";
    this.report("R002", `it uses ${showType(t)} (${what}), which has no form in the LIR (f32, i32, bool and vectors of f32)`, span);
    return null;
  }

  /**
   * @param {string} what
   * @param {Span | null} span
   * @returns {null}
   */
  f64(what, span) {
    this.report("R001", `it holds an f64 (${what}), so its meaning depends on f64 precision, and GLSL ES 3.00 has no f64; compute in f32`, span);
    return null;
  }
}
