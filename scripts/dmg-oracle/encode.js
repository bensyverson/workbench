// The one encoding for every value a trace compares. It is JSON-safe, deep-copies
// (so later mutation can't change what was recorded), and keeps apart what JSON
// merges: NaN and null, undefined and absent, -0 and 0, Infinity and null. Such
// values become `{ "$": tag }` objects; a user object that has its own `$` key is
// wrapped as `{ "$": "object", v }`, so a tag is never ambiguous.

/** @import { DmgRuntime } from "./dmg.js" */

/**
 * Returns an encoder bound to `rt`, which it needs to recognize entity and world proxies:
 * touching a proxy's members throws, so they are named by kind and index instead.
 * @param {DmgRuntime} rt
 * @returns {(v: unknown) => any}
 */
export function encoderFor(rt) {
  /** @type {Set<object>} */
  const path = new Set();
  /**
   * @param {unknown} v
   * @returns {any}
   */
  const enc = (v) => {
    switch (typeof v) {
      case "undefined": return { $: "undefined" };
      case "number":
        if (Number.isNaN(v)) return { $: "NaN" };
        if (Object.is(v, -0)) return { $: "-0" };
        if (v === Infinity) return { $: "Infinity" };
        if (v === -Infinity) return { $: "-Infinity" };
        return v;
      case "string": case "boolean": return v;
      case "bigint": return { $: "bigint", v: String(v) };
      case "symbol": return { $: "symbol" };
      case "function": return { $: "function" };
    }
    if (v === null) return null;
    const o = /** @type {object} */ (v);
    if (rt._tmap.has(o)) return { $: "entity", kind: /** @type {{ kind: string }} */ (o).kind, index: rt.ents.indexOf(/** @type {never} */ (o)) };
    if (o === rt.w) return { $: "world" };
    if (path.has(o)) return { $: "cycle" };
    path.add(o);
    try {
      if (Array.isArray(o)) return Array.from(o, enc);
      /** @type {Record<string, unknown>} */
      const out = {};
      for (const k of Object.keys(o)) out[k] = enc(/** @type {Record<string, unknown>} */ (o)[k]);
      return "$" in out ? { $: "object", v: out } : out;
    } finally { path.delete(o); }
  };
  return enc;
}
