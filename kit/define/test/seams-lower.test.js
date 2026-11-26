// What a Dialect's seams need from one built Program, checked when it lowers: each output lambda lowered as a UI
// value lambda and paired with its seam (D027), each extent(record) and edges(record) called (D030); and what the
// Program's lambdas read across the seam: value inputs through the inputs object, an Event input's record by the
// name it gives, in the slots it names.
import { test } from "node:test";
import assert from "node:assert/strict";
import { defineDialect } from "../index.js";
import { mazeDecl, particlesDecl, mazeGrammar, particlesGrammar, GRID } from "../fixtures/seams-dialects.js";

const steer = "(pl, pad) => { pl.dx = pad.left ? -1 : 0; }";

/** @param {(d: Record<string, any>) => void} [change] */
function lowerMaze(change = () => {}) {
  const d = mazeDecl();
  change(d);
  const g = mazeGrammar(defineDialect(/** @type {any} */ (d)));
  return g.lower(/** @type {any} */ (g("level")).grid(GRID).control(steer).build());
}
/** @param {any[]} ds */
const errors = (ds) => ds.filter((x) => x.severity === "error");

test("an output lambda that builds a point2 from two scalars lowers and pairs with its seam", () => {
  const low = /** @type {any} */ (lowerMaze());
  assert.deepEqual(errors(low.diagnostics), []);
  assert.ok(low.seams.outputs.player, "the output lambda's lowering is in the result");
  assert.deepEqual(low.seams.extents, { cell: { min: [-0.5, -0.5], max: [4.5, 2.5] } });
});

test("an output lambda whose result does not pair with its seam is D027 at the Dialect's line, naming the port", () => {
  const low = lowerMaze((d) => { d.ports.out.player.from = (/** @type {any} */ s) => s.player.x; });
  const ds = errors(low.diagnostics);
  assert.deepEqual(ds.map((x) => x.code), ["D027"]);
  assert.equal(/** @type {any} */ (ds[0]).port, "player");
  assert.match(ds[0].message, /output 'player'/);
  assert.match(/** @type {any} */ (ds[0]).file, /seams-lower\.test\.js$/);
  const three = lowerMaze((d) => { d.ports.out.player.from = (/** @type {any} */ s) => [s.player.x, s.player.y, s.t]; });
  assert.deepEqual(errors(three.diagnostics).map((x) => x.code), ["D027"]);
});

test("an extent(record) or edges(record) that throws or has the wrong shape is D030 when the Program lowers", () => {
  assert.deepEqual(errors(lowerMaze((d) => { d.frames.cell.extent = () => { throw new Error("no grid"); }; }).diagnostics).map((x) => x.code), ["D030"]);
  assert.deepEqual(errors(lowerMaze((d) => { d.frames.cell.extent = () => ({ min: [0, 0], max: [0, 1] }); }).diagnostics).map((x) => x.code), ["D030"]);
  assert.deepEqual(errors(lowerMaze((d) => { d.edges = () => [{ from: "cell", to: "nowhere", scale: 2 }]; }).diagnostics).map((x) => x.code), ["D030"]);
  const ok = /** @type {any} */ (lowerMaze((d) => { d.frames.px = { dims: 2, note: "pixels" }; d.edges = () => [{ from: "cell", to: "px", scale: 16, offset: 8 }]; }));
  assert.deepEqual(errors(ok.diagnostics), []);
  assert.deepEqual(ok.seams.edges, [{ from: "cell", to: "px", edge: { scale: [16, 16], offset: [8, 8] } }]);
});

/** @param {string} spawn @param {string} [rate] */
function lowerParticles(spawn, rate = "(t, live) => 0") {
  const g = particlesGrammar(defineDialect(/** @type {any} */ (particlesDecl())));
  return g.lower(/** @type {any} */ (g("fx")).bounds({ width: 320, height: 320 }).emitter("pop", { x: 1, y: 1, trigger: "burst" }).rate(rate).spawn(spawn).build());
}

test("a value input is read through the inputs object as its local type", () => {
  assert.deepEqual(errors(lowerParticles("(p, rng) => { p.life = inp.radius; p.vel = inp.wind; }").diagnostics), []);
  assert.deepEqual(errors(lowerParticles("(p, rng) => { p.life = inp.radius.x; }").diagnostics).map((x) => x.code), ["L002"]);
});

test("an Event input's record is read by its name in the slots it names, and nowhere else", () => {
  assert.deepEqual(errors(lowerParticles("(p, rng) => { p.pos = ev.at; }").diagnostics), []);
  assert.deepEqual(errors(lowerParticles("(p, rng) => { p.life = ev.where; }").diagnostics).map((x) => x.code), ["L002"]);
  const rate = errors(lowerParticles("(p, rng) => { p.life = 1; }", "(t, live) => ev.at.x").diagnostics);
  assert.deepEqual(rate.map((x) => x.code), ["L004"]);
});
