// The built-in layer part (Ben's ruling of 2026-11-27, "Rulings" 1 of the layer and package tests plan; README,
// "Layers"): several Draw outputs drawn as one picture, bottom first. Its output's max is the sum of the producers'
// built maxes, its frame the bottom producer's, each other input converted to it through the frame graph; it can be
// shown, wired into a Draw input, or layered again, and a profile's kinds are followed through it (S401).

import { test } from "node:test";
import assert from "node:assert/strict";
import { compose, layer, COMPOSE_CODES } from "../index.js";
import { GAMEBOY, CANVAS } from "../../draw/index.js";
import { drawnMaze, screen, GRID, steer } from "../../draw/fixtures/draw-dialects.js";

/** @param {any[]} ds */
const errors = (ds) => ds.filter((d) => d.severity === "error");
/** @param {any[]} ds */
const codes = (ds) => errors(ds).map((d) => d.code);

/**
 * Two producers: a screen `scr` in its pixels (built max 65: its board input's 64 and a line of text), and the maze
 * `level` in its cells (built max 4: a tiles op and one disc per coin of its 3 rows), placed 8 pixels a cell.
 * @param {{ maze?: (d: any) => void, screen?: (d: any) => void, frame?: boolean }} [o]
 */
function parts(o = {}) {
  const level = /** @type {any} */ (drawnMaze(o.maze)("level")).grid(GRID).control(steer);
  const scr = /** @type {any} */ (screen(o.screen)("scr")).size({ width: 40, height: 32 });
  const c = compose("layer-test").part(level).part(scr);
  if (o.frame !== false) c.frame(level.frame.cell, scr.frame.px, { scale: 8, offset: 4 });
  return { level, scr, c };
}

test("a layer draws its inputs bottom first in the bottom producer's frame, with max the sum of the built maxes", () => {
  const { level, scr, c } = parts();
  const top = layer("top", scr.out.view, level.out.view);
  c.show(top);
  assert.deepEqual(errors(c.check()), []);
  const rec = /** @type {any} */ (c.build());
  assert.deepEqual(rec.parts.map((/** @type {any} */ p) => p.name), ["level", "scr", "top"], "after the parts, in order of first mention");
  assert.deepEqual(rec.parts[2], { name: "top", dialect: "layer", record: {}, layer: { inputs: ["scr.out.view", "level.out.view"], max: 69, frame: "scr.px" } });
  assert.deepEqual(rec.wires, [
    { from: "scr.out.view", to: "top.in.0", convert: [], rename: {}, delay: false, dropped: [] },
    { from: "level.out.view", to: "top.in.1", convert: [{ field: "", kind: "draw", from: "maze.cell", to: "screen.px", scale: [8, 8], offset: [4, 4] }], rename: {}, delay: false, dropped: [] },
  ]);
  assert.equal(rec.show, "top");
  assert.equal(rec.view, "view");
  assert.deepEqual(c.plan(), ["scr.out.view → top.in.0: unchanged", "level.out.view → top.in.1: (value): maze.cell → screen.px, draw, ×8 +4"]);
});

test("the shorthand .show(<output>, <output>) adds a layer named layers and shows it", () => {
  const { level, scr, c } = parts();
  c.show(level.out.view, scr.out.view);
  assert.deepEqual(errors(c.check()), []);
  const rec = /** @type {any} */ (c.build());
  assert.equal(rec.show, "layers");
  // the maze is at the bottom now, so the layer is in its cells and the screen's pixels convert into them
  assert.deepEqual(rec.parts.at(-1).layer, { inputs: ["level.out.view", "scr.out.view"], max: 69, frame: "level.cell" });
  assert.deepEqual(rec.wires[1].convert, [{ field: "", kind: "draw", from: "screen.px", to: "maze.cell", scale: [0.125, 0.125], offset: [-0.5, -0.5] }]);
});

