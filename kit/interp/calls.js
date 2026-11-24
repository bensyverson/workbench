// Calls: a dialect intrinsic through its reference implementation, a helper or method
// kernel, or a method of the host's own objects.

import { fit } from "./values.js";

/** @import { Expr, Type } from "../ir/ir.js" */
/** @import { Frame } from "./frame.js" */
/** @import { Value } from "./interp.js" */

/** @param {Value} v */
const isKernel = (v) => typeof v === "object" && v !== null && /** @type {{ ir?: unknown }} */ (v).ir === "kernel";

/**
 * Runs an intrinsic's reference implementation. A componentwise one runs once per component of
 * its vector arguments (a scalar argument is passed whole to each); any other gets every
 * vector argument's components spread into its parameters. The result is rounded to the call's type.
 * @param {string} name
 * @param {import("./interp.js").IntrinsicRef} impl
 * @param {Value[]} args
 * @param {Type} t
 * @returns {Value}
 */
export function callIntrinsic(name, impl, args, t) {
  if (impl.componentwise) {
    const sizes = args.filter(Array.isArray).map((a) => a.length);
    if (sizes.length === 0) return impl.ref(.../** @type {number[]} */ (args));
    if (sizes.some((n) => n !== sizes[0])) throw new Error(`${name} over vectors of different sizes`);
    const parts = Array.from({ length: sizes[0] }, (_, i) => impl.ref(...args.map((a) => (Array.isArray(a) ? a[i] : a))));
    return fit(parts, t);
  }
  return impl.ref(...args.flatMap((a) => (Array.isArray(a) ? a : [a])));
}

/**
 * A call to a method of the host's objects: `recv.name(args)`, or `recv(args)` when `fn` has no dot (`at(0, 0)`).
 * @param {Value} recv
 * @param {string} fn  The IR's path for the call: its last segment is the member.
 * @param {Value[]} args
 * @returns {Value}
 */
export function callHost(recv, fn, args) {
  const dot = fn.lastIndexOf(".");
  if (dot < 0) {
    if (typeof recv !== "function") throw new Error(`${fn} is not a function: the receiver is ${typeof recv}`);
    return recv(...args);
  }
  const name = fn.slice(dot + 1);
  const target = /** @type {Record<string, unknown> | null | undefined} */ (recv);
  if (target === null || target === undefined) throw new Error(`${fn}: the receiver is ${target}`);
  if (typeof target[name] !== "function") throw new Error(`${fn}: ${name} is not a function of the receiver`);
  return /** @type {Function} */ (target[name])(...args);
}

/**
 * Runs the helper `name`: a kernel, interpreted, or a plain function the environment supplies.
 * @param {Frame} f
 * @param {string} name
 * @param {Value[]} args
 * @returns {Value}
 */
export function callHelper(f, name, args) {
  const h = f.m.env.helpers?.[name];
  if (h === undefined) throw new Error(`helper '${name}' is not in the environment`);
  if (typeof h === "function") return h(...args);
  return f.m.call(h, args, f.depth + 1);
}

/**
 * Runs a program method: the kernel the environment has for `owner.name`, receiver first, else the receiver's own method.
 * @param {Frame} f
 * @param {Extract<Expr, { k: "method" }>} e
 * @param {Value} recv
 * @param {Value[]} args
 * @returns {Value}
 */
export function callMethod(f, e, recv, args) {
  const m = f.m.env.methods?.[`${e.owner}.${e.name}`];
  if (m !== undefined) {
    if (!isKernel(m)) throw new Error(`method '${e.owner}.${e.name}' is not a kernel`);
    return f.m.call(m, [recv, ...args], f.depth + 1);
  }
  const target = /** @type {Record<string, unknown> | null | undefined} */ (recv);
  if (target === null || target === undefined) throw new Error(`${e.owner}.${e.name}: the receiver is ${target}`);
  if (typeof target[e.name] !== "function") throw new Error(`${e.owner}.${e.name} is not a method of the receiver`);
  return /** @type {Function} */ (target[e.name])(...args);
}
