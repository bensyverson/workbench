// Lowering M2's number types: f32 and the vectors an environment declares (D1: an
// operator takes its meaning from its operands' types). f32 and f64 never mix, a
// dialect's vector types never mix with each other, and each mix is an L003 whose tip
// names the explicit fix. A number literal is not yet a value: it takes f32 from its
// context. None of this runs where no operand is an f32 or a vector, so M1's lowering
// of f64 code keeps its meaning; assign.js's spill rule (`self.x = self.y = 0` goes through
// a temporary) applies to it too.

import { mixesNumbers as unionMixes, join, sameType, showType, vectorOf } from "../ir/types.js";
import { bad, spanOf, seq, check, expr, mismatch } from "./expr.js";

/** @import * as AST from "../parse/ast.js" */
/** @import { Type, Expr, Op, Span, VecType } from "../ir/ir.js" */
/** @import { Lowerer } from "./lowerer.js" */

/** The operators this file types, by source spelling. */
const ARITH = /** @type {Record<string, Op>} */ ({ "+": "add", "-": "sub", "*": "mul", "/": "div", "%": "rem", "**": "pow" });
const COMPARE = /** @type {Record<string, Op>} */ ({ "<": "lt", "<=": "le", ">": "gt", ">=": "ge" });
const EQUALITY = /** @type {Record<string, Op>} */ ({ "===": "eq", "!==": "ne", "==": "eq", "!=": "ne" });
const BITWISE = new Set(["&", "|", "^", "<<", ">>", ">>>"]);

/** A vector's component names, in order. */
const COMPONENTS = ["x", "y", "z", "w"];

/** f32's largest finite value, for messages. */
const F32_MAX = "3.4e+38";

/**
 * Whether `t` is an f32 or a vector: a type only this file's rules handle.
 * @param {Type} t
 */
export const wide = (t) => t === "f32" || vectorOf(t) !== null;

/**
 * The scalar type of a number or vector type, or null.
 * @param {Type} t
 * @returns {"f32" | "f64" | null}
 */
export const scalarOf = (t) => (t === "f32" || t === "f64" ? t : vectorOf(t)?.of ?? null);

/**
 * L016 for a literal that is not finite, or null when `v` is finite.
 * @param {Lowerer} L
 * @param {number} v
 * @param {Span} span
 * @returns {Expr | null}
 */
export function infinite(L, v, span) {
  if (Number.isFinite(v)) return null;
  const text = L.src.slice(span[0], span[1]);
  L.error("L016", span, `${text} is past the largest double (about 1.8e+308), so it reads as Infinity, which no number type here holds.`, "Write a finite number; for \"no limit\", use a large finite bound or a declared constant.");
  return L.ex({ k: "null", t: "unknown", span });
}

/** The operators a number literal's arithmetic may pass through and still be untyped: `2 * 3` is a literal too. */
const LITERAL_OPS = new Set(["neg", "pos", "add", "sub", "mul", "div", "rem", "pow"]);

/**
 * Whether `e` is an untyped number: a literal, or arithmetic on literals alone. Its f64 type is
 * only the placeholder lowering gives a number before its context decides; `asScalar` and `settle`
 * replace it. A typed f64 (a parameter, a conversion's result) is never one.
 * @param {Expr} e
 * @returns {boolean}
 */
export function isUntyped(e) {
  return e.t === "f64" && (e.k === "num" || (e.k === "op" && LITERAL_OPS.has(e.op) && e.args.every(isUntyped)));
}

/**
 * `e` as a value of scalar type `s`: an untyped number (see `isUntyped`) becomes an f32 one,
 * each literal rounded to f32 here, once. Anything else is returned as it is, for the caller to check.
 * @param {Lowerer} L
 * @param {Expr} e
 * @param {Type | null | undefined} s
 * @returns {Expr}
 */
export function asScalar(L, e, s) {
  if (s !== "f32" || !isUntyped(e)) return e;
  if (e.k === "num") {
    const v = Math.fround(e.v);
    if (Number.isFinite(v)) return L.ex({ ...e, v, t: "f32" });
    const text = L.src.slice(e.span[0], e.span[1]);
    L.error("L016", e.span, `${text} is outside f32's finite range, so as an f32 it would be Infinity.`, `f32's finite values reach about ±${F32_MAX}; use a smaller number, or keep this value f64.`);
    return L.ex({ k: "null", t: "unknown", span: e.span });
  }
  if (e.k !== "op") return e;
  const args = e.args.map((a) => asScalar(L, a, s));
  if (args.some((a) => a.t !== "f32")) return L.ex({ k: "null", t: "unknown", span: e.span });
  return L.ex({ ...e, args, t: "f32" });
}

