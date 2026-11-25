// Type names in a definition: checking them (D002, D011) and resolving them to core Types.

import { didYouMean } from "./codes.js";
import { TAG, tagged, isPlainObject, describe } from "./tags.js";
import { dialectEnum, optional } from "../ir/types.js";

/** @import { Type, VecType, ScalarType } from "../ir/ir.js" */
/** @import { Member, FnSig } from "../lower/environment.js" */
/** @import * as T from "./define.js" */

/** @typedef {{ code: string, path: Array<string | number>, message: string, tip: string }} Problem */

export const BUILTIN_TYPES = Object.freeze(["f32", "f64", "bool", "str", "null", "void"]);

/** @param {string[]} names */
export const listed = (names) => names.map((n) => `'${n}'`).join(", ");

/**
 * D001 for each key of `obj` not in `allowed`, and for each of `required` it lacks.
 * @param {Record<string, unknown>} obj @param {readonly string[]} allowed @param {readonly string[]} required
 * @param {Array<string | number>} path @param {string} what @param {Problem[]} out
 */
export function checkKeys(obj, allowed, required, path, what, out) {
  for (const k of Object.keys(obj)) {
    if (!allowed.includes(k)) out.push({ code: "D001", path: [...path, k], message: `${what} takes no key '${k}'.${didYouMean(k, allowed)}`, tip: `use one of ${listed([...allowed])}, or remove '${k}'` });
  }
  for (const k of required) if (!(k in obj)) out.push({ code: "D001", path, message: `${what} is missing its required key '${k}'.`, tip: `add '${k}'` });
}

/**
 * @typedef {object} TypeScope
 * @property {Set<string>} types  names declared in `types`: vectors and nominal scalars
 * @property {Set<string>} objects
 */

/**
 * D002 (or D011 for a malformed compound) for each type in `t` that resolves to nothing.
 * @param {unknown} t @param {TypeScope} scope
 * @param {{ typeVars?: boolean, infer?: boolean }} allow
 * @param {Array<string | number>} path @param {string} where @param {Problem[]} out
 */
export function checkType(t, scope, allow, path, where, out) {
  if (typeof t === "string") {
    if (BUILTIN_TYPES.includes(t) || scope.types.has(t) || scope.objects.has(t)) return;
    if (allow.typeVars && /^[A-Z]$/.test(t)) return;
    if (allow.infer && t === "infer") return;
    const known = [...BUILTIN_TYPES, ...scope.types, ...scope.objects];
    const why = /^[A-Z]$/.test(t) ? " A type variable is allowed only in an intrinsic's or a method's signature." : t === "infer" ? ` "infer" is allowed only as a slot convention's returns.` : /^(int|i32|u32|integer)$/i.test(t) ? " There is no integer type: a whole number is a number." : didYouMean(t, known);
    out.push({ code: "D002", path, message: `${where}: the type '${t}' resolves to nothing.${why}`, tip: `use a built-in (${BUILTIN_TYPES.join(", ")}), a vector or scalar declared in types or an object declared in objects${allow.typeVars ? ", or a type variable such as \"T\"" : ""}` });
    return;
  }
  const h = tagged(t);
  if (!h) { out.push({ code: "D002", path, message: `${where}: ${describe(t)} is not a type name.`, tip: `write the type's name as a string, e.g. "f32", or build it with list(), opt(), struct(), union(), enumOf() or object()` }); return; }
  /** @param {string} m @param {string} tip */
  const bad = (m, tip) => out.push({ code: "D011", path, message: `${where}: ${m}`, tip });
  switch (h[TAG]) {
    case "list":
      checkType(h.of, scope, allow, path, where, out);
      if (!(typeof h.max === "number" && Number.isInteger(h.max) && h.max > 0)) bad(`list() needs a positive whole max, got ${describe(h.max)}.`, `write list(type, max), e.g. list("f64", 1000)`);
      return;
    case "opt": checkType(h.of, scope, allow, path, where, out); return;
    case "struct":
      if (!isPlainObject(h.fields)) bad("struct() takes an object of field types.", `write struct({ x: "f64", y: "f64" })`);
      else for (const [k, v] of Object.entries(h.fields)) checkType(v, scope, allow, path, `${where}, field '${k}'`, out);
      if (h.options !== undefined) {
        const fields = isPlainObject(h.fields) ? Object.keys(h.fields) : [];
        const o = /** @type {any} */ (h.options);
        if (!isPlainObject(o) || Object.keys(o).some((k) => k !== "optional") || !(Array.isArray(o.optional) && o.optional.every((/** @type {unknown} */ n) => typeof n === "string" && fields.includes(n)))) bad("struct()'s second argument must be { optional: [some of its own fields] }.", `struct({ … }, { optional: ["y"] })`);
      }
      return;
    case "union":
      if (h.of.length < 2) bad("union() needs at least two types.", "write union(a, b, …)");
      for (const x of h.of) checkType(x, scope, allow, path, where, out);
      return;
    case "enum":
      if (!(Array.isArray(h.values) && h.values.length > 0 && h.values.every((v) => typeof v === "string"))) bad("enumOf() as a type takes a non-empty list of strings (the core's enums hold strings).", `write enumOf(["a", "b"])`);
      return;
    case "object":
      if (typeof h.label !== "string" || !isPlainObject(h.members)) bad("object() takes a label and an object of members.", `object("a row", { price: "f64" })`);
      else for (const [m, v] of Object.entries(h.members)) checkMember(v, scope, path, `${where}, member '${m}'`, out);
      return;
    default: {
      const named = h[TAG] === "vector" ? ["a vector type", `vec2: vector(2, "f32")`, "vec2"] : h[TAG] === "scalar" ? ["a nominal scalar", `date: scalar("f64", { note: "…" })`, "date"] : null;
      out.push({ code: "D002", path, message: `${where}: ${h[TAG]}() makes ${named ? `${named[0]}, which is declared in types and then named` : "no type"}.`, tip: named ? `declare it in types (e.g. ${named[1]}) and write "${named[2]}" here` : "use a type name or list(), opt(), struct(), union(), enumOf(), object()" });
    }
  }
}

