// Canvas draws what the README promises: a wrapped tiles ring that moves with its frame and shows no gap where a
// cell straddles its edge, and text whose characters are 8 by 8 units.

import { test } from "node:test";
import assert from "node:assert/strict";
import { drawCanvas, convertOp } from "../index.js";

/** A stand-in context that records each call; `measureText` answers with a width, as a real one does. @param {number} [glyph] */
function recorder(glyph) {
  /** @type {string[]} */
  const calls = [];
  const target = /** @type {Record<string, any>} */ ({});
  return {
    calls,
    ctx: new Proxy(target, {
      get(_, k) {
        if (k === "measureText" && glyph !== undefined) return (/** @type {string} */ s) => ({ width: glyph * [...s].length });
        return (/** @type {any[]} */ ...a) => calls.push(`${String(k)}(${a.map((x) => (typeof x === "object" ? "img" : x)).join(",")})`);
      },
      set(_, k, v) { calls.push(`${String(k)}=${v}`); return true; },
    }),
  };
}

const images = { "p.sheet": { size: [16, 8], cell: [8, 8] } };
/** The x of every cell a list draws, as `drawImage` destinations. @param {any[]} list */
function xs(list) {
  const { ctx, calls } = recorder();
  drawCanvas(/** @type {any} */ (ctx), list, { images, sources: { "p.sheet": {} } });
  return calls.filter((c) => c.startsWith("drawImage")).map((c) => Number(c.slice(10, -1).split(",")[5])).sort((a, b) => a - b);
}

test("a cell that straddles the ring's edge is drawn at both ends, so a scrolled ring has no gap", () => {
  // ring [0, 32): the cell at -4 wraps to 28 and covers 28..36, so its far part also shows at -4
  assert.deepEqual(xs([{ op: "tiles", at: [-4, 0], image: "p.sheet", grid: [[0, 1, 0, 1]], wrap: [4, 1] }]), [-4, 4, 12, 20, 28]);
  assert.deepEqual(xs([{ op: "tiles", at: [0, 0], image: "p.sheet", grid: [[0, 1, 0, 1]], wrap: [4, 1] }]), [0, 8, 16, 24], "aligned cells are drawn once");
});

test("a wrapped ring moves with its frame across an offset wire, and scales with a scaling one", () => {
  const src = { op: "tiles", at: [-4, 0], image: "p.sheet", grid: [[0, 1, 0, 1]], wrap: [4, 1] };
  const shifted = convertOp(src, { scale: [1, 1], offset: [100, 0] }, images);
  assert.deepEqual(xs([shifted]), xs([src]).map((x) => x + 100));
  const doubled = convertOp(src, { scale: [2, 1], offset: [0, 0] }, images);
  assert.deepEqual(xs([doubled]), [-8, 8, 24, 40, 56]);
  const both = convertOp(src, { scale: [2, 1], offset: [10, 0] }, images);
  assert.deepEqual(xs([both]), [2, 18, 34, 50, 66]);
  assert.equal(convertOp({ ...src, wrap: undefined }, { scale: [1, 1], offset: [100, 0] }, images).wrapAt, undefined, "no ring, no ring origin");
});

test("a ring mirrored by a negative scale keeps its cells in their mirrored places", () => {
  const src = { op: "tiles", at: [0, 0], image: "p.sheet", grid: [[0, 1, 0, 1]], wrap: [4, 1] };
  const m = convertOp(src, { scale: [-1, 1], offset: [40, 0] }, images);
  assert.deepEqual(m.size, [-8, 8]);
  // the source's cells span 0..32, so the mirror spans 8..40
  const { ctx, calls } = recorder();
  drawCanvas(/** @type {any} */ (ctx), [m], { images, sources: { "p.sheet": {} } });
  const lows = calls.filter((c) => c.startsWith("translate")).map((c) => Number(c.slice(10, -1).split(",")[0]) - 8).sort((a, b) => a - b);
  assert.deepEqual(lows, [8, 16, 24, 32]);
});

test("text draws each character 8 units wide: the font's own width is measured and the string scaled to it", () => {
  const { ctx, calls } = recorder(4.8);
  drawCanvas(/** @type {any} */ (ctx), [{ op: "text", at: [3, 10], str: "HI", font: "mono", fill: "#ffffffff" }], { images });
  assert.deepEqual(calls, ["font=8px monospace", "textBaseline=top", "fillStyle=#ffffffff", "save()", "translate(3,10)", `scale(${8 / 4.8},1)`, "fillText(HI,0,0)", "restore()"]);
});

test("text draws unscaled on a context that cannot measure", () => {
  const { ctx, calls } = recorder();
  const measured = /** @type {any} */ (ctx);
  measured.measureText = undefined;
  drawCanvas(measured, [{ op: "text", at: [3, 10], str: "HI", font: "mono", fill: "#ffffffff" }], { images });
  assert.ok(calls.includes("fillText(HI,3,10)"));
});