/**
 * `e` where nothing gives its type (a let's initializer, a helper's argument, a ternary of
 * literals, an array's item): an untyped number takes the Environment's default number type.
 * @param {Lowerer} L
 * @param {Expr} e
 * @returns {Expr}
 */
export const settle = (L, e) => asScalar(L, e, L.environment.numberType);

/**
 * Whether a value of type `t` mixes a number type with another type: an f32 or a vector that
 * joined with something else into a union, which the IR does not hold.
 * @param {Type} t
 * @returns {boolean}
 */
function mixesNumbers(t) {
  if (typeof t !== "object") return false;
  if ("opt" in t) return mixesNumbers(t.opt);
  return "union" in t && unionMixes(t.union);
}

/**
 * Reports (L003) two values that must share one type but are an f32 or a vector and something
 * else, returning whether it did. `a` and `b` are described by `what`; `b`'s source is
 * `bText` and `a`'s `aText` (null when `a` is no longer in the source, an earlier return).
 * @param {Lowerer} L
 * @param {AST.Node} node  Where to report.
 * @param {Type} a
 * @param {Type} b
 * @param {string} what  e.g. "The arms of this ternary are".
 * @param {string | null} aText
 * @param {string} bText
 * @returns {boolean}
 */
export function clash(L, node, a, b, what, aText, bText) {
  if (a === "unknown" || b === "unknown" || !mixesNumbers(join(a, b))) return false;
  const tip = mixTip(L, { t: a, text: aText }, { t: b, text: bText })
    ?? (vectorOf(a) && vectorOf(b) ? `Build one from the other's components, such as ${ctor(L, /** @type {VecType} */ (vectorOf(a)))}(v.x, v.y${/** @type {VecType} */ (vectorOf(a)).vec > 2 ? ", v.z" : ""}), so both are ${showType(a)}.` : `Give both one type; ${showType(a)} and ${showType(b)} do not convert.`);
  L.error("L003", node, `${what} ${showType(a)} and ${showType(b)}, which are different types.`, tip);
  return true;
}

/**
 * The tip for a mix of f32 and f64, or null when `a` and `b` are not one of each (as scalars or
 * a vector's scalar). It writes out each conversion that would fix it: a scalar side converted to
 * the other side's scalar type, by the environment's conversion for that type. A side whose
 * `text` is null (a type that is needed, not a value) is never the one converted.
 * @param {Lowerer} L
 * @param {{ t: Type, text: string | null }} a
 * @param {{ t: Type, text: string | null }} b
 * @returns {string | null}
 */
export function mixTip(L, a, b) {
  const sa = scalarOf(a.t), sb = scalarOf(b.t);
  if (!sa || !sb || sa === sb) return null;
  const names = Object.entries(L.environment.conversions ?? {});
  const to = (/** @type {string} */ t) => names.find(([, v]) => v === t)?.[0];
  /** @type {Array<[{ t: Type, text: string | null }, string]>} */
  const sides = [[a, sb], [b, sa]];
  const fixes = sides.flatMap(([x, s]) => {
    const conv = to(s);
    return conv && x.text !== null && !vectorOf(x.t) ? [`${conv}(${x.text})`] : [];
  });
  if (!fixes.length) return "f32 and f64 never mix, and this dialect declares no conversion that fixes it.";
  return `f32 and f64 never mix; convert explicitly: ${fixes.join(" or ")}.`;
}

/**
 * The name a lambda builds vector type `t` with, or its type's name when the environment has none.
 * @param {Lowerer} L
 * @param {VecType} t
 */
function ctor(L, t) {
  return Object.entries(L.environment.vectors ?? {}).find(([, v]) => sameType(v, t))?.[0] ?? showType(t);
}

/** @param {Lowerer} L @param {Expr} e */
const text = (L, e) => L.src.slice(e.span[0], e.span[1]);

/**
 * A binary operator with an f32 or a vector operand: arithmetic, a compare or an equality.
 * A literal on one side takes the other side's scalar type first.
 * @param {Lowerer} L
 * @param {string} operator
 * @param {Expr} a
 * @param {Expr} b
 * @param {AST.Node} node
 * @returns {Expr | null}  null for an operator this file does not know, left to M1's rules.
 */