test("a layer joins at its first mention; .part of it is allowed and not needed; a layer is one part", () => {
  const { level, scr, c } = parts();
  const top = layer("top", scr.out.view, level.out.view);
  c.part(top).show(top);
  assert.deepEqual(errors(c.check()), []);
  assert.deepEqual(/** @type {any} */ (c.build()).parts.map((/** @type {any} */ p) => p.name), ["level", "scr", "top"]);
  const twice = parts();
  const t2 = layer("top", twice.scr.out.view, twice.level.out.view);
  assert.deepEqual(codes(twice.c.part(t2).part(t2).show(t2).check()), ["S102"]);
});

test("a layered output wired into a Draw input smaller than its summed max is S204, naming the layer's seam", () => {
  const small = parts();
  const t2 = layer("top", small.level.out.view, small.scr.out.view);
  const hud2 = /** @type {any} */ (screen()("hud")).size({ width: 40, height: 32 });
  small.c.part(hud2).frame(small.level.frame.cell, hud2.frame.px, { scale: 8, offset: 4 }).wire(t2.out.view, hud2.in.board).show(hud2);
  const ds = errors(small.c.check());
  assert.deepEqual(ds.map((d) => d.code), ["S204"]);
  assert.equal(ds[0].from.seam, "Draw<69>@cell");
  assert.equal(ds[0].from.port, "out.view");
  assert.equal(ds[0].from.part, "top");
  assert.equal(ds[0].from.dialect, "layer");
});

test("a layered output wires into a part's Draw input through the bottom producer's frame", () => {
  const { level, scr, c } = parts();
  const top = layer("top", level.out.view, scr.out.view);
  const hud = /** @type {any} */ (screen((d) => { d.ports.in.board.seam = "Draw<79>@px"; })("hud")).size({ width: 40, height: 32 });
  c.part(hud).frame(level.frame.cell, hud.frame.px, { scale: 2, offset: 1 }).wire(top.out.view, hud.in.board).show(hud);
  assert.deepEqual(errors(c.check()), []);
  const w = /** @type {any} */ (c.build()).wires.find((/** @type {any} */ x) => x.to === "hud.in.board");
  assert.deepEqual(w.convert, [{ field: "", kind: "draw", from: "maze.cell", to: "screen.px", scale: [2, 2], offset: [1, 1] }]);
});

test("a layer of a layer: its max sums, its frame is the bottom layer's bottom frame", () => {
  const { level, scr, c } = parts();
  const more = /** @type {any} */ (drawnMaze()("more")).grid(GRID).control(steer);
  c.part(more).frame(more.frame.cell, level.frame.cell, { scale: 1, offset: 0 });
  const under = layer("under", level.out.view, scr.out.view);
  const over = layer("over", under.out.view, more.out.view);
  c.show(over);
  assert.deepEqual(errors(c.check()), []);
  const rec = /** @type {any} */ (c.build());
  assert.deepEqual(rec.parts.map((/** @type {any} */ p) => p.name), ["level", "scr", "more", "under", "over"]);
  assert.deepEqual(rec.parts.at(-1).layer, { inputs: ["under.out.view", "more.out.view"], max: 73, frame: "level.cell" });
  assert.deepEqual(rec.wires.filter((/** @type {any} */ w) => w.to.startsWith("over.")).map((/** @type {any} */ w) => [w.from, w.to, w.convert.length]), [["under.out.view", "over.in.0", 0], ["more.out.view", "over.in.1", 1]]);
});

