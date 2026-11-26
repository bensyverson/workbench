// Renderer profiles (ruling 2, 2026-11-26): at composition a profile judges op kinds only; at draw time it counts
// exactly, and an op over a limit is a diagnostic naming the profile and the limit, never a silent drop. The
// Game Boy draws image cells as sprites, tiles as its background and window, and text; Canvas draws every op.

import { test } from "node:test";
import assert from "node:assert/strict";
import { CANVAS, GAMEBOY, PROFILES, kindProblems, checkDraw, shadeOf } from "../index.js";

const images = {
  "p.hero": { size: [16, 16] },
  "p.ball": { size: [8, 8] },
  "p.odd": { size: [12, 12] },
  "p.bg": { size: [64, 8], cell: [8, 8] },
  "p.big": { size: [32, 16], cell: [16, 16] },
};
const box = { min: [0, 0], max: [160, 144] };
const sprite = (/** @type {number} */ x, /** @type {number} */ y) => ({ op: "image", at: [x, y], image: "p.ball" });
/** @param {any} r */
const codes = (r) => r.diagnostics.map((/** @type {any} */ d) => d.code);

test("the profiles are named, and the Game Boy draws three kinds", () => {
  assert.deepEqual(Object.keys(PROFILES), ["canvas", "gameboy"]);
  assert.equal(CANVAS.kinds.length, 6);
  assert.deepEqual([...GAMEBOY.kinds], ["image", "tiles", "text"]);
});

test("at composition a profile names the kinds it does not draw, and only those", () => {
  assert.deepEqual(kindProblems(GAMEBOY, ["image", "tiles", "text"]), []);
  assert.deepEqual(kindProblems(GAMEBOY, ["rect", "image", "ellipse"]), ["rect", "ellipse"]);
  assert.deepEqual(kindProblems(CANVAS, ["rect", "ellipse", "line"]), []);
});

test("Canvas draws every list", () => {
  const r = checkDraw(CANVAS, [{ op: "ellipse", at: [0, 0], r: [1, 1] }, { op: "rect", at: [0, 0], size: [9999, 1] }], { images, box });
  assert.deepEqual(r.diagnostics, []);
});

test("the Game Boy draws a list that fits, and counts its sprites by 8-by-8 objects", () => {
  const list = [
    { op: "tiles", at: [0, 0], image: "p.bg", grid: [[0, 1], [2, -1]] },
    { op: "image", at: [8, 8], image: "p.hero", flip: "x" },
    { op: "image", at: [40, 8], image: "p.big", cell: 1 },
    { op: "text", at: [0, 136], str: "SCORE 10", font: "mono", fill: "#ffffffff" },
  ];
  const r = checkDraw(GAMEBOY, list, { images, box });
  assert.deepEqual(r.diagnostics, []);
  assert.equal(r.summary, "Game Boy (DMG) draws it: 1 tiles layer, 8 sprites (at most 4 on a row), 8 characters");
});

test("a Game Boy limit passed at draw time is J040, naming the profile and the limit", () => {
  const many = Array.from({ length: 41 }, (_, i) => sprite((i % 10) * 16, Math.floor(i / 10) * 16));
  const r = checkDraw(GAMEBOY, many, { images, box });
  assert.deepEqual(codes(r), ["J040"]);
  assert.match(r.diagnostics[0].message, /Game Boy \(DMG\): 41 sprites; its limit is 40/);
  const row = checkDraw(GAMEBOY, Array.from({ length: 11 }, (_, i) => sprite(i * 9, 50)), { images, box });
  assert.deepEqual(codes(row), ["J040"]);
  assert.match(row.diagnostics[0].message, /11 sprites on pixel row 50; its limit is 10 a row/);
  const layers = checkDraw(GAMEBOY, [0, 1, 2].map(() => ({ op: "tiles", at: [0, 0], image: "p.bg", grid: [[0]] })), { images, box });
  assert.match(layers.diagnostics[0].message, /3 tiles layers; its limit is 2/);
  const wide = checkDraw(GAMEBOY, [], { images, box: { min: [0, 0], max: [320, 144] } });
  assert.match(wide.diagnostics[0].message, /the stage is 320 by 144; its screen is 160 by 144/);
});

test("an op the Game Boy cannot draw exactly is J041, an undrawn kind J042; Canvas still draws them", () => {
  const list = [
    { op: "image", at: [0, 0], image: "p.odd" },
    { op: "image", at: [0, 0], image: "p.ball", size: [16, 16] },
    { op: "tiles", at: [0, 0], image: "p.bg", grid: [[0]], size: [16, 16] },
    { op: "tiles", at: [0, 0], image: "p.big", grid: [[0]] },
    { op: "rect", at: [0, 0], size: [1, 1] },
  ];
  const r = checkDraw(GAMEBOY, list, { images, box });
  assert.deepEqual(codes(r), ["J041", "J041", "J041", "J041", "J042"]);
  assert.match(r.diagnostics[1].message, /drawn at 16 by 16, not its own 8 by 8: sprites don't scale/);
  assert.match(r.diagnostics[2].message, /cells drawn at 16 by 16.*background cells don't scale/);
  assert.match(r.diagnostics[4].message, /op 4 is a rect; the Game Boy \(DMG\) draws image, tiles, text/);
  assert.deepEqual(checkDraw(CANVAS, list, { images, box }).diagnostics, []);
});

test("a color's Game Boy shade is by brightness, 0 the lightest of 4; alpha 0 is transparent", () => {
  assert.equal(shadeOf("#ffffffff"), 0);
  assert.equal(shadeOf("#000000ff"), 3);
  assert.equal(shadeOf("#808080ff"), 1);
  assert.equal(shadeOf("#404040ff"), 2);
  assert.equal(shadeOf("#00000000"), null);
});
