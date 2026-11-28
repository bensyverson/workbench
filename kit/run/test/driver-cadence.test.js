// @ts-nocheck: handles and builder chains are generated, which TypeScript cannot see.
// The driver keeps its frame cadence across run.inputNow (issue jLEeBY, reviewer-84). inputNow stamps at the first
// millisecond after run.T when an instant already ran there, which in a framed run is every frame, and moves the run
// there; the driver read every move of run.T as a host's jump and reset its place to it, so a preview each frame added
// 1 ms a frame (120 frames of 1/60 ended at T = 2.159). Only a real jump (runUntil, advance, step, a rewind) resets it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRun, createDriver, replay } from "../index.js";
import { compose } from "../../compose/index.js";
import { tiny, ticker } from "./helpers.js";

/** A frame part `fp` with a param v, optionally beside a 1/8 s ticker. @param {boolean} [tick] */
function scene(tick = false) {
  const fp = tiny("fp", { state: { k: "f64" }, inputs: false, ports: { out: {}, in: {} } }, { clock: () => ({ frame: true }), init: () => ({ k: 0 }), step: (s) => ({ k: s.k + 1 }) });
  const tk = ticker("tk", { tick: 1 / 8 });
  const runtimes = tick ? [fp.runtime, tk.runtime] : [fp.runtime];
  let c = compose("c").part(fp.grammar("fp").param("v", { value: 1 }));
  if (tick) c = c.part(tk.part);
  const composed = c.build({ runtimes });
  const run = createRun(composed, { runtimes, frames: "display", dev: false });
  return { composed, runtimes, run, driver: createDriver(run) };
}

/** @param {any} run @param {number} i */
const preview = (run, i) => run.inputNow({ kind: "param", part: "fp", name: "v", value: 1 + (i % 5) });

for (const tick of [false, true]) {
  test(`a preview each frame leaves live time at the frame cadence: 120 frames of 1/60 end at T = 2 (${tick ? "with" : "without"} a ticker)`, () => {
    const { run, driver, composed, runtimes } = scene(tick);
    for (let i = 0; i < 120; i++) { preview(run, i); driver.frame(1 / 60); }
    assert.ok(Math.abs(run.seconds - 2) <= 0.001, String(run.seconds));
    assert.equal(run.log.inputs.filter((e) => e.kind === "frame").length, 120);
    assert.deepEqual(replay(composed, { runtimes, dev: false }, run.record()).diagnostics, []);
  });
}

test("several previews between two frames still leave the cadence", () => {
  const { run, driver } = scene(true);
  for (let i = 0; i < 120; i++) { for (let k = 0; k < 4; k++) preview(run, i + k); driver.frame(1 / 60); }
  assert.ok(Math.abs(run.seconds - 2) <= 0.001, String(run.seconds));
});

// The driver learns of a jump at its next frame and counts from the run's T then, so a preview between the jump and
// that frame (stamped a millisecond past it when an instant ran there) moves that one frame by up to 1 ms.
const AFTER_JUMP = 1 / 60 + 0.0015;

test("a real jump after previews still resets the driver's place: a rewind, a runUntil", () => {
  const { run, driver } = scene();
  for (let i = 0; i < 120; i++) { preview(run, i); driver.frame(1 / 60); }
  run.rewind(1);
  preview(run, 0);
  driver.frame(1 / 60);
  assert.ok(run.seconds > 1 && run.seconds <= 1 + AFTER_JUMP, String(run.seconds));
  run.runUntil(5);
  preview(run, 1);
  driver.frame(1 / 60);
  assert.ok(run.seconds > 5 && run.seconds <= 5 + AFTER_JUMP, String(run.seconds));
});
