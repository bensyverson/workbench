// The verifier's tables: which types a Kernel may hold, what each operator takes and
// gives, and the effect verbs. M2's value types add entries here.

import { assignable, sameType } from "./types.js";

/** @import { Type, Op, EffectVerb, Expr, Stmt, Coerce } from "./ir.js" */

/** Every verb an effect may start with (ir.d.ts, `EffectVerb`). */
export const EFFECT_VERBS = new Set(/** @type {EffectVerb[]} */ (["read", "write", "rng", "emit", "sfx", "toast", "spawn", "destroy", "call", "hud", "input", "log", "end"]));

/** The named types; `unknown` is not one: a Kernel holds only types that lowered. */
const NAMED = new Set(["f64", "bool", "str", "null", "void"]);

/**
 * Why `t` cannot appear in a Kernel, or null when it can. Never throws.
 * @param {unknown} t
 * @param {boolean} [partial]  Whether `unknown` may stand for a type not yet inferred.
 * @returns {string | null}
 */
export function typeProblem(t, partial = false) {
  if (t === "unknown") return partial ? null : "unknown marks an expression that failed to lower, and a Kernel is only made when nothing failed";
  if (typeof t === "string") return NAMED.has(t) ? null : "not a type";
  if (typeof t !== "object" || t === null || Array.isArray(t)) return "not a type";
  const o = /** @type {Record<string, unknown>} */ (t);
  if ("tvar" in o) return "a type variable is bound at each call, so none is left in a Kernel";
  if ("enum" in o) {
    const v = o.enum;
    return Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === "string") ? null : "an enum is one or more strings";
  }
  if ("ref" in o || "obj" in o) return typeof (o.ref ?? o.obj) === "string" ? null : "names no kind or object";
  if ("opt" in o) {
    const inner = o.opt;
    if (inner === "null" || inner === "void" || inner === "unknown" || (typeof inner === "object" && inner !== null && "opt" in inner)) return "a possibly-empty value is never nested in another, nor of null, void or unknown (`optional` in types.js)";
    return typeProblem(inner, partial);
  }
  if ("list" in o) {
    const { max, len } = /** @type {{ max: unknown, len: unknown }} */ (o);
    if (!Number.isSafeInteger(max) || /** @type {number} */ (max) < 0) return "a list's max is a whole number, so a loop over it is bounded";
    if (len !== undefined && (!Number.isSafeInteger(len) || /** @type {number} */ (len) < 0 || /** @type {number} */ (len) > /** @type {number} */ (max))) return "a list's len is a whole number no more than its max";
    if (o.with !== undefined && typeof o.with !== "string") return "a list's with names an object";
    return typeProblem(o.list, partial);
  }
  if ("struct" in o) {
    const fields = o.struct;
    if (typeof fields !== "object" || fields === null || Array.isArray(fields)) return "a struct's fields are a record of types";
    const opt = o.optional;
    if (opt !== undefined && !(Array.isArray(opt) && opt.every((k) => typeof k === "string" && k in fields))) return "a struct's optional names its own fields";
    for (const v of Object.values(fields)) { const p = typeProblem(v, partial); if (p) return p; }
    return null;
  }
  if ("union" in o) {
    const ms = o.union;
    if (!Array.isArray(ms) || ms.length < 2) return "a union has two or more members";
    for (const m of ms) { const p = typeProblem(m, partial); if (p) return p; }
    return null;
  }
  return "not a type";
}

/** @param {Type} t */
const num = (t) => assignable(t, "f64");
/** @param {Type} t */
const str = (t) => assignable(t, "str");
/** @param {Type} t */
const bool = (t) => assignable(t, "bool");

/**
 * Whether every value of `t` is an entity reference.
 * @param {Type} t
 * @returns {boolean}
 */
const entity = (t) => typeof t === "object" && ("ref" in t || ("union" in t && t.union.every(entity)));

/**
 * An operator's rule: given its operands' types and its own, what is wrong, or null.
 * @typedef {(args: Type[], t: Type) => string | null} OpRule
 */

/**
 * @param {number} n
 * @param {(t: Type) => boolean} each
 * @param {string} what
 * @param {Type} result
 * @returns {OpRule}
 */
const uniform = (n, each, what, result) => (args, t) => {
  if (args.length !== n) return `takes ${n} operand${n === 1 ? "" : "s"}, not ${args.length}`;
  if (!args.every(each)) return `takes ${what}`;
  return t === result ? null : `gives ${result}`;
};

const arith = uniform(2, num, "two numbers", "f64");
const unary = uniform(1, num, "a number", "f64");
const logic = uniform(2, bool, "two bools", "bool");

