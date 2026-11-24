// Running a kernel: bind its parameters, run its body, and hand back what it returns.

import { execBlock } from "./exec.js";
import { Scope, step, DEFAULT_MAX_DEPTH } from "./frame.js";
import { fit } from "./values.js";

/** @import { Kernel } from "../ir/ir.js" */
/** @import { Machine } from "./frame.js" */
/** @import { RunEnv, Value } from "./interp.js" */

/**
 * Evaluates `kernel` by walking its IR, and returns what it returns (undefined for none).
 *
 * `inputs` are the arguments in the kernel's parameter order, or an object by parameter name.
 * Each is rounded to its parameter's type, so an f32 parameter never holds a double. Everything
 * the kernel reaches outside itself comes from `env` (see `RunEnv`).
 * @param {Kernel} kernel
 * @param {Value[] | Record<string, Value>} inputs
 * @param {RunEnv} [env]
 * @returns {Value}
 */
export function run(kernel, inputs, env = {}) {
  const args = Array.isArray(inputs) ? inputs : kernel.params.map((p) => {
    if (!Object.hasOwn(inputs, p.name)) throw new Error(`${kernel.name}: no input for parameter '${p.name}'`);
    return inputs[p.name];
  });
  /** @type {Machine} */
  const m = { env, steps: 0, call: (k, a, depth) => call(m, k, a, depth) };
  return call(m, kernel, args, 0);
}

/**
 * @param {Machine} m
 * @param {Kernel} kernel
 * @param {Value[]} args
 * @param {number} depth
 * @returns {Value}
 */
function call(m, kernel, args, depth) {
  if (depth > (m.env.maxDepth ?? DEFAULT_MAX_DEPTH)) throw new Error(`${kernel.name}: calls nested past the depth limit (${m.env.maxDepth ?? DEFAULT_MAX_DEPTH})`);
  step(m, kernel.name);
  if (args.length < kernel.params.length) {
    throw new Error(`${kernel.name}: parameter '${kernel.params[args.length].name}' was not given (${args.length} of ${kernel.params.length} arguments)`);
  }
  const scope = new Scope(null);
  kernel.params.forEach((p, i) => scope.declare(p.name, fit(args[i], p.t)));
  const sig = execBlock({ m, kernel, scope, depth }, kernel.body, "body");
  return sig?.signal === "return" ? sig.value : undefined;
}
