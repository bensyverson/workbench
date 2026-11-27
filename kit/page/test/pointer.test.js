// @ts-nocheck: page and run objects are generated, which TypeScript cannot follow here.
// The pointer on the stage (project/2026-11-27-controls-draft.md, requirements 5, 6, 10 and 13; build plan groups 39
// and 42's pointer gesture): a canvas point is mapped through the host's zoom and pan and the stage's corner, hits are
// listed topmost first in each part's own frame, the topmost hit part that takes the pointer gets it (with capture
// from down to up), and a blur cancels a captured pointer. The lens bench under a layer of marks.
import { test } from "node:test";
import assert from "node:assert/strict";
import { lensPage } from "../fixtures/controls-bench.js";

const ev = (type, x, y, o = {}) => ({ type, x, y, pointerId: 1, buttons: type === "pointermove" ? 0 : 1, detail: 1, shiftKey: false, altKey: false, metaKey: false, ctrlKey: false, deltaX: 0, deltaY: 0, ...o });
const settle = (pg) => pg.run.runUntil(pg.run.seconds + 0.25);

test("39. mapping, hits, routing and capture, and a blur's cancel", () => {
  const { page: pg } = lensPage();
  pg.setView({ zoom: 2, pan: [10, 0] });
  assert.deepEqual(pg.toStage(70, 60), [30, 30], "zoom, pan and the stage's corner undone");
  const hits = pg.hits(70, 60);
  assert.deepEqual(hits.map((h) => [h.part, h.output, h.id, h.at]), [["m", "view", "m1", [3, 3]], ["b", "view", "bg", [30, 30]]], "topmost first, each in its part's frame");
  assert.equal(pg.pointer(ev("pointerdown", 70, 60)), true);
  pg.pointer(ev("pointerup", 70, 60));
  settle(pg);
  assert.deepEqual(pg.run.state("b").got, ["down@30,30:bg", "up@30,30:bg"], "marks takes no pointer: the next hit down gets it");
  pg.setView({ zoom: 1, pan: [0, 0] });
  pg.pointer(ev("pointerdown", 400, 400));
  settle(pg);
  assert.equal(pg.run.state("b").got.at(-1), "down@400,400:", "nothing hit: the bottom part");

  const both = lensPage({ marksPointer: true }).page;
  both.pointer(ev("pointerdown", 30, 30));
  both.pointer(ev("pointermove", 80, 80, { buttons: 1 }));
  settle(both);
  assert.deepEqual(both.run.state("m").got, ["down@3,3:m1", "move@8,8:"], "captured from the down: the move goes to marks in its frame");
  assert.deepEqual(both.run.state("b").got, []);
  both.blur();
  settle(both);
  assert.equal(both.run.state("m").got.at(-1).split("@")[0], "cancel");
  both.pointer(ev("pointerup", 80, 80));
  both.pointer(ev("pointerdown", 80, 80));
  settle(both);
  assert.equal(both.run.state("b").got.at(-1), "down@80,80:bg", "the capture ended at the cancel");
});

test("42. the first pointer down unlocks a locked page and is delivered", () => {
  const { page: pg } = lensPage({ keyed: true });
  assert.equal(pg.locked, true);
  assert.equal(pg.pointer(ev("pointermove", 50, 50)), false, "a hover does not unlock");
  assert.equal(pg.pointer(ev("pointerdown", 50, 50)), true);
  assert.equal(pg.locked, false);
  settle(pg);
  assert.deepEqual(pg.run.state("b").got, ["down@50,50:bg"]);
});

import { compose, layer } from "../../compose/index.js";
import { defineUI, list, pointerSeam } from "../../define/index.js";
import { tiny } from "../../run/test/helpers.js";
import { createPage } from "../index.js";
import { fakeContext, frames } from "../fixtures/bench.js";

/** The lens board under marks in the shown layer `top`, and also, in px converted to cells, in a layer `other` the page does not show. */
function twoLayers(otherFirst) {
  const board = tiny("lens", {
    state: { got: list("str", 50) }, inputs: false,
    frames: { px: { dims: 2, note: "pixels", extent: () => ({ min: [0, 0], max: [100, 100] }) } },
    ports: { in: { pointer: { seam: pointerSeam("px") } }, out: { view: { seam: "Draw<4>@px", from: () => [{ op: "rect", at: [0, 0], size: [100, 100], fill: "#000000", id: "bg" }] } } },
  }, { clock: () => ({ tick: 1 / 60 }), events: { in: { pointer: 16 } }, init: () => ({ got: [] }), step: (s, c) => ({ got: [...s.got, ...c.inputs.pointer.map((r) => `${r.phase}@${r.at}`)] }) });
  const marks = tiny("marks", {
    state: { n: "f64" }, inputs: false,
    frames: { cell: { dims: 2, note: "cells", extent: () => ({ min: [0, 0], max: [10, 10] }) } },
    ports: { in: {}, out: { view: { seam: "Draw<4>@cell", from: () => [{ op: "rect", at: [9, 9], size: [1, 1], fill: "#ffffff", id: "m" }] } } },
  }, { clock: () => ({ tick: 1 / 60 }), init: () => ({ n: 0 }), step: (s) => s });
  const b = board.grammar("b"), m = marks.grammar("m");
  const top = layer("top", b.out.view, m.out.view);
  const other = layer("other", m.out.view, b.out.view);
  let c = compose("bench").part(b).part(m);
  c = otherFirst ? c.part(other).part(top) : c.part(top).part(other);
  c = c.frame(m.frame.cell, b.frame.px, { scale: 10, offset: 0 }).show(top);
  const packages = [{ name: "lens", ui: defineUI(board.grammar, { stage: { draw: "view", pointer: "pointer" } }) }, { name: "marks", ui: defineUI(marks.grammar, {}) }];
  const runtimes = [board.runtime, marks.runtime];
  return createPage({ composed: c.build({ runtimes, packages }), runtimes, packages, context: fakeContext(), requestFrame: frames().requestFrame });
}

test("39. a point maps only through the shown layer's path, whichever layer the glue declares first", () => {
  for (const otherFirst of [false, true]) {
    const pg = twoLayers(otherFirst);
    assert.deepEqual(pg.hits(50, 50).find((h) => h.part === "b").at, [50, 50], `hits, other first: ${otherFirst}`);
    pg.pointer(ev("pointerdown", 50, 50));
    settle(pg);
    assert.deepEqual(pg.run.state("b").got, ["down@50,50"], `other first: ${otherFirst}`);
  }
});
