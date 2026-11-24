// Lowering an explicit null check: an optional on one side of `==`, `!=`, `===` or `!==` and `null` or
// `undefined` on the other. It tests emptiness only, so an optional number holding 0 or a date at the epoch
// (stored as 0) is present, and it narrows a `const` local as truthiness does (see `nullFacts`).
//
// Each form keeps its JavaScript meaning, since emitted code must do what the source does:
// - `x != null` (or `undefined`) matches both empty values; it lowers to `present`, `x == null` to `not(present)`.
// - `x !== null` lowers to `ne(x, null)` as before. It narrows only an optional primitive (a number, a nominal
//   scalar, a string, an enum, a bool), trusting that a Dialect gives null, never undefined, for an empty one;
//   an optional reference does not narrow by it, because `find` gives undefined for no match.
// - `x !== undefined` is refused: the kit's empty value is null, for which it is true.

import { binary, expr, spanOf } from "./expr.js";
import { namedScalar } from "../ir/types.js";

/** @import * as AST from "../parse/ast.js" */
/** @import { Expr, Type } from "../ir/ir.js" */
/** @import { Lowerer } from "./lowerer.js" */

/** @typedef {{ value: AST.Expression, emptyNode: AST.Expression, present: boolean, loose: boolean, undef: boolean }} NullCheck */

const OPERATORS = new Set(["===", "==", "!==", "!="]);

/**
 * Whether `n` spells an empty value: the literal `null`, or `undefined` where no local shadows it.
 * @param {Lowerer} L
 * @param {AST.Node} n
 */
const empty = (L, n) => (n.type === "Literal" && n.value === null) || isUndefined(L, n);

/** @param {Lowerer} L @param {AST.Node} n */
const isUndefined = (L, n) => n.type === "Identifier" && n.name === "undefined" && !L.lookup("undefined");

/**
 * The parts of `node` if it is a null check: the side that is not empty, whether a true result means
 * present, and how it compares. Null for any other expression, including one with both sides empty.
 * @param {Lowerer} L
 * @param {AST.Node} node
 * @returns {NullCheck | null}
 */
export function nullCheckOf(L, node) {
  if (node.type !== "BinaryExpression" || !OPERATORS.has(node.operator)) return null;
  const left = empty(L, node.left), right = empty(L, node.right);
  if (left === right) return null;
  const [value, emptyNode] = left ? [node.right, node.left] : [node.left, node.right];
  return { value, emptyNode, present: node.operator.startsWith("!"), loose: node.operator.length === 2, undef: isUndefined(L, emptyNode) };
}

/**
 * Whether a strict `!== null` proves a value of `t` present: an optional primitive's empty value is null.
 * @param {Type} t  The optional's inner type.
 */
const nullIsEmpty = (t) => t === "f64" || t === "f32" || t === "str" || t === "bool" || namedScalar(t) !== null || (typeof t === "object" && "enum" in t);

/**
 * Lowers a null check (see `nullCheckOf`). A side that is not optional falls to the general equality
 * rules with a null literal in place of the empty value, so their refusals are unchanged.
 * @param {Lowerer} L
 * @param {AST.BinaryExpression} node
 * @param {NullCheck} check
 * @returns {Expr}
 */
export function nullCheck(L, node, check) {
  const span = spanOf(node);
  const v = expr(L, check.value);
  const isOpt = typeof v.t === "object" && "opt" in v.t;
  if (isOpt && check.undef && !check.loose) {
    const src = L.src.slice(check.value.range[0], check.value.range[1]);
    L.error("L003", node, `'${node.operator} undefined' is ${check.present ? "true" : "false"} for null, the empty value here.`, `Use ${src} ${check.present ? "!==" : "==="} null, or ${src} ${check.present ? "!=" : "=="} null to match undefined as well.`);
    return L.ex({ k: "null", t: "unknown", span });
  }
  if (!isOpt || !check.loose) {
    const nothing = L.ex({ k: "null", t: "null", span: spanOf(check.emptyNode) });
    return check.value === node.left ? binary(L, node.operator, v, nothing, node) : binary(L, node.operator, nothing, v, node);
  }
  const present = L.ex({ k: "op", op: "present", args: [v], t: "bool", span });
  return check.present ? present : L.ex({ k: "op", op: "not", args: [present], t: "bool", span });
}

/**
 * What a null check proves when it is true or false: the optional `const` local it shows present, if any.
 * @param {Lowerer} L
 * @param {NullCheck} check
 * @returns {{ yes: string[], no: string[] } | null}  Null when `check` is not about a local.
 */
export function nullFacts(L, check) {
  if (check.value.type !== "Identifier") return null;
  const b = L.lookup(check.value.name);
  if (!b || b.kind !== "const" || typeof b.t !== "object" || !("opt" in b.t)) return { yes: [], no: [] };
  if (!check.loose && (check.undef || !nullIsEmpty(b.t.opt))) return { yes: [], no: [] };
  return check.present ? { yes: [b.name], no: [] } : { yes: [], no: [b.name] };
}
