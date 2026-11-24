// Operations on IR types: printing, assignability, joins, and type variables.

/** @import { Type, VecType } from "./ir.js" */

/**
 * A compact, readable rendering: `Mole?`, `[Spark; 24]`, `{x: f64}`, `"a"|"b"`, a dialect's
 * vector by its name (`vec2`) and a structural one by its shape (`f32x2`).
 * @param {Type} t
 * @returns {string}
 */
export function showType(t) {
  if (typeof t === "string") return t;
  if ("enum" in t) return t.enum.map((v) => JSON.stringify(v)).join("|");
  if ("ref" in t) return t.ref;
  if ("opt" in t) {
    const inner = showType(t.opt);
    return typeof t.opt === "object" && ("union" in t.opt || "enum" in t.opt) ? `(${inner})?` : `${inner}?`;
  }
  if ("list" in t) return `[${showType(t.list)}; ${t.max}]`;
  if ("struct" in t) {
    const opt = new Set(t.optional ?? []);
    return `{${Object.entries(t.struct).map(([k, v]) => `${k}${opt.has(k) ? "?" : ""}: ${showType(v)}`).join(", ")}}`;
  }
  if ("union" in t) return t.union.map(showType).join(" | ");
  if ("obj" in t) return t.obj;
  if ("vec" in t) return t.name ?? `${t.of}x${t.vec}`;
  return t.tvar;
}

/**
 * Structural equality.
 * @param {Type} a
 * @param {Type} b
 */
