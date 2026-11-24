// The LIR verifier's tables: the fields each node kind has, and what each operator takes and gives.

import { isVec, sameLType, showLType } from "./types.js";

/** @import { LType, LOp } from "./lir.js" */

/** The fields each expression kind must have besides `k`, `t` and `span`. */
export const EXPR_FIELDS = /** @type {Record<string, string[]>} */ ({
  num: ["v"], bool: ["v"], local: ["name"], uniform: ["name"], op: ["op", "args"], conv: ["of"], call: ["name", "spelling", "args"],
  helper: ["name", "args"], vec: ["items"], swizzle: ["of", "name"], cond: ["test", "then", "else"],
});

/** The fields each statement kind must have besides `k` and `span`. */
export const STMT_FIELDS = /** @type {Record<string, string[]>} */ ({
  let: ["name", "t", "value"], set: ["name", "value"], do: ["value"], if: ["test", "then", "else"],
  for: ["name", "t", "init", "test", "update", "body", "bound"], return: ["value"], break: [], continue: [],
});

/**
 * What an operator gives for these operand types: the result type, or why it takes none.
 * @typedef {(args: LType[]) => LType | string} OpRule
 */

/** @param {LType} t */
const scalar = (t) => t === "f32" || t === "i32";

/**
 * Arithmetic on f32s and vectors. `scale` says where a scalar may stand beside a vector.
 * @param {"either" | "right" | "none"} scale
 * @returns {OpRule}
 */
const arithmetic = (scale) => (args) => {
  const [a, b] = args;
  const what = `takes two f32s, two vectors of one size${scale === "either" ? ", or a vector and an f32" : scale === "right" ? ", or a vector then an f32" : ""}`;
  if (args.length !== 2) return "takes two operands";
  if (a === "f32" && b === "f32") return "f32";
  if (isVec(a) && isVec(b) && a.vec === b.vec) return a;
  if (isVec(a) && b === "f32" && scale !== "none") return a;
  if (a === "f32" && isVec(b) && scale === "either") return b;
  return `${what}, not ${showLType(a)} and ${showLType(b)}`;
};

/** @type {OpRule} */
const negate = ([a, ...rest]) => (rest.length === 0 && (a === "f32" || isVec(a)) ? a : `takes one f32 or vector, not ${args2(a, rest)}`);
/** @param {LType} a @param {LType[]} rest */
const args2 = (a, rest) => [a, ...rest].map(showLType).join(" and ");

/** @type {OpRule} */
const order = ([a, b, ...rest]) => (rest.length === 0 && b !== undefined && scalar(a) && sameLType(a, b) ? "bool" : "takes two f32s or two i32s");
/** @type {OpRule} */
const equal = ([a, b, ...rest]) => (rest.length === 0 && b !== undefined && sameLType(a, b) ? "bool" : "takes two operands of one type");
/** @type {OpRule} */
const not = ([a, ...rest]) => (rest.length === 0 && a === "bool" ? "bool" : "takes one bool");
/** @type {OpRule} */
const logic = ([a, b, ...rest]) => (rest.length === 0 && a === "bool" && b === "bool" ? "bool" : "takes two bools");

/** What each operator takes and gives. i32 has comparisons only: its division would differ from the core's, and nothing needs the rest. */
export const OPS = /** @type {Record<LOp, OpRule>} */ ({
  add: arithmetic("none"), sub: arithmetic("none"), mul: arithmetic("either"), div: arithmetic("right"), neg: negate,
  lt: order, le: order, gt: order, ge: order, eq: equal, ne: equal, not, and: logic, or: logic,
});
