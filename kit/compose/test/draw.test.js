// Draw wires at composition (the draw-list draft, as ruled 2026-11-26): a Draw output feeds a Draw input through
// the frame graph as one `draw` conversion; its max is the built Program's (ruling 1), so a wire is judged on what
// this Program can draw; a renderer profile judges the shown list's op kinds (S401, ruling 2), followed through
// the Draw inputs its builder spreads; and the shown part's Draw output is the page's (S402 when it is unclear).

import { test } from "node:test";
import assert from "node:assert/strict";
import { compose, COMPOSE_CODES } from "../index.js";
import { GAMEBOY, CANVAS } from "../../draw/index.js";
import { drawnMaze, screen, GRID, steer } from "../../draw/fixtures/draw-dialects.js";

/** @param {{ maze?: (d: any) => void, screen?: (d: any) => void }} [change] */
function glue(change = {}) {
  const level = /** @type {any} */ (drawnMaze(change.maze)("level")).grid(GRID).control(steer);
  const scr = /** @type {any} */ (screen(change.screen)("scr")).size({ width: 40, height: 32 });
  return compose("draw-test")
    .part(level).part(scr)
    .frame(level.frame.cell, scr.frame.px, { scale: 8, offset: 4 })
    .wire(level.out.view, scr.in.board)
    .wire(level.out.score, scr.in.score)
    .show(scr);
}
/** @param {any[]} ds */
const errors = (ds) => ds.filter((d) => d.severity === "error");

test("a Draw wire plans one draw conversion along the frame path, and the page shows view", () => {
  const c = glue();
  assert.deepEqual(errors(c.check()), []);
  const rec = /** @type {any} */ (c.build());
  const w = rec.wires.find((/** @type {any} */ x) => x.to === "scr.in.board");
  assert.deepEqual(w.convert, [{ field: "", kind: "draw", from: "maze.cell", to: "screen.px", scale: [8, 8], offset: [4, 4] }]);
  assert.equal(rec.view, "view");
  assert.match(c.plan().join("\n"), /level\.out\.view → scr\.in\.board: \(value\): maze\.cell → screen\.px, draw, ×8 \+4/);
});

test("a Draw wire is judged on the built Program's max, not the seam's ceiling", () => {
  // the maze's max(record) is 1 + its 3 rows: 4 ops fit an input of 4, and not one of 3
  assert.deepEqual(errors(glue({ screen: (d) => { d.ports.in.board.seam = "Draw<4>@px"; } }).check()), []);
  const ds = errors(glue({ screen: (d) => { d.ports.in.board.seam = "Draw<3>@px"; } }).check());
  assert.deepEqual(ds.map((d) => d.code), ["S204"]);
  assert.match(ds[0].message, /up to 4 ops and the input takes at most 3/);
  assert.equal(ds[0].from.seam, "Draw<4>@cell");
});

test("a profile judges the shown list's kinds at composition, through the inputs it spreads (S401)", () => {
  assert.deepEqual(errors(glue().check({ profile: CANVAS })), []);
  const ds = errors(glue().check({ profile: GAMEBOY }));
  assert.deepEqual(ds.map((d) => d.code), ["S401"]);
  assert.match(ds[0].message, /the Game Boy \(DMG\) draws image, tiles, text; scr\.out\.view can hold ellipse, from level\.out\.view/);
  assert.equal(ds[0].from.port, "out.view");
  assert.equal(ds[0].from.part, "level");
  assert.equal(ds[0].to.part, "scr");
  // by name, too
  assert.deepEqual(errors(glue().check({ profile: "gameboy" })).map((d) => d.code), ["S401"]);
  assert.deepEqual(errors(glue().check({ profile: "vectrex" })).map((d) => d.code), ["S403"]);
  // a kind the kit cannot see is left to draw time (an op returned through a local; a builder is Bench code, so a
  // spread into an object, as this case was written before builders were lowered, is S109 at defineDialect)
  const open = glue({ maze: (d) => { d.ports.out.view.layers[1].from = (/** @type {any} */ c) => { const o = { op: "ellipse", at: [c.x, c.y], r: [1, 1] }; return o; }; } });
  assert.deepEqual(errors(open.check({ profile: GAMEBOY })), []);
  // but a builder that is open does not hide the kinds the kit can see: a rect beside it is still S401
  const hidden = glue({ maze: (d) => {
    d.ports.out.view.layers[0].from = () => ({ op: "rect", at: [0, 0], size: [1, 1] });
    d.ports.out.view.layers[1].from = (/** @type {any} */ c) => { const o = { op: "image", at: [c.x, c.y], image: "sheet", cell: 0 }; return o; };
  } });
  const seen = errors(hidden.check({ profile: GAMEBOY }));
  assert.deepEqual(seen.map((d) => d.code), ["S401"]);
  assert.match(seen[0].message, /can hold rect, from level\.out\.view/);
  // a Game Boy-shaped maze passes
  const gb = glue({ maze: (d) => { d.ports.out.view.layers[1].from = (/** @type {any} */ c) => ({ op: "image", at: [c.x, c.y], image: "sheet", cell: 0 }); } });
  assert.deepEqual(errors(gb.check({ profile: GAMEBOY })), []);
});

test("the composed record keeps the profile build was given, resolved from its name, so the page reads it there", () => {
  const gb = glue({ maze: (d) => { d.ports.out.view.layers[1].from = (/** @type {any} */ c) => ({ op: "image", at: [c.x, c.y], image: "sheet", cell: 0 }); } });
  assert.equal(/** @type {any} */ (gb.build({ profile: "gameboy" })).profile, GAMEBOY);
  assert.equal(/** @type {any} */ (gb.build({ profile: GAMEBOY })).profile, GAMEBOY);
  assert.equal(/** @type {any} */ (glue().build({ profile: CANVAS })).profile, CANVAS);
  // a composition given no profile has none on its record
  assert.equal(Object.hasOwn(/** @type {any} */ (glue().build()), "profile"), false);
});

test("a shown part with several Draw outputs shows the one named view, and none named view is S402", () => {
  const two = glue({ screen: (d) => { d.ports.out.mini = { seam: "Draw<4>@px", note: "a thumbnail", from: () => null }; } });
  assert.equal(/** @type {any} */ (two.build()).view, "view");
  const ds = errors(glue({ screen: (d) => { d.ports.out.big = d.ports.out.view; delete d.ports.out.view; d.ports.out.mini = { seam: "Draw<4>@px", note: "a thumbnail", from: () => null }; } }).check());
  assert.deepEqual(ds.map((d) => d.code), ["S402"]);
  assert.match(ds[0].message, /scr has two Draw outputs, big and mini, and none is named view/);
});

test("every S4 code has a case above", () => {
  const covered = ["S401", "S402", "S403"];
  assert.deepEqual(Object.keys(COMPOSE_CODES).filter((c) => c.startsWith("S4")), covered);
});
