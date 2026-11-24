// The module the checker supplies as `kit/define` to a candidate's files: the draft's helpers, and stub
// defineDialect / defineGrammar that validate their input (D001–D014) and, for the grammar, return a
// recording builder. Nothing here lowers or runs a lambda.

import { TAG } from "./tags.js";
import { session, callSite } from "./session.js";
import { validateDialect } from "./dialect.js";
import { validateGrammar } from "./grammar.js";
import { rootBuilder } from "./builder.js";

/** @import * as T from "./tags.js" */

/** @param {unknown} n @param {unknown} elem @param {unknown} [options] @returns {T.VectorTag} */
export const vector = (n, elem, options) => ({ [TAG]: "vector", n, elem, options });
/** @returns {T.ExactTag} */
export const exact = () => ({ [TAG]: "exact" });
/** @param {unknown} figure @returns {T.ToleranceTag} */
export const tolerance = (figure) => ({ [TAG]: "tolerance", figure });
/** @param {unknown} of @param {unknown} max @returns {T.ListTag} */
export const list = (of, max) => ({ [TAG]: "list", of, max });
/** @param {unknown} of @returns {T.OptTag} */
export const opt = (of) => ({ [TAG]: "opt", of });
/** @param {unknown} fields @param {unknown} [options] @returns {T.StructTag} */
export const struct = (fields, options) => ({ [TAG]: "struct", fields, options });
/** @param {...unknown} of @returns {T.UnionTag} */
export const union = (...of) => ({ [TAG]: "union", of });
/** @param {unknown} values @returns {T.EnumTag} */
export const enumOf = (values) => ({ [TAG]: "enum", values });
/** @param {...unknown} a @returns {T.NameTag} */
export const name = (...a) => ({ [TAG]: "name", ns: a[0], count: a.length });
/** @param {...unknown} a @returns {T.RefTag} */
export const ref = (...a) => ({ [TAG]: "ref", ns: a[0], count: a.length });
/** @param {...unknown} a @returns {T.DataTag} */
export const data = (...a) => ({ [TAG]: "data", shape: a[0], count: a.length });
/** @param {...unknown} a @returns {T.RestTag} */
export const rest = (...a) => ({ [TAG]: "rest", spec: a[0], count: a.length });
/** @param {...unknown} of @returns {T.OneOfTag} */
export const oneOf = (...of) => ({ [TAG]: "oneOf", of });
/** @param {unknown} of @returns {T.RecordOfTag} */
export const recordOf = (of) => ({ [TAG]: "recordOf", of });
/** @param {unknown} of @returns {T.ListOfTag} */
export const listOf = (of) => ({ [TAG]: "listOf", of });

/**
 * Validates a Dialect definition and returns it unchanged.
 * @template D
 * @param {D} def
 * @returns {D}
 */
export function defineDialect(def) {
  const site = callSite();
  session.report(site, validateDialect(def));
  if (def !== null && typeof def === "object") session.dialects.add(def);
  session.dialect ??= /** @type {Record<string, unknown>} */ (def);
  return def;
}

/**
 * Validates a Grammar definition and returns its root builder: a function that records the calls made on it.
 * @param {unknown} dialect
 * @param {unknown} def
 * @returns {(...args: unknown[]) => unknown}
 */
export function defineGrammar(dialect, def) {
  const site = callSite();
  const known = dialect !== null && typeof dialect === "object" && session.dialects.has(dialect);
  session.report(site, validateGrammar(known ? /** @type {Record<string, unknown>} */ (dialect) : null, def));
  session.grammar = { def, dialect: known ? /** @type {Record<string, unknown>} */ (dialect) : null };
  return rootBuilder(def);
}
