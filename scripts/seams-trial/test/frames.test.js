// The frame graph: edges normalized per axis, composed along a path and run backward, "fit" from two extents, and
// a second path that disagrees with the first found when it is added.

import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeEdge, composeEdges, invertEdge, fitEdge, FrameGraph, convertText } from "../checker/frames.js";

test("an edge's scalar scale and offset apply to every axis; a bad one says why", () => {
  assert.deepEqual(normalizeEdge({ scale: 32, offset: 16 }, 2), { ok: true, edge: { scale: [32, 32], offset: [16, 16] } });
  assert.deepEqual(normalizeEdge({ scale: [2, -2] }, 2), { ok: true, edge: { scale: [2, -2], offset: [0, 0] } });
  for (const bad of [{ scale: 0 }, { scale: [1] }, { scale: "2" }, { offset: 1 }, { scale: 1, offset: [1, 2, 3] }, { scale: 1, rotate: 90 }, null, 3, { scale: NaN }, { scale: Infinity }]) {
    const r = normalizeEdge(bad, 2);
    assert.equal(r.ok, false, JSON.stringify(bad));
  }
});

test("edges compose and invert", () => {
  const a = { scale: [32, 32], offset: [16, 16] };
  const b = { scale: [0.5, 0.5], offset: [1, 2] };
  assert.deepEqual(composeEdges(a, b), { scale: [16, 16], offset: [9, 10] });
  const inv = invertEdge(a);
  assert.deepEqual(composeEdges(a, inv), { scale: [1, 1], offset: [0, 0] });
});

test("fit: one scale so a's box min..max fits inside b's, centered", () => {
  assert.deepEqual(fitEdge({ min: [0, 0], max: [10, 5] }, { min: [0, 0], max: [320, 320] }), { scale: [32, 32], offset: [0, 80] });
  assert.deepEqual(fitEdge({ min: [-0.5, -0.5], max: [9.5, 7.5] }, { min: [0, 0], max: [320, 320] }), { scale: [32, 32], offset: [16, 48] });
  assert.deepEqual(fitEdge({ min: [0], max: [4] }, { min: [10], max: [12] }), { scale: [0.5], offset: [10] });
});

test("the graph finds a path through edges run either way, and refuses a disagreeing second path", () => {
  const g = new FrameGraph();
  for (const n of ["m.cell", "m.px", "p.px"]) g.addNode(n, 2);
  assert.equal(g.add({ from: "m.cell", to: "m.px", edge: { scale: [16, 16], offset: [8, 8] }, by: "maze" }), null);
  assert.equal(g.add({ from: "p.px", to: "m.px", edge: { scale: [0.5, 0.5], offset: [0, 0] }, by: "glue" }), null);
  const p = g.path("m.cell", "p.px");
  assert.ok(p);
  assert.deepEqual(p.edge, { scale: [32, 32], offset: [16, 16] });
  assert.deepEqual(p.steps.map((s) => s.by), ["maze", "glue"]);
  assert.equal(g.path("m.cell", "nowhere"), null);
  const clash = g.add({ from: "m.cell", to: "p.px", edge: { scale: [30, 30], offset: [16, 16] }, by: "glue2" });
  assert.ok(clash);
  assert.deepEqual(clash.existing.edge, { scale: [32, 32], offset: [16, 16] });
  const same = g.add({ from: "m.cell", to: "p.px", edge: { scale: [32, 32], offset: [16, 16] }, by: "glue3" });
  assert.equal(same, null, "an edge that agrees with the path is redundant, not a clash");
});

test("a conversion prints by kind", () => {
  const e = { scale: [32, 32], offset: [16, 16] };
  assert.equal(convertText({ field: "at", kind: "point", from: "maze.cell", to: "particles.px", edge: e }), "at: maze.cell → particles.px, point, ×32 +16");
  assert.equal(convertText({ field: "v", kind: "vector", from: "a.x", to: "b.y", edge: { scale: [2, -2], offset: [1, 1] } }), "v: a.x → b.y, vector, ×[2, -2]");
  assert.equal(convertText({ field: "", kind: "quantity", from: "a.x", to: "b.y", edge: { scale: [2, -2], offset: [1, 1] } }), "(value): a.x → b.y, quantity, ×2");
});
