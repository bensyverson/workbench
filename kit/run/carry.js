// Values crossing a wire, as kit/compose planned them: the producer's record fields renamed (data only; for a list of
// records, each item's), the fields the consumer does not take dropped by path (`keep`, `inner.x`, `pts[].x`, a
// list's `[].k`), then each tagged leaf converted along its frame path. A conversion's `field` and a dropped path
// name the consumer's fields, after the rename, so the rename comes first. A point converts by scale and offset per
// axis (a point1 is one number), a vector (or a rate of one) by scale, a quantity by its one magnitude.

/** @import { Conversion } from "../compose/compose.js" */
import { convertDraw } from "./draw.js";

/**
 * One leaf converted. @param {unknown} v @param {Conversion} c @returns {unknown}
 */
function convertLeaf(v, c) {
  if (c.kind === "quantity") return typeof v === "number" ? v * c.scale[0] : v;
  if (c.kind === "point" && typeof v === "number") return v * (c.scale[0] ?? 1) + (c.offset[0] ?? 0);
  if (!Array.isArray(v)) return v;
  return v.map((x, i) => (typeof x === "number" ? x * (c.scale[i] ?? 1) + (c.kind === "point" ? c.offset[i] ?? 0 : 0) : x));
}

/**
 * The value at a leaf path (`at`, `a.b`, `pts[]`, "" for the value itself) converted, in a copy.
 * @param {unknown} v @param {string[]} path @param {Conversion} c @returns {unknown}
 */
function convertAt(v, path, c) {
  if (path.length === 0) return convertLeaf(v, c);
  const [head, ...rest] = path;
  if (head === "[]") return Array.isArray(v) ? v.map((x) => convertAt(x, rest, c)) : v;
  if (v === null || typeof v !== "object" || Array.isArray(v)) return v;
  const o = /** @type {Record<string, unknown>} */ (v);
  return Object.hasOwn(o, head) ? { ...o, [head]: convertAt(o[head], rest, c) } : o;
}

/** A leaf path as segments: `pts[].at` is pts, [], at. @param {string} field */
const segments = (field) => (field === "" ? [] : field.replace(/\[\]/g, ".[]").split(".").filter((s) => s !== ""));

/** A record's fields renamed; a list's items' (the record a list carries). @param {unknown} v @param {Record<string, string>} rename @returns {unknown} */
function renamed(v, rename) {
  if (Array.isArray(v)) return v.map((x) => renamed(x, rename));
  if (v === null || typeof v !== "object") return v;
  /** @type {Record<string, unknown>} */
  const r = {};
  for (const [k, x] of Object.entries(/** @type {Record<string, unknown>} */ (v))) r[Object.hasOwn(rename, k) ? rename[k] : k] = x;
  return r;
}

/** The value with the field at a path removed, in a copy; a path that meets no record leaves it be. @param {unknown} v @param {string[]} path @returns {unknown} */
function dropAt(v, path) {
  const [head, ...rest] = path;
  if (head === "[]") return Array.isArray(v) ? v.map((x) => dropAt(x, rest)) : v;
  if (v === null || typeof v !== "object" || Array.isArray(v) || !Object.hasOwn(v, head)) return v;
  const o = /** @type {Record<string, unknown>} */ (v);
  if (rest.length === 0) { const { [head]: _gone, ...kept } = o; return kept; }
  return { ...o, [head]: dropAt(o[head], rest) };
}

/**
 * One value or record carried across a wire: renamed, dropped, converted, then filled: each field the producer's
 * record lacks and the consumer declares a default for gets that default (already in the consumer's frame, so after
 * the conversions), in a copy per record. The plan decided statically that the producer's seam lacks the field, so
 * the default replaces whatever a runtime pushed under that name. A wire constant (`set`, the glue's literal for a
 * field the producer's seam lacks) is given the same way. The wire never computes a value.
 * @param {unknown} v @param {{ rename: Record<string, string>, dropped: string[], convert: Conversion[], fill?: Record<string, unknown>, set?: Record<string, unknown> }} wire
 * @returns {unknown}
 */
export function carry(v, wire) {
  let out = Object.keys(wire.rename).length ? renamed(v, wire.rename) : v;
  // kit/compose lists dropped fields by their paths after the rename
  for (const d of wire.dropped) out = dropAt(out, segments(d));
  for (const c of wire.convert) out = c.kind === "draw" ? convertDraw(out, /** @type {any} */ (c)) : convertAt(out, segments(c.field), c);
  if ((wire.fill || wire.set) && out !== null && typeof out === "object" && !Array.isArray(out)) {
    const o = /** @type {Record<string, unknown>} */ (out);
    const entries = [...Object.entries(wire.fill ?? {}), ...Object.entries(wire.set ?? {})];
    // a copy per record: the defaults are the Dialect's parsed seam values, and a consumer may freeze what it is handed
    if (entries.length) out = { ...o, ...Object.fromEntries(entries.map(([k, d]) => [k, structuredClone(d)])) };
  }
  return out;
}
