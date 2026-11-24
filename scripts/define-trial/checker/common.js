// What the Dialect and Grammar validators share: key checks with a did-you-mean, and type names.

import { didYouMean } from "../../../kit/lower/codes.js";
import { TAG, tagged, isPlainObject } from "./tags.js";

/** @import { Problem } from "./session.js" */

export { didYouMean };

/** @param {string[]} names */
export const listed = (names) => names.map((n) => `'${n}'`).join(", ");

/**
 * D001 for each key of `obj` not in `allowed`, and for each of `required` it lacks.
 * @param {Record<string, unknown>} obj
 * @param {readonly string[]} allowed
 * @param {readonly string[]} required
 * @param {Array<string | number>} path
 * @param {string} what  e.g. "defineDialect", "an intrinsic"
 * @param {Problem[]} out
 */
export function checkKeys(obj, allowed, required, path, what, out) {
  for (const k of Object.keys(obj)) {
    if (allowed.includes(k)) continue;
    out.push({ code: "D001", path: [...path, k], message: `${what} takes no key '${k}'.${didYouMean(k, allowed)}`, fix: `use one of ${listed([...allowed])}, or remove '${k}'` });
  }
  for (const k of required) {
    if (!(k in obj)) out.push({ code: "D001", path, message: `${what} is missing its required key '${k}'.`, fix: `add '${k}'` });
  }
}

export const BUILTIN_TYPES = Object.freeze(["f32", "f64", "bool", "str", "null", "void"]);

/**
 * @typedef {object} TypeScope
 * @property {Set<string>} vectors
 * @property {Set<string>} objects
 */

/**
 * D002 (or D011 for a malformed compound) for each type in `t` that resolves to nothing.
 * @param {unknown} t
 * @param {TypeScope} scope
 * @param {{ typeVars?: boolean, infer?: boolean }} allow  type variables (intrinsic and method signatures), "infer" (slot returns)
 * @param {Array<string | number>} path
 * @param {string} where  what holds the type, for the message
 * @param {Problem[]} out
 */
export function checkType(t, scope, allow, path, where, out) {
  if (typeof t === "string") {
    if (BUILTIN_TYPES.includes(t) || scope.vectors.has(t) || scope.objects.has(t)) return;
    if (allow.typeVars && /^[A-Z]$/.test(t)) return;
    if (allow.infer && t === "infer") return;
    const known = [...BUILTIN_TYPES, ...scope.vectors, ...scope.objects];
    const why = /^[A-Z]$/.test(t) ? " A type variable is allowed only in an intrinsic's or a method's signature." : t === "infer" ? ` "infer" is allowed only as a slot convention's returns.` : /^(int|i32|u32|integer|date|datetime)$/i.test(t) ? " The draft has no integer or date type." : didYouMean(t, known);
    out.push({ code: "D002", path, message: `${where}: the type '${t}' resolves to nothing.${why}`, fix: `use a built-in (${BUILTIN_TYPES.join(", ")}), a vector declared in types, an object declared in objects${allow.typeVars ? ", or a type variable such as \"T\"" : ""}` });
    return;
  }
  const h = tagged(t);
  if (!h) {
    out.push({ code: "D002", path, message: `${where}: ${describe(t)} is not a type name.`, fix: `write the type's name as a string, e.g. "f32", or build it with list(), opt(), struct(), union() or enumOf()` });
    return;
  }
  /** @param {string} m @param {string} fix */
  const bad = (m, fix) => out.push({ code: "D011", path, message: `${where}: ${m}`, fix });
  const kind = h[TAG];
  if (kind === "list") {
    const l = /** @type {import("./tags.js").ListTag} */ (h);
    checkType(l.of, scope, allow, path, where, out);
    if (!(typeof l.max === "number" && Number.isInteger(l.max) && l.max > 0)) bad(`list() needs a positive whole max, got ${describe(l.max)}.`, "write list(type, max), e.g. list(\"f64\", 1000)");
  } else if (kind === "opt") {
    checkType(/** @type {import("./tags.js").OptTag} */ (h).of, scope, allow, path, where, out);
  } else if (kind === "struct") {
    const s = /** @type {import("./tags.js").StructTag} */ (h);
    if (!isPlainObject(s.fields)) bad("struct() takes an object of field types.", `write struct({ x: "f64", y: "f64" })`);
    else for (const [k, v] of Object.entries(s.fields)) checkType(v, scope, allow, path, `${where}, field '${k}'`, out);
    if (s.options !== undefined) {
      const o = s.options;
      if (!isPlainObject(o)) bad("struct()'s second argument is { optional: [...] }.", `write struct({ … }, { optional: ["y"] })`);
      else {
        checkKeys(o, ["optional"], [], path, "struct()'s options", out);
        const fields = isPlainObject(s.fields) ? Object.keys(s.fields) : [];
        if (o.optional !== undefined && !(Array.isArray(o.optional) && o.optional.every((n) => typeof n === "string" && fields.includes(n)))) bad("struct()'s optional must list some of its own fields.", `optional: [${fields.map((f) => `"${f}"`).join(", ")}]`);
      }
    }
  } else if (kind === "union") {
    const u = /** @type {import("./tags.js").UnionTag} */ (h);
    if (u.of.length < 2) bad("union() needs at least two types.", "write union(a, b, …)");
    for (const x of u.of) checkType(x, scope, allow, path, where, out);
  } else if (kind === "enum") {
    const e = /** @type {import("./tags.js").EnumTag} */ (h);
    if (!(Array.isArray(e.values) && e.values.length > 0 && e.values.every((v) => typeof v === "string"))) bad("enumOf() takes a non-empty list of strings.", `write enumOf(["a", "b"])`);
  } else {
    out.push({ code: "D002", path, message: `${where}: ${kind}() makes ${kind === "vector" ? "a vector type, which is declared in types and then named" : "no type"}.`, fix: kind === "vector" ? `declare it in types (e.g. vec2: vector(2, "f32")) and write "vec2" here` : "use a type name or list(), opt(), struct(), union(), enumOf()" });
  }
}

/** @param {unknown} v */
export const kindOf = (v) => tagged(v)?.[TAG];

/**
 * A short description of a value for a message.
 * @param {unknown} v
 */
export function describe(v) {
  if (typeof v === "string") return JSON.stringify(v);
  if (typeof v === "function") return "a function";
  if (Array.isArray(v)) return "a list";
  if (v === null) return "null";
  if (v === undefined) return "nothing";
  const k = kindOf(v);
  if (k) return `${k}()`;
  return typeof v === "object" ? "an object" : String(v);
}