export function typedBinary(L, operator, a, b, node) {
  if (BITWISE.has(operator)) {
    const side = [a, b].find((e) => wide(e.t));
    const t = /** @type {Expr} */ (side).t;
    const f64 = Object.entries(L.environment.conversions ?? {}).find(([, v]) => v === "f64")?.[0];
    const tip = vectorOf(t) ? "Apply it to each component, after converting each to f64." : f64 ? `Convert first: ${f64}(${text(L, /** @type {Expr} */ (side))}).` : "Bitwise operators take f64s only.";
    L.error("L003", node, `'${operator}' works on f64s through int32, not on ${showType(t)}.`, tip);
    return bad(node);
  }
  const kind = operator in ARITH ? "arith" : operator in COMPARE ? "compare" : operator in EQUALITY ? "equality" : null;
  if (!kind) return null;
  a = asScalar(L, a, scalarOf(b.t));
  b = asScalar(L, b, scalarOf(a.t));
  const span = spanOf(node);
  const op = /** @type {Op} */ ({ ...ARITH, ...COMPARE, ...EQUALITY }[operator]);
  const A = a.t, B = b.t;
  const made = (/** @type {Type} */ t) => L.ex({ k: "op", op, args: [a, b], t, span });
  if (A === "unknown" || B === "unknown") return made(kind === "arith" ? (A === "unknown" ? B : A) : "bool");
  const va = vectorOf(A), vb = vectorOf(B);
  const fail = (/** @type {string} */ message, /** @type {string} */ tip) => { L.error("L003", node, message, tip); return bad(node); };
  if (kind === "equality" && (va || vb)) {
    const [x, y] = [text(L, a), text(L, b)];
    const each = COMPONENTS.slice(0, (va ?? vb)?.vec).map((c) => `${x}.${c} ${operator} ${y}.${c}`);
    return fail(`'${operator}' does not compare vectors.`, `Compare their components: ${each.join(operator.startsWith("!") ? " || " : " && ")}.`);
  }
  const mix = mixTip(L, { t: A, text: text(L, a) }, { t: B, text: text(L, b) });
  const num = (/** @type {Type} */ t) => (vectorOf(t) ? `${showType(t)} (of ${scalarOf(t)})` : showType(t));
  if (mix) return fail(`'${operator}' mixes ${num(A)} and ${num(B)}.`, mix);
  if (!scalarOf(A) || !scalarOf(B)) return fail(`'${operator}' needs numbers${kind === "arith" ? " or vectors" : ""}, not ${showType(A)} and ${showType(B)}.`, "Use values of one number type on both sides.");
  if (kind !== "arith") {
    if (va || vb) return fail(`'${operator}' does not order vectors.`, `Compare a component, such as ${text(L, va ? a : b)}.x, or the vectors' lengths.`);
    return made("bool");
  }
  if (!va && !vb) return made(A);
  if (op === "rem" || op === "pow") return fail(`'${operator}' is not defined on vectors.`, "Apply it to each component, or use the dialect's function for it.");
  if (va && vb) {
    if (sameType(A, B)) return made(A);
    const same = va.vec === vb.vec && va.of === vb.of ? `, though both are ${va.vec} ${va.of}s` : "";
    const simple = /^[\w.]+$/.test(text(L, b));
    const names = COMPONENTS.slice(0, va.vec).map((c) => `${simple ? text(L, b) : "v"}.${c}`);
    return fail(`${showType(A)} and ${showType(B)} are different types${same}, so '${operator}' cannot mix them.`, `Build a ${showType(A)} from the ${showType(B)}'s components: ${ctor(L, va)}(${names.join(", ")})${simple ? "" : `, with v a const holding the ${showType(B)}`}.`);
  }
  const v = /** @type {VecType} */ (va ?? vb), vecType = /** @type {Type} */ (va ? A : B), scalar = va ? b : a;
  if (op === "mul" || (op === "div" && va)) return made(vecType);
  const s = text(L, scalar);
  const splat = `${ctor(L, v)}(${Array(v.vec).fill(s).join(", ")})`;
  if (op === "div") return fail(`'/' divides a vector by a scalar, not a scalar by a vector.`, `Build the vector first: ${splat} ${operator} ${text(L, b)}.`);
  return fail(`'${operator}' takes two ${showType(v)}s, not a ${showType(v)} and ${showType(scalar.t)}.`, `Build the vector: ${va ? `${text(L, a)} ${operator} ${splat}` : `${splat} ${operator} ${text(L, b)}`}.`);
}

/**
 * The members of a vector: its components, each of its scalar type, and the environment's aliases for them.
 * @param {Lowerer} L
 * @param {VecType} t
 * @returns {Record<string, import("./environment.js").Member>}
 */
export function components(L, t) {
  const own = COMPONENTS.slice(0, t.vec);
  const aliases = Object.keys(aliasesOf(L, t)).filter((a) => own.includes(aliasesOf(L, t)[a]));
  return Object.fromEntries([...own, ...aliases].map((c) => [c, { kind: "value", t: t.of }]));
}

