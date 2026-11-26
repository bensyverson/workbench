// The draw list's closed op table (the draw-list draft, as ruled 2026-11-26): typing one op against a Dialect's
// paint (its named colors and declared images), the paint declaration itself, a color resolved to "#rrggbbaa",
// an op converted across a frame edge, and the box an op covers. Pure data and functions: no Node built-ins.

/** A declared image: its size in pixels, and the cells it is cut into. @typedef {{ size: number[], cell?: number[], note?: string }} Image */
/** A Dialect's paint. @typedef {{ colors: Record<string, string>, images: Record<string, Image> }} Paint */
/** @typedef {{ scale: number[], offset: number[] }} Edge */
/** @typedef {{ min: number[], max: number[] }} Box */
/** One draw op, as a builder writes it or a wire carries it. @typedef {Record<string, any> & { op: string }} Op */

/** Each op's fields: name → [type, required]. */
export const OPS = Object.freeze({
  rect: { at: ["point2", true], size: ["vec2", true], fill: ["color", false], stroke: ["color", false] },
  ellipse: { at: ["point2", true], r: ["vec2", true], fill: ["color", false], stroke: ["color", false] },
  line: { points: ["points", true], width: ["f64", true], stroke: ["color", true], closed: ["bool", false], fill: ["color", false] },
  image: { at: ["point2", true], image: ["image", true], cell: ["cell", false], size: ["vec2", false], flip: ["flip", false] },
  tiles: { at: ["point2", true], image: ["image", true], grid: ["grid", true], key: ["key", false], size: ["vec2", false], wrap: ["vec2", false] },
  text: { at: ["point2", true], str: ["str", true], font: ["font", true], fill: ["color", true] },
});
/** The op kinds, in the table's order. */
export const OP_KINDS = Object.freeze(Object.keys(OPS));
/** The fonts every renderer has; each character is GLYPH by GLYPH units of the frame it is drawn in. */
export const FONTS = Object.freeze(["mono"]);
export const GLYPH = 8;
const FLIPS = ["x", "y", "xy"];
const HEX = /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const IMAGE_KEYS = ["size", "cell", "note"];

const isNum = (/** @type {unknown} */ v) => typeof v === "number" && Number.isFinite(v);
const isVec = (/** @type {unknown} */ v) => Array.isArray(v) && v.length === 2 && v.every(isNum);
const whole = (/** @type {unknown} */ v) => isNum(v) && Number.isInteger(v);
const isObj = (/** @type {unknown} */ v) => v !== null && typeof v === "object" && !Array.isArray(v);
/** @param {unknown} v */
const short = (v) => { const s = JSON.stringify(v) ?? String(v); return s.length > 80 ? `${s.slice(0, 77)}...` : s; };

/** How many cells an image has (0 when it is not cut into cells). @param {Image} img */
export const cellCount = (img) => (img.cell ? Math.floor(img.size[0] / img.cell[0]) * Math.floor(img.size[1] / img.cell[1]) : 0);

/**
 * The problems with one op, each a sentence; none when it fits the table. `images` names the images the op may
 * draw: the Dialect's own, by their bare names.
 * @param {unknown} op @param {Paint} paint @returns {string[]}
 */
export function typeOp(op, paint) {
  if (!isObj(op)) return [`${short(op)} is not a record: an op is { op: "<op>", <fields> }`];
  const o = /** @type {Record<string, unknown>} */ (op);
  if (!Object.hasOwn(o, "op")) return [`${short(o)} has no op field: say which op it is, one of ${OP_KINDS.join(", ")}`];
  if (typeof o.op !== "string" || !Object.hasOwn(OPS, o.op)) return [`${typeof o.op === "string" ? `'${o.op}'` : short(o.op)} is not an op: the ops are ${OP_KINDS.join(", ")}`];
  const fields = /** @type {Record<string, [string, boolean]>} */ (/** @type {any} */ (OPS)[o.op]);
  /** @type {string[]} */
  const out = [];
  const name = `${/^[aeiou]/.test(o.op) ? "an" : "a"} ${o.op}`;
  for (const k of Object.keys(o)) if (k !== "op" && !Object.hasOwn(fields, k)) out.push(`${name} has no field '${k}' (its fields: ${Object.keys(fields).join(", ")})`);
  for (const [k, [type, required]] of Object.entries(fields)) {
    if (o[k] === undefined || o[k] === null) { if (required) out.push(`${name} needs ${k} (${type})`); continue; }
    const p = fieldProblem(k, type, o[k], o, paint);
    if (p) out.push(`${name}: ${p}`);
  }
  return out;
}

