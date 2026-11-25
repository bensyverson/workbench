// Lowering stores: assignment and `++`/`--`. A store applies its place's coercion,
// and as a value the expression yields what was computed, never the stored value.
// Evaluation order is JavaScript's: the receiver once, then (for a compound
// assignment or update) the target's old value, then the right-hand side.

import { assignable, showType, vectorOf } from "../ir/types.js";
import { components, componentOf, componentNames, isUntyped } from "./numeric.js";
import { expr, check, mismatch, bad, seq, binary, resolveMember, placeOf, identifier, spanOf } from "./expr.js";

/** @import * as AST from "../parse/ast.js" */
/** @import { Expr, Effect, Place, Span, Type } from "../ir/ir.js" */
/** @import { Lowerer, Binding } from "./lowerer.js" */

/**
 * The writable place an assignment target names, or null after reporting why not.
 * With `once`, a receiver that could change or has effects is first saved to a
 * temporary, so reading and writing the place evaluate it once between them.
 * @param {Lowerer} L
 * @param {AST.MemberExpression} node
 * A total (`bump: true`) is no place: it comes back as `{ total }`, for the caller to bump or refuse (L017).
 * @param {{ once?: boolean }} [opts]
 * @returns {{ place: Place, load: () => Expr, write: Effect, total?: undefined } | { total: Place } | null}
 */
export function placeFor(L, node, opts = {}) {
  const r = resolveMember(L, node);
  if (!r) return null;
  const name = /** @type {AST.Identifier} */ (node.property).name;
  const d = r.decl;
  if (d.kind === "value" && d.bump) return { total: placeOf(r, name) };
  if (d.kind === "value" && !d.store && r.owner === "vector") {
    L.error("L013", node, `'${name}' is a component of a vector value, which cannot be changed in place here.`, "Change a component of a let vector (let a = v; a.x = 1;), or build a new vector from the old one's components.");
    return null;
  }
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
  const top = L.sigs.helpers?.[target.name];
  if (!b && top) { L.error("L013", target, `'${target.name}' is a top-level ${top.kind === "const" ? "constant" : "function"} of the program.`, "A baked constant cannot change at run time; keep changing state in an attribute."); return null; }
  if (!b && L.environment.globals[target.name]) { L.error("L013", target, `'${target.name}' is a global of the language.`, "A global is read-only; keep what changes in a let local, or in a member the slot may write."); return null; }
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
  const part = vectorPart(L, target);
  if (part) return assignPart(L, node, wantValue, part);
  const p = placeFor(L, target, { once: op !== "=" });
  if (!p) return bad(node);
  if (p.total) {
    if (op !== "+=" || wantValue) return refuseTotal(L, node, target, op === "+=" ? "a bump used as a value" : `changed with '${op}'`);
    const written = L.src.slice(target.range[0], target.range[1]);
    const value = check(L, node.right, "f64", `a bump of ${written}`, (text, got) => bumpFix(L, written, text, got));
    L.emit({ k: "bump", place: p.total, value, span }, [/** @type {Effect} */ (`bump ${p.total.owner}.${p.total.name}`)]);
    return bad(node);
  }
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
  // An untyped literal is spilled too: the value of an assignment has its place's type, not a literal's.
  if (wantValue && (!L.stable(v) || isUntyped(v))) {
    const name = L.temp(v.t);
    L.emit({ k: "let", name, t: v.t, value: v, span: v.span });
    v = L.ex({ k: "local", name, t: v.t, span: v.span });
  }
  L.emit({ k: "store", place, value: v, span }, [p.write]);
  return v;
}

/**
 * A component of a vector held in a local: `a.x`, `a.r`. Null when `target` is anything else.
 * @param {Lowerer} L
 * @param {AST.MemberExpression} target
 * @returns {{ id: AST.Identifier, b: Binding, vec: import("../ir/ir.js").VecType, comp: string, label: string } | null}
 */
function vectorPart(L, target) {
  if (target.computed || target.object.type !== "Identifier" || target.property.type !== "Identifier") return null;
  const b = L.lookup(target.object.name);
  const vec = b && !b.dead && !b.pending ? vectorOf(b.t) : null;
  const name = target.property.name;
  if (!b || !vec || !(name in components(L, vec))) return null;
  return { id: target.object, b, vec, comp: componentOf(L, vec, name), label: `${target.object.name}.${name}` };
}

/**
 * `a.x = v` and `a.x += v` on a let vector: the vector is rebuilt with that component changed, since
 * a vector is a value and has no places inside it. As a value it yields what was computed.
 * @param {Lowerer} L
 * @param {AST.AssignmentExpression} node
 * @param {boolean} wantValue
 * @param {NonNullable<ReturnType<typeof vectorPart>>} part
 * @returns {Expr}
 */
