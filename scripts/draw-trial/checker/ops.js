// The draw list as scripts/draw-trial/docs/draw.md defines it, emulated: the `Draw<max>@frame` seam, the closed op
// table (typing one op), named colors and declared images, an op converted across a frame edge, the box an op
// covers, and an op as it crosses a wire (colors resolved, images qualified by the producing part).

/** @typedef {{ size: number[], cell?: number[], note?: string }} Image */
/** @typedef {{ colors: Record<string, string>, images: Record<string, Image> }} Paint */
/** @typedef {{ scale: number[], offset: number[] }} Edge */
/** @typedef {{ min: number[], max: number[] }} Box */

/** Each op's fields: name → [type, required]. */
export const OPS = Object.freeze({
  rect: { at: ["point2", true], size: ["vec2", true], fill: ["color", false], stroke: ["color", false] },
  ellipse: { at: ["point2", true], r: ["vec2", true], fill: ["color", false], stroke: ["color", false] },
  line: { points: ["points", true], width: ["f64", true], stroke: ["color", true], closed: ["bool", false], fill: ["color", false] },
  image: { at: ["point2", true], image: ["image", true], cell: ["cell", false], size: ["vec2", false], flip: ["flip", false] },
  tiles: { at: ["point2", true], image: ["image", true], grid: ["grid", true], wrap: ["vec2", false] },
  text: { at: ["point2", true], str: ["str", true], font: ["font", true], fill: ["color", true] },
});
/** The one font every renderer of the trial has; each character is GLYPH by GLYPH units. */
export const FONTS = Object.freeze(["mono"]);
export const GLYPH = 8;
const FLIPS = ["x", "y", "xy"];
const HEX = /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

/**
 * A `Draw<max>@frame` seam's max and frame; null when the text is not a Draw seam at all; `{ error }` when it starts
 * like one but is misspelled.
 * @param {string} text @returns {{ max: number, frame: string } | { error: string } | null}
 */
export function parseDrawSeam(text) {
  const t = String(text).trim();
  if (!/^Draw\b/.test(t)) return null;
  const m = /^Draw\s*<\s*(\d+)\s*>\s*@\s*([A-Za-z_$][\w$]*)$/.exec(t);
  const error = `'${t}' is not a draw list seam: write Draw<<max>>@<frame>, <max> a whole number of at least 1 and <frame> one of your 2-D frames`;
  if (!m || Number(m[1]) < 1) return { error };
  return { max: Number(m[1]), frame: m[2] };
}

const isNum = (/** @type {unknown} */ v) => typeof v === "number" && Number.isFinite(v);
const isVec = (/** @type {unknown} */ v) => Array.isArray(v) && v.length === 2 && v.every(isNum);
const whole = (/** @type {unknown} */ v) => isNum(v) && Number.isInteger(v);

/** How many cells an image has (0 when it is not cut into cells). @param {Image} img */
export const cellCount = (img) => (img.cell ? Math.floor(img.size[0] / img.cell[0]) * Math.floor(img.size[1] / img.cell[1]) : 0);

/**
 * The problems with one op, each a sentence; none when it fits the table.
 * @param {unknown} op @param {Paint} paint @returns {string[]}
 */
export function typeOp(op, paint) {
  if (op === null || typeof op !== "object" || Array.isArray(op)) return [`${JSON.stringify(op)} is not a record: an op is { op: "<op>", <fields> }`];
  const o = /** @type {Record<string, unknown>} */ (op);
  if (!("op" in o)) return [`${short(o)} has no op field: say which op it is, one of ${Object.keys(OPS).join(", ")}`];
  const fields = /** @type {Record<string, [string, boolean]> | undefined} */ (/** @type {any} */ (OPS)[String(o.op)]);
  if (!fields) return [`'${o.op}' is not an op: the ops are ${Object.keys(OPS).join(", ")}`];
  /** @type {string[]} */
  const out = [];
  const name = `a ${o.op}`;
  for (const k of Object.keys(o)) if (k !== "op" && !(k in fields)) out.push(`${name} has no field '${k}' (its fields: ${Object.keys(fields).join(", ")})`);
  for (const [k, [type, required]] of Object.entries(fields)) {
    if (o[k] === undefined || o[k] === null) { if (required) out.push(`${name} needs ${k} (${type})`); continue; }
    const p = fieldProblem(k, type, o[k], o, paint);
    if (p) out.push(`${name}: ${p}`);
  }
  return out;
}