export const SIGNATURE_KEYS = Object.freeze(["params", "returns", "minArgs", "rest"]);

/**
 * params, returns, minArgs and rest of an intrinsic or method; type variables are allowed.
 * @param {Record<string, unknown>} sig @param {TypeScope} scope @param {Array<string | number>} path @param {string} where @param {Problem[]} out
 */
export function checkSignature(sig, scope, path, where, out) {
  if (sig.params !== undefined) {
    if (!Array.isArray(sig.params)) out.push({ code: "D011", path: [...path, "params"], message: `${where}: params must be a list of types.`, tip: `params: ["f32"]` });
    else sig.params.forEach((t, i) => checkType(t, scope, { typeVars: true }, [...path, "params"], `${where}, param ${i + 1}`, out));
  }
  if (sig.returns !== undefined) checkType(sig.returns, scope, { typeVars: true }, [...path, "returns"], `${where}, returns`, out);
  if (sig.rest !== undefined) checkType(sig.rest, scope, { typeVars: true }, [...path, "rest"], `${where}, rest`, out);
  if (sig.minArgs !== undefined && !(typeof sig.minArgs === "number" && Number.isInteger(sig.minArgs) && sig.minArgs >= 0)) out.push({ code: "D011", path: [...path, "minArgs"], message: `${where}: minArgs must be a whole number.`, tip: "minArgs: 1" });
}

/** The keys a member of a declared object may carry for per-slot effects; effects.js judges them (D021). */
const EFFECT_KEYS = Object.freeze(["write", "bump", "effects"]);

/**
 * An object member: a type, or { value, size }, { fn: signature }, { keyed: { what, keys } }. With `effects`, a
 * member of a declared object, it may also carry write, bump and effects (checked by effects.js, D021).
 * @param {unknown} t @param {TypeScope} scope @param {Array<string | number>} path @param {string} where @param {Problem[]} out
 * @param {{ effects?: boolean }} [options]
 */
export function checkMember(t, scope, path, where, out, { effects = false } = {}) {
  if (!isPlainObject(t)) { checkType(t, scope, {}, path, where, out); return; }
  const bad = (/** @type {string} */ m, /** @type {string} */ tip) => out.push({ code: "D011", path, message: `${where}: ${m}`, tip });
  const extra = effects ? EFFECT_KEYS : [];
  if ("value" in t) {
    checkKeys(t, ["value", "size", ...extra], [], path, where, out);
    checkType(t.value, scope, {}, path, where, out);
    if (t.size !== undefined && t.size !== true) bad("size must be true when present.", `{ value: "f64", size: true }`);
  } else if ("fn" in t) {
    checkKeys(t, ["fn", ...extra], [], path, where, out);
    if (!isPlainObject(t.fn)) bad("fn must be { params, returns }.", `{ fn: { params: ["f64"], returns: "f64" } }`);
    else { checkKeys(t.fn, SIGNATURE_KEYS, ["params", "returns"], [...path, "fn"], `${where}'s fn`, out); checkSignature(t.fn, scope, [...path, "fn"], where, out); }
  } else if ("keyed" in t) {
    checkKeys(t, ["keyed", ...extra], [], path, where, out);
    const k = t.keyed;
    if (!isPlainObject(k)) { bad("keyed must be { what, keys }.", `{ keyed: { what: "column", keys: { … } } }`); return; }
    checkKeys(k, ["what", "keys"], ["what", "keys"], [...path, "keyed"], `${where}'s keyed`, out);
    if (k.keys !== undefined && !isPlainObject(k.keys)) { bad("keyed.keys must be an object of signatures.", `keys: { revenue: { params: [], returns: "f64" } }`); return; }
    for (const [key, sig] of Object.entries(isPlainObject(k.keys) ? k.keys : {})) {
      const p = [...path, "keyed", "keys", key];
      if (!isPlainObject(sig)) { out.push({ code: "D011", path: p, message: `${where}: key '${key}' must be a signature { params, returns }.`, tip: `${key}: { params: [], returns: "f64" }` }); continue; }
      checkKeys(sig, SIGNATURE_KEYS, ["params", "returns"], p, `${where}, key '${key}'`, out);
      checkSignature(sig, scope, p, `${where}, key '${key}'`, out);
    }
  } else {
    checkKeys(t, ["value", "size", "fn", "keyed"], [], path, where, out);
    bad("an object member is { value }, { fn } or { keyed }.", `write a type name, { value, size: true }, { fn: { params, returns } } or { keyed: { what, keys } }`);
  }
}

