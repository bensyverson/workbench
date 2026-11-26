// A display frame's cost does not grow with the run's length: the driver and the scheduler find frames by binary
// search and keep a slowdown's N001 as it goes, so frame 40,000 costs what frame 1,000 did (leaf 0aVPIi, L4).
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRun, createDriver } from "../index.js";
import { pair } from "../test/helpers.js";

test("frames 39,000 to 40,000 cost about what frames 0 to 1,000 did", () => {
  const { composed, runtimes } = pair({ prodClock: { tick: 1 / 30 }, consClock: { frame: true }, per: 1, max: 8, consStep: (/** @type {any} */ s) => s });
  const run = createRun(composed, { runtimes, frames: "display", dev: false });
  const driver = createDriver(run);
  const batch = () => { const t0 = performance.now(); for (let i = 0; i < 1000; i++) driver.frame(1 / 60); return performance.now() - t0; };
  batch(); // warm up
  const early = Math.min(batch(), batch());
  for (let i = 0; i < 36; i++) batch();
  const late = Math.min(batch(), batch());
  assert.ok(late < early * 3 + 2, `early ${early.toFixed(1)} ms, late ${late.toFixed(1)} ms per 1,000 frames`);
});
