// The trial's two renderers, as draw.md's profiles describe them: a Canvas 2D stub that draws every op (one call
// each) and counts what falls outside the stage, and a Game Boy (DMG) profile that says what it would draw or
// refuse. Both take a list already in the shown frame, one unit a pixel, with images named `<part>.<image>`.

import { opBox, GLYPH } from "./ops.js";

/** @typedef {import("./ops.js").Image} Image */
/** @typedef {import("./ops.js").Box} Box */

/** The Game Boy profile's limits. */
export const GB = Object.freeze({ width: 160, height: 144, sprites: 40, perRow: 10, tile: 8, shades: 4, layers: 2 });

const num = (/** @type {number} */ v) => String(Math.round(v * 1000) / 1000);
/** @param {Box} b */
const sizeText = (b) => `${num(b.max[0] - b.min[0])} by ${num(b.max[1] - b.min[1])}`;

/**
 * The Canvas 2D renderer: every op is one call. Counts by op, and the ops whose box lies wholly outside `box`.
 * @param {any[]} list @param {{ box: Box, images: Record<string, Image> }} o
 */
export function canvas(list, { box, images }) {
  /** @type {Record<string, number>} */
  const counts = {};
  let outside = 0;
  for (const op of list) {
    counts[op.op] = (counts[op.op] ?? 0) + 1;
    const b = opBox(op, images);
    if (b.max[0] < box.min[0] || b.min[0] > box.max[0] || b.max[1] < box.min[1] || b.min[1] > box.max[1]) outside++;
  }
  const by = Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(", ");
  return { counts, outside, text: `${list.length} op${list.length === 1 ? "" : "s"}${by ? `: ${by}` : ""}; ${outside} outside the ${sizeText(box)} stage` };
}

/** A color's Game Boy shade: 0 the lightest, 3 the darkest, by brightness. @param {string} hex */
export function shadeOf(hex) {
  const v = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const lum = 0.299 * v[0] + 0.587 * v[1] + 0.114 * v[2];
  return Math.round((1 - lum) * (GB.shades - 1));
}

/**
 * The Game Boy profile: what it would draw, or each reason it refuses the list.
 * @param {any[]} list @param {{ box: Box, images: Record<string, Image> }} o
 */
export function gameboy(list, { box, images }) {
  /** @type {string[]} */
  const refused = [];
  /** @type {Record<string, number>} */
  const free = {};
  /** @type {Record<string, number>} */
  const shades = {};
  /** @type {number[]} sprites covering each pixel row */
  const rows = [];
  let sprites = 0, layers = 0, chars = 0;
  const w = box.max[0] - box.min[0], h = box.max[1] - box.min[1];
  if (w > GB.width || h > GB.height) refused.push(`the stage is ${sizeText(box)}; the screen is ${GB.width} by ${GB.height}`);
  for (const op of list) {
    for (const k of ["fill", "stroke"]) if (typeof op[k] === "string") shades[op[k]] = shadeOf(op[k]);
    switch (op.op) {
      case "rect": case "ellipse": case "line": free[op.op] = (free[op.op] ?? 0) + 1; break;
      case "image": {
        const img = images[op.image];
        const native = op.cell !== undefined && img?.cell ? img.cell : img?.size ?? [0, 0];
        if (native[0] % GB.tile || native[1] % GB.tile) { refused.push(`image ${op.image} is ${native[0]} by ${native[1]}: sprites are made of ${GB.tile} by ${GB.tile} cells`); break; }
        if (op.size && (op.size[0] !== native[0] || op.size[1] !== native[1])) { refused.push(`image ${op.image} drawn at another size (${num(op.size[0])} by ${num(op.size[1])}, not ${native[0]} by ${native[1]}): sprites don't scale`); break; }
        const across = native[0] / GB.tile;
        sprites += across * (native[1] / GB.tile);
        for (let y = Math.max(0, Math.floor(op.at[1] - box.min[1])); y < Math.min(GB.height, Math.floor(op.at[1] - box.min[1] + native[1])); y++) rows[y] = (rows[y] ?? 0) + across;
        break;
      }
      case "tiles": {
        const c = images[op.image]?.cell;
        if (!c || c[0] !== GB.tile || c[1] !== GB.tile) { refused.push(`tiles of ${op.image}: background cells are ${GB.tile} by ${GB.tile}`); break; }
        layers++;
        if (layers > GB.layers) refused.push("a third tiles layer: the Game Boy has a background and a window");
        break;
      }
      case "text": chars += String(op.str).length; break;
      default: break;
    }
  }
  for (const [k, n] of Object.entries(free)) refused.unshift(`${k} ×${n}: the Game Boy draws no free shapes, only tiles and sprite cells`);
  if (sprites > GB.sprites) refused.push(`${sprites} sprites; the most is ${GB.sprites}`);
  const maxPerRow = Math.max(0, ...rows.filter((n) => n !== undefined));
  const worst = rows.findIndex((n) => n === maxPerRow);
  if (maxPerRow > GB.perRow) refused.push(`${maxPerRow} sprites on row ${worst}; the most is ${GB.perRow}`);
  const ok = refused.length === 0;
  const shadeText = Object.entries(shades).map(([c, s]) => `${c}→${s}`).join(" ");
  const text = ok
    ? `draws it: ${Math.min(layers, GB.layers)} tiles layer${layers === 1 ? "" : "s"}, ${sprites} sprites (at most ${maxPerRow} on a row), ${chars} characters${shadeText ? `; shades ${shadeText}` : ""}`
    : `refuses it: ${refused.join("; ")}`;
  return { ok, refused, sprites, maxPerRow, layers, chars, shades, text, glyph: GLYPH };
}

/**
 * The Game Boy's check at composition: a shown `Draw<max>` whose max passes the sprite limit is refused, because a
 * Draw seam does not say which ops it holds (draw.md: "checked at composition where the types allow").
 * @param {number} max @returns {string | null}
 */
export function gameboyAtCompose(max) {
  return max > GB.sprites ? `the shown list is Draw<${max}>, and the Game Boy draws at most ${GB.sprites} sprites; a Draw seam doesn't say which ops it holds, so the composition is refused` : null;
}