/**
 * The tip for a value that should be vector type `t`: how to build one, or null when `t` is not a vector.
 * @param {Lowerer} L
 * @param {Type} t
 * @returns {string | null}
 */
export function vectorTip(L, t) {
  const v = vectorOf(t);
  return v ? `Build one: ${ctor(L, v)}(${componentNames(v).join(", ")}), with an ${v.of} for each component.` : null;
}

/**
 * The names of `t`'s components, in order.
 * @param {VecType} t
 */
export const componentNames = (t) => COMPONENTS.slice(0, t.vec);

/**
 * The environment's alias names for `t`'s components, as alias to the component.
 * @param {Lowerer} L
 * @param {VecType} t
 * @returns {Record<string, string>}
 */
const aliasesOf = (L, t) => (t.name ? L.environment.componentAliases?.[t.name] ?? {} : {});

/**
 * The component of `t` that `name` stands for: itself, or what an alias names.
 * @param {Lowerer} L
 * @param {VecType} t
 * @param {string} name
 */
export const componentOf = (L, t, name) => aliasesOf(L, t)[name] ?? name;

/**
 * A call to a vector type's name (construction) or to a conversion, or null when `name` is neither.
 * @param {Lowerer} L
 * @param {AST.CallExpression} node
 * @param {string} name
 * @param {AST.Expression[]} args
 * @returns {Expr | null}
 */
export function numericCall(L, node, name, args) {
  const v = L.environment.vectors?.[name];
  const to = L.environment.conversions?.[name];
  if (!v && !to) return null;
  const n = v ? v.vec : 1;
  if (args.length !== n) {
    L.error("L015", node, `${name} got ${args.length} argument${args.length === 1 ? "" : "s"}.`, v ? `${name} takes ${n}: one ${v.of} per component.${fromVector(L, name, v, args)}` : `${name} takes 1: the value to convert.`);
    return bad(node);
  }
  const span = spanOf(node);
  if (v) {
    const items = seq(L, args.map((a, i) => () => check(L, a, v.of, `component ${i + 1} of ${name}`)));
    return L.ex({ k: "vec", items, t: v, span });
  }
  const target = /** @type {"f32" | "f64"} */ (to);
  const from = target === "f32" ? "f64" : "f32";
  const arg = expr(L, args[0]);
  const what = L.src.slice(args[0].range[0], args[0].range[1]);
  if (arg.t === target) L.error("L003", args[0], `${what} is already ${target}.`, `Remove the conversion: write ${what}.`);
  else if (arg.t !== from && arg.t !== "unknown") mismatch(L, args[0], arg.t, from, `${name}(…)`);
  return L.ex({ k: "op", op: target, args: [arg], t: target, span });
}

/**
 * For `vec3(c)` with a vector `c`: the sentence naming the components to pass, or "".
 * @param {Lowerer} L
 * @param {string} name
 * @param {VecType} v
 * @param {AST.Expression[]} args
 */
function fromVector(L, name, v, args) {
  if (args.length !== 1 || args[0].type !== "Identifier") return "";
  const t = L.lookup(args[0].name)?.t;
  const from = t ? vectorOf(t) : null;
  if (!from) return "";
  const x = args[0].name;
  const parts = COMPONENTS.slice(0, v.vec).map((c) => (COMPONENTS.indexOf(c) < from.vec ? `${x}.${c}` : "0"));
  return ` To make one from a ${showType(from)}, write its components: ${name}(${parts.join(", ")}).`;
}

/**
 * Checks a call's type variable against its signature's `numeric` limit, reporting L003 when it is not
 * what the intrinsic takes. Returns whether it is fine.
 * @param {Lowerer} L
 * @param {AST.Node} node
 * @param {"number" | "vector"} limit
 * @param {Map<string, Type>} bound
 * @param {string} label  What is called, for the message.
 * @returns {boolean}
 */
export function numericBinding(L, node, limit, bound, label) {
  const t = [...bound.values()][0];
  if (!t || t === "unknown") return true;
  if (limit === "vector" ? vectorOf(t) : t === "f32" || t === "f64" || vectorOf(t)) return true;
  const takes = limit === "vector" ? "a vector" : "numbers or vectors";
  L.error("L003", node, `${label} takes ${takes}, not ${showType(t)}.`, limit === "vector" ? "Pass a vector value, such as a vec2 or a color." : "Pass an f32 or a vector.");
  return false;
}

/**
 * Whether `name` is a vector type or a conversion of the environment, which is only called.
 * @param {Lowerer} L
 * @param {string} name
 */
export function isNumericName(L, name) {
  return Boolean(L.environment.vectors?.[name] || L.environment.conversions?.[name]);
}
