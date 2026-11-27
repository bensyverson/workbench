// The Game Boy profile and painter's order: the DMG draws every sprite above the background and window, and among
// overlapping sprites the smaller X wins (a tie goes to the earlier OAM entry), whatever order a list gave them.
// A list whose painter's order the hardware would not reproduce is refused, naming the ops.

import { test } from "node:test";
import assert from "node:assert/strict";
import { GAMEBOY, CANVAS, checkDraw } from "../index.js";
import { DRAW_CODES } from "../codes.js";

const images = {
  "p.hero": { size: [8, 8] },
  "p.wide": { size: [16, 8], cell: [8, 8] },
  "p.tall": { size: [8, 16] },
  "p.sheet": { size: [16, 8], cell: [8, 8] },
  "p.huge": { size: [8 * 300, 8], cell: [8, 8] },
};
const box = { min: [0, 0], max: [160, 144] };
const full = (at = [0, 0]) => ({ op: "tiles", at, image: "p.sheet", grid: Array.from({ length: 18 }, () => Array(20).fill(0)) });
const sprite = (/** @type {number} */ x, /** @type {number} */ y, image = "p.hero") => ({ op: "image", at: [x, y], image });
/** @param {any[]} list */
const check = (list) => checkDraw(GAMEBOY, list, { images, box });
/** @param {any} r */
const codes = (r) => r.diagnostics.map((/** @type {any} */ d) => d.code);

test("a tiles op after a sprite it overlaps is J043, naming both ops", () => {
  const r = check([sprite(40, 40), full()]);
  assert.deepEqual(codes(r), ["J043"]);
  assert.match(r.diagnostics[0].message, /op 1: tiles drawn over op 0/);
  assert.equal(r.ok, false);
});

test("the window over a sprite is J043 too, and only the sprite it covers is named", () => {
  const r = check([full(), sprite(40, 40), full()]);
  assert.deepEqual(codes(r), ["J043"]);
  assert.match(r.diagnostics[0].message, /op 2: tiles drawn over op 1/);
});

test("text counts as sprites: the background over text is J043", () => {
  const r = check([{ op: "text", at: [8, 8], str: "HI", font: "mono", fill: "#000000ff" }, full()]);
  assert.deepEqual(codes(r), ["J043"]);
  assert.match(r.diagnostics[0].message, /op 1: tiles drawn over op 0/);
});

test("tiles drawn first, or beside the sprite, or over a -1 cell, or off the screen, pass", () => {
  assert.deepEqual(check([full(), sprite(40, 40)]).diagnostics, []);
  const small = { op: "tiles", at: [0, 0], image: "p.sheet", grid: [[0, 0]] };
  assert.deepEqual(check([sprite(40, 40), small]).diagnostics, []);
  const hole = { op: "tiles", at: [40, 40], image: "p.sheet", grid: [[-1, 0]] };
  assert.deepEqual(check([sprite(40, 40), hole]).diagnostics, []);
  assert.deepEqual(codes(check([sprite(48, 40), hole])), ["J043"]);
  assert.deepEqual(check([sprite(200, 40), full()]).diagnostics, []);
  assert.deepEqual(codes(check([sprite(40, 40), { op: "tiles", at: [36, 36], image: "p.sheet", grid: [[0]] }])), ["J043"]);
});

test("two overlapping sprites must list the smaller x last; a tie or the larger x last is J044", () => {
  const later = check([sprite(44, 40), sprite(40, 40)]);
  assert.deepEqual(later.diagnostics, []);
  const bad = check([full(), sprite(40, 40), sprite(44, 40)]);
  assert.deepEqual(codes(bad), ["J044"]);
  assert.match(bad.diagnostics[0].message, /op 2 is drawn over op 1, but at x 44 against 40/);
  assert.deepEqual(codes(check([sprite(40, 40), sprite(40, 44)])), ["J044"]);
});

