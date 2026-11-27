// Whether a value fits a parsed seam, and a record with its defaults filled: what a wire's consumer is handed, checked
// for a value given by hand (kit/run's `in` input, N012; kit/package's test inputs, K021). Frames are not read: a value
// is already in its seam's own frame.

import { printSeam } from "./seam.js";

/** @import { Seam } from "./seam.js" */

/** @param {unknown} x */
const isNum = (x) => typeof x === "number" && Number.isFinite(x);
/** @param {unknown} x */
const isObject = (x) => x !== null && typeof x === "object" && !Array.isArray(x);

/**
 * Why `value` does not fit `seam`, or null. Problems of one record are joined with "; ".
 * @param {Seam} seam @param {unknown} value @param {string} [path]  the field the value sits at, for the message
 * @returns {string | null}
 */
export function valueProblem(seam, value, path = "") {
  /** @type {string[]} */
  const out = [];
  check(seam, value, path, out);
  return out.length ? out.join("; ") : null;
}

/**
 * @param {Seam} seam @param {unknown} v @param {string} path @param {string[]} out
 */
function check(seam, v, path, out) {
  const at = path ? `'${path}'` : "the record";
  const bad = () => out.push(`${at} is ${JSON.stringify(v)}, not ${/^[aeiou]/.test(printSeam(seam)) ? "an" : "a"} ${printSeam(seam)}`);
  switch (seam.kind) {
    case "scalar":
      if (seam.of === "bool" ? typeof v !== "boolean" : seam.of === "str" ? typeof v !== "string" : !isNum(v)) bad();
      return;
    case "quantity": if (!isNum(v)) bad(); return;
    case "point": case "vector":
      if (seam.dims === 1 && seam.kind === "point" ? !isNum(v) : !(Array.isArray(v) && v.length === seam.dims && v.every(isNum))) bad();
      return;
    case "enum": if (typeof v !== "string" || !seam.values.includes(v)) bad(); return;
    case "list":
      if (!Array.isArray(v)) { bad(); return; }
      if (v.length > seam.max) out.push(`${at} holds ${v.length} items and the list takes at most ${seam.max}`);
      v.forEach((x, i) => check(seam.of, x, `${path}[${i}]`, out));
      return;
    case "record": {
      if (!isObject(v)) { out.push(`${at} is ${JSON.stringify(v)}, not a record (an object with ${Object.keys(seam.fields).join(", ") || "no fields"})`); return; }
      const o = /** @type {Record<string, unknown>} */ (v);
      const sub = (/** @type {string} */ k) => (path ? `${path}.${k}` : k);
      const defaults = seam.defaults ?? {};
      for (const [k, t] of Object.entries(seam.fields)) {
        if (!Object.hasOwn(o, k)) { if (!Object.hasOwn(defaults, k)) out.push(`'${sub(k)}' is missing and has no default`); continue; }
        check(t, o[k], sub(k), out);
      }
      for (const k of Object.keys(o)) if (!Object.hasOwn(seam.fields, k)) out.push(`'${sub(k)}' is not a field of the record (its fields: ${Object.keys(seam.fields).join(", ") || "none"})`);
      return;
    }
    default: return; // an Event or a Draw list is a whole port's type, not a value
  }
}

/**
 * A record with each missing field that has a default given it, in a copy as a wire fills one; a value that is not a
 * record of this seam is returned as it is (valueProblem judges it).
 * @param {Seam} seam @param {unknown} value
 */
export function fillDefaults(seam, value) {
  if (seam.kind !== "record" || !isObject(value)) return value;
  const o = /** @type {Record<string, unknown>} */ (value);
  const out = /** @type {Record<string, unknown>} */ ({ ...o });
  for (const [k, d] of Object.entries(seam.defaults ?? {})) if (!Object.hasOwn(o, k)) out[k] = structuredClone(d);
  return out;
}
