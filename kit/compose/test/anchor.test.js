// An anchored edge (README, "Placing a picture" ▸ "An anchored edge"; leaf QqirvU): a `.frame` edge whose offset the
// kit computes from the two frames' extents for the built records. `anchor` is "min", "center" or "max" for every
// axis, an array of one per axis, or a pair { from, to }; `offset` is then a nudge. The result is a plain
// { scale, offset }: every check, path and conversion downstream is an ordinary edge's. The composed record keeps
// each glue edge as written, and as computed, in `frames`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { compose, layer } from "../index.js";
import { screen, drawnMaze, GRID, steer } from "../../draw/fixtures/draw-dialects.js";

/** @param {any[]} ds */
const errors = (ds) => ds.filter((d) => d.severity === "error");
/** @param {any[]} ds */
const codes = (ds) => errors(ds).map((d) => d.code);

/**
 * A screen `big` of 192 by 128 pixels and a screen `hud` of `w` by `h` on it, shown as a layer, big at the bottom.
 * `edge` is the hud's .frame edge onto big; `noExtent` deletes the hud's px extent.
 * @param {unknown} edge @param {{ w?: number, h?: number, noExtent?: boolean }} [o]
 */
function onBig(edge, o = {}) {
  const big = /** @type {any} */ (screen()("big")).size({ width: 192, height: 128 });
  const hg = screen((d) => { d.name = "hudscreen"; if (o.noExtent) delete d.frames.px.extent; });
  const hud = /** @type {any} */ (hg("hud")).size({ width: o.w ?? 160, height: o.h ?? 24 });
  const c = compose("anchor-test").part(big).part(hud).frame(hud.frame.px, big.frame.px, edge).show(big.out.view, hud.out.view);
  return { c, big, hud };
}

/** The hud's conversion into big's px, as the composed record plans it. @param {any} c */
const placed = (c) => {
  const w = c.build().wires.find((/** @type {any} */ x) => x.from === "hud.out.view");
  return { scale: w.convert[0].scale, offset: w.convert[0].offset };
};

test("anchor ['center', 'min'] with an offset nudge centers the panel along the top, 4 pixels down: the kit computes [16, 4]", () => {
  const { c } = onBig({ scale: 1, anchor: ["center", "min"], offset: [0, 4] });
  assert.deepEqual(errors(c.check()), []);
  assert.deepEqual(placed(c), { scale: [1, 1], offset: [16, 4] });
});

test("one anchor for every axis: 'max' puts the panel in the bottom-right corner (y grows downward, so max is the bottom)", () => {
  const { c } = onBig({ scale: 1, anchor: "max" });
  assert.deepEqual(placed(c), { scale: [1, 1], offset: [32, 104] });
});

test("a negative inset at a max side and a positive one at a min side move the picture inward", () => {
  const { c } = onBig({ scale: 1, anchor: ["max", "min"], offset: [-10, 10] }, { w: 90, h: 40 });
  assert.deepEqual(placed(c), { scale: [1, 1], offset: [92, 10] });
});

test("the pair form puts the first frame's `from` point on the second's `to` point: a label under the box, touching it", () => {
  const { c } = onBig({ scale: 1, anchor: { from: ["center", "min"], to: ["center", "max"] } }, { w: 80, h: 14 });
  assert.deepEqual(errors(c.check()), []);
  assert.deepEqual(placed(c), { scale: [1, 1], offset: [56, 128] });
});

test("in a pair, each side is one anchor for every axis or an array of one per axis", () => {
  const { c } = onBig({ scale: 1, anchor: { from: "center", to: ["center", "max"] } }, { w: 80, h: 14 });
  assert.deepEqual(placed(c), { scale: [1, 1], offset: [56, 121] });
});

test("the alignment is computed on the scaled box: a half-size picture centered, and a flipped one still lands inside", () => {
  assert.deepEqual(placed(onBig({ scale: 0.5, anchor: "center" }).c), { scale: [0.5, 0.5], offset: [56, 58] });
  // x flipped: the scaled box is [-160, 0], so its low end at big's low end is an offset of 160, spanning 0..160
  assert.deepEqual(placed(onBig({ scale: [-1, 1], anchor: "min" }).c), { scale: [-1, 1], offset: [160, 0] });
});

test("the composed record keeps each glue edge in `frames`, as written (normalized per axis) and as computed", () => {
  const { c } = onBig({ scale: 1, anchor: ["center", "min"], offset: [0, 4] });
  const rec = /** @type {any} */ (c.build());
  assert.equal(rec.frames.length, 1);
  const [f] = rec.frames;
  assert.equal(f.from, "hud.px");
  assert.equal(f.to, "big.px");
  assert.equal(typeof f.line, "number");
  assert.deepEqual(f.given, { scale: [1, 1], offset: [0, 4], anchor: { from: ["center", "min"], to: ["center", "min"] } });
  assert.deepEqual(f.edge, { scale: [1, 1], offset: [16, 4] });
  assert.deepEqual(onBig("fit").c.build().frames.map((/** @type {any} */ x) => x.given), ["fit"]);
  assert.deepEqual(onBig({ scale: 1, offset: [16, 4] }).c.build().frames.map((/** @type {any} */ x) => [x.given, x.edge]), [[{ scale: [1, 1], offset: [16, 4] }, { scale: [1, 1], offset: [16, 4] }]]);
});