/** What each operator takes and gives (ir.d.ts, `Op`). */
export const OPS = /** @type {Record<Op, OpRule>} */ ({
  add: arith, sub: arith, mul: arith, div: arith, rem: arith, pow: arith,
  band: arith, bor: arith, bxor: arith, shl: arith, shr: arith, ushr: arith,
  neg: unary, pos: unary, bnot: unary,
  lt: compare, le: compare, gt: compare, ge: compare,
  eq: equality, ne: equality,
  not: uniform(1, bool, "a bool", "bool"),
  and: logic, or: logic,
  truthy: uniform(1, (a) => a !== "void", "a value", "bool"),
  present: uniform(1, (a) => typeof a === "object" && "opt" in a && entity(a.opt), "a possibly-empty entity reference", "bool"),
  concat: (args, t) => {
    if (args.length !== 2) return `takes 2 operands, not ${args.length}`;
    if (!args.every((a) => num(a) || str(a)) || !args.some((a) => a !== "unknown" && str(a))) return "takes a string and a string or number";
    return t === "str" ? null : "gives str";
  },
});

/** @type {OpRule} */
function compare(args, t) {
  if (args.length !== 2) return `takes 2 operands, not ${args.length}`;
  if (!(args.every(num) || args.every(str))) return "compares two numbers or two strings";
  return t === "bool" ? null : "gives bool";
}

/** @type {OpRule} */
function equality(args, t) {
  if (args.length !== 2) return `takes 2 operands, not ${args.length}`;
  const [a, b] = args;
  if (!(assignable(a, b) || assignable(b, a) || (str(a) && str(b)))) return "compares values that can be equal";
  return t === "bool" ? null : "gives bool";
}

/**
 * What owns the members of a value of type `t`: an entity kind, a dialect object, a list's `with`.
 * @param {Type} t
 * @returns {string | null}
 */
export function ownerOf(t) {
  if (typeof t !== "object") return null;
  if ("ref" in t) return t.ref;
  if ("obj" in t) return t.obj;
  if ("list" in t && t.with) return t.with;
  return null;
}

/**
 * Whether a store rule can hold values of `t`.
 * @param {Coerce} c
 * @param {Type} t
 */
export function storeFits(c, t) {
  if (c.type === "bool") return t === "bool";
  if (c.type === "enum") return typeof t === "object" && "enum" in t && sameType({ enum: t.enum }, { enum: c.values ?? [] });
  return t === "f64";
}

/**
 * Whether `e` is the start a bounded `for` may count from: an integer literal (maybe negated) within 2^53, or a param.
 * @param {Expr} e
 */
function countsFrom(e) {
  const n = e.k === "op" && e.op === "neg" ? e.args[0] : e;
  if (n.k === "num") return Number.isSafeInteger(n.v);
  return isParam(e);
}

/** @param {Expr} e */
const isParam = (e) => e.k === "call" && e.fn.endsWith(".param") && e.args[0]?.k === "str";

/**
 * The bound a `for` test names, as lowering writes it, or null when it bounds nothing: a constant
 * within 2^53, a param, a list's length (at most its `max`), or a read-only place.
 * @param {Expr} b
 * @returns {string | null}
 */
function boundOf(b) {
  if (b.k === "num") return Math.abs(b.v) <= Number.MAX_SAFE_INTEGER ? `const ${b.v}` : null;
  if (isParam(b) && b.k === "call" && b.args[0].k === "str") return `param ${b.args[0].v}`;
  if (b.k === "field" && b.name === "length" && typeof b.of.t === "object" && "list" in b.of.t) return `size ≤ ${b.of.t.max}`;
  if (b.k === "load" && !b.place.store) return `size ${b.place.name}`;
  return null;
}

/**
 * Whether `stmts`, at any depth, change the local `name`.
 * @param {Stmt[]} stmts
 * @param {string} name
 * @returns {boolean}
 */
function changes(stmts, name) {
  return stmts.some((s) => ((s.k === "set" || s.k === "push") && s.name === name)
    || (s.k === "if" && (changes(s.then, name) || changes(s.else, name)))
    || (s.k === "for" && (changes(s.update, name) || changes(s.body, name)))
    || (s.k === "each" && changes(s.body, name)));
}

/**
 * Why a `for` is not bounded, or null when it is: it counts by one, from an integer or a
 * param, up to the bound it names, and nothing in it changes the counter.
 * @param {Extract<Stmt, { k: "for" }>} s
 * @returns {string | null}
 */
export function unbounded(s) {
  if (!countsFrom(s.init)) return "its counter does not start at an integer or a param";
  const t = s.test;
  if (!(t.k === "op" && (t.op === "lt" || t.op === "le") && t.args.length === 2 && t.args[0].k === "local" && t.args[0].name === s.name)) return `its test is not ${s.name} < bound or ${s.name} <= bound`;
  const named = boundOf(t.args[1]);
  if (named === null) return "its test's bound is not a constant, a param, a list's length or a read-only place";
  if (named !== s.bound) return `it records the bound '${s.bound}', but its test's is '${named}'`;
  const u = s.update;
  const step = u.length === 1 && u[0].k === "set" && u[0].name === s.name ? u[0].value : null;
  if (!(step && step.k === "op" && step.op === "add" && step.args[0]?.k === "local" && step.args[0].name === s.name && step.args[1]?.k === "num" && step.args[1].v === 1)) return `its update is not ${s.name} = ${s.name} + 1`;
  if (changes(s.body, s.name)) return `its body changes ${s.name}`;
  return null;
}
