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
