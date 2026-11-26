// The Canvas 2D renderer: a draw list, already in the shown frame (one unit a pixel), drawn on a 2D context in
// painter's order, one or a few calls per op. Images are declared without pixel data; a host that has a picture
// for one passes it in `sources` by its carried name (`<part>.<image>`), and an image without one draws its box.

import { GLYPH, nativeSize, gridCells } from "./ops.js";

/** @typedef {import("./ops.js").Op} Op */
/** @typedef {import("./ops.js").Image} Image */
/** The calls the renderer makes: a CanvasRenderingContext2D has them all. @typedef {{ fillStyle: unknown, strokeStyle: unknown, lineWidth: number, font: string, textBaseline: string, fillRect: Function, strokeRect: Function, beginPath: Function, ellipse: Function, moveTo: Function, lineTo: Function, closePath: Function, fill: Function, stroke: Function, fillText: Function, drawImage: Function, save: Function, restore: Function, translate: Function, scale: Function }} Context2D */

/** The color an image without pixel data draws its box in. */
const PLACEHOLDER = "#808080ff";

/**
 * Draws a list on a Canvas 2D context.
 * @param {Context2D} ctx @param {Op[]} list
 * @param {{ images: Record<string, Image>, sources?: Record<string, unknown> }} o
 */
export function drawCanvas(ctx, list, { images, sources = {} }) {
  for (const op of list) {
    switch (op.op) {
      case "rect":
        if (op.fill) { ctx.fillStyle = op.fill; ctx.fillRect(op.at[0], op.at[1], op.size[0], op.size[1]); }
        if (op.stroke) { ctx.strokeStyle = op.stroke; ctx.lineWidth = 1; ctx.strokeRect(op.at[0], op.at[1], op.size[0], op.size[1]); }
        break;
      case "ellipse":
        ctx.beginPath();
        ctx.ellipse(op.at[0], op.at[1], Math.abs(op.r[0]), Math.abs(op.r[1]), 0, 0, 2 * Math.PI);
        if (op.fill) { ctx.fillStyle = op.fill; ctx.fill(); }
        if (op.stroke) { ctx.strokeStyle = op.stroke; ctx.lineWidth = 1; ctx.stroke(); }
        break;
      case "line":
        ctx.beginPath();
        op.points.forEach((/** @type {number[]} */ p, /** @type {number} */ i) => (i === 0 ? ctx.moveTo(p[0], p[1]) : ctx.lineTo(p[0], p[1])));
        if (op.closed) ctx.closePath();
        if (op.closed && op.fill) { ctx.fillStyle = op.fill; ctx.fill(); }
        ctx.lineWidth = op.width;
        ctx.strokeStyle = op.stroke;
        ctx.stroke();
        break;
      case "image": {
        const img = images[op.image];
        if (!img) break;
        const native = /** @type {number[]} */ (nativeSize(op, images));
        const cell = op.cell !== undefined && img.cell ? cellAt(img, op.cell) : [0, 0];
        blit(ctx, sources[op.image], cell, native, op.at, op.size ?? native, op.flip);
        break;
      }
      case "tiles": {
        const img = images[op.image];
        if (!img?.cell) break;
        const c = op.size ?? img.cell;
        gridCells(op).forEach((row, r) => row.forEach((n, col) => {
          if (n < 0) return;
          // a ring repeats from the frame's origin: a scrolled map is a tiles op whose at is minus the scroll
          const x = wrapped(op.at[0] + col * c[0], op.wrap?.[0], c[0]), y = wrapped(op.at[1] + r * c[1], op.wrap?.[1], c[1]);
          blit(ctx, sources[op.image], cellAt(img, n), /** @type {number[]} */ (img.cell), [x, y], c, undefined);
        }));
        break;
      }
      case "text":
        ctx.font = `${GLYPH}px monospace`;
        ctx.textBaseline = "top";
        ctx.fillStyle = op.fill;
        ctx.fillText(op.str, op.at[0], op.at[1]);
        break;
      default: break;
    }
  }
}

/** A cell's top-left corner in its image, counting left to right, then top to bottom. @param {Image} img @param {number} n */
function cellAt(img, n) {
  const c = /** @type {number[]} */ (img.cell);
  const across = img.size[0] / c[0];
  return [(n % across) * c[0], Math.floor(n / across) * c[1]];
}

/** An offset in a ring of `count` cells of `size` (no ring: as it is). @param {number} v @param {number | undefined} count @param {number} size */
const wrapped = (v, count, size) => (count ? ((v % (count * size)) + count * size) % (count * size) : v);

/**
 * One picture, or one cell of it, drawn at a size; a negative size or a flip mirrors it about its own box.
 * @param {Context2D} ctx @param {unknown} source @param {number[]} from @param {number[]} native @param {number[]} at @param {number[]} size @param {string | undefined} flip
 */
function blit(ctx, source, from, native, at, size, flip) {
  const fx = (size[0] < 0) !== (flip === "x" || flip === "xy"), fy = (size[1] < 0) !== (flip === "y" || flip === "xy");
  const w = Math.abs(size[0]), h = Math.abs(size[1]);
  const x = size[0] < 0 ? at[0] + size[0] : at[0], y = size[1] < 0 ? at[1] + size[1] : at[1];
  if (!source) { ctx.strokeStyle = PLACEHOLDER; ctx.lineWidth = 1; ctx.strokeRect(x, y, w, h); return; }
  if (!fx && !fy) { ctx.drawImage(source, from[0], from[1], native[0], native[1], x, y, w, h); return; }
  ctx.save();
  ctx.translate(fx ? x + w : x, fy ? y + h : y);
  ctx.scale(fx ? -1 : 1, fy ? -1 : 1);
  ctx.drawImage(source, from[0], from[1], native[0], native[1], 0, 0, w, h);
  ctx.restore();
}
