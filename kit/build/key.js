// Keys and revisions (the build record draft, ruled 2026-11-26). Identity is the part's name in the glue; a
// revision numbers one run's builds of a part and bumps only when its content key changes; the content key is what
// a cache would reuse a result by.

import { KIT_VERSION } from "../define/version.js";
import { sha256 } from "./sha256.js";

/**
 * Plain data as text, one text per value: JSON with every object's keys sorted, so two equal values give one text
 * whatever order their keys were written in, and with the numbers JSON cannot write spelled out (`NaN`, `Infinity`,
 * `-Infinity`, `-0`) instead of all becoming null or 0. Plain JSON data gives its JSON text. Undefined, symbols and
 * functions are left out as JSON leaves them (null in an array); undefined alone gives undefined.
 * @param {unknown} v @returns {string}
 */
export function canonical(v) {
  return /** @type {string} */ (text(v));
}

/** @param {unknown} x @returns {string | undefined} */
function text(x) {
  if (x === undefined || typeof x === "function" || typeof x === "symbol") return undefined;
  if (typeof x === "number") return Number.isFinite(x) ? (Object.is(x, -0) ? "-0" : JSON.stringify(x)) : String(x);
  if (x === null || typeof x !== "object") return JSON.stringify(x);
  if (typeof (/** @type {any} */ (x)).toJSON === "function") return text(/** @type {any} */ (x).toJSON());
  if (Array.isArray(x)) return `[${x.map((i) => text(i) ?? "null").join(",")}]`;
  const o = /** @type {Record<string, unknown>} */ (x);
  const parts = [];
  for (const k of Object.keys(o).sort()) { const t = text(o[k]); if (t !== undefined) parts.push(`${JSON.stringify(k)}:${t}`); }
  return `{${parts.join(",")}}`;
}

/** A param value's type as the key keeps it: `number`, `boolean`, `string`, `null`, `array` or `object`. @param {unknown} v */
const typeText = (v) => (Array.isArray(v) ? "array" : v === null ? "null" : typeof v);

/**
 * A built record as its content key sees it: without its `reads`, and each param declaration under `params` with
 * its `value` replaced by the value's type (`valueType`). The reads say where build-time code read a param (a file
 * and line, which move when the glue's lines do), and what each read produced is already in the record; a value only
 * Kernels read reaches them through `$` each step, never compiled in (ruled 2026-11-26, leaf x3iG6D). A
 * declaration's type comes only from its value, and a Dialect may compile it in (a uniform's type), so the type
 * stays; so do the declaration's other fields.
 * @param {Record<string, any>} record @returns {Record<string, any>}
 */
export function keyed(record) {
  const { reads: _reads, ...rest } = record;
  const params = rest.params;
  if (params === null || typeof params !== "object" || Array.isArray(params)) return rest;
  /** @type {Record<string, unknown>} */
  const decls = {};
  for (const [n, d] of Object.entries(params)) {
    if (d !== null && typeof d === "object" && !Array.isArray(d)) { const { value, ...decl } = d; decls[n] = "value" in d ? { ...decl, valueType: typeText(value) } : decl; } else decls[n] = d;
  }
  return { ...rest, params: decls };
}

/**
 * A part's content key: the hash of the kit version, the package's content key (kit/package's; "" when the host
 * has none) and the built record in canonical form, as `keyed` gives it (no reads; a param's value only as its type).
 * @param {{ package: string | null | undefined, record: Record<string, any>, kitVersion?: string }} o
 * @returns {string}
 */
export function partKey({ package: pkg, record, kitVersion = KIT_VERSION }) {
  return sha256(`${kitVersion}\0${pkg ?? ""}\0${canonical(keyed(record))}`);
}

/**
 * A composition's content key: its parts' keys by identity (sorted by name), its wires as data and its shown part.
 * @param {Record<string, string>} parts  each part's content key, by name
 * @param {unknown[]} wires  the composed record's wires
 * @param {string | null} show
 * @returns {string}
 */
export function compositionKey(parts, wires, show) {
  const keys = Object.keys(parts).sort().map((n) => [n, parts[n]]);
  return sha256(canonical({ parts: keys, wires, show }));
}

/**
 * The revision a build gets: 1 for a part's first build in a run, the same number when the key is unchanged, the
 * next number when it changed.
 * @param {{ key: string, revision: number } | null} previous @param {string} key
 * @returns {number}
 */
export function nextRevision(previous, key) {
  if (!previous) return 1;
  return previous.key === key ? previous.revision : previous.revision + 1;
}

/**
 * A fast hash of plain data, for comparing a run's states instant by instant (N005); not a content key. 53 bits as
 * 14 hex digits, over the canonical text (cyrb53).
 * @param {unknown} v @returns {string}
 */
export function stateHash(v) {
  const s = canonical(v) ?? "undefined";
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, "0");
}
