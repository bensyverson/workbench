// Lowering expressions. An expression lowers to an IR expression; anything that
// cannot stay inside one (a store, a query's loop, a lazy branch holding either)
// spills into statements ahead of it, in evaluation order.

import { assignable, itemAt, join, namedScalar, showType, strictJoin, vectorOf } from "../ir/types.js";
import { didYouMean } from "./codes.js";
import { call } from "./call.js";
import { assign, update } from "./assign.js";
import { scalarBinary, scalarTest, refuse as refuseScalar } from "./scalar.js";
import { wide, infinite, asScalar, settle, isUntyped, scalarOf, clash, mixTip, typedBinary, components, componentOf, isNumericName, vectorTip } from "./numeric.js";

/** @import * as AST from "../parse/ast.js" */
/** @import { Type, Expr, Op, Place, Span } from "../ir/ir.js" */
/** @import { Member } from "./environment.js" */
/** @import { Lowerer } from "./lowerer.js" */

/** @typedef {{ decl: Member, owner: string, recv: Expr }} Resolved */

const ARITH = /** @type {Record<string, Op>} */ ({ "-": "sub", "*": "mul", "/": "div", "%": "rem", "**": "pow", "&": "band", "|": "bor", "^": "bxor", "<<": "shl", ">>": "shr", ">>>": "ushr" });
const COMPARE = /** @type {Record<string, Op>} */ ({ "<": "lt", "<=": "le", ">": "gt", ">=": "ge" });
const EQUALITY = /** @type {Record<string, Op>} */ ({ "===": "eq", "!==": "ne", "==": "eq", "!=": "ne" });

/**
 * A short description of a type for messages: strings say so.
 * @param {Type} t
 */
export function describe(t) {
  return typeof t === "object" && "enum" in t && t.enum.length === 1 ? `str ${showType(t)}` : showType(t);
}

/** @param {AST.Node} n @returns {Span} */
export const spanOf = (n) => [n.range[0], n.range[1]];

/**
 * A placeholder for an expression that failed to lower.
 * @param {AST.Node} n
 * @returns {Expr}
 */
export const bad = (n) => ({ k: "null", t: "unknown", span: spanOf(n) });

/**
 * Lowers `node` where a value of type `expected` is needed, reporting a mismatch at the narrowest node.
 * @param {Lowerer} L
 * @param {AST.Expression} node
 * @param {Type} expected
 * @param {string} what  What needs the value, for the message.
 * @returns {Expr}
 */
export function check(L, node, expected, what) {
  if (node.type === "ConditionalExpression") return cond(L, node, (n) => check(L, n, expected, what));
  const e = asScalar(L, expr(L, node, expected), expected);
  if (!assignable(e.t, expected)) mismatch(L, node, e.t, expected, what);
  return e;
}

/**
 * @param {Lowerer} L
 * @param {AST.Node} node
 * @param {Type} got
 * @param {Type} expected
 * @param {string} what
 */
export function mismatch(L, node, got, expected, what) {
  const members = typeof expected === "object" && "union" in expected ? expected.union : [expected];
  const enums = members.flatMap((m) => (typeof m === "object" && "enum" in m ? m.enum : []));
  const here = { t: got, text: L.src.slice(node.range[0], node.range[1]) };
  const tip = enums.length ? `Use one of: ${enums.join(", ")}.` : mixTip(L, here, { t: expected, text: null }) ?? vectorTip(L, expected) ?? `Give it a ${showType(expected)} value.`;
  L.error("L003", node, `This is ${describe(got)}, but ${what} needs ${showType(expected)}.`, tip);
}

/**
 * Lowers an expression for its value.
 * @param {Lowerer} L
 * @param {AST.Expression} node
 * @param {Type} [expected]  A hint for object literals.
 * @returns {Expr}
 */
