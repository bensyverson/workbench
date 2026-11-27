// The host's zoom and pan of the stage (project/2026-11-27-controls-draft.md, requirement 10): pure math, and the
// navigator that decides which pointer and wheel events are the view's (Ctrl or ⌘ with the wheel, a pinch, Space with
// a drag, a two-finger drag) and which go to the part's pointer input (a plain wheel, every other event). Not logged.
import { test } from "node:test";
import assert from "node:assert/strict";
import { FIT, zoomAt, panBy, wheelIntent, createNavigator } from "../viewport.js";

test("zoomAt keeps the canvas point under the pointer still, and clamps the zoom", () => {
  const v = zoomAt(FIT, [40, 20], 2);
  assert.equal(v.zoom, 2);
  // the stage point under (40, 20) before, (40 - 0) / 1, is under it after: (40 - pan) / 2
  assert.deepEqual([(40 - v.pan[0]) / v.zoom, (20 - v.pan[1]) / v.zoom], [40, 20]);
  assert.equal(zoomAt(FIT, [0, 0], 1000).zoom, 16, "clamped above");
  assert.equal(zoomAt(FIT, [0, 0], 0.001).zoom, 0.25, "clamped below");
  assert.deepEqual(panBy(v, [3, -4]).pan, [v.pan[0] + 3, v.pan[1] - 4]);
  assert.deepEqual(FIT, { zoom: 1, pan: [0, 0] });
});

test("a wheel with Ctrl or ⌘ zooms (a trackpad pinch is one), and a plain wheel is the part's", () => {
  assert.equal(wheelIntent({ ctrlKey: true }), "zoom");
  assert.equal(wheelIntent({ metaKey: true }), "zoom");
  assert.equal(wheelIntent({}), "pointer");
});

test("the navigator: Ctrl+wheel zooms at the pointer, a plain wheel and a plain drag go to the page", () => {
  const n = createNavigator();
  const z = n.pointer({ type: "wheel", x: 10, y: 10, ctrlKey: true, deltaY: -100 });
  assert.equal(z.to, "view");
  assert.ok(n.view.zoom > 1);
  assert.deepEqual(n.pointer({ type: "wheel", x: 10, y: 10, deltaY: -100 }), { to: "page" });
  assert.deepEqual(n.pointer({ type: "pointerdown", x: 1, y: 1, pointerId: 1 }), { to: "page" });
  assert.deepEqual(n.pointer({ type: "pointermove", x: 2, y: 1, pointerId: 1 }), { to: "page" });
  n.fit();
  assert.deepEqual(n.view, FIT, "Fit resets");
});

test("the navigator: Space with a drag pans, and the drag is not the page's; Space let go ends it", () => {
  const n = createNavigator();
  n.space(true);
  assert.equal(n.pointer({ type: "pointerdown", x: 10, y: 10, pointerId: 1 }).to, "view");
  assert.equal(n.pointer({ type: "pointermove", x: 15, y: 7, pointerId: 1 }).to, "view");
  assert.deepEqual(n.view.pan, [5, -3]);
  assert.equal(n.pointer({ type: "pointerup", x: 15, y: 7, pointerId: 1 }).to, "view");
  n.space(false);
  assert.deepEqual(n.pointer({ type: "pointerdown", x: 10, y: 10, pointerId: 1 }), { to: "page" });
});

test("the navigator: two touches pinch to zoom about their middle and drag to pan; the first touch's page capture is cancelled", () => {
  const n = createNavigator();
  assert.deepEqual(n.pointer({ type: "pointerdown", x: 10, y: 10, pointerId: 1, pointerType: "touch" }), { to: "page" });
  const second = n.pointer({ type: "pointerdown", x: 30, y: 10, pointerId: 2, pointerType: "touch" });
  assert.deepEqual(second, { to: "view", cancel: [1] }, "the page lets go of the first touch");
  // spread apart: the distance doubles about the middle (20, 10)
  n.pointer({ type: "pointermove", x: 0, y: 10, pointerId: 1, pointerType: "touch" });
  n.pointer({ type: "pointermove", x: 40, y: 10, pointerId: 2, pointerType: "touch" });
  assert.ok(Math.abs(n.view.zoom - 2) < 1e-9, String(n.view.zoom));
  assert.deepEqual([(20 - n.view.pan[0]) / n.view.zoom, (10 - n.view.pan[1]) / n.view.zoom], [20, 10], "the middle stays put");
  // both move down 6: a two-finger drag pans
  const before = [...n.view.pan];
  n.pointer({ type: "pointermove", x: 0, y: 16, pointerId: 1, pointerType: "touch" });
  n.pointer({ type: "pointermove", x: 40, y: 16, pointerId: 2, pointerType: "touch" });
  assert.ok(Math.abs(n.view.pan[1] - (before[1] + 6)) < 1e-9);
  assert.equal(n.pointer({ type: "pointerup", x: 40, y: 16, pointerId: 2, pointerType: "touch" }).to, "view");
  assert.equal(n.pointer({ type: "pointermove", x: 1, y: 16, pointerId: 1, pointerType: "touch" }).to, "view", "the rest of the gesture stays the view's");
  assert.equal(n.pointer({ type: "pointerup", x: 1, y: 16, pointerId: 1, pointerType: "touch" }).to, "view");
  assert.deepEqual(n.pointer({ type: "pointerdown", x: 1, y: 1, pointerId: 3, pointerType: "touch" }), { to: "page" }, "a new touch is the page's again");
});