/** @param {string} k @param {string} type @param {unknown} v @param {Record<string, unknown>} o @param {Paint} paint @returns {string | null} */
function fieldProblem(k, type, v, o, paint) {
  switch (type) {
    case "point2": return isVec(v) ? null : `${k} must be a point2, [<x>, <y>], got ${short(v)}`;
    case "vec2": return isVec(v) ? null : `${k} must be a vec2, [<x>, <y>], got ${short(v)}`;
    case "f64": return isNum(v) ? null : `${k} must be a number, got ${short(v)}`;
    case "bool": return typeof v === "boolean" ? null : `${k} must be true or false, got ${short(v)}`;
    case "str": return typeof v === "string" ? null : `${k} must be a string, got ${short(v)} (format a number into one: "SCORE " + <n>)`;
    case "color": return typeof v === "string" && resolveColor(v, paint.colors) ? null : `${short(v)} is not a color: name one your Dialect's colors declares (${Object.keys(paint.colors).join(", ") || "it declares none"}), or write "#rrggbb" or "#rrggbbaa"`;
    case "font": return typeof v === "string" && FONTS.includes(v) ? null : `font ${short(v)}: the only font is ${FONTS.map((f) => `"${f}"`).join(", ")}`;
    case "flip": return typeof v === "string" && FLIPS.includes(v) ? null : `flip must be 'x', 'y' or 'xy', got ${short(v)}`;
    case "points": return Array.isArray(v) && v.length >= 2 && v.every(isVec) ? null : `points must be a list of two or more point2s, got ${short(v)}`;
    case "image": return typeof v === "string" && Object.hasOwn(paint.images, v) ? null : `${short(v)} is not a declared image (images: ${Object.keys(paint.images).join(", ") || "none"})`;
    case "key": return isObj(v) && Object.entries(/** @type {object} */ (v)).every(([c, n]) => [...c].length === 1 && whole(n)) ? null : `key maps single characters to cell numbers, { "<char>": <cell> }, got ${short(v)}`;
    case "cell": {
      if (!whole(v) || /** @type {number} */ (v) < 0) return `cell must be a whole number from 0, got ${short(v)}`;
      const img = paint.images[String(o.image)];
      if (!img) return null;
      const n = cellCount(img);
      if (!n) return `cell ${v}: image '${o.image}' has no cells (declare cell: [<cw>, <ch>])`;
      return /** @type {number} */ (v) < n ? null : `cell ${v} is past the end: image '${o.image}' has ${n} cells`;
    }
    case "grid": return gridProblem(v, o, paint);
    default: return null;
  }
}