export function expr(L, node, expected) {
  const span = spanOf(node);
  switch (node.type) {
    case "Literal": {
      const v = node.value;
      if (typeof v === "number") return infinite(L, v, span) ?? L.ex({ k: "num", v, t: "f64", span });
      if (typeof v === "string") return L.ex({ k: "str", v, t: { enum: [v] }, span });
      if (typeof v === "boolean") return L.ex({ k: "bool", v, t: "bool", span });
      return L.ex({ k: "null", t: "null", span });
    }
    case "Identifier": return identifier(L, node);
    case "MemberExpression": {
      const folded = bakedItem(L, node);
      if (folded) return folded;
      if (node.computed) return index(L, node);
      const r = resolveMember(L, node);
      if (!r) return bad(node);
      return valueOf(L, r, node);
    }
    case "CallExpression": return call(L, node);
    case "UnaryExpression": {
      if (node.operator === "!") return L.ex({ k: "op", op: "not", args: [test(L, node.argument)], t: "bool", span });
      const arg = expr(L, node.argument);
      const op = node.operator === "-" ? "neg" : node.operator === "+" ? "pos" : "bnot";
      const named = namedScalar(arg.t);
      if (named) return refuseScalar(L, `'${node.operator}'`, named, node);
      if (op !== "bnot" && wide(arg.t)) return L.ex({ k: "op", op, args: [arg], t: arg.t, span });
      if (!assignable(arg.t, "f64")) mismatch(L, node.argument, arg.t, "f64", `'${node.operator}'`);
      return L.ex({ k: "op", op, args: [arg], t: "f64", span });
    }
    case "BinaryExpression": {
      const [a, b] = seq(L, [() => expr(L, node.left), () => expr(L, node.right)]);
      return binary(L, node.operator, a, b, node);
    }
    case "LogicalExpression": return logical(L, node, "value");
    case "ConditionalExpression": return cond(L, node, (n) => expr(L, n, expected));
    case "AssignmentExpression": return assign(L, node, true);
    case "UpdateExpression": return update(L, node, true);
    case "ObjectExpression": return object(L, node, expected);
    case "ArrowFunctionExpression":
      L.error("L005", node, "A callback is allowed only as the argument of a declared query.", `Callbacks are allowed only in ${L.environment.queries.join(", ")}.`);
      return bad(node);
    case "ArrayExpression": return array(L, node);
    default:
      L.error("L012", node, `${node.type} is not lowered yet.`, "Rewrite it with the constructs in the runtime subset.");
      return bad(node);
  }
}

/**
 * @param {Lowerer} L
 * @param {AST.Identifier} node
 * @returns {Expr}
 */
export function identifier(L, node) {
  const span = spanOf(node);
  const b = L.lookup(node.name);
  if (b) {
    if (b.dead) {
      L.error("L001", node, `'${node.name}' is read before its declaration finishes.`, `A name is not usable inside its own initializer; give the inner name another name, or read the outer one before declaring it.`);
      return bad(node);
    }
    if (b.pending) { L.error(b.pending.code, node, b.pending.message, b.pending.tip); return L.ex({ k: "local", name: b.name, t: "unknown", span }); }
    const t = L.narrowed.has(b.name) && typeof b.t === "object" && "opt" in b.t ? b.t.opt : b.t;
    return L.ex({ k: "local", name: b.name, t, span });
  }
  const h = L.sigs.helpers?.[node.name];
  if (h?.kind === "fn") {
    L.error("L003", node, `'${node.name}' is a function here.`, `Call it: ${node.name}(…).`);
    return bad(node);
  }
  if (h?.kind === "const") {
    if (!h.value) { L.error("L014", node, `The constant '${node.name}' does not lower, so it cannot be baked in.`, `Fix ${node.name}'s diagnostics first: a constant is an expression of literals and other constants.`); return bad(node); }
    const baked = inline(L, h.value, span);
    return baked.k === "array" || baked.k === "struct" ? settleTree(L, baked) : baked;
  }
  const g = L.environment.globals[node.name];
  if (g) return L.ex({ k: "global", name: node.name, t: g, span });
  if (isNumericName(L, node.name)) {
    L.error("L003", node, `'${node.name}' is a function here.`, `Call it: ${node.name}(…).`);
    return bad(node);
  }
  const known = [...L.scopes.flatMap((s) => [...s.keys()]), ...Object.keys(L.environment.globals)];
  const tip = node.name === "undefined" ? "Use null for an empty value."
    : `Runtime lambdas see only their parameters and ${Object.keys(L.environment.globals).join(", ")}; a top-level helper or constant is not visible, so pass it in or declare it.${didYouMean(node.name, known)}`;
  L.error("L001", node, `'${node.name}' is not declared here.`, tip);
  return bad(node);
}

/**
 * `A[0]` or `A.h` where A is a baked array or struct constant: the item itself, still untyped
 * where it is a number, so it takes its type from this use as a scalar constant does. Only where
 * the Environment has a default number type, so a dialect without one lowers exactly as before.
 * @param {Lowerer} L
 * @param {AST.MemberExpression} node
 * @returns {Expr | null}
 */
