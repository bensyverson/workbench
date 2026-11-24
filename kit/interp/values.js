// Values and operators. A number is a JS double, an f32 is a double that `Math.fround` has
// rounded, and a vector is an array of its components. The interpreter rounds a value to its
// type after every expression, so an f32 operation is the double operation rounded once.

/** @import { Type, Op } from "../ir/ir.js" */
/** @import { Value } from "./interp.js" */

/** The component names, in order: `.x` is index 0. */
export const COMPONENTS = "xyzw";

/**
 * Rounds `v` to what `t` holds: an f32, or each component of a vector of f32s. Anything else
 * (an f64, a string, a record, an entity) is as it was. An optional rounds what it holds.
 * @param {Value} v
 * @param {Type} t
 * @returns {Value}
 */
export function fit(v, t) {
  if (t === "f32") return Math.fround(/** @type {number} */ (v));
  if (typeof t !== "object") return v;
  if ("vec" in t) return t.of === "f32" ? /** @type {number[]} */ (v).map(Math.fround) : v;
  if ("opt" in t) return v === null || v === undefined ? v : fit(v, t.opt);
  return v;
}

/**
 * Applies `f` to two operands: componentwise on two vectors, and with a scalar on the side
 * `scale` allows it (`either`: mul; `right`: div; `none`: add, sub, which take two of one type).
 * @param {(a: number, b: number) => number} f
 * @param {"either" | "right" | "none"} scale
 * @param {Value} a
 * @param {Value} b
 * @param {string} op
 * @returns {Value}
 */
function binary(f, scale, a, b, op) {
  const va = Array.isArray(a), vb = Array.isArray(b);
  if (va && vb) {
    if (a.length !== b.length) throw new Error(`${op} of vectors of ${a.length} and ${b.length} components`);
    return a.map((x, i) => f(x, b[i]));
  }
  if (va && !vb) {
    if (scale === "none") throw new Error(`${op} takes two vectors or two scalars, not a vector and a scalar`);
    return a.map((x) => f(x, /** @type {number} */ (b)));
  }
  if (!va && vb) {
    if (scale === "none") throw new Error(`${op} takes two vectors or two scalars, not a scalar and a vector`);
    if (scale === "right") throw new Error(`${op} does not take a scalar before a vector`);
    return b.map((y) => f(/** @type {number} */ (a), y));
  }
  return f(/** @type {number} */ (a), /** @type {number} */ (b));
}

/**
 * A scalar-only operator (`rem`, `pow`, the bitwise ones and the compares).
 * @param {(a: any, b: any) => Value} f
 * @param {Value} a
 * @param {Value} b
 * @param {string} op
 * @returns {Value}
 */
function scalars(f, a, b, op) {
  if (Array.isArray(a) || Array.isArray(b)) throw new Error(`${op} takes scalars, not vectors`);
  return f(a, b);
}

/**
 * @param {(a: number) => number} f
 * @param {Value} a
 * @returns {Value}
 */
const unary = (f, a) => (Array.isArray(a) ? a.map(f) : f(/** @type {number} */ (a)));

/**
 * An operator over its evaluated operands (`and` and `or` are lazy, so the evaluator handles them).
 * The result is not yet rounded to the node's type: `fit` does that.
 * @param {Op} op
 * @param {Value[]} args
 * @returns {Value}
 */
export function applyOp(op, args) {
  const [a, b] = args;
  /** @param {number} n */
  const arity = (n) => { if (args.length !== n) throw new Error(`${op} takes ${n} operand${n === 1 ? "" : "s"}, not ${args.length}`); };
  switch (op) {
    case "add": arity(2); return binary((x, y) => x + y, "none", a, b, op);
    case "sub": arity(2); return binary((x, y) => x - y, "none", a, b, op);
    case "mul": arity(2); return binary((x, y) => x * y, "either", a, b, op);
    case "div": arity(2); return binary((x, y) => x / y, "right", a, b, op);
    case "rem": arity(2); return scalars((x, y) => x % y, a, b, op);
    case "pow": arity(2); return scalars((x, y) => Math.pow(x, y), a, b, op);
    case "neg": arity(1); return unary((x) => -x, a);
    case "pos": arity(1); return unary((x) => +x, a);
    case "band": arity(2); return scalars((x, y) => x & y, a, b, op);
    case "bor": arity(2); return scalars((x, y) => x | y, a, b, op);
    case "bxor": arity(2); return scalars((x, y) => x ^ y, a, b, op);
    case "bnot": arity(1); return ~(/** @type {number} */ (a));
    case "shl": arity(2); return scalars((x, y) => x << y, a, b, op);
    case "shr": arity(2); return scalars((x, y) => x >> y, a, b, op);
    case "ushr": arity(2); return scalars((x, y) => x >>> y, a, b, op);
    case "eq": arity(2); return scalars((x, y) => x === y, a, b, op);
    case "ne": arity(2); return scalars((x, y) => x !== y, a, b, op);
    case "lt": arity(2); return scalars((x, y) => x < y, a, b, op);
    case "le": arity(2); return scalars((x, y) => x <= y, a, b, op);
    case "gt": arity(2); return scalars((x, y) => x > y, a, b, op);
    case "ge": arity(2); return scalars((x, y) => x >= y, a, b, op);
    case "not": arity(1); return !a;
    case "truthy": arity(1); if (Array.isArray(a)) throw new Error("truthy takes no vector"); return !!a;
    case "present": arity(1); return a !== null && a !== undefined;
    case "concat": arity(2); return /** @type {string} */ (a) + /** @type {string} */ (b);
    case "f32": arity(1); return Math.fround(/** @type {number} */ (a));
    case "f64": arity(1); return a;
    case "and": case "or": throw new Error(`${op} is lazy: the evaluator must handle it`);
  }
  throw new Error(`no such operator '${op}'`);
}