/** @param {string} k @param {string} type @param {unknown} v @param {Record<string, unknown>} o @param {Paint} paint */
function fieldProblem(k, type, v, o, paint) {
  switch (type) {
    case "point2": return isVec(v) ? null : `${k} must be a point2, [<x>, <y>], got ${JSON.stringify(v)}`;
    case "vec2": return isVec(v) ? null : `${k} must be a vec2, [<x>, <y>], got ${JSON.stringify(v)}`;
    case "f64": return isNum(v) ? null : `${k} must be a number, got ${JSON.stringify(v)}`;
    case "bool": return typeof v === "boolean" ? null : `${k} must be true or false, got ${JSON.stringify(v)}`;
    case "str": return typeof v === "string" ? null : `${k} must be a string, got ${JSON.stringify(v)}`;
    case "color": return typeof v === "string" && resolveColor(v, paint.colors) ? null : `${JSON.stringify(v)} is not a color: name one your Dialect's colors declares (${Object.keys(paint.colors).join(", ") || "it declares none"}), or write "#rrggbb" or "#rrggbbaa"`;
    case "font": return typeof v === "string" && FONTS.includes(v) ? null : `font ${typeof v === "string" ? `'${v}'` : JSON.stringify(v)}: the only font is ${FONTS.map((f) => `"${f}"`).join(", ")}`;
    case "flip": return typeof v === "string" && FLIPS.includes(v) ? null : `flip must be 'x', 'y' or 'xy', got ${JSON.stringify(v)}`;
    case "points": return Array.isArray(v) && v.length >= 2 && v.every(isVec) ? null : `points must be a list of two or more point2s, got ${JSON.stringify(v)}`;
    case "image": return typeof v === "string" && Object.hasOwn(paint.images, v) ? null : `${JSON.stringify(v)} is not a declared image (images: ${Object.keys(paint.images).join(", ") || "none"})`;
    case "cell": {
      if (!whole(v) || /** @type {number} */ (v) < 0) return `cell must be a whole number from 0, got ${JSON.stringify(v)}`;
      const img = paint.images[String(o.image)];
      if (!img) return null;
      const n = cellCount(img);
      if (!n) return `cell ${v}: image '${o.image}' has no cells (declare cell: [<cw>, <ch>])`;
      return /** @type {number} */ (v) < n ? null : `cell ${v} is past the end: image '${o.image}' has ${n} cells`;
    }
    case "grid": {
      if (!Array.isArray(v) || !v.every((r) => Array.isArray(r))) return `grid must be a list of rows, each a list of cell numbers, got ${short(v)}`;
      const img = paint.images[String(o.image)];
      if (img && !cellCount(img)) return `image '${o.image}' has no cells, so it cannot be tiled (declare cell: [<cw>, <ch>])`;
      const n = img ? cellCount(img) : Infinity;
      const bad = v.flat().find((c) => !whole(c) || c < -1 || c >= n);
      return bad === undefined ? null : `grid holds ${JSON.stringify(bad)}: each is a cell number from 0${img ? ` to ${n - 1}` : ""}, or -1 for none`;
    }
    default: return null;
  }
}

/** @param {unknown} v */
const short = (v) => { const s = JSON.stringify(v) ?? String(v); return s.length > 80 ? `${s.slice(0, 77)}...` : s; };

/**
 * The problems with a Dialect's `colors` and `images`.
 * @param {{ colors?: unknown, images?: unknown }} paint @returns {string[]}
 */