function bakedItem(L, node) {
  const o = node.object;
  if (!L.environment.numberType || o.type !== "Identifier" || L.lookup(o.name)) return null;
  const h = L.sigs.helpers?.[o.name];
  const value = h?.kind === "const" ? h.value : null;
  if (!value) return null;
  const p = node.property;
  let item;
  if (node.computed) {
    if (value.k !== "array" || p.type !== "Literal" || typeof p.value !== "number" || !Number.isInteger(p.value)) return null;
    item = value.items[p.value];
  } else if (value.k === "struct" && p.type === "Identifier") item = value.fields[p.name];
  if (!item) return null;
  const baked = inline(L, item, spanOf(node));
  return baked.k === "array" || baked.k === "struct" ? settleTree(L, baked) : baked;
}

/**
 * A baked array or struct constant, kept untyped inside its definition, with every number in it
 * settled to the default number type, as a literal array or struct is at its definition.
 * @param {Lowerer} L
 * @param {Expr} e
 * @returns {Expr}
 */
function settleTree(L, e) {
  if (e.k === "array") {
    const items = e.items.map((i) => settleTree(L, i));
    const item = items.reduce((/** @type {Type | null} */ a, i) => (a === null ? null : strictJoin(a, i.t)), "unknown");
    return L.ex({ ...e, items, t: item === null || item === "unknown" ? e.t : { list: item, max: items.length, len: items.length } });
  }
  if (e.k === "struct") {
    const fields = Object.fromEntries(Object.entries(e.fields).map(([k, v]) => [k, settleTree(L, v)]));
    return L.ex({ ...e, fields, t: { struct: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, v.t])) } });
  }
  return settle(L, e);
}

/**
 * A copy of a baked constant's value at its use, spanned there so every span stays inside the lambda.
 * @param {Lowerer} L
 * @param {Expr} e
 * @param {Span} span
 * @returns {Expr}
 */
function inline(L, e, span) {
  /** @type {Record<string, any>} */
  const copy = { ...e, span };
  for (const key of ["test", "then", "else", "recv", "of", "index"]) if (copy[key]) copy[key] = inline(L, copy[key], span);
  for (const key of ["args", "items"]) if (copy[key]) copy[key] = copy[key].map((/** @type {Expr} */ a) => inline(L, a, span));
  if (copy.fields) copy.fields = Object.fromEntries(Object.entries(copy.fields).map(([k, v]) => [k, inline(L, /** @type {Expr} */ (v), span)]));
  if (copy.place) copy.place = { ...copy.place, recv: inline(L, copy.place.recv, span) };
  return L.ex(/** @type {Expr} */ (copy));
}

/**
 * Resolves `obj.name` to the member it names, lowering `obj`. Reports and returns null on failure.
 * @param {Lowerer} L
 * @param {AST.MemberExpression} node
 * @returns {Resolved | null}
 */
export function resolveMember(L, node) {
  const recv = expr(L, node.object);
  if (node.computed) { computed(L, recv, node); return null; }
  const name = /** @type {AST.Identifier} */ (node.property).name;
  return resolveOn(L, recv, name, node);
}

/**
 * `list[i]`: the item, or nothing when `i` is out of range, so it is typed possibly empty and
 * must be checked before use, as a `find` result must. Any other computed name cannot be checked (L009).
 * @param {Lowerer} L
 * @param {AST.MemberExpression} node
 * @returns {Expr}
 */
function index(L, node) {
  const [recv, at] = seq(L, [() => expr(L, node.object), () => expr(L, /** @type {AST.Expression} */ (node.property))]);
  let t = recv.t;
  if (typeof t === "object" && "opt" in t) {
    const what = L.src.slice(node.object.range[0], node.object.range[1]);
    L.error("L008", node.object, `'${what}' may be empty here.`, `Check it first: if (!${what}) return;`);
    t = t.opt;
  }
  if (typeof t === "object" && "list" in t) {
    if (!assignable(at.t, "f64")) mismatch(L, node.property, at.t, "f64", "a list index");
    return L.ex({ k: "index", of: recv, index: at, t: itemAt(t, at.k === "num" ? at.v : null), span: spanOf(node) });
  }
  computed(L, recv, node);
  return bad(node);
}