/** A tiles grid: rows of cell numbers (-1 for none), or strings read through `key`. @param {unknown} v @param {Record<string, unknown>} o @param {Paint} paint */
function gridProblem(v, o, paint) {
  if (!Array.isArray(v) || !v.every((r) => Array.isArray(r) || typeof r === "string")) return `grid must be a list of rows, each a list of cell numbers or a string, got ${short(v)}`;
  const img = paint.images[String(o.image)];
  if (img && !cellCount(img)) return `image '${o.image}' has no cells, so it cannot be tiled (declare cell: [<cw>, <ch>])`;
  const n = img ? cellCount(img) : Infinity;
  const key = isObj(o.key) ? /** @type {Record<string, unknown>} */ (o.key) : null;
  if (v.some((r) => typeof r === "string") && !key) return "string rows need a key: key: { \"<char>\": <cell> }, -1 for none";
  for (const row of v) {
    if (typeof row === "string") {
      const c = [...row].find((ch) => !Object.hasOwn(/** @type {object} */ (key), ch));
      if (c !== undefined) return `grid's row '${row}' holds the character '${c}', which the key does not map (map it to a cell, or to -1 for none)`;
      continue;
    }
    const bad = row.find((c) => !whole(c) || c < -1 || c >= n);
    if (bad !== undefined) return `grid holds ${short(bad)}: each is a cell number from 0${img ? ` to ${n - 1}` : ""}, or -1 for none`;
  }
  if (key) {
    const bad = Object.entries(key).find(([, c]) => /** @type {number} */ (c) < -1 || /** @type {number} */ (c) >= n);
    if (bad) return `key maps '${bad[0]}' to ${bad[1]}: each is a cell number from 0${img ? ` to ${n - 1}` : ""}, or -1 for none`;
  }
  return null;
}

/**
 * The problems with a Dialect's `colors` and `images`, each a sentence.
 * @param {{ colors?: unknown, images?: unknown }} paint @returns {string[]}
 */
export function checkPaint(paint) {
  /** @type {string[]} */
  const out = [];
  const colors = paint.colors ?? {}, images = paint.images ?? {};
  if (!isObj(colors)) out.push("colors must be an object of names to \"#rrggbb\" or \"#rrggbbaa\"");
  else for (const [k, v] of Object.entries(/** @type {object} */ (colors))) if (typeof v !== "string" || !HEX.test(v)) out.push(`colors.${k}: ${short(v)} is not "#rrggbb" or "#rrggbbaa"`);
  if (!isObj(images)) { out.push("images must be an object of names to { size, cell?, note }"); return out; }
  const pos = (/** @type {unknown} */ a) => isVec(a) && /** @type {number[]} */ (a).every((x) => whole(x) && x > 0);
  for (const [k, v] of Object.entries(/** @type {Record<string, any>} */ (images))) {
    if (!isObj(v)) { out.push(`images.${k} must be { size: [<w>, <h>], cell?: [<cw>, <ch>], note }`); continue; }
    for (const key of Object.keys(v)) if (!IMAGE_KEYS.includes(key)) out.push(`images.${k} has no key '${key}' (its keys: ${IMAGE_KEYS.join(", ")})`);
    if (!pos(v.size)) out.push(`images.${k}.size must be [<w>, <h>], whole numbers of pixels, got ${short(v.size)}`);
    else if (v.cell !== undefined && (!pos(v.cell) || v.size[0] % v.cell[0] !== 0 || v.size[1] % v.cell[1] !== 0)) out.push(`images.${k}.cell must be [<cw>, <ch>] that divides its size ${short(v.size)}, got ${short(v.cell)}`);
  }
  return out;
}

/**
 * A color as "#rrggbbaa", from a name in `colors` or a literal; null when it is neither.
 * @param {string} c @param {Record<string, string>} colors @returns {string | null}
 */
export function resolveColor(c, colors) {
  const v = Object.hasOwn(colors, c) ? colors[c] : c;
  if (typeof v !== "string" || !HEX.test(v)) return null;
  const h = v.toLowerCase();
  return h.length === 7 ? `${h}ff` : h;
}

/** @param {number[]} p @param {Edge} e */
const movePoint = (p, e) => p.map((v, i) => v * e.scale[i] + e.offset[i]);
/** @param {number[]} v @param {Edge} e */
const scaleVec = (v, e) => v.map((x, i) => x * e.scale[i]);
/** @param {Edge} e */
const unit = (e) => e.scale.every((s) => s === 1);

/**
 * The size an image op draws at without a `size`: its cell's, or the whole picture's.
 * @param {Op} op @param {Record<string, Image>} images @returns {number[] | null}
 */
