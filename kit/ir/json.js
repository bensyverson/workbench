// The IR's JSON text: standard JSON, indented by structure, with any value that
// fits on one line kept there, so goldens stay short and diffs stay local.

/**
 * @param {unknown} value  Plain JSON data.
 * @param {number} [width]  The line width a one-line value must fit in.
 * @returns {string}
 */
export function formatJSON(value, width = 100) {
  return format(value, "", width) + "\n";
}

/**
 * @param {unknown} v
 * @param {string} indent
 * @param {number} width
 * @param {number} [lead]  Columns already used on the first line (a key).
 * @returns {string}
 */
function format(v, indent, width, lead = 0) {
  const flat = oneLine(v);
  if (indent.length + lead + flat.length <= width || v === null || typeof v !== "object") return flat;
  const inner = indent + "  ";
  if (Array.isArray(v)) return `[\n${v.map((x) => inner + format(x, inner, width)).join(",\n")}\n${indent}]`;
  const entries = Object.entries(/** @type {Record<string, unknown>} */ (v)).filter(([, x]) => x !== undefined);
  return `{\n${entries.map(([k, x]) => `${inner}${JSON.stringify(k)}: ${format(x, inner, width, k.length + 4)}`).join(",\n")}\n${indent}}`;
}

/**
 * @param {unknown} v
 * @returns {string}
 */
function oneLine(v) {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(oneLine).join(", ")}]`;
  const entries = Object.entries(/** @type {Record<string, unknown>} */ (v)).filter(([, x]) => x !== undefined);
  return entries.length ? `{ ${entries.map(([k, x]) => `${JSON.stringify(k)}: ${oneLine(x)}`).join(", ")} }` : "{}";
}

/**
 * Where `a` and `b` first differ (a path like `body[0].span`), or null when they are the same JSON data,
 * numbers compared with `Object.is`. A key whose value is undefined counts as absent, as in JSON.
 * @param {unknown} a
 * @param {unknown} b
 * @param {string} [path]  Where `a` and `b` sit in the values being compared.
 * @returns {string | null}
 */
export function jsonDifference(a, b, path = "") {
  if (typeof a !== "object" || a === null || typeof b !== "object" || b === null) return Object.is(a, b) ? null : path;
  if (Array.isArray(a) !== Array.isArray(b)) return path;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return path;
    for (let i = 0; i < a.length; i++) { const d = jsonDifference(a[i], b[i], `${path}[${i}]`); if (d !== null) return d; }
    return null;
  }
  const ra = /** @type {Record<string, unknown>} */ (a), rb = /** @type {Record<string, unknown>} */ (b);
  const keys = new Set([...Object.keys(ra), ...Object.keys(rb)]);
  for (const k of keys) {
    if (ra[k] === undefined && rb[k] === undefined) continue;
    const d = jsonDifference(ra[k], rb[k], path ? `${path}.${k}` : k);
    if (d !== null) return d;
  }
  return null;
}
