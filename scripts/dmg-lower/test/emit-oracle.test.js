// A quick check per lambda: swap each emitted function for presets 04–07 into a fresh
// build, one at a time, and compare a seeded run with the original's. The full
// differential run (several seeds, long runs, every lambda at once) is the report leaf's.
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadDmg } from "../../dmg-oracle/load.js";
import { swapLambda, lambdaSlots } from "../../dmg-oracle/lambdas.js";
import { runTrace, firstDifference } from "../../dmg-oracle/trace.js";
import { inputTrace } from "../../dmg-oracle/inputs.js";
import { lowerPreset, emitEntry } from "../pipeline.js";

const dmg = loadDmg();
const SEED = 7;
const FRAMES = 600;

for (const id of ["04", "05", "06", "07"]) {
  test(`preset ${id}: each emitted lambda, swapped in alone, leaves the trace unchanged`, () => {
    const input = inputTrace(SEED, FRAMES);
    const original = runTrace(dmg.build(id), { seed: SEED, frames: FRAMES, input });
    assert.equal(original.ticks.length, FRAMES);
    const seen = new Set();
    for (const e of lowerPreset(dmg, id).entries) {
      if (seen.has(e.slot.id)) continue;
      seen.add(e.slot.id);
      const { emitted, fn } = emitEntry(e);
      assert.equal(emitted.lines.length, emitted.source.split("\n").length, `${e.slot.id}: one map entry per line`);
      for (const m of emitted.lines) assert.ok(m.span[0] >= 0 && m.span[0] < m.span[1] && m.span[1] <= e.slot.src.length, `${e.slot.id}: span ${m.span}`);
      const build = dmg.build(id);
      swapLambda(build.spec, e.slot.id, fn);
      assert.equal(lambdaSlots(build.spec).find((s) => s.id === e.slot.id)?.src, String(fn), `${e.slot.id} is swapped`);
      const swapped = runTrace(build, { seed: SEED, frames: FRAMES, input });
      assert.equal(firstDifference(original, swapped), null, `${id} ${e.slot.id}\n${emitted.source}`);
    }
  });
}
