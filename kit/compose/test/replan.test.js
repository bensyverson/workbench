// replan (README, "An anchored edge" ▸ "How kit/run sees a rebuilt extent"): a composed record's conversions planned
// again from the parts' frames in force: each Dialect's edges(record) and each glue edge, "fit" and anchored ones
// computed from the extents now in force. kit/run calls it after a rebuild; a plan that fails fails the rebuild.

import { test } from "node:test";
import assert from "node:assert/strict";
import { compose, replan } from "../index.js";
import { screen } from "../../draw/fixtures/draw-dialects.js";

/** @param {number} w @param {number} h */
const px = (w, h) => ({ frames: { px: { dims: 2 } }, extents: { px: { min: [0, 0], max: [w, h] } }, edges: [] });

/** The HUD panel (160 by 24) anchored along the top of a 192 by 128 screen, shown as a layer. */
function hud() {
  const big = /** @type {any} */ (screen()("big")).size({ width: 192, height: 128 });
  const panel = /** @type {any} */ (screen((d) => { d.name = "hudscreen"; })("hud")).size({ width: 160, height: 24 });
  return compose("r").part(big).part(panel).frame(panel.frame.px, big.frame.px, { scale: 1, anchor: ["center", "min"], offset: [0, 4] }).show(big.out.view, panel.out.view).build();
}

test("for the records it was built with, replan gives the composed record's own conversions and edges", () => {
  const composed = hud();
  const r = replan(composed, (p) => (p === "big" ? px(192, 128) : p === "hud" ? px(160, 24) : null));
  assert.ok(r.ok);
  assert.deepEqual(r.convert, composed.wires.map((w) => w.convert));
  assert.deepEqual(r.frames, [{ scale: [1, 1], offset: [16, 4] }]);
  assert.deepEqual(r.edges.map((e) => [e.from, e.to, e.by]), [["hud.px", "big.px", "glue"]]);
});

test("a wider bottom picture moves the anchored panel: four 16-pixel cells wider puts it at [48, 4], with no edit", () => {
  const r = replan(hud(), (p) => (p === "big" ? px(256, 128) : p === "hud" ? px(160, 24) : null));
  assert.ok(r.ok);
  assert.deepEqual(r.convert[1], [{ field: "", kind: "draw", from: "hudscreen.px", to: "screen.px", scale: [1, 1], offset: [48, 4] }]);
});

/** A hand-made record: part a's cell and px related by its Dialect's edge, and both related by the glue to b's q. */
const triangle = {
  parts: [{ name: "a", dialect: "da", record: {} }, { name: "b", dialect: "db", record: {} }],
  frames: [
    { from: "a.cell", to: "b.q", line: 3, given: { scale: [2], offset: [0] }, edge: { scale: [2], offset: [0] } },
    { from: "a.px", to: "b.q", line: 4, given: { scale: [1], offset: [0] }, edge: { scale: [1], offset: [0] } },
  ],
  wires: [{ from: "a.out.at", to: "b.in.at", convert: [{ field: "", kind: /** @type {const} */ ("point"), from: "da.cell", to: "db.q", scale: [2], offset: [0] }], rename: {}, delay: false, dropped: [] }],
};
/** @param {Array<{ from: string, to: string, edge: any }>} edges @returns {(p: string) => import("../replan.js").PartFrames | null} */
const framesOf = (edges) => (p) => {
  /** @type {Record<string, { dims: number }>} */
  const frames = p === "a" ? { cell: { dims: 1 }, px: { dims: 1 } } : { q: { dims: 1 } };
  return p === "a" || p === "b" ? { frames, extents: {}, edges: p === "a" ? edges : [] } : null;
};

test("a Dialect edge that now disagrees with the glue's path is S253; one that agrees plans", () => {
  assert.ok(replan(triangle, framesOf([{ from: "cell", to: "px", edge: { scale: [2], offset: [0] } }])).ok);
  const r = replan(triangle, framesOf([{ from: "cell", to: "px", edge: { scale: [3], offset: [0] } }]));
  assert.equal(r.ok, false);
  assert.deepEqual(!r.ok && r.diagnostics.map((d) => d.code), ["S253"]);
  assert.match(!r.ok ? r.diagnostics[0].message : "", /line 4/);
});

test("a conversion whose path is gone is S251; a derived edge whose extent is gone is S256", () => {
  const lonely = { ...triangle, frames: [] };
  const r = replan(lonely, framesOf([]));
  assert.deepEqual(!r.ok && r.diagnostics.map((d) => d.code), ["S251"]);
  const fit = { ...triangle, frames: [{ ...triangle.frames[0], given: /** @type {const} */ ("fit") }] };
  const s = replan(fit, framesOf([]));
  assert.deepEqual(!s.ok && s.diagnostics.map((d) => d.code), ["S256"]);
  assert.match(!s.ok ? s.diagnostics[0].message : "", /da\.cell and db\.q now declare no extent/);
});