/**
 * Reports `obj[k]` where it cannot be read as an item: storing into a list element or calling one (L012); any other computed name cannot be checked (L009).
 * @param {Lowerer} L
 * @param {Expr} recv  `obj`, already lowered.
 * @param {AST.MemberExpression} node
 */
export function computed(L, recv, node) {
  if (typeof recv.t === "object" && "list" in recv.t) {
    L.error("L012", node, "A list element cannot be assigned or called here.", "Change a field of the item instead, after checking it exists: const m = list[i]; if (m) m.x = 1;");
    return;
  }
  if (recv.t === "unknown") return;
  L.error("L009", node.property, "A dynamic property name cannot be checked.", "Name the member directly, as self.name, or use a declared list.");
}

/**
 * @param {Lowerer} L
 * @param {Expr} recv
 * @param {string} name
 * @param {AST.MemberExpression} node
 * @returns {Resolved | null}
 */
export function resolveOn(L, recv, name, node) {
  let t = recv.t;
  if (t === "unknown") return null;
  if (typeof t === "object" && "opt" in t) {
    const what = L.src.slice(node.object.range[0], node.object.range[1]);
    L.error("L008", node.object, `'${what}' may be empty here.`, `Check it first: if (!${what}) return;`);
    t = t.opt;
    recv = { ...recv, t };
  }
  /** @type {Record<string, Member> | undefined} */
  let members;
  let owner = "";
  let label = showType(t);
  if (typeof t === "object" && ("ref" in t || "obj" in t)) {
    owner = "ref" in t ? t.ref : t.obj;
    const o = L.environment.objects[owner];
    members = o?.members;
    label = o?.label ?? owner;
  } else if (typeof t === "object" && "list" in t) {
    const own = t.with ? L.environment.objects[t.with]?.members ?? {} : {};
    owner = t.with ?? "list";
    members = { ...L.environment.list, ...own };
    label = t.with ? L.environment.objects[t.with]?.label ?? t.with : "a list";
  } else if (typeof t === "object" && "struct" in t) {
    owner = "struct";
    members = Object.fromEntries(Object.entries(t.struct).map(([k, v]) => [k, /** @type {Member} */ ({ kind: "value", t: v })]));
  } else if (typeof t === "object" && "vec" in t) {
    owner = "vector";
    members = components(L, t);
  }
  const decl = members?.[name];
  if (!decl) {
    const names = Object.keys(members ?? {});
    const tip = (didYouMean(name, names).trim() || "") + (names.length ? ` Members: ${names.join(", ")}.` : ` ${label} has no members.`);
    L.error("L002", node.property, `${label} has no member '${name}'.`, tip.trim());
    return null;
  }
  return { decl, owner, recv };
}

/**
 * The value of a resolved member read without a call.
 * @param {Lowerer} L
 * @param {Resolved} r
 * @param {AST.MemberExpression} node
 * @returns {Expr}
 */
function valueOf(L, r, node) {
  const span = spanOf(node);
  const name = /** @type {AST.Identifier} */ (node.property).name;
  if (r.decl.kind !== "value") {
    L.error("L003", node, `'${name}' is a function here.`, `Call it: ${L.src.slice(node.range[0], node.range[1])}(…).`);
    return bad(node);
  }
  if (r.owner === "list" || r.owner === "struct" || r.owner === "vector" || (typeof r.recv.t === "object" && "list" in r.recv.t && name === "length")) {
    const vec = vectorOf(r.recv.t);
    return L.ex({ k: "field", of: r.recv, name: vec ? componentOf(L, vec, name) : name, t: r.decl.t, span });
  }
  return L.ex({ k: "load", place: placeOf(r, name), t: r.decl.t, span }, r.decl.effect ? [r.decl.effect] : []);
}

/**
 * @param {Resolved} r
 * @param {string} name
 * @returns {Place}
 */
export function placeOf(r, name) {
  const d = /** @type {Extract<Member, { kind: "value" }>} */ (r.decl);
  return { recv: r.recv, owner: r.owner, name, t: d.t, ...(d.store ? { store: d.store } : {}), ...(d.size && !d.store ? { size: /** @type {const} */ (true) } : {}) };
}

/**
 * Lowers operands left to right. When one spills statements, the operands before it
 * that could change are first saved to temporaries, so evaluation order holds.
 * @param {Lowerer} L
 * @param {Array<() => Expr>} thunks
 * @returns {Expr[]}
 */
