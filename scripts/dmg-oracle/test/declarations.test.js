// Reading a built DMG spec's declarations: the dialect's input.
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadDmg } from "../load.js";
import { declarationsOf } from "../declarations.js";

const dmg = loadDmg();

test("preset 06: world attributes from fragments, an alias, a board on a grid, methods", () => {
  const d = declarationsOf(dmg.build("06").spec);
  assert.equal(d.game, "fragments");
  assert.deepEqual(d.world, { attrs: { score: { type: "u16", max: 9999 }, secs: { type: "u8" } }, methods: ["award"] });
  assert.deepEqual(d.comps.Mole, { attrs: { up: { type: "bool" }, ttl: { type: "u8" } }, baked: {}, methods: ["whack"], sprites: ["up"], count: 9 });
  assert.deepEqual(d.comps.Hammer.count, 1);
  assert.deepEqual(d.aliases, { hammer: "Hammer" });
  assert.deepEqual(d.board, { comp: "Mole", size: 9 });
  assert.deepEqual(d.grid, { rows: 3, cols: 3 });
  assert.deepEqual(d.pools, {});
});

test("preset 05: baked constants typed by value; preset 04: params by kind", () => {
  assert.deepEqual(declarationsOf(dmg.build("05").spec).comps.Mole.baked, { stay: "f64", delay: "f64" });
  assert.deepEqual(declarationsOf(dmg.build("04").spec).params, {
    spawn: { kind: "slider", live: true },
    linger: { kind: "slider", live: false },
    order: { kind: "choice", live: true, options: ["random", "sweep"] },
    sound: { kind: "toggle", live: true },
  });
});

test("preset 07: a pool with its component and size, sounds", () => {
  const d = declarationsOf(dmg.build("07").spec);
  assert.deepEqual(d.pools, { sparks: { comp: "Spark", size: 24 } });
  assert.deepEqual(d.comps.Spark.count, 24);
  assert.deepEqual(d.sfx, ["fizz"]);
  assert.equal(d.board, null);
  assert.equal(d.grid, null);
});
