// Values crossing a wire, as kit/compose planned them: the producer's record fields renamed (data only), the fields
// the consumer does not take dropped, then each tagged leaf converted along its frame path. A conversion's `field`
// names the consumer's field, after the rename, so the rename comes first. A point converts by scale and offset per
// axis, a vector (or a rate of one) by scale, a quantity by its one magnitude.

/** @import { Conversion } from "../compose/compose.js" */

/**
 * One leaf converted. @param {unknown} v @param {Conversion} c @returns {unknown}
 */
function convertLeaf(v, c) {
  if (c.kind === "quantity") return typeof v === "number" ? v * c.scale[0] : v;
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

/**
 * One value or record carried across a wire: renamed, dropped, converted. A value that is no record skips the
 * first two.
 * @param {unknown} v @param {{ rename: Record<string, string>, dropped: string[], convert: Conversion[] }} wire
 * @returns {unknown}
 */
export function carry(v, wire) {
  let out = v;
  if (out !== null && typeof out === "object" && !Array.isArray(out) && (Object.keys(wire.rename).length || wire.dropped.length)) {
    /** @type {Record<string, unknown>} */
    const r = {};
    for (const [k, x] of Object.entries(/** @type {Record<string, unknown>} */ (out))) {
      const name = Object.hasOwn(wire.rename, k) ? wire.rename[k] : k;
      // kit/compose lists dropped fields by their names after the rename
      if (!wire.dropped.includes(name)) r[name] = x;
    }
    out = r;
  }
  for (const c of wire.convert) out = convertAt(out, segments(c.field), c);
  return out;
}
