// Lowering a fields Program: the generated grammar's `lower` (kit/define), which builds the Environment from the
// Program's params and lowers its pixel lambda with the Library functions it uses and its own helpers, read
// back in the shape the backends, the harness and the debugger take.

import { field } from "./grammar.js";
import { LIBRARY } from "./dialect.js";

/** @import { FieldProgram } from "./decls.js" */
/** @import { LowerResult, HelperResult } from "../../lower/index.js" */
/** @import { Kernel } from "../../ir/ir.js" */

/**
 * @typedef {object} FieldLowering
 * @property {import("../../lower/environment.js").Environment} environment
 * @property {Kernel | null} kernel  The pixel Kernel; null when anything failed.
 * @property {LowerResult["diagnostics"]} diagnostics  The pixel lambda's own, and only those: when a Library function
 *   or helper it calls does not lower, the pixel has no kernel and may have no diagnostic; `pixel.blockedBy` names
 *   those functions, and their diagnostics are in `helpers` (a blocked helper's own `result.blockedBy` leads on).
 * @property {HelperResult[]} helpers  The Library functions and helpers it uses, with their Kernels.
 * @property {LowerResult} pixel
 */

/**
 * Lowers a Program's pixel lambda and the helpers beside it.
 * @param {FieldProgram} program
 * @returns {FieldLowering}
 */
export function lowerField(program) {
  // The builder refuses this (B002); a hand-built Program reaches here, and a second definition would replace the Library's own.
  const clash = program.units.find((u) => LIBRARY.some((l) => l.name === u.name));
  if (clash) throw new Error(`field '${program.name}' declares '${clash.name}', which the Library already defines; a second one would replace it inside the Library too`);
  const { environment, lambdas, helpers } = field.lower(program);
  const [{ result: pixel }] = lambdas;
  return { environment, kernel: pixel.kernel, diagnostics: pixel.diagnostics, helpers, pixel };
}