/**
 * Resolves definition types to core Types. `objectFor` registers an `object(label, members)` type and
 * returns its name; without it, an inline object type is an error (only conventions may make one).
 * @typedef {object} Resolver
 * @property {Record<string, VecType>} vectors
 * @property {Record<string, ScalarType>} [scalars]  the nominal scalars declared in `types`
 * @property {(label: string, members: Record<string, unknown>) => string} [objectFor]
 * @property {{ has(name: string): boolean }} [objects]  declared object names, which win over a one-letter type variable
 */

/**
 * @param {unknown} t  a checked type, or a core Type a step handed back (see `fromCore`)
 * @param {Resolver} r
 * @returns {Type}
 */
export function resolveType(t, r) {
  if (typeof t === "string") {
    if (t in r.vectors) return r.vectors[t];
    if (r.scalars && Object.hasOwn(r.scalars, t)) return r.scalars[t];
    if (/^[A-Z]$/.test(t) && !r.objects?.has(t)) return { tvar: t };
    if (BUILTIN_TYPES.includes(t) || t === "unknown") return /** @type {Type} */ (t);
    return { obj: t };
  }
  const h = tagged(t);
  if (!h) throw new Error(`not a type: ${describe(t)}`);
  switch (h[TAG]) {
    case "list": return { list: resolveType(h.of, r), max: /** @type {number} */ (h.max) };
    case "opt": return optional(resolveType(h.of, r));
    case "struct": {
      const fields = /** @type {Record<string, unknown>} */ (h.fields);
      const opts = /** @type {{ optional?: string[] } | undefined} */ (h.options)?.optional;
      return { struct: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, resolveType(v, r)])), ...(opts ? { optional: opts } : {}) };
    }
    case "union": return { union: h.of.map((x) => resolveType(x, r)) };
    case "enum": return dialectEnum(/** @type {string[]} */ (h.values));
    case "object": {
      if (!r.objectFor) throw new Error("object() types are made only by slot conventions");
      return { obj: r.objectFor(/** @type {string} */ (h.label), /** @type {Record<string, unknown>} */ (h.members)) };
    }
  }
  throw new Error(`not a type: ${h[TAG]}()`);
}

/**
 * @param {Record<string, unknown>} sig @param {Resolver} r
 * @returns {Omit<FnSig, "effects">}
 */
function resolveSig(sig, r) {
  return {
    params: /** @type {unknown[]} */ (sig.params).map((p) => resolveType(p, r)),
    ...(sig.minArgs !== undefined ? { minArgs: /** @type {number} */ (sig.minArgs) } : {}),
    ...(sig.rest !== undefined ? { rest: resolveType(sig.rest, r) } : {}),
    returns: resolveType(sig.returns, r),
  };
}

/**
 * An intrinsic's call signature, in the shape fields' `sig` has.
 * @param {T.IntrinsicDef} i @param {Resolver} r
 * @returns {FnSig}
 */
export function intrinsicSig(i, r) {
  return { ...resolveSig(/** @type {any} */ (i), r), effects: [], ...(i.numeric ? { numeric: i.numeric } : {}) };
}

/**
 * A member in the core's terms. `at` names a declared object's member (`Plant.height`): a writable one stores with
 * the value rule and a total is a bump, each recording `read Plant.height` when read; a verb carries its effects.
 * @param {unknown} m @param {Resolver} r @param {string} [at]
 * @returns {Member}
 */
export function resolveMember(m, r, at) {
  if (!isPlainObject(m)) return { kind: "value", t: resolveType(m, r) };
  if ("value" in m) {
    const write = at !== undefined && m.write === true, bump = at !== undefined && m.bump === true;
    return {
      kind: "value", t: resolveType(m.value, r), ...(m.size === true ? { size: true } : {}),
      ...(write ? { store: { type: /** @type {const} */ ("value") } } : {}),
      ...(bump ? { bump: /** @type {const} */ (true) } : {}),
      ...(write || bump ? { effect: /** @type {import("../ir/ir.js").Effect} */ (`read ${at}`) } : {}),
    };
  }
  if ("fn" in m) return { kind: "fn", ...resolveSig(/** @type {Record<string, unknown>} */ (m.fn), r), effects: at !== undefined && Array.isArray(m.effects) ? [...m.effects] : [] };
  const k = /** @type {{ what: string, keys: Record<string, Record<string, unknown>> }} */ (m.keyed);
  return { kind: "keyed", what: k.what, keys: Object.fromEntries(Object.entries(k.keys).map(([key, sig]) => [key, resolveSig(sig, r)])), effects: [] };
}
