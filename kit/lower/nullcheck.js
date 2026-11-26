// Lowering an explicit null check: an optional on one side of `==`, `!=`, `===` or `!==` and `null` or
// `undefined` on the other. It tests emptiness only, so an optional number holding 0 or a date at the epoch
// (stored as 0) is present, and a loose one narrows a `const` local as truthiness does (see `nullFacts`).
//
// Each form keeps its JavaScript meaning, since emitted code must do what the source does:
// - `x != null` (or `undefined`) matches both empty values; it lowers to `present`, `x == null` to `not(present)`,
//   and it is the null check that narrows.
// - `x !== null` lowers to `ne(x, null)` as before, and narrows nothing: the core itself gives undefined for an
//   empty value (`find` with no match, an index past a known length, an optional struct key read by
//   destructuring), for which `!== null` is true. (62bec66 narrowed an optional primitive by it, trusting the
//   Dialect to give null; that premise was wrong, since the empty values above come from the core, not the Dialect.)
// - `x !== undefined` is refused: the kit's empty value is null, for which it is true.

import { binary, describe, expr, spanOf } from "./expr.js";

/** @import * as AST from "../parse/ast.js" */
/** @import { Expr } from "../ir/ir.js" */
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
    L.error("L003", node, `'${node.operator} undefined' is ${check.present ? "true" : "false"} for null, the empty value here.`, `Use ${src} ${check.present ? "!=" : "=="} null, which matches undefined as well and narrows.`);
    return L.ex({ k: "null", t: "unknown", span });
  }
  if (!isOpt && check.undef && v.t !== "unknown" && v.t !== "null") {
    L.error("L003", node, `${describe(v.t)} and undefined can never be equal.`, "This value is never empty: drop the check.");
    return L.ex({ k: "bool", v: !check.present, t: "bool", span });
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
  const key = b ? (b.kind === "const" && typeof b.t === "object" && "opt" in b.t ? b.name : null) : optionalGlobal(L, check.value.name);
  if (key === null || !check.loose) return { yes: [], no: [] };
  return check.present ? { yes: [key], no: [] } : { yes: [], no: [key] };
}

/**
 * The narrowing key of an optional global (an Event input's record, null in a slot called without one: ruling 6,
 * 2026-11-26), or null. A lambda cannot assign a global, so a check on one holds like one on a `const` local; the
 * key cannot meet a local's name.
 * @param {Lowerer} L @param {string} name @returns {string | null}
 */
export function optionalGlobal(L, name) {
  const g = Object.hasOwn(L.environment.globals, name) ? L.environment.globals[name] : undefined;
  return g && typeof g === "object" && "opt" in g ? `global ${name}` : null;
}
