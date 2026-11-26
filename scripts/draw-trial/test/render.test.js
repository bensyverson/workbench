import { test } from "node:test";
import assert from "node:assert/strict";
import { canvas, gameboy, gameboyAtCompose, GB } from "../checker/render.js";

const images = { "a.hero": { size: [16, 16] }, "a.sheet": { size: [32, 8], cell: [8, 8] }, "a.big": { size: [20, 20] } };
const box = { min: [0, 0], max: [160, 144] };

test("canvas draws every op, one call each, and counts those outside the stage", () => {
  const r = canvas([
    { op: "rect", at: [0, 0], size: [10, 10], fill: "#000000ff" },
    { op: "ellipse", at: [500, 500], r: [2, 2], fill: "#ffffffff" },
    { op: "text", at: [0, 0], str: "HI", font: "mono", fill: "#000000ff" },
  ], { box, images });
  assert.deepEqual(r.counts, { rect: 1, ellipse: 1, text: 1 });
  assert.equal(r.outside, 1);
  assert.match(r.text, /3 ops: rect 1, ellipse 1, text 1; 1 outside the 160 by 144 stage/);
});

test("gameboy draws tiles, aligned image cells and text, and counts sprites", () => {
  const r = gameboy([
    { op: "tiles", at: [0, 0], image: "a.sheet", grid: [[0, 1], [2, 3]] },
    { op: "image", at: [8, 8], image: "a.hero" },
    { op: "image", at: [40, 8], image: "a.sheet", cell: 2 },
    { op: "text", at: [0, 136], str: "SCORE", font: "mono", fill: "#000000ff" },
  ], { box, images });
  assert.deepEqual(r.refused, []);
  assert.equal(r.sprites, 5);
  assert.equal(r.maxPerRow, 3);
  assert.equal(r.ok, true);
  assert.match(r.text, /draws it: 1 tiles layer, 5 sprites \(at most 3 on a row\), 5 characters/);
});

test("gameboy refuses rect, ellipse, line, unaligned and scaled images, a third tiles layer, and a large stage", () => {
  const r = gameboy([
    { op: "rect", at: [0, 0], size: [8, 8], fill: "#000000ff" },
    { op: "ellipse", at: [0, 0], r: [1, 1], fill: "#000000ff" },
    { op: "ellipse", at: [0, 0], r: [1, 1], fill: "#000000ff" },
    { op: "line", points: [[0, 0], [1, 1]], width: 1, stroke: "#000000ff" },
    { op: "image", at: [0, 0], image: "a.big" },
    { op: "image", at: [0, 0], image: "a.hero", size: [8, 8] },
    { op: "tiles", at: [0, 0], image: "a.sheet", grid: [[0]] },
    { op: "tiles", at: [0, 0], image: "a.sheet", grid: [[0]] },
    { op: "tiles", at: [0, 0], image: "a.sheet", grid: [[0]] },
  ], { box: { min: [0, 0], max: [320, 144] }, images });
  assert.equal(r.ok, false);
  const t = r.refused.join("; ");
  for (const re of [/rect ×1/, /ellipse ×2/, /line ×1/, /20 by 20/, /drawn at another size/, /a third tiles layer/, /the stage is 320 by 144/]) assert.match(t, re);
});

test("gameboy refuses more than 40 sprites, or more than 10 on one row", () => {
  const row = Array.from({ length: 11 }, (_, i) => ({ op: "image", at: [i * 8, 0], image: "a.sheet", cell: 0 }));
  assert.match(gameboy(row, { box, images }).refused.join(";"), /11 sprites on row 0; the most is 10/);
  const many = Array.from({ length: 41 }, (_, i) => ({ op: "image", at: [(i % 10) * 8, Math.floor(i / 10) * 8], image: "a.sheet", cell: 0 }));
  assert.match(gameboy(many, { box, images }).refused.join(";"), /41 sprites; the most is 40/);
});

test("gameboy maps each color to the nearest of 4 shades by brightness", () => {
  const r = gameboy([
    { op: "text", at: [0, 0], str: "a", font: "mono", fill: "#ffffffff" },
    { op: "text", at: [0, 8], str: "b", font: "mono", fill: "#000000ff" },
    { op: "text", at: [0, 16], str: "c", font: "mono", fill: "#808080ff" },
  ], { box, images });
  assert.deepEqual(r.shades, { "#ffffffff": 0, "#000000ff": 3, "#808080ff": 1 });
});

test("gameboyAtCompose refuses a seam whose max passes the sprite limit, since a Draw seam names no op mix", () => {
  assert.equal(gameboyAtCompose(GB.sprites), null);
  assert.match(/** @type {string} */ (gameboyAtCompose(256)), /Draw<256>.*40 sprites/);
});