export function checkPaint(paint) {
  /** @type {string[]} */
  const out = [];
  const colors = paint.colors ?? {}, images = paint.images ?? {};
  if (typeof colors !== "object" || Array.isArray(colors)) out.push("colors must be an object of names to \"#rrggbb\" or \"#rrggbbaa\"");
  else for (const [k, v] of Object.entries(colors)) if (typeof v !== "string" || !HEX.test(v)) out.push(`colors.${k}: ${JSON.stringify(v)} is not "#rrggbb" or "#rrggbbaa"`);
  if (typeof images !== "object" || Array.isArray(images)) { out.push("images must be an object of names to { size, cell?, note }"); return out; }
  for (const [k, v] of Object.entries(/** @type {Record<string, any>} */ (images))) {
    if (!v || typeof v !== "object") { out.push(`images.${k} must be { size: [<w>, <h>], cell?: [<cw>, <ch>], note }`); continue; }
    for (const key of Object.keys(v)) if (!["size", "cell", "note"].includes(key)) out.push(`images.${k} has no key '${key}' (its keys: size, cell, note)`);
    const pos = (/** @type {unknown} */ a) => isVec(a) && /** @type {number[]} */ (a).every((x) => whole(x) && x > 0);
    if (!pos(v.size)) out.push(`images.${k}.size must be [<w>, <h>], whole numbers of pixels, got ${JSON.stringify(v.size)}`);
    else if (v.cell !== undefined && (!pos(v.cell) || v.size[0] % v.cell[0] !== 0 || v.size[1] % v.cell[1] !== 0)) out.push(`images.${k}.cell must be [<cw>, <ch>] that divides its size ${JSON.stringify(v.size)}, got ${JSON.stringify(v.cell)}`);
  }
  return out;
}

/**
 * A color as "#rrggbbaa", from a name in `colors` or a literal; null when it is neither.
 * @param {string} c @param {Record<string, string>} colors
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
/** @param {number[]} v @param {Edge} e */
const scaleAbs = (v, e) => v.map((x, i) => x * Math.abs(e.scale[i]));

/**
 * An op converted across a frame edge, as draw.md's table says: positions by scale and offset; size, r and width
 * by the scale; tiles and text by `at` only. A width under a scale that differs per axis takes the mean.
 * @param {any} op @param {Edge} e
 */
export function convertOp(op, e) {
  const o = { ...op };
  if (isVec(o.at)) o.at = movePoint(o.at, e);
  switch (o.op) {
    case "rect": if (isVec(o.size)) o.size = scaleVec(o.size, e); break;
    case "ellipse": if (isVec(o.r)) o.r = scaleAbs(o.r, e); break;
    case "line":
      if (Array.isArray(o.points)) o.points = o.points.map((/** @type {number[]} */ p) => movePoint(p, e));
      if (isNum(o.width)) o.width = o.width * (Math.abs(e.scale[0]) + Math.abs(e.scale[1])) / 2;
      break;
    case "image": if (isVec(o.size)) o.size = scaleVec(o.size, e); break;
    default: break;
  }
  return o;
}

/**
 * The box an op covers in its frame: an image without `size` at its declared size (or its cell's), tiles at their
 * cell size per grid cell, text at GLYPH units a character.
 * @param {any} op @param {Record<string, Image>} images @returns {Box}
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
      const img = images[op.image];
      const s = op.size ?? (op.cell !== undefined && img?.cell ? img.cell : img?.size) ?? [0, 0];
      return box(at, [at[0] + s[0], at[1] + s[1]]);
    }
    case "tiles": {
      const c = images[op.image]?.cell ?? [0, 0];
      const cols = Math.max(0, ...op.grid.map((/** @type {unknown[]} */ r) => r.length));
      return box(at, [at[0] + cols * c[0], at[1] + op.grid.length * c[1]]);
    }
    case "text": return box(at, [at[0] + String(op.str).length * GLYPH, at[1] + GLYPH]);
    default: return box(at, at);
  }
}

/**
 * An op as it leaves its part on a wire: each color resolved to "#rrggbbaa", the image named `<part>.<image>`.
 * @param {any} op @param {Paint} paint @param {string} part
 */
export function carryOp(op, paint, part) {
  const o = { ...op };
  for (const k of ["fill", "stroke"]) if (typeof o[k] === "string") o[k] = resolveColor(o[k], paint.colors) ?? o[k];
  if (typeof o.image === "string") o.image = `${part}.${o.image}`;
  return o;
}
