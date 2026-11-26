// The Game Boy profile draws a list exactly or refuses it (ruling 2, 2026-11-26): a mirrored image is a sprite's flip
// bit, text costs the sprites it is made of, a second tiles layer must be the window, and a frame without an extent
// has no stage to judge.

import { test } from "node:test";
import assert from "node:assert/strict";
import { CANVAS, GAMEBOY, checkDraw } from "../index.js";

const images = {
  "p.hero": { size: [16, 16] },
  "p.ball": { size: [8, 8] },
  "p.bg": { size: [64, 8], cell: [8, 8] },
};
const box = { min: [0, 0], max: [160, 144] };
const sprite = (/** @type {number} */ x, /** @type {number} */ y) => ({ op: "image", at: [x, y], image: "p.ball" });
/** @param {any} r */
const codes = (r) => r.diagnostics.map((/** @type {any} */ d) => d.code);

test("a mirrored image passes on the Game Boy (the sprite's flip bit), and counts its sprites from its own corner", () => {
  const mirrored = { op: "image", at: [24, 8], image: "p.hero", size: [-16, 16] };
  assert.deepEqual(checkDraw(GAMEBOY, [mirrored], { images, box }).diagnostics, []);
  assert.deepEqual(checkDraw(GAMEBOY, [{ op: "image", at: [24, 24], image: "p.hero", size: [16, -16] }], { images, box }).diagnostics, []);
  // a mirror is the picture's own size: a mirrored scale is still a scale
  assert.deepEqual(codes(checkDraw(GAMEBOY, [{ op: "image", at: [24, 8], image: "p.hero", size: [-32, 16] }], { images, box })), ["J041"]);
  // a mirrored y spans backwards, so its rows are above `at`: 2 sprites across it, 9 balls on the same rows
  const row = [{ op: "image", at: [24, 24], image: "p.hero", size: [16, -16] }, ...Array.from({ length: 9 }, (_, i) => ({ op: "image", at: [40 + i * 8, 8], image: "p.ball" }))];
  assert.match(checkDraw(GAMEBOY, row, { images, box }).diagnostics[0].message, /11 sprites on pixel row 8; its limit is 10 a row/);
});

test("a mirrored tiles op stays refused on the Game Boy", () => {
  const r = checkDraw(GAMEBOY, [{ op: "tiles", at: [8, 0], image: "p.bg", grid: [[0, 1]], size: [-8, 8] }], { images, box });
  assert.deepEqual(codes(r), ["J041"]);
  assert.match(r.diagnostics[0].message, /mirrored/);
});

test("Game Boy text is charged as sprites: one per character that is not a space, against both sprite limits", () => {
  const text = (/** @type {string} */ str, /** @type {number} */ x = 0, /** @type {number} */ y = 0) => ({ op: "text", at: [x, y], str, font: "mono", fill: "#000000ff" });
  const ok = checkDraw(GAMEBOY, [text("SCORE 0001", 0, 0)], { images, box });
  assert.deepEqual(ok.diagnostics, []);
  assert.match(ok.summary, /9 sprites/);
  const row = checkDraw(GAMEBOY, [text("ABCDEFGHIJK", 0, 16)], { images, box });
  assert.deepEqual(codes(row), ["J040"]);
  assert.match(row.diagnostics[0].message, /11 sprites on pixel row 16; its limit is 10 a row/);
  const total = checkDraw(GAMEBOY, [0, 1, 2, 3, 4].map((i) => text("ABCDEFGHI0", 0, i * 16)).concat([text("X", 0, 100)]), { images, box });
  assert.deepEqual(codes(total), ["J040"]);
  assert.match(total.diagnostics[0].message, /51 sprites; its limit is 40/);
  const mixed = checkDraw(GAMEBOY, [...Array.from({ length: 38 }, (_, i) => sprite((i % 10) * 16, Math.floor(i / 10) * 16)), text("ABC", 0, 120)], { images, box });
  assert.match(mixed.diagnostics[0].message, /41 sprites; its limit is 40/);
});

test("a second Game Boy tiles layer must be exactly the window: opaque, on the tile grid, reaching the screen's far corner", () => {
  const bg = { op: "tiles", at: [0, 0], image: "p.bg", grid: [[0, 1]] };
  const rows = (/** @type {number} */ last) => [0, 1].map(() => [...Array.from({ length: 19 }, () => 1), last]);
  const window = (/** @type {Record<string, unknown>} */ o = {}) => ({ op: "tiles", at: [0, 128], image: "p.bg", grid: rows(1), ...o });
  assert.deepEqual(checkDraw(GAMEBOY, [bg, window()], { images, box }).diagnostics, []);
  const transparent = checkDraw(GAMEBOY, [bg, window({ grid: rows(-1) })], { images, box });
  assert.deepEqual(codes(transparent), ["J041"]);
  assert.match(transparent.diagnostics[0].message, /window/);
  assert.deepEqual(codes(checkDraw(GAMEBOY, [bg, window({ at: [0, 60] })], { images, box })), ["J041"], "it stops short of the bottom edge");
  assert.deepEqual(codes(checkDraw(GAMEBOY, [bg, window({ at: [3, 128] })], { images, box })), ["J041"], "it is off the tile grid");
  assert.deepEqual(codes(checkDraw(GAMEBOY, [bg, window({ grid: ["..", ".."], key: { ".": -1 } })], { images, box })), ["J041"], "a string grid is read through its key");
});

test("a frame with no extent is judged without a stage", () => {
  assert.deepEqual(checkDraw(GAMEBOY, [], { images, box: /** @type {any} */ (null) }).diagnostics, []);
  assert.equal(checkDraw(CANVAS, [], { images, box: /** @type {any} */ (null) }).ok, true);
});
