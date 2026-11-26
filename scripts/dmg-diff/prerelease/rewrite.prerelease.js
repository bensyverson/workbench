// Every rewritten preset (scripts/dmg-oracle/presets.json) against its archived original on the original runtime:
// three seeds, 1200 frames, each case that reaches a rewritten arm. The traces must be identical.
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadDmg, originalPresets } from "../../dmg-oracle/load.js";
import { compareRewrites } from "../rewrite-check.js";

test("every rewritten preset's trace matches its original's, seeds 7, 11, 23 over 1200 frames", () => {
  const frames = 1200;
  const { changed, runs } = compareRewrites(loadDmg(), originalPresets(), { seeds: [7, 11, 23], frames });
  assert.ok(changed.length > 0);
  assert.deepEqual(runs.filter((r) => r.diff || r.ticks < frames), []);
});