export function seq(L, thunks) {
  /** @type {Expr[]} */
  const vals = [];
  for (const thunk of thunks) {
    const mark = L.out.length;
    const v = thunk();
    if (L.out.length > mark) {
      const out = L.out;
      L.out = [];
      for (let i = 0; i < vals.length; i++) {
        if (L.stable(vals[i])) continue;
        const name = L.temp(vals[i].t);
        L.emit({ k: "let", name, t: vals[i].t, value: vals[i], span: vals[i].span });
        vals[i] = L.ex({ k: "local", name, t: vals[i].t, span: vals[i].span });
      }
      out.splice(mark, 0, ...L.out);
      L.out = out;
    }
    vals.push(v);
  }
  return vals;
}

/**
 * Builds a binary operation on lowered operands, checking their types.
 * @param {Lowerer} L
 * @param {string} operator
 * @param {Expr} a
 * @param {Expr} b
 * @param {AST.Node} node
 * @returns {Expr}
 */
export function binary(L, operator, a, b, node) {
  const span = spanOf(node);
  if (namedScalar(a.t) || namedScalar(b.t)) {
    const named = scalarBinary(L, operator, a, b, node);
    if (named) return named;
  }
  if (wide(a.t) || wide(b.t)) {
    const typed = typedBinary(L, operator, a, b, node);
    if (typed) return typed;
  }
  const isNum = (/** @type {Expr} */ e) => assignable(e.t, "f64");
  const isStr = (/** @type {Expr} */ e) => e.t !== "unknown" && assignable(e.t, "str");
  if (operator === "+") {
    if (isNum(a) && isNum(b)) return L.ex({ k: "op", op: "add", args: [a, b], t: "f64", span });
    if ((isStr(a) || isStr(b)) && (isNum(a) || isStr(a)) && (isNum(b) || isStr(b))) return L.ex({ k: "op", op: "concat", args: [a, b], t: "str", span });
    L.error("L003", node, `'+' needs two numbers or a string, not ${describe(a.t)} and ${describe(b.t)}.`, "Make both sides f64, or one a string to concatenate.");
    return bad(node);
  }
  if (operator in ARITH) {
    for (const [e, n] of /** @type {const} */ ([[a, "left"], [b, "right"]])) if (!isNum(e)) mismatch(L, node, e.t, "f64", `the ${n} side of '${operator}'`);
    return L.ex({ k: "op", op: ARITH[operator], args: [a, b], t: "f64", span });
  }
  if (operator in COMPARE) {
    if (!((isNum(a) && isNum(b)) || (isStr(a) && isStr(b)))) L.error("L003", node, `'${operator}' compares two numbers or two strings, not ${describe(a.t)} and ${describe(b.t)}.`, "Compare values of the same type.");
    return L.ex({ k: "op", op: COMPARE[operator], args: [a, b], t: "bool", span });
  }
  if (operator in EQUALITY) {
    const loose = operator.length === 2;
    const comparable = assignable(a.t, b.t) || assignable(b.t, a.t) || (isStr(a) && isStr(b));
    const prim = (/** @type {Type} */ t) => t === "f64" || t === "bool" || t === "str" || (typeof t === "object" && ("enum" in t || "scalar" in t));
    const compound = (/** @type {Expr} */ e) => { const t = typeof e.t === "object" && "opt" in e.t ? e.t.opt : e.t; return typeof t === "object" && ("list" in t || "struct" in t); };
    const nothing = (/** @type {Expr} */ e) => e.t === "null";
    if ((compound(a) && !nothing(b)) || (compound(b) && !nothing(a))) L.error("L003", node, `'${operator}' on a list or struct would compare identity, and a list or struct value has none here.`, "Compare their fields or items instead: a.x === b.x, a[0] === b[0].");
    else if (!comparable) L.error("L003", node, `${describe(a.t)} and ${describe(b.t)} can never be equal.`, "Compare values of the same type.");
    else if (loose && !(prim(a.t) && prim(b.t))) L.error("L003", node, `'${operator}' between ${describe(a.t)} and ${describe(b.t)} can coerce.`, `Use '${operator}=' instead.`);
    return L.ex({ k: "op", op: EQUALITY[operator], args: [a, b], t: "bool", span });
  }
  L.error("L012", node, `'${operator}' is not lowered.`, "Rewrite it with the operators in the runtime subset.");
  return bad(node);
}