export function nativeSize(op, images) {
  const img = images[op.image];
  if (!img) return null;
  return op.op === "tiles" || (op.cell !== undefined && img.cell) ? img.cell ?? null : img.size;
}

/**
 * An op converted across a frame edge (ruling 3, 2026-11-26): positions by scale and offset; a rect's size, an
 * image's and a tiles op's cell size by the scale, sign kept (a negative size mirrors); radii by the scale's
 * magnitude; a line's width by the mean magnitude; text by `at` only. An image or tiles op without `size` takes its
 * image's (named in `images`, as the wire carries it) scaled, unless the scale is one on both axes.
 * @param {Op} op @param {Edge} e @param {Record<string, Image>} images @returns {Op}
 */
export function convertOp(op, e, images) {
  const o = { ...op };
  if (isVec(o.at)) o.at = movePoint(o.at, e);
  switch (o.op) {
    case "rect": if (isVec(o.size)) o.size = scaleVec(o.size, e); break;
    case "ellipse": if (isVec(o.r)) o.r = o.r.map((/** @type {number} */ x, /** @type {number} */ i) => x * Math.abs(e.scale[i])); break;
    case "line":
      if (Array.isArray(o.points)) o.points = o.points.map((/** @type {number[]} */ p) => movePoint(p, e));
      if (isNum(o.width)) o.width = o.width * (Math.abs(e.scale[0]) + Math.abs(e.scale[1])) / 2;
      break;
    case "image": case "tiles": {
      if (isVec(o.size)) { o.size = scaleVec(o.size, e); break; }
      const n = nativeSize(o, images);
      if (n && !unit(e)) o.size = scaleVec(n, e);
      break;
    }
    default: break;
  }
  return o;
}

/** A tiles grid's rows as lengths. @param {Op} op */
const rowLengths = (op) => op.grid.map((/** @type {string | unknown[]} */ r) => (typeof r === "string" ? [...r].length : r.length));

/**
 * The box an op covers in its frame: a negative size spans backwards from `at`; an image without `size` at its
 * declared size (or its cell's), tiles at their cell size per grid cell, text at GLYPH units a character.
 * @param {Op} op @param {Record<string, Image>} images @returns {Box}
 */
export function opBox(op, images) {
  const box = (/** @type {number[]} */ a, /** @type {number[]} */ b) => ({ min: [Math.min(a[0], b[0]), Math.min(a[1], b[1])], max: [Math.max(a[0], b[0]), Math.max(a[1], b[1])] });
  const at = op.at ?? [0, 0];
  switch (op.op) {
    case "rect": return box(at, [at[0] + op.size[0], at[1] + op.size[1]]);
    case "ellipse": return box([at[0] - op.r[0], at[1] - op.r[1]], [at[0] + op.r[0], at[1] + op.r[1]]);
    case "line": {
      const xs = op.points.map((/** @type {number[]} */ p) => p[0]), ys = op.points.map((/** @type {number[]} */ p) => p[1]);
      return { min: [Math.min(...xs), Math.min(...ys)], max: [Math.max(...xs), Math.max(...ys)] };
    }
    case "image": {
      const s = op.size ?? nativeSize(op, images) ?? [0, 0];
      return box(at, [at[0] + s[0], at[1] + s[1]]);
    }
    case "tiles": {
      const c = op.size ?? nativeSize(op, images) ?? [0, 0];
      const cols = Math.max(0, ...rowLengths(op));
      return box(at, [at[0] + cols * c[0], at[1] + op.grid.length * c[1]]);
    }
    case "text": return box(at, [at[0] + [...String(op.str)].length * GLYPH, at[1] + GLYPH]);
    default: return box(at, at);
  }
}

/**
 * A tiles grid's cell numbers, row by row: string rows read through the op's key.
 * @param {Op} op @returns {number[][]}
 */
export const gridCells = (op) => op.grid.map((/** @type {string | number[]} */ r) => (typeof r === "string" ? [...r].map((ch) => op.key[ch]) : r));
