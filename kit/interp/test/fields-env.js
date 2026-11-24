// Runs a lowered fields Program's pixel Kernel in the interpreter: the helpers beside it are
// the Environment's helpers, and the Dialect's intrinsics supply their reference implementations.
// (Node runs every file under test/; this one holds no tests.)
import assert from "node:assert/strict";
import { lowerField, INTRINSICS } from "../../dialects/fields/index.js";
import { run } from "../index.js";

/** @import { FieldProgram } from "../../dialects/fields/decls.js" */
/** @import { Kernel } from "../../ir/ir.js" */
/** @import { RunEnv } from "../interp.js" */

/**
 * Lowers `program` and returns a function from a uv and uniforms to the pixel's color.
 * @param {FieldProgram} program
 * @param {Partial<RunEnv>} [extra]  Added to the run's environment, e.g. a hook.
 * @returns {{ kernel: Kernel, pixel: (uv: number[], u: Record<string, unknown>) => number[] }}
 */
export function pixelOf(program, extra = {}) {
  const lowered = lowerField(program);
  assert.deepEqual(lowered.diagnostics.map((d) => d.code), [], program.name);
  const kernel = /** @type {Kernel} */ (lowered.kernel);
  /** @type {Record<string, Kernel>} */
  const helpers = {};
  for (const h of lowered.helpers) if (h.kind === "fn" && h.result.kernel) helpers[h.name] = h.result.kernel;
  const env = { helpers, intrinsics: INTRINSICS, ...extra };
  return { kernel, pixel: (uv, u) => /** @type {number[]} */ (run(kernel, [uv, u], env)) };
}