function assignPart(L, node, wantValue, part) {
  const span = spanOf(node);
  const { id, b, vec, comp, label } = part;
  if (!writableLocal(L, id)) return bad(node);
  const cur = () => L.ex({ k: "local", name: b.name, t: b.t, span: spanOf(id) });
  // The assigned component's own read points at `a.x`; a kept one points at the vector `a` it comes from.
  const at = (/** @type {string} */ c, /** @type {Span} */ sp = spanOf(id)) => L.ex({ k: "field", of: cur(), name: c, t: vec.of, span: sp });
  let v;
  if (node.operator === "=") v = check(L, node.right, vec.of, label);
  else {
    const [old, r] = seq(L, [() => at(comp, spanOf(node.left)), () => expr(L, node.right)]);
    v = binary(L, node.operator.slice(0, -1), old, r, node);
    if (!assignable(v.t, vec.of)) mismatch(L, node, v.t, vec.of, label);
  }
  // An untyped literal is spilled too: the value of an assignment has its place's type, not a literal's.
  if (wantValue && (!L.stable(v) || isUntyped(v))) {
    const name = L.temp(v.t);
    L.emit({ k: "let", name, t: v.t, value: v, span: v.span });
    v = L.ex({ k: "local", name, t: v.t, span: v.span });
  }
  const items = componentNames(vec).map((c) => (c === comp ? v : at(c)));
  L.emit({ k: "set", name: b.name, value: L.ex({ k: "vec", items, t: b.t, span }), span });
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
  const target = node.argument;
  const part = target.type === "MemberExpression" ? vectorPart(L, target) : null;
  if (part && target.type === "MemberExpression") {
    // `a.x++` is `a.x += 1`; as a value, prefix yields the new component and postfix the old one.
    const one = /** @type {AST.Literal} */ ({ type: "Literal", value: 1, raw: "1", range: node.range, loc: node.loc });
    const step = /** @type {AST.AssignmentExpression} */ ({ type: "AssignmentExpression", operator: node.operator === "++" ? "+=" : "-=", left: target, right: one, range: node.range, loc: node.loc });
    if (!wantValue || node.prefix) return assign(L, step, wantValue);
    const cur = L.ex({ k: "local", name: part.b.name, t: part.b.t, span: spanOf(part.id) });
    const old = L.ex({ k: "field", of: cur, name: part.comp, t: part.vec.of, span });
    const name = L.temp(part.vec.of);
    L.emit({ k: "let", name, t: part.vec.of, value: old, span });
    assign(L, step, false);
    return L.ex({ k: "local", name, t: part.vec.of, span });
  }
  /** The number type of the target: the step is one of it. */
  let nt = /** @type {"f32" | "f64"} */ ("f64");
  const one = () => L.ex({ k: "num", v: 1, t: nt, span });
  const numeric = (/** @type {import("../ir/ir.js").Type} */ t) => {
    if (t === "f32") { nt = "f32"; return; }
    if (typeof t === "object" && "vec" in t) { L.error("L003", target, `'${node.operator}' counts a number, not ${showType(t)}.`, `Change a component instead: ${L.src.slice(target.range[0], target.range[1])}.x${node.operator}.`); return; }
    if (!assignable(t, "f64")) mismatch(L, target, t, "f64", `'${node.operator}'`);
  };
  /** @type {() => Expr} */
  let read;
  /** @type {(v: Expr) => void} */
  let write;
  if (target.type === "Identifier") {
    const b = writableLocal(L, target);
    if (!b) return bad(node);
    numeric(b.t);
    read = () => L.ex({ k: "local", name: b.name, t: nt, span: spanOf(target) });
    write = (v) => { L.emit({ k: "set", name: b.name, value: v, span }); };
  } else if (target.type === "MemberExpression") {
    const p = placeFor(L, target, { once: true });
    if (!p) return bad(node);
    if (p.total) {
      if (node.operator !== "++" || wantValue) return refuseTotal(L, node, target, node.operator === "++" ? "a bump used as a value" : `changed with '${node.operator}'`);
      L.emit({ k: "bump", place: p.total, value: L.ex({ k: "num", v: 1, t: "f64", span }), span }, [/** @type {Effect} */ (`bump ${p.total.owner}.${p.total.name}`)]);
      return bad(node);
    }
    numeric(p.place.t);
    read = p.load;
    write = (v) => { L.emit({ k: "store", place: p.place, value: v, span }, [p.write]); };
  } else { L.error("L012", node, "This update target is not lowered.", "Update a local or a field."); return bad(node); }
  const opExpr = (/** @type {Expr} */ x) => L.ex({ k: "op", op, args: [x, one()], t: nt, span });
  if (!wantValue) { write(opExpr(read())); return bad(node); }
  const name = L.temp(nt);
  const local = () => L.ex({ k: "local", name, t: nt, span });
  if (node.prefix) {
    L.emit({ k: "let", name, t: nt, value: opExpr(read()), span });
    write(local());
  } else {
    L.emit({ k: "let", name, t: nt, value: read(), span });
    write(opExpr(local()));
  }
  return local();
}

/**
 * L017: a total changed other than by a `+=` or `++` statement.
 * @param {Lowerer} L @param {AST.Node & { range: [number, number] }} node @param {AST.MemberExpression} target @param {string} why
 * @returns {Expr}
 */
function refuseTotal(L, node, target, why) {
  const written = L.src.slice(target.range[0], target.range[1]);
  L.error("L017", node, `'${written}' is a total, ${why}.`, `A total changes only by a statement that adds to it: ${written} += <number>; or ${written}++;`);
  return bad(node);
}

/**
 * The L003 tip for a total bumped by an f32: a total is an f64 even in an f32 Dialect, and f32 and f64 never mix, so
 * the fix is the statement with the Dialect's conversion written in. Null (the usual tip) for any other type.
 * @param {Lowerer} L @param {string} written  the total as written @param {string} text  the value as written @param {Type} got
 * @returns {string | null}
 */
function bumpFix(L, written, text, got) {
  if (got !== "f32") return null;
  const conv = Object.entries(L.environment.conversions ?? {}).find(([, t]) => t === "f64")?.[0];
  if (conv) return `A total is an f64, and f32 and f64 never mix; convert explicitly: ${written} += ${conv}(${text});`;
  return `A total is an f64, and f32 and f64 never mix, but this Dialect declares no conversion to f64; declare one, conversions: { f64: "f64" }, to bump a total by an f32.`;
}