test("sprites that do not overlap may come in any order", () => {
  assert.deepEqual(check([sprite(8, 8), sprite(100, 8)]).diagnostics, []);
  assert.deepEqual(check([sprite(100, 8), sprite(8, 8)]).diagnostics, []);
  assert.deepEqual(check([sprite(8, 8), sprite(16, 8)]).diagnostics, []);
});

test("a wide image's cells are objects with their own x, and an op's own cells are not compared", () => {
  assert.deepEqual(check([sprite(40, 40, "p.wide")]).diagnostics, []);
  // the wide image's right cell (x 48) is under the later sprite at 44, which has the smaller x: fine
  assert.deepEqual(codes(check([sprite(40, 40, "p.wide"), sprite(44, 40)])), ["J044"]);
  assert.deepEqual(check([sprite(40, 40, "p.wide"), sprite(36, 40)]).diagnostics, []);
  assert.deepEqual(check([sprite(30, 40, "p.wide"), sprite(34, 40, "p.tall")]).diagnostics.map((d) => d.code), ["J044"]);
});

test("text characters are sprites in the order rule", () => {
  const text = { op: "text", at: [8, 8], str: "AB", font: "mono", fill: "#000000ff" };
  assert.deepEqual(codes(check([text, sprite(12, 8)])), ["J044"]);
  assert.deepEqual(check([sprite(20, 8), text]).diagnostics, []);
  assert.deepEqual(codes(check([sprite(12, 8), text])), ["J044"]);
});

test("Canvas still draws any order", () => {
  assert.deepEqual(checkDraw(CANVAS, [sprite(40, 40), full(), sprite(44, 40)], { images, box }).diagnostics, []);
});

test("the new codes are in the table", () => {
  assert.ok(DRAW_CODES.J043 && DRAW_CODES.J044);
});

test("VRAM: 256 distinct background tiles pass, 257 are J040", () => {
  const bg = (/** @type {number} */ n) => ({ op: "tiles", at: [0, 0], image: "p.huge", grid: [Array.from({ length: n }, (_, i) => i)] });
  assert.deepEqual(check([bg(256)]).diagnostics, []);
  const r = check([bg(257)]);
  assert.deepEqual(codes(r), ["J040"]);
  assert.match(r.diagnostics[0].message, /257 distinct background tiles; its limit is 256/);
  // the same tile twice is one tile
  assert.deepEqual(check([{ op: "tiles", at: [0, 0], image: "p.sheet", grid: [[0, 0, 0]] }]).diagnostics, []);
});

test("VRAM: the 384-tile total cannot bind, since 40 sprites add at most 40 tiles to 256", () => {
  const bg = { op: "tiles", at: [0, 0], image: "p.huge", grid: [Array.from({ length: 256 }, (_, i) => i)] };
  const sprites = Array.from({ length: 40 }, (_, i) => ({ op: "image", at: [(i % 10) * 12, 100 + Math.floor(i / 10) * 9], image: "p.huge", cell: 256 + i }));
  assert.deepEqual(check([bg, ...sprites]).diagnostics, []);
});

test("a wrapped tiles ring is judged where its cells are drawn: a scrolled ring over an earlier sprite is J043", () => {
  const ring = { ...full([-8, 0]), wrap: [20, 18] };
  // cell 0 wraps to x 152, over the sprite listed before the ring
  assert.deepEqual(codes(check([sprite(152, 0), ring])), ["J043"]);
  // a ring listed first is fine, wherever it wraps
  assert.deepEqual(codes(check([ring, sprite(152, 0)])), []);
});

test("J042 names an op kind with its article: an ellipse", () => {
  const r = check([{ op: "ellipse", at: [8, 8], r: [4, 4], fill: "#000000ff" }]);
  assert.ok(r.diagnostics.some((/** @type {any} */ d) => d.code === "J042" && / is an ellipse;/.test(d.message)), JSON.stringify(r.diagnostics));
});
