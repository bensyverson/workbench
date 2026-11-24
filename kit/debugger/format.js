// Showing a value the way its type reads: an f32 as the shortest decimal that is the same single,
// a vector as `vec2(0.5, 1)`, an enum as its quoted string.

import { showType } from "../ir/types.js";

/** @import { Type } from "../ir/ir.js" */

/**
 * The shortest decimal that rounds to the same f32 as `x`.
 * @param {number} x
 * @returns {string}
 */
function shortestF32(x) {
  if (!Number.isFinite(x)) return String(x);
  for (let p = 1; p <= 9; p++) {
    const s = x.toPrecision(p);
    if (Math.fround(Number(s)) === x) return String(Number(s));
  }
  return String(x);
}

/**
 * @param {unknown} v
 * @param {Type} t
 * @returns {string}
 */
export function formatValue(v, t) {
  if (v === undefined) return "";
  if (typeof t === "object" && "vec" in t && Array.isArray(v)) {
    const part = (/** @type {unknown} */ c) => formatValue(c, t.of);
    return `${t.name ?? showType(t)}(${v.map(part).join(", ")})`;
  }
  if (t === "f32" && typeof v === "number") return shortestF32(v);
  if (typeof v === "number") return String(v);
  if (typeof v === "string") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map((c) => formatValue(c, "unknown")).join(", ")}]`;
  return String(v);
}