test("a profile follows a layer's inputs to the builders that write each kind (S401), shown or wired on", () => {
  const { level, scr, c } = parts();
  const top = layer("top", scr.out.view, level.out.view);
  c.show(top);
  assert.deepEqual(errors(c.check({ profile: CANVAS })), []);
  const ds = errors(c.check({ profile: GAMEBOY }));
  assert.deepEqual(ds.map((d) => d.code), ["S401"]);
  assert.match(ds[0].message, /top\.out\.view can hold ellipse, from level\.out\.view/);
  assert.equal(ds[0].from.part, "level");
  assert.equal(ds[0].to.part, "top");
  assert.equal(ds[0].to.port, "out.view");
  // through a layer wired into the shown part's Draw input
  const on = parts();
  const t2 = layer("top", on.level.out.view, on.scr.out.view);
  const hud = /** @type {any} */ (screen((d) => { d.ports.in.board.seam = "Draw<79>@px"; })("hud")).size({ width: 40, height: 32 });
  on.c.part(hud).frame(on.level.frame.cell, hud.frame.px, { scale: 8, offset: 4 }).wire(t2.out.view, hud.in.board).show(hud);
  const seen = errors(on.c.check({ profile: GAMEBOY }));
  assert.deepEqual(seen.map((d) => d.code), ["S401"]);
  assert.match(seen[0].message, /hud\.out\.view can hold ellipse, from level\.out\.view/);
});

test("S404: a layer argument that is not a Draw output", () => {
  const { level, scr, c } = parts();
  const ds = errors(c.show(layer("top", scr.out.view, level.out.score)).check());
  assert.deepEqual(ds.map((d) => d.code), ["S404"]);
  assert.match(ds[0].message, /level\.out\.score .* is not a Draw list/);
  assert.equal(ds[0].from.port, "out.score");
  const short = parts();
  assert.deepEqual(codes(short.c.show(short.scr.out.view, short.level.out.score).check()), ["S404"]);
});

test("S102: what a layer and the shorthand refuse, and what they still take", () => {
  const cases = /** @type {Array<[string, (p: ReturnType<typeof parts>) => unknown, RegExp]>} */ ([
    ["one output", (p) => p.c.show(layer("top", p.scr.out.view)), /two or more Draw outputs/],
    ["not an output handle", (p) => p.c.show(layer("top", p.scr.out.view, p.level)), /level is not an output handle/],
    ["an input handle", (p) => p.c.show(layer("top", p.scr.out.view, p.scr.in.board)), /scr\.in\.board is an input/],
    ["one output twice", (p) => p.c.show(layer("top", p.scr.out.view, p.level.out.view, p.scr.out.view)), /scr\.out\.view is given twice/],
    ["a bad name", (p) => p.c.show(layer("Top!", p.scr.out.view, p.level.out.view)), /lowercase letters, digits and -/],
    ["the shorthand with one output", (p) => p.c.show(p.scr.out.view), /one output alone/],
    ["the shorthand with a part among outputs", (p) => p.c.show(p.scr.out.view, p.level), /level is not an output handle/],
  ]);
  for (const [what, make, message] of cases) {
    const p = parts();
    make(p);
    const ds = errors(p.c.check());
    assert.deepEqual(ds.map((d) => d.code), ["S102"], what);
    assert.match(ds[0].message, message, what);
  }
  // an output of a part not added
  const level = /** @type {any} */ (drawnMaze()("level")).grid(GRID).control(steer);
  const scr = /** @type {any} */ (screen()("scr")).size({ width: 40, height: 32 });
  const lone = compose("layer-test").part(scr).frame(level.frame.cell, scr.frame.px, { scale: 8, offset: 4 }).show(layer("top", scr.out.view, level.out.view));
  assert.ok(codes(lone.check()).includes("S102"));
  assert.match(errors(lone.check()).find((d) => /top/.test(d.message))?.message ?? "", /level\.out\.view is a handle of a part not in the composition/);
  // the same output may feed two layers
  const p = parts();
  const a = layer("a", p.scr.out.view, p.level.out.view), b = layer("b", p.level.out.view, p.scr.out.view);
  assert.deepEqual(errors(p.c.part(a).part(b).show(a).check()), []);
});

test("S101: a layer named like another part; the shorthand's fix says to name the layer", () => {
  const p = parts();
  const layers = /** @type {any} */ (screen()("layers")).size({ width: 8, height: 8 });
  const ds = errors(p.c.part(layers).show(p.scr.out.view, p.level.out.view).check());
  assert.deepEqual(ds.map((d) => d.code), ["S101"]);
  assert.match(ds[0].fix, /layer\("<name>", \.\.\.\)/);
  const q = parts();
  assert.deepEqual(codes(q.c.show(layer("scr", q.scr.out.view, q.level.out.view)).check()), ["S101"]);
});

