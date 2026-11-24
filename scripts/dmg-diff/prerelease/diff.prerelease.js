// The M1 differential run: every case, three seeds, 3000 frames (past 06's game over
// at tick 2399). Each lowerable lambda, swapped in alone and all at once, must leave
// the trace unchanged, and the runs must reach the arms the cases were chosen for.
// Then every preset's default, on two seeds, against the survey's lowered count.
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadDmg } from "../../dmg-oracle/load.js";
import { CASES, runCase, allPresetCases } from "../differential.js";
import { survey } from "../survey.js";

const dmg = loadDmg();
const SEEDS = [7, 11, 23];
const FRAMES = 3000;

for (const c of CASES) {
  test(`${c.label}: emitted lambdas match the original over ${FRAMES} frames, seeds ${SEEDS.join(", ")}`, () => {
    for (const seed of SEEDS) {
      const r = runCase(dmg, c, { seed, frames: FRAMES });
      assert.deepEqual(r.skipped, [], "every lambda of 04-07 lowers");
      assert.equal(r.error, null, `${c.label} seed ${seed}: the original stopped`);
      assert.equal(r.ticks, FRAMES, `${c.label} seed ${seed}: the original ran short`);
      assert.deepEqual(r.mismatches, [], `${c.label} seed ${seed}`);
      if (c.preset === "06") assert.ok(r.coverage.overTicks > 0, "06's done fires");
      if (c.label.startsWith("04 linger 0")) assert.ok(r.coverage.wraps > 0, "ttl wraps");
    }
  });
}

test("every lowered lambda of every preset, swapped in alone and all at once, matches on seeds 7 and 11 over 1200 frames", () => {
  const frames = 1200;
  /** @type {Map<string, number>} */
  const swapped = new Map();
  for (const c of allPresetCases(dmg)) {
    for (const seed of [7, 11]) {
      const r = runCase(dmg, c, { seed, frames });
      assert.equal(r.error, null, `${c.label} seed ${seed}: the original stopped`);
      assert.equal(r.ticks, frames, `${c.label} seed ${seed}: the original ran short`);
      assert.deepEqual(r.mismatches, [], `${c.label} seed ${seed}`);
      swapped.set(c.label, r.swapped.length);
    }
  }
  const lowered = survey(dmg).filter((r) => r.status === "lowered").length;
  assert.equal([...swapped.values()].reduce((a, b) => a + b, 0), lowered, "the swapped lambdas are the survey's lowered ones");
  assert.equal(lowered, 109);
});
