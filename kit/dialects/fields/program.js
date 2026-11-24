// Lowering a fields Program: its environment from its params, the Library functions it uses,
// its own helpers, and its pixel lambda, through the kit's program lowering.

import { lowerProgram } from "../../lower/index.js";
import { fieldsEnvironment } from "./environment.js";
import { LIBRARY, libraryFor } from "./library.js";

/** @import { FieldProgram } from "./decls.js" */
/** @import { LowerResult, HelperResult } from "../../lower/index.js" */
/** @import { Kernel } from "../../ir/ir.js" */

/**
 * @typedef {object} FieldLowering
 * @property {import("../../lower/environment.js").Environment} environment
 * @property {Kernel | null} kernel  The pixel Kernel; null when anything failed.
 * @property {LowerResult["diagnostics"]} diagnostics  The pixel lambda's.
 * @property {HelperResult[]} helpers  The Library functions and helpers it uses, with their Kernels.
 * @property {LowerResult} pixel
 */

/**
 * Lowers a Program's pixel lambda and the helpers beside it.
 * @param {FieldProgram} program
 * @returns {FieldLowering}
 */
export function lowerField(program) {
  const environment = fieldsEnvironment(program.params);
  const clash = program.units.find((u) => LIBRARY.some((l) => l.name === u.name));
  if (clash) throw new Error(`field '${program.name}' declares '${clash.name}', which the Library already defines; a second one would replace it inside the Library too`);
  const units = [...libraryFor([program.pixel, ...program.units.map((u) => u.src)]), ...program.units];
  const slot = { id: `${program.name}.pixel`, kind: "pixel", on: "field" };
  const { results, helpers } = lowerProgram(environment, [{ src: program.pixel, slot }], units);
  const [pixel] = results;
  return { environment, kernel: pixel.kernel, diagnostics: pixel.diagnostics, helpers, pixel };
}
