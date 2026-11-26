// Renderer profiles (the draw-list draft, as ruled 2026-11-26, ruling 2): what a renderer draws and its limits.
// At composition a profile judges op kinds only (kit/compose's S401); at draw time `checkDraw` counts exactly,
// on the list in the shown frame, one unit a pixel. An op over a limit is a diagnostic naming the profile and the
// limit; nothing is dropped silently.

import { OP_KINDS, nativeSize } from "./ops.js";

/** @typedef {import("./ops.js").Op} Op */
/** @typedef {import("./ops.js").Image} Image */
/** @typedef {import("./ops.js").Box} Box */
/** @typedef {{ width: number, height: number, sprites: number, perRow: number, tile: number, shades: number, layers: number }} GameBoyLimits */
/** @typedef {{ name: string, label: string, kinds: readonly string[], limits?: GameBoyLimits }} Profile */
/** @typedef {{ code: string, message: string }} DrawDiagnostic */

/** Canvas 2D: every op, about one call each, and no limit that matters. @type {Profile} */
export const CANVAS = Object.freeze({ name: "canvas", label: "Canvas 2D", kinds: OP_KINDS });
/** The Game Boy (DMG): tiles as its background and window, image cells as sprites, text through its font. @type {Profile} */
export const GAMEBOY = Object.freeze({
  name: "gameboy", label: "Game Boy (DMG)", kinds: Object.freeze(["image", "tiles", "text"]),
  limits: Object.freeze({ width: 160, height: 144, sprites: 40, perRow: 10, tile: 8, shades: 4, layers: 2 }),
});
/** The profiles by name. */
export const PROFILES = Object.freeze({ canvas: CANVAS, gameboy: GAMEBOY });

/** The kinds of `kinds` a profile does not draw, in order. @param {Profile} profile @param {readonly string[]} kinds */
export const kindProblems = (profile, kinds) => kinds.filter((k) => !profile.kinds.includes(k));

const num = (/** @type {number} */ v) => String(Math.round(v * 1000) / 1000);
const by = (/** @type {number[]} */ v) => `${num(v[0])} by ${num(v[1])}`;

/**
 * A color's Game Boy shade, 0 the lightest of 4 and 3 the darkest, by brightness; null for a color whose alpha is
 * 0, which draws nothing. Any other alpha draws the shade: the Game Boy has no blending.
 * @param {string} hex  "#rrggbbaa" @returns {number | null}
 */
export function shadeOf(hex) {
  if (hex.length === 9 && hex.slice(7) === "00") return null;
  const v = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const lum = 0.299 * v[0] + 0.587 * v[1] + 0.114 * v[2];
  return Math.round((1 - lum) * 3);
}

/**
 * Whether a profile draws a list as it stands, at draw time: its diagnostics, and a line saying what it draws.
 * @param {Profile} profile @param {Op[]} list @param {{ images: Record<string, Image>, box: Box }} o
 * @returns {{ ok: boolean, diagnostics: DrawDiagnostic[], summary: string }}
 */
export function checkDraw(profile, list, { images, box }) {
  if (!profile.limits) return { ok: true, diagnostics: [], summary: `${profile.label} draws it: ${list.length} op${list.length === 1 ? "" : "s"}` };
  return gameBoy(profile, /** @type {GameBoyLimits} */ (profile.limits), list, images, box);
}

/** @param {Profile} profile @param {GameBoyLimits} gb @param {Op[]} list @param {Record<string, Image>} images @param {Box} box */
function gameBoy(profile, gb, list, images, box) {
  /** @type {DrawDiagnostic[]} */
  const out = [];
  const say = (/** @type {string} */ code, /** @type {string} */ m) => out.push({ code, message: `${profile.label}: ${m}` });
  /** sprites covering each pixel row @type {number[]} */
  const rows = [];
  let sprites = 0, layers = 0, chars = 0;
  const w = box.max[0] - box.min[0], h = box.max[1] - box.min[1];
  if (w > gb.width || h > gb.height) say("J040", `the stage is ${by([w, h])}; its screen is ${gb.width} by ${gb.height}`);
  list.forEach((op, i) => {
    switch (op.op) {
      case "image": {
        const native = nativeSize(op, images) ?? [0, 0];
        if (native[0] % gb.tile || native[1] % gb.tile) { say("J041", `op ${i}: image ${op.image} is ${by(native)}; sprites are made of ${gb.tile} by ${gb.tile} cells`); return; }
        if (op.size && (op.size[0] !== native[0] || op.size[1] !== native[1])) { say("J041", `op ${i}: image ${op.image} drawn at ${by(op.size)}, not its own ${by(native)}: sprites don't scale (a scaling wire, or a size)`); return; }
        const across = native[0] / gb.tile;
        sprites += across * (native[1] / gb.tile);
        const top = Math.floor(op.at[1] - box.min[1]);
        for (let y = Math.max(0, top); y < Math.min(gb.height, top + native[1]); y++) rows[y] = (rows[y] ?? 0) + across;
        return;
      }
      case "tiles": {
        const c = nativeSize(op, images);
        if (!c || c[0] !== gb.tile || c[1] !== gb.tile) { say("J041", `op ${i}: tiles of ${op.image}: its cells are ${c ? by(c) : "undeclared"}; background cells are ${gb.tile} by ${gb.tile}`); return; }
        if (op.size && (op.size[0] !== c[0] || op.size[1] !== c[1])) { say("J041", `op ${i}: tiles of ${op.image} with cells drawn at ${by(op.size)}, not ${by(c)}: background cells don't scale (a scaling wire, or a size)`); return; }
        layers++;
        return;
      }
      case "text": chars += [...String(op.str)].length; return;
      default: say("J042", `op ${i} is a ${op.op}; the ${profile.label} draws ${profile.kinds.join(", ")}`);
    }
  });
  if (layers > gb.layers) say("J040", `${layers} tiles layers; its limit is ${gb.layers} (a background and a window)`);
  if (sprites > gb.sprites) say("J040", `${sprites} sprites; its limit is ${gb.sprites}`);
  const perRow = Math.max(0, ...rows.filter((n) => n !== undefined));
  if (perRow > gb.perRow) say("J040", `${perRow} sprites on pixel row ${rows.findIndex((n) => n === perRow)}; its limit is ${gb.perRow} a row`);
  const ok = out.length === 0;
  const summary = ok
    ? `${profile.label} draws it: ${layers} tiles layer${layers === 1 ? "" : "s"}, ${sprites} sprites (at most ${perRow} on a row), ${chars} characters`
    : `${profile.label} refuses it: ${out.map((d) => d.message.slice(profile.label.length + 2)).join("; ")}`;
  return { ok, diagnostics: out, summary };
}
