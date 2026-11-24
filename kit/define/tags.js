// The helpers a definition is written with. Each returns a plain object tagged with a private symbol, so
// the validators can tell `vector(2, "f32")` from an object written by hand. Helpers never throw: a bad
// argument is kept as given and reported when the definition is validated, so every problem is collected.

export const TAG = Symbol("kit/define helper");

/** @import * as T from "./define.js" */

/**
 * The trailing `{ as }` of an argument spec, if the last argument is one.
 * @param {unknown[]} a
 * @returns {[unknown[], string | undefined, unknown]}
 */
function splitAs(a) {
  const last = a.at(-1);
  if (a.length > 0 && last !== null && typeof last === "object" && !(TAG in last) && "as" in last) return [a.slice(0, -1), /** @type {any} */ (last).as, last];
  return [a, undefined, undefined];
}

/** @param {unknown} n @param {unknown} elem @param {unknown} [options] @returns {T.VectorTag} */
export const vector = (n, elem, options) => ({ [TAG]: "vector", n, elem, options });
/** A nominal scalar, declared in types: a named type stored as `of` ("f64"), compared only with its own kind. @param {unknown} of @param {unknown} [options] @returns {T.ScalarTag} */
export const scalar = (of, options) => ({ [TAG]: "scalar", of, options });
/** @returns {T.ExactTag} */
export const exact = () => ({ [TAG]: "exact" });
/** @param {unknown} figure @returns {T.ToleranceTag} */
export const tolerance = (figure) => ({ [TAG]: "tolerance", figure });
/** @param {unknown} of @param {unknown} max @returns {T.ListTag} */
export const list = (of, max) => ({ [TAG]: "list", of, max });
/** A type that may be null; as an argument spec, an optional trailing argument. @param {unknown} of @returns {T.OptTag} */
export const opt = (of) => ({ [TAG]: "opt", of });
/** @param {unknown} fields @param {unknown} [options] @returns {T.StructTag} */
export const struct = (fields, options) => ({ [TAG]: "struct", fields, options });
/** @param {...unknown} of @returns {T.UnionTag} */
export const union = (...of) => ({ [TAG]: "union", of });
/** One of these values: a nominal enum type, or a data shape. @param {unknown} values @returns {T.EnumTag} */
export const enumOf = (values) => ({ [TAG]: "enum", values });
/** An object type made on the spot, with members as in `objects`. @param {unknown} label @param {unknown} members @returns {T.ObjectTag} */
export const object = (label, members) => ({ [TAG]: "object", label, members });

/** @param {...unknown} a @returns {T.NameTag} */
export function name(...a) {
  const [rest, as, opts] = splitAs(a);
  return { [TAG]: "name", ns: rest[0], count: rest.length, as, opts };
}
/** @param {...unknown} a @returns {T.RefTag} */
export function ref(...a) {
  const [rest, as, opts] = splitAs(a);
  return { [TAG]: "ref", ns: rest[0], count: rest.length, as, opts };
}
/** @param {...unknown} a @returns {T.DataTag} */
export function data(...a) {
  const [rest, as, opts] = splitAs(a);
  return { [TAG]: "data", shape: rest[0], count: rest.length, as, opts };
}
/** @param {...unknown} a @returns {T.LambdaTag} */
export function lambda(...a) {
  const [rest, as, opts] = splitAs(a);
  return { [TAG]: "lambda", convention: rest[0], count: rest.length, as, opts };
}
/** @param {...unknown} a @returns {T.RestTag} */
export function rest(...a) {
  const [r, as, opts] = splitAs(a);
  return { [TAG]: "rest", spec: r[0], count: r.length, as, opts };
}
/** @param {...unknown} of @returns {T.OneOfTag} */
export const oneOf = (...of) => ({ [TAG]: "oneOf", of });
/** @param {unknown} of @returns {T.RecordOfTag} */
export const recordOf = (of) => ({ [TAG]: "recordOf", of });
/** @param {unknown} of @returns {T.ListOfTag} */
export const listOf = (of) => ({ [TAG]: "listOf", of });

/**
 * The helper's tag, or undefined for anything a helper did not make.
 * @param {unknown} v
 * @returns {T.Tagged | undefined}
 */
export function tagged(v) {
  return v !== null && typeof v === "object" && TAG in v ? /** @type {T.Tagged} */ (v) : undefined;
}

/** @param {unknown} v */
export const kindOf = (v) => tagged(v)?.[TAG];

/** @param {unknown} v @returns {v is Record<string, unknown>} */
export const isPlainObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v) && !(TAG in v);

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
