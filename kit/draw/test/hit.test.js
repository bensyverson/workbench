// Picking (project/2026-11-27-controls-draft.md, requirement 6; build plan groups 32 to 34) and the vec3 color
// (ruling 7): every op may carry an `id` that survives conversion and carrying; hitTest gives the topmost op under a
// point, exactly per kind; pageView names each op's producing part; a color may be sRGB components from 0 to 1.
import { test } from "node:test";
import assert from "node:assert/strict";
import { typeOp, convertOp, carryList, hitTest, resolveColor, OP_KINDS, drawCanvas } from "../index.js";
import { createRun, pageView } from "../../run/index.js";
import { compose, layer } from "../../compose/index.js";
import { tiny } from "../../run/test/helpers.js";

const paint = { colors: { ink: "#ffffff" }, images: { sheet: { size: [16, 8], cell: [8, 8] } } };
const OPS = {
  rect: { op: "rect", at: [0, 0], size: [4, 2], fill: "ink" },
  ellipse: { op: "ellipse", at: [10, 10], r: [2, 1], fill: "ink" },
  line: { op: "line", points: [[0, 0], [10, 0]], width: 2, stroke: "ink" },
  image: { op: "image", at: [20, 20], image: "sheet", cell: 0 },
  tiles: { op: "tiles", at: [30, 30], image: "sheet", grid: [[0, 1]] },
  text: { op: "text", at: [40, 40], str: "AB", font: "mono", fill: "ink" },
};

test("32. id is taken on all six op kinds, a non-string id is refused, and id survives convertOp and carryList", () => {
  assert.deepEqual(Object.keys(OPS), [...OP_KINDS]);
  for (const [k, op] of Object.entries(OPS)) {
    assert.deepEqual(typeOp({ ...op, id: `the ${k}` }, paint), [], k);
    assert.match(typeOp({ ...op, id: 3 }, paint).join(" "), /id/, k);
  }
  const moved = convertOp({ ...OPS.rect, id: "lens-1" }, { scale: [2, 2], offset: [1, 1] }, paint.images);
  assert.equal(moved.id, "lens-1");
  assert.equal(carryList([{ ...OPS.ellipse, id: "e" }])[0].id, "e");
});

test("33. hitTest: rect, ellipse, line and closed line, the boxes of image, tiles and text, the topmost first, an empty list null", () => {
  const at = (/** @type {any} */ op, /** @type {number[]} */ p) => hitTest([{ ...op, id: "x" }], p, paint.images)?.id ?? null;
  assert.equal(at(OPS.rect, [3, 1]), "x");
  assert.equal(at(OPS.rect, [5, 1]), null);
  assert.equal(at({ ...OPS.rect, at: [4, 2], size: [-4, -2] }, [1, 1]), "x", "a negative size spans backwards");
  assert.equal(at(OPS.ellipse, [11.5, 10.2]), "x");
  assert.equal(at(OPS.ellipse, [11.8, 10.9]), null, "inside the box, outside the ellipse");
  assert.equal(at(OPS.line, [5, 0.9]), "x");
  assert.equal(at(OPS.line, [5, 1.1]), null, "farther than width / 2");
  const tri = { op: "line", points: [[0, 0], [10, 0], [0, 10]], width: 1, stroke: "ink", closed: true, fill: "ink" };
  assert.equal(at(tri, [2, 2]), "x", "a closed filled line's inside");
  assert.equal(at({ ...tri, fill: undefined }, [2, 2]), null, "an unfilled one has no inside");
  assert.equal(at(OPS.image, [27, 27]), "x");
  assert.equal(at(OPS.image, [29, 27]), null);
  assert.equal(at(OPS.tiles, [45, 31]), "x");
  assert.equal(at(OPS.text, [55, 47]), "x");
  assert.equal(at(OPS.text, [57, 47]), null);
  const top = hitTest([{ ...OPS.rect, id: "under" }, { ...OPS.rect, id: "over" }], [1, 1], paint.images);
  assert.equal(top?.id, "over");
  assert.equal(hitTest([], [0, 0], {}), null);
});

test("34. pageView gives parts beside list, the producing part of each op, through a layer", () => {
  const mk = (/** @type {string} */ n, /** @type {Function} */ from) => tiny(n, { state: { k: "f64" }, inputs: false, frames: { px: { dims: 2, note: "pixels", extent: () => ({ min: [0, 0], max: [10, 10] }) } },
    ports: { out: { view: { seam: "Draw<2>@px", from } } } },
  { clock: () => ({ tick: 1 }), init: () => ({ k: 0 }), step: (/** @type {any} */ s) => s });
  const a = mk("under", () => [{ op: "rect", at: [0, 0], size: [1, 1], fill: "#ffffff", id: "under" }]), b = mk("over", () => [{ op: "rect", at: [0, 0], size: [1, 1], fill: "#ffffff", id: "over" }]);
  const pa = a.grammar("a"), pb = b.grammar("b");
  const top = layer("top", pa.out.view, pb.out.view);
  const composed = compose("two").part(pa).part(pb).part(top).frame(pa.frame.px, pb.frame.px, { scale: 1, offset: 0 }).show(top).build({ runtimes: [a.runtime, b.runtime] });
  const run = createRun(composed, { runtimes: [a.runtime, b.runtime] });
  run.runUntil(1);
  const v = pageView(run, composed, [a.runtime, b.runtime]);
  assert.deepEqual(v.list.map((o) => o.id), ["under", "over"]);
  assert.deepEqual([...(v.parts ?? [])], ["a", "b"]);
});

test("ruling 7: a color may be a vec3 of sRGB components from 0 to 1, in typeOp, resolveColor and on the canvas", () => {
  assert.deepEqual(typeOp({ ...OPS.rect, fill: [1, 0.5, 0] }, paint), []);
  assert.match(typeOp({ ...OPS.rect, fill: [2, 0, 0] }, paint).join(" "), /color/);
  assert.match(typeOp({ ...OPS.rect, fill: [1, 0] }, paint).join(" "), /color/);
  assert.equal(resolveColor([1, 0.5, 0], {}), "#ff8000ff", "as a hex color resolves: with its alpha");
  /** @type {string[]} */
  const fills = [];
  const ctx = new Proxy({}, { get: (_t, k) => (k === "fillStyle" ? fills.at(-1) : () => {}), set: (_t, k, v) => { if (k === "fillStyle") fills.push(v); return true; } });
  drawCanvas(/** @type {any} */ (ctx), [{ ...OPS.rect, fill: [0, 0, 1] }], { images: {} });
  assert.deepEqual(fills, ["#0000ff"]);
});