/**
 * Lowers `node` where only its truthiness matters, returning a bool.
 * @param {Lowerer} L
 * @param {AST.Expression} node
 * @returns {Expr}
 */
export function test(L, node) {
  if (node.type === "UnaryExpression" && node.operator === "!") return L.ex({ k: "op", op: "not", args: [test(L, node.argument)], t: "bool", span: spanOf(node) });
  if (node.type === "LogicalExpression" && node.operator !== "??") return logical(L, node, "test");
  const e = expr(L, node);
  if (e.t === "bool" || e.t === "unknown") return e;
  if (scalarTest(L, node, e.t)) return bad(node);
  if (typeof e.t === "object" && "vec" in e.t) L.error("L003", node, "A vector is always true as a condition.", `Test a component instead: if (${L.src.slice(node.range[0], node.range[1])}.x !== 0).`);
  const op =typeof e.t === "object" && "opt" in e.t && isEntity(e.t.opt) ? "present" : "truthy";
  return L.ex({ k: "op", op, args: [e], t: "bool", span: e.span });
}

/**
 * Whether every value of `t` is an entity reference, which is never falsy.
 * @param {Type} t
 * @returns {boolean}
 */
function isEntity(t) {
  if (typeof t !== "object") return false;
  if ("ref" in t) return true;
  return "union" in t && t.union.every(isEntity);
}

/**
 * What a test proves when it is true or false: the optional locals it shows present.
 * @param {Lowerer} L
 * @param {AST.Expression} node
 * @returns {{ yes: string[], no: string[] }}
 */
export function facts(L, node) {
  if (node.type === "Identifier") {
    const b = L.lookup(node.name);
    if (b && b.kind === "const" && typeof b.t === "object" && "opt" in b.t) return { yes: [b.name], no: [] };
  }
  if (node.type === "UnaryExpression" && node.operator === "!") { const f = facts(L, node.argument); return { yes: f.no, no: f.yes }; }
  if (node.type === "LogicalExpression" && node.operator === "&&") return { yes: [...facts(L, node.left).yes, ...facts(L, node.right).yes], no: [] };
  if (node.type === "LogicalExpression" && node.operator === "||") return { yes: [], no: [...facts(L, node.left).no, ...facts(L, node.right).no] };
  return { yes: [], no: [] };
}

/**
 * `a && b` and `a || b`, short-circuiting. In a value, both sides must be bool.
 * @param {Lowerer} L
 * @param {AST.LogicalExpression} node
 * @param {"value" | "test"} mode
 * @returns {Expr}
 */
function logical(L, node, mode) {
  const span = spanOf(node);
  if (node.operator === "??") {
    L.error("L012", node, "'??' is not lowered yet.", "Write the check out: x !== null ? x : fallback.");
    return bad(node);
  }
  const side = (/** @type {AST.Expression} */ n) => {
    const e = mode === "test" ? test(L, n) : expr(L, n);
    if (!assignable(e.t, "bool")) L.error("L003", n, `'${node.operator}' in a value needs bools on both sides, not ${describe(e.t)}.`, "Use a ternary, or compare explicitly (x !== 0).");
    return e;
  };
  const a = side(node.left);
  const f = facts(L, node.left);
  const b = L.capture(() => side(node.right), node.operator === "&&" ? f.yes : f.no);
  const op = node.operator === "&&" ? "and" : "or";
  if (!b.stmts.length) return L.ex({ k: "op", op, args: [a, b.value], t: "bool", span });
  const name = L.temp("bool");
  L.emit({ k: "let", name, t: "bool", value: a, span: a.span });
  const t0 = L.ex({ k: "local", name, t: "bool", span: a.span });
  const guard = op === "and" ? t0 : L.ex({ k: "op", op: "not", args: [t0], t: "bool", span: a.span });
  const set = { k: /** @type {const} */ ("set"), name, value: b.value, span: b.value.span, effects: L.effectsOf(b.value) };
  L.emit({ k: "if", test: guard, then: [...b.stmts, set], else: [], span });
  return L.ex({ k: "local", name, t: "bool", span });
}

/**
 * A lazy ternary; `branch` lowers each arm.
 * @param {Lowerer} L
 * @param {AST.ConditionalExpression} node
 * @param {(n: AST.Expression) => Expr} branch
 * @returns {Expr}
 */