test("S111: a layer has no inputs, frames or params to name, and the fix says what to do instead", () => {
  const p = parts();
  const top = layer("top", p.scr.out.view, p.level.out.view);
  const extra = /** @type {any} */ (drawnMaze()("extra")).grid(GRID).control(steer);
  p.c.part(extra).show(top).wire(extra.out.view, top.in.more).frame(top.frame.px, extra.frame.cell, { scale: 1, offset: 0 }).wire(extra.out.score, top.param.n);
  const ds = errors(p.c.check());
  assert.deepEqual(ds.map((d) => d.code), ["S111", "S111", "S111"]);
  assert.match(ds.map((d) => d.fix).join("\n"), /pass the output to layer/);
  assert.match(ds.map((d) => d.fix).join("\n"), /relate the bottom producer's frame/);
  assert.match(ds[0].message, /layer 'top'/);
  // and its one output is view
  const q = parts();
  const t2 = layer("top", q.scr.out.view, q.level.out.view);
  const hud = /** @type {any} */ (screen()("hud")).size({ width: 8, height: 8 });
  assert.deepEqual(codes(q.c.part(hud).wire(t2.out.picture, hud.in.board).show(t2).check()), ["S111"]);
});

test("S251: an input whose frame no path joins to the bottom frame, with the .frame to write", () => {
  const { level, scr, c } = parts({ frame: false });
  const ds = errors(c.show(layer("top", scr.out.view, level.out.view)).check());
  assert.deepEqual(ds.map((d) => d.code), ["S251"]);
  assert.match(ds[0].message, /level\.out\.view cannot feed top\.in\.1: .*maze\.cell.*screen\.px/);
  assert.match(ds[0].fix, /\.frame\(level\.frame\.cell, scr\.frame\.px/);
});

test("a producer that does not build stops with its own diagnostics, and its layer is not judged", () => {
  const level = /** @type {any} */ (drawnMaze()("level")).grid(GRID); // no .control: B005
  const scr = /** @type {any} */ (screen()("scr")).size({ width: 40, height: 32 });
  const ds = compose("layer-test").part(level).part(scr).frame(level.frame.cell, scr.frame.px, { scale: 8, offset: 4 }).show(layer("top", scr.out.view, level.out.view)).check();
  assert.deepEqual(codes(ds), ["B005"]);
  assert.match(errors(ds)[0].message, /^part 'level'/);
});

test("S115: a loop through a layer names only wires that can be delayed", () => {
  const { level, scr, c } = parts();
  const top = layer("top", scr.out.view, level.out.view);
  const ds = errors(c.wire(top.out.view, scr.in.board).show(scr).check());
  // the layer's max (69) is over the board's 64 too
  assert.deepEqual(ds.map((d) => d.code).sort(), ["S115", "S204"]);
  const loop = /** @type {any} */ (ds.find((d) => d.code === "S115"));
  assert.match(loop.fix, /\.wire\(top\.out\.view, scr\.in\.board, \{ delay: true \}\)/);
  assert.doesNotMatch(loop.fix, /top\.in\./);
});

test("the S4 codes include S404, and layer is exported beside page", () => {
  assert.ok(Object.hasOwn(COMPOSE_CODES, "S404"));
  assert.equal(typeof layer, "function");
});

test(".show() with no argument reads as that call, not as a layer of zero outputs", () => {
  const { scr } = parts();
  const s102 = compose("x").part(scr).show().check().find((d) => d.code === "S102");
  assert.ok(s102);
  assert.match(s102.message, /^\.show\(\): /);
  assert.doesNotMatch(s102.message, /0 outputs/);
  assert.match(compose("x").part(scr).show(scr.out.view, scr.out.view).check().find((d) => d.code === "S102")?.message ?? "", /^\.show\(2 outputs\)/, "a call with outputs still says how many");
});
