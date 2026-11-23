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
