// The M1 differential run: every case, three seeds, 3000 frames (past 06's game over
// at tick 2399). Each lowerable lambda, swapped in alone and all at once, must leave
// the trace unchanged, and the runs must reach the arms the cases were chosen for.
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadDmg } from "../../dmg-oracle/load.js";
import { CASES, runCase } from "../differential.js";

const dmg = loadDmg();
const SEEDS = [7, 11, 23];
const FRAMES = 3000;

for (const c of CASES) {
  test(`${c.label}: emitted lambdas match the original over ${FRAMES} frames, seeds ${SEEDS.join(", ")}`, () => {
    for (const seed of SEEDS) {
      const r = runCase(dmg, c, { seed, frames: FRAMES });
      assert.deepEqual(r.skipped, [], "every lambda of 04-07 lowers");
      assert.deepEqual(r.mismatches, [], `${c.label} seed ${seed}`);
      if (c.preset === "06") assert.ok(r.coverage.overTicks > 0, "06's done fires");
      if (c.label.startsWith("04 linger 0")) assert.ok(r.coverage.wraps > 0, "ttl wraps");
    }
  });
}
