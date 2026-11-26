// A Draw list crossing two scaling wires in a row: an op that came from an upstream part still carries its image's
// name, so the second wire sizes it from that part's declaration, not only from the producer's own images.

import { test } from "node:test";
import assert from "node:assert/strict";
import { defineRuntime } from "../../define/index.js";
import { compose } from "../../compose/index.js";
import { createRun, pageView } from "../index.js";
import { drawnMaze, screen, GRID } from "../../draw/fixtures/draw-dialects.js";
import { mazeStep } from "./helpers.js";

test("an image or tiles op spread through a middle part is sized by the next scaling wire", () => {
  const mg = drawnMaze((/** @type {any} */ d) => {
    d.ports.out.view.max = 8;
    d.ports.out.view.layers = [
      { from: (/** @type {any} */ s) => ({ op: "tiles", at: [0, 0], image: "sheet", grid: s.grid, key: { "#": 0, ".": 1, c: 1 } }) },
      { from: () => ({ op: "image", at: [0, 0], image: "sheet", cell: 0 }) },
    ];
  });
  const sg = screen((/** @type {any} */ d) => { d.ports.in.board.seam = "Draw<80>@px"; d.ports.out.view.max = 70; });
  const runtimes = [
    defineRuntime(mg, { clock: () => ({ tick: 1 / 8 }), init: (/** @type {any} */ r) => ({ t: 0, score: 0, player: { x: 1, y: 1 }, home: [1, 1], grid: r.grid, coins: [] }), step: (/** @type {any} */ s, /** @type {any} */ ctx) => ({ ...mazeStep(s, ctx), coins: [] }), events: { out: { picked: 8 } } }),
    defineRuntime(sg, { clock: () => ({ tick: 1 / 8 }), init: () => ({ t: 0 }), step: (/** @type {any} */ s, /** @type {any} */ ctx) => ({ t: s.t + ctx.dt }) }),
  ];
  const level = /** @type {any} */ (mg("level")).grid(GRID).control("(pl, pad) => { pl.dx = 1; }");
  const a = /** @type {any} */ (sg("a")).size({ width: 40, height: 24 });
  const b = /** @type {any} */ (sg("b")).size({ width: 80, height: 48 });
  const composed = compose("chain").part(level).part(a).part(b)
    .frame(level.frame.cell, a.frame.px, { scale: 1, offset: 0 })
    .frame(a.frame.px, b.frame.px, { scale: 2, offset: 0 })
    .wire(level.out.view, a.in.board).wire(a.out.view, b.in.board).show(b).build();
  const run = createRun(composed, { runtimes });
  run.runUntil(0.5);
  const v = pageView(run, composed, runtimes);
  const tiles = v.list.find((o) => o.op === "tiles"), image = v.list.find((o) => o.op === "image");
  assert.deepEqual(tiles?.size, [16, 16]);
  assert.deepEqual(image?.size, [16, 16]);
  assert.deepEqual(run.diagnostics.filter((d) => d.severity === "error"), []);
});
