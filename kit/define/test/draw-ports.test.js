// Draw ports in a Dialect (the draw-list draft, as ruled 2026-11-26): a Draw output declares its builder and the
// kit reads its layers and op kinds; a Draw input takes no default and reads as an empty list unwired; colors and
// images are Dialect keys; each is judged at defineDialect (J001–J003), and a Program's max at lower (J010).

import { test } from "node:test";
import assert from "node:assert/strict";
import { defineDialect, DefinitionError, list, struct } from "../index.js";
import { mazeDecl, mazeGrammar, GRID } from "../fixtures/seams-dialects.js";

const steer = "(pl, pad) => { pl.dx = pad.left ? -1 : 0; }";

/** The fixture maze with a picture: walls as tiles of a sheet, one disc per coin. */
function drawnMaze() {
  const d = /** @type {Record<string, any>} */ (mazeDecl());
  d.state.coins = list(struct({ x: "f64", y: "f64" }), 16);
  d.colors = { coin: "#ffd23f" };
  d.images = { sheet: { size: [16, 8], cell: [8, 8], note: "a wall, then the floor" } };
  d.ports.out.view = {
    seam: "Draw<64>@cell", note: "the maze after this tick, one unit a cell",
    max: (/** @type {any} */ record) => 1 + record.grid.length,
    layers: [
      { from: (/** @type {any} */ s) => ({ op: "tiles", at: [-0.5, -0.5], image: "sheet", grid: s.grid, key: { "#": 0, ".": 1, c: 1 }, size: [1, 1] }) },
      { each: "coins", from: (/** @type {any} */ c) => ({ op: "ellipse", at: [c.x, c.y], r: [0.25, 0.25], fill: "coin" }) },
    ],
  };
  return d;
}
/** @param {Record<string, any>} d */
const diagnosticsOf = (d) => {
  try { defineDialect(/** @type {any} */ (d)); } catch (e) {
    assert.ok(e instanceof DefinitionError, String(e));
    return /** @type {any[]} */ (e.diagnostics);
  }
  return [];
};

test("a Draw output defines clean and carries its builder, kinds, colors and images", () => {
  const m = /** @type {any} */ (defineDialect(/** @type {any} */ (drawnMaze())));
  const v = m.seams.out.view;
  assert.equal(v.seamText, "Draw<64>@cell");
  assert.equal(v.from, undefined);
  assert.deepEqual(v.draw.layers.map((/** @type {any} */ l) => l.kind), ["whole", "each"]);
  assert.deepEqual(v.draw.kinds, { ops: ["tiles", "ellipse"], inputs: [], open: false });
  assert.deepEqual(m.seams.colors, { coin: "#ffd23f" });
  assert.deepEqual(Object.keys(m.seams.images), ["sheet"]);
});

test("a malformed Draw port, a call of map or bad paint is refused at defineDialect", () => {
  const codes = (/** @type {(d: any) => void} */ f) => { const d = drawnMaze(); f(d); return diagnosticsOf(d).map((x) => x.code); };
  assert.deepEqual(codes((d) => { d.ports.out.view.pen = () => {}; }), ["J001"]);
  assert.deepEqual(codes((d) => { d.ports.out.view.layers[1].each = "score"; }), ["J001"]);
  assert.deepEqual(codes((d) => { d.ports.out.view.seam = "Draw<64>@nowhere"; }), ["D025"]);
  assert.deepEqual(codes((d) => { d.frames.line = { dims: 1, note: "one axis" }; d.ports.out.view.seam = "Draw<64>@line"; }), ["J001"]);
  assert.deepEqual(codes((d) => { d.ports.out.view.layers[0].from = (/** @type {any} */ s) => s.grid.map(() => null); }), ["J002"]);
  assert.deepEqual(codes((d) => { d.colors.coin = "gold"; }), ["J003"]);
  assert.deepEqual(codes((d) => { d.images.sheet.cell = [3, 8]; }), ["J003"]);
  assert.deepEqual(codes((d) => { d.ports.out.view.size = 2; }), ["D024"]);
  // an Event output and a value output are judged as before
  assert.deepEqual(codes((d) => { d.ports.out.score.each = "coins"; }), ["D024"]);
});

test("a Draw input reads as an empty list unwired and takes no default, required, delivery or record", () => {
  const d = drawnMaze();
  d.objects.In = { label: "the inputs (inp)", members: {} };
  d.globals.inp = "In";
  d.inputs = { object: "In", name: "inp" };
  d.ports.in = { under: { seam: "Draw<8>@cell", note: "a picture drawn under the maze" } };
  const m = /** @type {any} */ (defineDialect(/** @type {any} */ (d)));
  assert.deepEqual(m.seams.in.under.default, []);
  assert.equal(m.seams.in.under.required, false);
  d.ports.in.under.default = [];
  assert.deepEqual(diagnosticsOf(d).map((x) => x.code), ["J001"]);
  delete d.ports.in.under.default;
  d.ports.in.under.required = true;
  assert.match(diagnosticsOf(d)[0].message, /a Draw input takes no default or required: unwired, it is an empty list/);
});

test("a Program's max comes from max(record) when it lowers, and one past the ceiling is J010", () => {
  const lower = (/** @type {(d: any) => void} */ f) => {
    const d = drawnMaze();
    f(d);
    const g = mazeGrammar(defineDialect(/** @type {any} */ (d)));
    return /** @type {any} */ (g.lower(/** @type {any} */ (g("level")).grid(GRID).control(steer).build()));
  };
  const ok = lower(() => {});
  assert.deepEqual(ok.diagnostics.filter((/** @type {any} */ x) => x.severity === "error"), []);
  assert.deepEqual(ok.seams.draws, { view: { max: 4 } });
  const over = lower((d) => { d.ports.out.view.max = () => 65; });
  const j = over.diagnostics.filter((/** @type {any} */ x) => x.code === "J010");
  assert.equal(j.length, 1);
  assert.equal(j[0].port, "view");
  assert.match(j[0].message, /output 'view'.*65 ops for this Program, past the seam's ceiling \(Draw<64>\)/);
});
