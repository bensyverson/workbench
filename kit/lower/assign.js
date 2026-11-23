// Lowering stores: assignment and `++`/`--`. A store applies its place's coercion,
// and as a value the expression yields what was computed, never the stored value.
// Evaluation order is JavaScript's: the receiver once, then (for a compound
// assignment or update) the target's old value, then the right-hand side.

import { assignable } from "../ir/types.js";
import { expr, check, mismatch, bad, seq, binary, resolveMember, placeOf, identifier, spanOf } from "./expr.js";

/** @import * as AST from "../parse/ast.js" */
/** @import { Expr, Effect, Place } from "../ir/ir.js" */
/** @import { Lowerer, Binding } from "./lowerer.js" */

/**
 * The writable place an assignment target names, or null after reporting why not.
 * With `once`, a receiver that could change or has effects is first saved to a
 * temporary, so reading and writing the place evaluate it once between them.
 * @param {Lowerer} L
 * @param {AST.MemberExpression} node
 * @param {{ once?: boolean }} [opts]
 * @returns {{ place: Place, load: () => Expr, write: Effect } | null}
 */
export function placeFor(L, node, opts = {}) {
  const r = resolveMember(L, node);
  if (!r) return null;
  const name = /** @type {AST.Identifier} */ (node.property).name;
  const d = r.decl;
  if (d.kind !== "value" || !d.store) {
    L.error("L013", node, `'${name}' is read-only at run time.`, "Baked values are ROM constants and built-ins like frame belong to the runtime; declare an .attr to change it.");
    return null;
  }
  const recv = opts.once ? saved(L, r.recv) : r.recv;
  const place = placeOf({ ...r, recv }, name);
  const span = spanOf(node);
  const load = () => L.ex({ k: "load", place, t: d.t, span }, d.effect ? [d.effect] : []);
  return { place, load, write: /** @type {Effect} */ (`write ${r.owner}.${name}`) };
}

/**
 * `e` itself when it yields the same value however late it is read, else a temporary holding it.
 * @param {Lowerer} L
 * @param {Expr} e
 * @returns {Expr}
 */
function saved(L, e) {
  if (L.stable(e)) return e;
  const name = L.temp(e.t);
  L.emit({ k: "let", name, t: e.t, value: e, span: e.span });
  return L.ex({ k: "local", name, t: e.t, span: e.span });
}

/**
 * The binding an assignment or update of `target` changes, or null after reporting why not.
 * @param {Lowerer} L
 * @param {AST.Identifier} target
 * @returns {Binding | null}
 */
function writableLocal(L, target) {
  const b = L.lookup(target.name);
  if (!b) { identifier(L, target); return null; }
  if (b.kind !== "let") { L.error("L013", target, `'${target.name}' is ${b.kind === "param" ? "a parameter" : "const"}.`, "Declare it with let to change it, or use a new name."); return null; }
  if (L.pure > 0) { L.error("L006", target, `A query callback must be pure, but this changes '${target.name}'.`, "Keep callbacks pure: compute the change after the query, from its result."); return null; }
  return b;
}

/**
 * `target = value` and compound assignments. As a value, it yields the right-hand side unwrapped.
 * @param {Lowerer} L
 * @param {AST.AssignmentExpression} node
 * @param {boolean} wantValue
 * @returns {Expr}
 */
export function assign(L, node, wantValue) {
  const span = spanOf(node);
  const op = node.operator;
  if (op === "||=" || op === "&&=" || op === "??=") { L.error("L012", node, `'${op}' is not lowered yet.`, "Write it out with an if."); return bad(node); }
  const binop = op.slice(0, -1);
  const target = node.left;
  if (target.type === "Identifier") {
    const b = writableLocal(L, target);
    if (!b) return bad(node);
    const cur = () => L.ex({ k: "local", name: b.name, t: b.t, span: spanOf(target) });
    let v;
    if (op === "=") v = check(L, node.right, b.t, `'${target.name}'`);
    else {
      const [old, r] = seq(L, [cur, () => expr(L, node.right)]);
      v = binary(L, binop, old, r, node);
      if (!assignable(v.t, b.t)) mismatch(L, node, v.t, b.t, `'${target.name}'`);
    }
    L.emit({ k: "set", name: b.name, value: v, span });
    return cur();
  }
  if (target.type !== "MemberExpression") { L.error("L012", target, "Destructuring assignment is not lowered yet.", "Assign each field on its own line."); return bad(node); }
  const p = placeFor(L, target, { once: op !== "=" });
  if (!p) return bad(node);
  const what = `${p.place.owner}.${p.place.name}`;
  let place = p.place;
  let v;
  if (op === "=") {
    const [recv, value] = seq(L, [() => p.place.recv, () => check(L, node.right, p.place.t, what)]);
    place = { ...p.place, recv };
    v = value;
  } else {
    const [old, r] = seq(L, [p.load, () => expr(L, node.right)]);
    v = binary(L, binop, old, r, node);
    if (!assignable(v.t, p.place.t)) mismatch(L, node, v.t, p.place.t, what);
  }
  if (wantValue && !L.stable(v)) {
    const name = L.temp(v.t);
    L.emit({ k: "let", name, t: v.t, value: v, span: v.span });
    v = L.ex({ k: "local", name, t: v.t, span: v.span });
  }
  L.emit({ k: "store", place, value: v, span }, [p.write]);
  return v;
}

/**
 * `++`/`--`. As a value, prefix yields the new number and postfix the old one, both unwrapped.
 * @param {Lowerer} L
 * @param {AST.UpdateExpression} node
 * @param {boolean} wantValue
 * @returns {Expr}
 */
export function update(L, node, wantValue) {
  const span = spanOf(node);
  const op = node.operator === "++" ? "add" : "sub";
  const one = () => L.ex({ k: "num", v: 1, t: "f64", span });
  const target = node.argument;
  /** @type {() => Expr} */
  let read;
  /** @type {(v: Expr) => void} */
  let write;
  if (target.type === "Identifier") {
    const b = writableLocal(L, target);
    if (!b) return bad(node);
    if (!assignable(b.t, "f64")) mismatch(L, target, b.t, "f64", `'${node.operator}'`);
    read = () => L.ex({ k: "local", name: b.name, t: "f64", span: spanOf(target) });
    write = (v) => { L.emit({ k: "set", name: b.name, value: v, span }); };
  } else if (target.type === "MemberExpression") {
    const p = placeFor(L, target, { once: true });
    if (!p) return bad(node);
    if (!assignable(p.place.t, "f64")) mismatch(L, target, p.place.t, "f64", `'${node.operator}'`);
    read = p.load;
    write = (v) => { L.emit({ k: "store", place: p.place, value: v, span }, [p.write]); };
  } else { L.error("L012", node, "This update target is not lowered.", "Update a local or a field."); return bad(node); }
  const opExpr = (/** @type {Expr} */ x) => L.ex({ k: "op", op, args: [x, one()], t: "f64", span });
  if (!wantValue) { write(opExpr(read())); return bad(node); }
  const name = L.temp("f64");
  const local = () => L.ex({ k: "local", name, t: "f64", span });
  if (node.prefix) {
    L.emit({ k: "let", name, t: "f64", value: opExpr(read()), span });
    write(local());
  } else {
    L.emit({ k: "let", name, t: "f64", value: read(), span });
    write(opExpr(local()));
  }
  return local();
}
