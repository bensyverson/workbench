// Seam types as the checker models them: just enough to check kinds, frame tags, shapes and enum values.

/**
 * @typedef {object} SeamType
 * @property {string} text  as the references write it, e.g. "vec2i@cell", "Grid<'rock' | 'open'>@cell"
 * @property {"scalar" | "vector" | "enum" | "array" | "grid" | "image" | "event"} kind
 * @property {string} [tag]  the frame tag, without "@"
 * @property {boolean} [numeric]  f32, int, or a vector
 * @property {string[]} [values]  an enum's or a grid's values
 * @property {[number, number]} [shape]  a grid's cols × rows, when known at build
 * @property {Map<string, number>} [kinds]  a spawn array's kinds and how many of each
 */

const SCALARS = new Set(["f32", "int", "bool"]);
const VECTORS = new Set(["vec2", "vec3", "vec2i"]);

/**
 * A type written in a tiles `.state`, `.event` or `.export`: f32, int, bool, vec2, vec3, vec2i, optionally
 * with a frame tag (`vec2@px`), or an enum `'idle|chase'`.
 * @param {unknown} text
 * @returns {SeamType | null}  null when it is not one
 */
export function parseDeclaredType(text) {
  if (typeof text !== "string") return null;
  const t = text.trim();
  if (SCALARS.has(t)) return { text: t, kind: "scalar", numeric: t !== "bool" };
  const m = /^(vec2|vec3|vec2i)(?:@(px|cell))?$/.exec(t);
  if (m && VECTORS.has(m[1])) return { text: t, kind: "vector", numeric: true, ...(m[2] ? { tag: m[2] } : {}) };
  if (/^[A-Za-z_]\w*(\s*\|\s*[A-Za-z_]\w*)+$/.test(t)) return { text: t, kind: "enum", values: t.split("|").map((s) => s.trim()) };
  return null;
}

export const DECLARED_TYPES = "'f32', 'int', 'bool', 'vec2', 'vec3', 'vec2i', 'vec2@px', 'vec2i@cell', or an enum such as 'idle|chase'";

/** Kinds a GPU kernel may read as a uniform. */
export const GPU_KINDS = new Set(["scalar", "vector", "enum"]);

/** @param {SeamType} t */
export const isSignalReadable = (t) => GPU_KINDS.has(t.kind);
