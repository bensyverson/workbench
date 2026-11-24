// Lowering a Dialect's nominal scalars (`{ scalar: "date", of: "f64" }`): a named type stored as an f64
// that compares with its own kind and meets no arithmetic. What the name means (a date, a stamp) is the
// Dialect's; this file knows only "a named scalar". Each refusal is one L003 with a one-line tip.

import { namedScalar, showType } from "../ir/types.js";
import { bad, spanOf } from "./expr.js";

/** @import * as AST from "../parse/ast.js" */
/** @import { Type, Expr, Op } from "../ir/ir.js" */
/** @import { Lowerer } from "./lowerer.js" */

const ORDER = /** @type {Record<string, Op>} */ ({ "<": "lt", "<=": "le", ">": "gt", ">=": "ge" });
const EQUAL = new Set(["===", "!==", "==", "!="]);

/**
 * The nominal scalar `t` is or holds as a possibly-empty value, or null.
 * @param {Type} t
 */
const held = (t) => namedScalar(typeof t === "object" && "opt" in t ? t.opt : t);

/**
 * A binary operator with a nominal scalar on either side, or null to leave it to the general rules
 * (an equality whose sides can be equal, such as an optional scalar and null).
 * @param {Lowerer} L
 * @param {string} operator
 * @param {Expr} a
 * @param {Expr} b
 * @param {AST.Node} node
 * @returns {Expr | null}
 */
export function scalarBinary(L, operator, a, b, node) {
  const sa = namedScalar(a.t), sb = namedScalar(b.t);
  const s = /** @type {import("../ir/ir.js").ScalarType} */ (sa ?? sb);
  const name = showType(s);
  const other = sa ? b : a;
  const ordered = operator in ORDER;
  if (ordered || EQUAL.has(operator)) {
    if (other.t === "unknown" || (sa && sb && sa.scalar === sb.scalar)) return ordered ? L.ex({ k: "op", op: ORDER[operator], args: [a, b], t: "bool", span: spanOf(node) }) : null;
    if (!ordered && held(other.t)?.scalar === s.scalar) return null;
    const tip = namedScalar(other.t) ? `Compare two ${name}s; ${name} and ${showType(other.t)} are different types.` : `Compare two ${name}s; a ${name} never meets ${other.t === "f64" || other.t === "f32" ? "a plain number" : showType(other.t)}.`;
    L.error("L003", node, `'${operator}' compares ${name} only with ${name}, not with ${showType(other.t)}.`, tip);
    return bad(node);
  }
  return refuse(L, `'${operator}'`, s, node);
}

/**
 * L003 for an operator that takes no nominal scalar.
 * @param {Lowerer} L
 * @param {string} what  The operator, quoted.
 * @param {import("../ir/ir.js").ScalarType} s
 * @param {AST.Node} node
 * @returns {Expr}
 */
export function refuse(L, what, s, node) {
  const name = showType(s);
  L.error("L003", node, `${what} does not take ${name}: a ${name} is compared with another ${name}, never computed with.`, `Use one of the Dialect's intrinsics that take a ${name}.`);
  return bad(node);
}

/**
 * L003 for a nominal scalar tested as a condition, returning whether it was one: it is always present, and
 * its backing number would make the one stored as 0 (the epoch, for a date) false. A possibly-empty scalar
 * is tested as an optional number is, by JavaScript's truthiness: that is how it narrows.
 * @param {Lowerer} L
 * @param {AST.Node} node
 * @param {Type} t
 * @returns {boolean}
 */
export function scalarTest(L, node, t) {
  const s = namedScalar(t);
  if (!s) return false;
  const name = showType(s);
  L.error("L003", node, `A ${name} is not tested as a condition: it is always present, and the one stored as 0 would read as false.`, `Compare it with another ${name}.`);
  return true;
}