test("the plan prints the computed edge, then where it came from: the anchors, the nudge and the two boxes", () => {
  const { c } = onBig({ scale: 1, anchor: ["center", "min"], offset: [0, 4] });
  const line = c.plan().find((/** @type {string} */ l) => l.startsWith("hud.out.view")) ?? "";
  assert.match(line, /^hud\.out\.view → layers\.in\.1: \(value\): hudscreen\.px → screen\.px, draw, ×1 \+\[16, 4\] \(anchored at line \d+: \[center, min\] \+\[0, 4\], \[0, 0\]\.\.\[160, 24\] in \[0, 0\]\.\.\[192, 128\]\)$/);
  const pair = onBig({ scale: 1, anchor: { from: ["center", "min"], to: ["center", "max"] } }, { w: 80, h: 14 }).c.plan().join("\n");
  assert.match(pair, /\(anchored at line \d+: \[center, min\] on \[center, max\] \+\[0, 0\], \[0, 0\]\.\.\[80, 14\] in \[0, 0\]\.\.\[192, 128\]\)/);
  assert.match(onBig("fit").c.plan().join("\n"), /\(fit at line \d+: \[0, 0\]\.\.\[160, 24\] in \[0, 0\]\.\.\[192, 128\]\)/);
  assert.doesNotMatch(onBig({ scale: 1, offset: [16, 4] }).c.plan().join("\n"), /anchored|fit at/, "an ordinary edge adds nothing");
});

test("an anchored edge with a frame that declares no extent is S256, naming the frame and offering an ordinary edge", () => {
  const { c } = onBig({ scale: 1, anchor: "min" }, { noExtent: true });
  const ds = c.check();
  assert.deepEqual(codes(ds), ["S256"]);
  assert.match(ds[0].message, /hudscreen\.px declares no extent/);
  assert.match(ds[0].message, /anchored edge/);
  assert.match(ds[0].fix, /\.frame\(hud\.frame\.px, big\.frame\.px, \{ scale: …, offset: … \}\)/);
  // the same frames with an ordinary edge still build
  assert.deepEqual(errors(onBig({ scale: 1, offset: 0 }, { noExtent: true }).c.check()), []);
});

test("a malformed anchor is S257: a word other than the three, an array of the wrong length, a pair missing a side or with another key", () => {
  for (const anchor of ["top", ["min"], ["min", "middle"], { from: "min" }, { to: "max" }, { from: "min", to: "max", by: "min" }, 3, null]) {
    const ds = onBig({ scale: 1, anchor }).c.check();
    assert.deepEqual(codes(ds), ["S257"], JSON.stringify(anchor));
    assert.match(ds[0].message, /anchor/, JSON.stringify(anchor));
  }
  assert.match(onBig({ scale: 1, anchor: "top" }).c.check()[0].message, /"min", "center" or "max"/);
});

test("an edge key the kit does not know is S257 naming the edge's keys, with a fix for the frames at hand and no canned numbers", () => {
  const ds = onBig({ scale: 1, rotate: 90 }).c.check();
  assert.deepEqual(codes(ds), ["S257"]);
  assert.match(ds[0].message, /scale, offset and anchor, not 'rotate'/);
  assert.doesNotMatch(ds[0].message, /rotation/);
  assert.doesNotMatch(ds[0].fix, /32|16/);
  assert.match(ds[0].fix, /\.frame\(hud\.frame\.px, big\.frame\.px, \{ scale: <n>, anchor: <anchor> \}\)/);
  assert.match(ds[0].fix, /\.frame\(hud\.frame\.px, big\.frame\.px, \{ scale: <n>, offset: \[<x>, <y>\] \}\)/);
});

test("an anchored edge is compared by its computed numbers: a second path that agrees is fine, one that disagrees is S253 and prints the derivation", () => {
  const big = /** @type {any} */ (screen()("big")).size({ width: 192, height: 128 });
  const hg = screen((d) => { d.name = "hudscreen"; });
  const hud = /** @type {any} */ (hg("hud")).size({ width: 160, height: 24 });
  const agree = compose("a").part(big).part(hud).frame(hud.frame.px, big.frame.px, { scale: 1, anchor: ["center", "min"] }).frame(big.frame.px, hud.frame.px, { scale: 1, offset: [-16, 0] }).show(big.out.view, hud.out.view);
  assert.deepEqual(errors(agree.check()), []);
  const clash = compose("b").part(big).part(hud).frame(hud.frame.px, big.frame.px, { scale: 1, anchor: ["center", "min"] }).frame(big.frame.px, hud.frame.px, { scale: 1, offset: 0 }).show(big.out.view, hud.out.view);
  const ds = clash.check();
  assert.deepEqual(codes(ds), ["S253"]);
  assert.match(ds[0].message, /\(anchored at line \d+: \[center, min\] \+\[0, 0\], \[0, 0\]\.\.\[160, 24\] in \[0, 0\]\.\.\[192, 128\]\)/);
});

test("S251 on a picture onto a picture whose frames both have extents offers an anchor beside fit", () => {
  const big = /** @type {any} */ (screen()("big")).size({ width: 192, height: 128 });
  const hud = /** @type {any} */ (screen((d) => { d.name = "hudscreen"; })("hud")).size({ width: 160, height: 24 });
  const ds = compose("c").part(big).part(hud).show(layer("l", big.out.view, hud.out.view)).check();
  assert.deepEqual(codes(ds), ["S251"]);
  assert.match(ds[0].fix, /\.frame\(hud\.frame\.px, big\.frame\.px, \{ scale: 1, anchor: "min" \}\)/);
  assert.match(ds[0].fix, /"fit"/);
  // and on a Draw wire into a part's Draw input
  const level = /** @type {any} */ (drawnMaze()("level")).grid(GRID).control(steer);
  const wired = compose("d").part(level).part(big).wire(level.out.view, big.in.board).show(big).check();
  assert.deepEqual(codes(wired), ["S251"]);
  assert.match(wired[0].fix, /\.frame\(level\.frame\.cell, big\.frame\.px, \{ scale: 1, anchor: "min" \}\)/);
});
