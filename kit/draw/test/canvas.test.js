// The Canvas 2D renderer: one or a few context calls per op, in painter's order, on any object with the Canvas
// 2D methods it uses (a recording stand-in here). An image without pixel data draws its box.

import { test } from "node:test";
import assert from "node:assert/strict";
import { drawCanvas } from "../index.js";

/** A stand-in context that records each call and each style set. */
function recorder() {
  /** @type {string[]} */
  const calls = [];
  const target = /** @type {Record<string, any>} */ ({});
  return {
    calls,
    ctx: new Proxy(target, {
      get(_, k) { return (/** @type {any[]} */ ...a) => calls.push(`${String(k)}(${a.map((x) => (typeof x === "object" ? "img" : x)).join(",")})`); },
      set(_, k, v) { calls.push(`${String(k)}=${v}`); return true; },
    }),
  };
}

const images = { "p.sheet": { size: [16, 8], cell: [8, 8] }, "p.hero": { size: [4, 4] } };

test("each op draws in painter's order with its colors", () => {
  const { ctx, calls } = recorder();
  drawCanvas(/** @type {any} */ (ctx), [
    { op: "rect", at: [1, 2], size: [3, 4], fill: "#ff0000ff", stroke: "#00ff00ff" },
    { op: "ellipse", at: [5, 5], r: [2, 1], fill: "#0000ffff" },
    { op: "line", points: [[0, 0], [4, 0], [4, 4]], width: 2, stroke: "#000000ff", closed: true },
    { op: "text", at: [0, 10], str: "HI", font: "mono", fill: "#ffffffff" },
  ], { images });
  assert.deepEqual(calls, [
    "fillStyle=#ff0000ff", "fillRect(1,2,3,4)", "strokeStyle=#00ff00ff", "lineWidth=1", "strokeRect(1,2,3,4)",
    "beginPath()", "ellipse(5,5,2,1,0,0,6.283185307179586)", "fillStyle=#0000ffff", "fill()",
    "beginPath()", "moveTo(0,0)", "lineTo(4,0)", "lineTo(4,4)", "closePath()", "lineWidth=2", "strokeStyle=#000000ff", "stroke()",
    "font=8px monospace", "textBaseline=top", "fillStyle=#ffffffff", "fillText(HI,0,10)",
  ]);
});

test("an image draws its cell from a source, flipped by a negative size or flip; without a source, its box", () => {
  const { ctx, calls } = recorder();
  const sources = { "p.sheet": {} };
  drawCanvas(/** @type {any} */ (ctx), [
    { op: "image", at: [10, 0], image: "p.sheet", cell: 1 },
    { op: "image", at: [10, 0], image: "p.sheet", cell: 0, size: [-16, 8] },
    { op: "image", at: [0, 0], image: "p.hero", flip: "x" },
  ], { images, sources });
  assert.deepEqual(calls, [
    "drawImage(img,8,0,8,8,10,0,8,8)",
    "save()", "translate(10,0)", "scale(-1,1)", "drawImage(img,0,0,8,8,0,0,16,8)", "restore()",
    "strokeStyle=#808080ff", "lineWidth=1", "strokeRect(0,0,4,4)",
  ]);
});

test("tiles draw each cell at the cell size, skipping -1, reading string rows through the key, and wrapping", () => {
  const { ctx, calls } = recorder();
  drawCanvas(/** @type {any} */ (ctx), [
    { op: "tiles", at: [0, 0], image: "p.sheet", grid: ["#.", ".#"], key: { "#": 1, ".": -1 }, size: [4, 4] },
    { op: "tiles", at: [-8, 0], image: "p.sheet", grid: [[0, 1]], wrap: [1, 1] },
  ], { images, sources: { "p.sheet": {} } });
  assert.deepEqual(calls, [
    "drawImage(img,8,0,8,8,0,0,4,4)", "drawImage(img,8,0,8,8,4,4,4,4)",
    "drawImage(img,0,0,8,8,0,0,8,8)", "drawImage(img,8,0,8,8,0,0,8,8)",
  ]);
});
