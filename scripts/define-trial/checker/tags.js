// The values kit/define's helpers return. Each is a plain object tagged with a private symbol, so the
// validators can tell `vector(2, "f32")` from an object an author wrote by hand. Helpers never throw: a bad
// argument is kept as given and reported when the definition is validated, so every problem is collected.

export const TAG = Symbol("kit/define helper");

/** Every name kit/define exports (define.js), for the did-you-mean on an import it does not have. */
export const HELPERS = Object.freeze(["vector", "exact", "tolerance", "list", "opt", "struct", "union", "enumOf", "name", "ref", "data", "rest", "oneOf", "recordOf", "listOf", "defineDialect", "defineGrammar"]);

/**
 * @typedef {{ [TAG]: "vector", n: unknown, elem: unknown, options: unknown }} VectorTag
 * @typedef {{ [TAG]: "exact" }} ExactTag
 * @typedef {{ [TAG]: "tolerance", figure: unknown }} ToleranceTag
 * @typedef {{ [TAG]: "list", of: unknown, max: unknown }} ListTag
 * @typedef {{ [TAG]: "opt", of: unknown }} OptTag
 * @typedef {{ [TAG]: "struct", fields: unknown, options: unknown }} StructTag
 * @typedef {{ [TAG]: "union", of: unknown[] }} UnionTag
 * @typedef {{ [TAG]: "enum", values: unknown }} EnumTag
 * @typedef {{ [TAG]: "name", ns: unknown, count: number }} NameTag
 * @typedef {{ [TAG]: "ref", ns: unknown, count: number }} RefTag
 * @typedef {{ [TAG]: "data", shape: unknown, count: number }} DataTag
 * @typedef {{ [TAG]: "rest", spec: unknown, count: number }} RestTag
 * @typedef {{ [TAG]: "oneOf", of: unknown[] }} OneOfTag
 * @typedef {{ [TAG]: "recordOf", of: unknown }} RecordOfTag
 * @typedef {{ [TAG]: "listOf", of: unknown }} ListOfTag
 * @typedef {VectorTag | ExactTag | ToleranceTag | ListTag | OptTag | StructTag | UnionTag | EnumTag | NameTag | RefTag | DataTag | RestTag | OneOfTag | RecordOfTag | ListOfTag} Tagged
 */

/**
 * The helper's tag, or undefined for anything a helper did not make.
 * @param {unknown} v
 * @returns {Tagged | undefined}
 */
export function tagged(v) {
  return v !== null && typeof v === "object" && TAG in v ? /** @type {Tagged} */ (v) : undefined;
}

/** @param {unknown} v @returns {v is Record<string, unknown>} */
export const isPlainObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v) && !(TAG in v);