export function sameType(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Whether a value of type `from` may be used where `to` is expected.
 * `unknown` on either side is accepted: it marks an error already reported.
 * @param {Type} from
 * @param {Type} to
 * @returns {boolean}
 */
export function assignable(from, to) {
  if (from === "unknown" || to === "unknown" || sameType(from, to)) return true;
  if (typeof from === "object" && "union" in from) return from.union.every((f) => assignable(f, to));
  if (typeof from === "object" && "opt" in from) return assignable("null", to) && assignable(from.opt, to);
  if (typeof to === "string") return to === "str" && typeof from === "object" && "enum" in from;
  if ("union" in to) return to.union.some((m) => assignable(from, m));
  if ("opt" in to) return from === "null" || assignable(from, to.opt);
  if (typeof from === "string") return false;
  if ("enum" in to) return "enum" in from && from.enum.every((v) => to.enum.includes(v));
  if ("ref" in to) return "ref" in from && from.ref === to.ref;
  if ("list" in to) return "list" in from && assignable(from.list, to.list) && from.max <= to.max && (to.len === undefined || from.len === to.len);
  if ("obj" in to) return "obj" in from && from.obj === to.obj;
  if ("struct" in to) {
    if (!("struct" in from)) return false;
    const optional = new Set(to.optional ?? []);
    for (const [k, v] of Object.entries(from.struct)) if (!(k in to.struct) || !assignable(v, to.struct[k])) return false;
    return Object.keys(to.struct).every((k) => k in from.struct || optional.has(k));
  }
  return false;
}

/**
 * The type of a value that is either `a` or `b`: a ternary's, or a function's over its returns.
 * @param {Type} a
 * @param {Type} b
 * @returns {Type}
 */
export function join(a, b) {
  if (a === "unknown") return b;
  if (b === "unknown" || sameType(a, b)) return a;
  const empty = (/** @type {Type} */ t) => t === "null" || t === "void";
  if (empty(a)) return optional(b);
  if (empty(b)) return optional(a);
  if (typeof a === "object" && "opt" in a) return optional(join(a.opt, b));
  if (typeof b === "object" && "opt" in b) return optional(join(a, b.opt));
  if (typeof a === "object" && typeof b === "object" && "enum" in a && "enum" in b) return { enum: [...new Set([...a.enum, ...b.enum])] };
  if (assignable(a, b)) return b;
  if (assignable(b, a)) return a;
  const members = [a, b].flatMap((t) => (typeof t === "object" && "union" in t ? t.union : [t]));
  return { union: members.filter((t, i) => members.findIndex((u) => sameType(t, u)) === i) };
}

/**
 * The one type of two values that must share one, by a closed list, or null when they do
 * not: the same type; two string literals, giving the enum of both; a dialect enum and a
 * literal that is one of its members, giving the dialect enum; a string literal or enum and
 * `str`, giving `str`; a value and null (or a possibly-empty value), giving possibly empty.
 * Dialect enums, entity and struct types join only with themselves, `void` joins with nothing, and
 * `unknown` (an error already reported) yields to the other side. Unlike `join` it never
 * falls back to a union, which is why call-site parameters and array items use it.
 * @param {Type} a
 * @param {Type} b
 * @returns {Type | null}
 */
export function strictJoin(a, b) {
  if (a === "unknown") return b;
  if (b === "unknown" || sameType(a, b)) return a;
  // A void value is not a value: it never becomes a parameter's type, not even as possibly empty.
  if (a === "void" || b === "void") return null;
  const isOpt = (/** @type {Type} */ t) => typeof t === "object" && "opt" in t;
  const inner = (/** @type {Type} */ t) => (typeof t === "object" && "opt" in t ? t.opt : t);
  if (a === "null" || b === "null" || isOpt(a) || isOpt(b)) {
    const rest = [a, b].filter((t) => t !== "null").map(inner);
    if (rest.length === 0) return "null";
    const both = rest.length === 2 ? strictJoin(rest[0], rest[1]) : rest[0];
    return both === null ? null : optional(both);
  }
  if (typeof a === "object" && typeof b === "object" && "enum" in a && "enum" in b) return joinEnums(a, b);
  if (a === "str" && typeof b === "object" && "enum" in b) return "str";
  if (b === "str" && typeof a === "object" && "enum" in a) return "str";
  return null;
}

/**
 * Two enums by the strict list. Enums built of string literals give the enum of every
 * member. A dialect enum is nominal: a literal enum meets it by membership (and gives it),
 * and two dialect enums join only when they have the same members.
 * @param {{ enum: string[], declared?: true }} a
 * @param {{ enum: string[], declared?: true }} b
 * @returns {Type | null}
 */
function joinEnums(a, b) {
  const within = (/** @type {string[]} */ x, /** @type {string[]} */ y) => x.every((v) => y.includes(v));
  if (a.declared && b.declared) return within(a.enum, b.enum) && within(b.enum, a.enum) ? a : null;
  if (a.declared) return within(b.enum, a.enum) ? a : null;
  if (b.declared) return within(a.enum, b.enum) ? b : null;
  return { enum: [...new Set([...a.enum, ...b.enum])].sort() };
}

/**
 * A dialect's enum: a closed set the dialect declares (sprite names, choice options,
 * buttons, an entity's kind). Marked `declared`, which is how it differs from the enum of
 * a string literal; see `strictJoin`.
 * @param {string[]} values
 * @returns {Type}
 */
export function dialectEnum(values) {
  return { enum: values, declared: true };
}

/**
 * The type of `list[i]`: the item type when `i` is a constant position below the list's exact
 * length (`len`, recorded only for array literals), otherwise the item type made possibly empty.
 * @param {{ list: Type, len?: number }} list
 * @param {number | null} i the index when it is a constant, else null
 * @returns {Type}
 */
export function itemAt(list, i) {
  const known = i !== null && Number.isInteger(i) && i >= 0 && list.len !== undefined && i < list.len;
  return known ? list.list : optional(list.list);
}

/**
 * `t`, made possibly empty.
 * @param {Type} t
 * @returns {Type}
 */
export function optional(t) {
  if (t === "null" || t === "void" || t === "unknown" || (typeof t === "object" && "opt" in t)) return t;
  return { opt: t };
}

/**
 * Binds type variables in `param` by matching it against `arg`. Returns false on a mismatch.
 * @param {Type} param
 * @param {Type} arg
 * @param {Map<string, Type>} bound
 * @returns {boolean}
 */
export function unify(param, arg, bound) {
  if (arg === "unknown") return true;
  if (typeof param === "object" && "tvar" in param) {
    const prior = bound.get(param.tvar);
    if (!prior) { bound.set(param.tvar, arg); return true; }
    return assignable(arg, prior);
  }
  if (typeof param === "object" && typeof arg === "object") {
    if ("list" in param && "list" in arg) return unify(param.list, arg.list, bound);
    if ("opt" in param) return unify(param.opt, "opt" in arg ? arg.opt : arg, bound);
  }
  return assignable(arg, substitute(param, bound));
}

/**
 * `t` with its type variables replaced by their bindings (`unknown` when unbound).
 * @param {Type} t
 * @param {Map<string, Type>} bound
 * @returns {Type}
 */
export function substitute(t, bound) {
  if (typeof t === "string") return t;
  if ("tvar" in t) return bound.get(t.tvar) ?? "unknown";
  if ("opt" in t) return optional(substitute(t.opt, bound));
  if ("list" in t) return { ...t, list: substitute(t.list, bound) };
  if ("union" in t) return { union: t.union.map((m) => substitute(m, bound)) };
  if ("struct" in t) return { ...t, struct: Object.fromEntries(Object.entries(t.struct).map(([k, v]) => [k, substitute(v, bound)])) };
  return t;
}

/**
 * A dialect's vector type: `name` over a structural shape of `n` components of `of`. Nominal,
 * as a dialect's enum is: two dialect vectors with the same shape (`vec3`, `color`) are different
 * types, and neither is the structural vector of its shape, so no join, assignment or operator
 * mixes them.
 * @param {string} name
 * @param {2 | 3 | 4} n
 * @param {"f32" | "f64"} of
 * @returns {VecType}
 */
export function dialectVector(name, n, of) {
  return { vec: n, of, name };
}

/**
 * The vector type `t` is, or null.
 * @param {Type} t
 * @returns {VecType | null}
 */
export function vectorOf(t) {
  return typeof t === "object" && "vec" in t ? t : null;
}
