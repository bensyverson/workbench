// @ts-nocheck: the fixture Grammar is built at run time, so its builder chains are untyped.
// Data files reach runtimes (project/2026-11-27-controls-draft.md, ruling 5 on open question 5): a part's init and
// step get `ctx.files`, its package's decoded data files by the name the Dialect gives them (`files.<name>`), frozen,
// so a lens bench's runtime reads its glass catalog without a pick carrying every column. A part with none gets {}.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRun } from "../index.js";
import { compose } from "../../compose/index.js";
import { list } from "../../define/index.js";
import { tiny } from "./helpers.js";

const GLASSES = [{ name: "BK7", nd: 1.5168 }, { name: "F2", nd: 1.62 }];
const bench = () => tiny("lens", { state: { glasses: list("str", 8), nd: "f64", frozen: "bool" }, inputs: false, ports: {} }, {
  clock: () => ({ tick: 1 / 4 }),
  init: (_r, ctx) => ({ glasses: ctx.files.glasses.map((g) => g.name), nd: 0, frozen: Object.isFrozen(ctx.files.glasses[0]) }),
  step: (s, ctx) => ({ ...s, nd: ctx.files.glasses[1].nd }),
});

test("ctx.files gives init and step the package's data files by name, frozen; a part with none gets {}", () => {
  const t = bench();
  const composed = compose("bench").part(t.grammar("b")).build({ runtimes: [t.runtime] });
  const packages = [{ name: "lens", content: null, data: { "data/glasses.json": { path: "data/glasses.json", kind: "json", from: "files.glasses", value: GLASSES }, "art/sheet.png": { path: "art/sheet.png", kind: "image", from: "images.sheet" } } }];
  const run = createRun(composed, { runtimes: [t.runtime], packages });
  run.runUntil(0.5);
  assert.deepEqual(run.diagnostics, []);
  assert.deepEqual(run.state("b").glasses, ["BK7", "F2"]);
  assert.equal(run.state("b").nd, 1.62);
  assert.equal(run.state("b").frozen, true);
  const bare = tiny("lens", { state: { n: "f64" }, inputs: false, ports: {} }, { clock: () => ({ tick: 1 / 4 }), init: (_r, ctx) => ({ n: Object.keys(ctx.files).length }), step: (s) => s });
  const r2 = createRun(compose("bench").part(bare.grammar("b")).build({ runtimes: [bare.runtime] }), { runtimes: [bare.runtime] });
  r2.runUntil(0.3);
  assert.equal(r2.state("b").n, 0);
});