export function cond(L, node, branch) {
  const span = spanOf(node);
  const f = facts(L, node.test);
  const c = test(L, node.test);
  const a = L.capture(() => branch(node.consequent), f.yes);
  const b = L.capture(() => branch(node.alternate), f.no);
  // Two untyped arms have no type yet: the default gives it. A literal beside a typed arm takes that arm's type.
  if (isUntyped(a.value) && isUntyped(b.value)) { a.value = settle(L, a.value); b.value = settle(L, b.value); }
  else { a.value = asScalar(L, a.value, scalarOf(b.value.t)); b.value = asScalar(L, b.value, scalarOf(a.value.t)); }
  const [x, y] = [a.value, b.value].map((v) => L.src.slice(v.span[0], v.span[1]));
  if (clash(L, node, a.value.t, b.value.t, "The arms of this ternary are", x, y)) return bad(node);
  const t = join(a.value.t, b.value.t);
  if (!a.stmts.length && !b.stmts.length) return L.ex({ k: "cond", test: c, then: a.value, else: b.value, t, span });
  const name = L.temp(t);
  L.emit({ k: "let", name, t, value: null, span });
  /** @param {{ stmts: import("../ir/ir.js").Stmt[], value: Expr }} arm */
  const arm = (arm) => [...arm.stmts, /** @type {import("../ir/ir.js").Stmt} */ ({ k: "set", name, value: arm.value, span: arm.value.span, effects: L.effectsOf(arm.value) })];
  L.emit({ k: "if", test: c, then: arm(a), else: arm(b), span });
  return L.ex({ k: "local", name, t, span });
}

/**
 * An array literal: a bounded list as long as the literal, of the strict join of its items.
 * An empty one has no item type, so it is rejected; there is no tuple type, so items of
 * different types are too (L003, at the first item that does not join).
 * @param {Lowerer} L
 * @param {AST.ArrayExpression} node
 * @returns {Expr}
 */
function array(L, node) {
  const elements = /** @type {AST.Expression[]} */ (node.elements);
  if (elements.some((el) => el === null)) {
    L.error("L012", node, "An array literal has a hole, an empty slot between its commas.", "Write every item out: [1, 0, 2].");
    return bad(node);
  }
  if (elements.length === 0) {
    L.error("L012", node, "An empty array literal has no item type.", "Use a declared list (w.board, w.pool(name)), or write the items out.");
    return bad(node);
  }
  // A baked constant's numbers stay untyped until each use (see `settleTree`).
  const keep = L.slot.kind === "const";
  const items = seq(L, elements.map((el) => () => (keep ? expr(L, el) : settle(L, expr(L, el)))));
  /** @type {Type} */
  let item = "unknown";
  items.forEach((e, i) => {
    const joined = strictJoin(item, e.t);
    if (joined === null) {
      L.error("L003", elements[i], `An array's items share one type, but this is ${describe(e.t)} and the items before it are ${describe(item)}.`, "Use items of one type; for a pair of different things, use an object: { name: \"up\", dx: 0 }.");
      return;
    }
    item = joined;
  });
  return L.ex({ k: "array", items, t: item === "unknown" ? "unknown" : { list: item, max: items.length, len: items.length }, span: spanOf(node) });
}

/**
 * An object literal: a struct, its fields checked against `expected` where it names them.
 * @param {Lowerer} L
 * @param {AST.ObjectExpression} node
 * @param {Type} [expected]
 * @returns {Expr}
 */
function object(L, node, expected) {
  const members = expected && typeof expected === "object" && "union" in expected ? expected.union : expected ? [expected] : [];
  const shape = /** @type {Extract<Type, { struct: unknown }> | undefined} */ (members.find((m) => typeof m === "object" && "struct" in m));
  const props = /** @type {AST.Property[]} */ (node.properties);
  const names = props.map((p) => (p.key.type === "Identifier" ? p.key.name : String(/** @type {AST.Literal} */ (p.key).value)));
  const vals = seq(L, props.map((p, i) => () => {
    const want = shape?.struct[names[i]];
    return want ? check(L, p.value, want, `field '${names[i]}'`) : L.slot.kind === "const" ? expr(L, p.value) : settle(L, expr(L, p.value));
  }));
  /** @type {Record<string, Expr>} */
  const fields = {};
  /** @type {Record<string, Type>} */
  const struct = {};
  names.forEach((n, i) => { fields[n] = vals[i]; struct[n] = vals[i].t; });
  return L.ex({ k: "struct", fields, t: { struct }, span: spanOf(node) });
}

