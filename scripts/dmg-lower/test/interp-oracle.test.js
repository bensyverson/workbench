// The reference interpreter against the DMG runtime: swap each lambda of presets 04-07, run by
// the interpreter instead of the original closure or the emitted JS, and compare a seeded run
// with the original's. The DMG host's own proxies coerce every store and log its warnings, so
// the interpreter hands them the raw value (`host.store`), as the JS backend does.
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadDmg } from "../../dmg-oracle/load.js";
import { swapLambda } from "../../dmg-oracle/lambdas.js";
import { runTrace, firstDifference } from "../../dmg-oracle/trace.js";
import { inputTrace } from "../../dmg-oracle/inputs.js";
import { lowerPreset } from "../pipeline.js";
import { run } from "../../../kit/interp/index.js";

/** @import { Kernel } from "../../../kit/ir/ir.js" */
/** @import { RunEnv } from "../../../kit/interp/interp.js" */

const dmg = loadDmg();
const SEED = 7;
const FRAMES = 600;

/**
 * The interpreter as a lambda: what the runtime calls with its own arguments. `nudge` plants a
 * fault: every store writes that much more than the Kernel said.
 * @param {Kernel} kernel
 * @param {Record<string, Kernel>} helpers
 * @param {{ nudge?: number, calls?: { n: number } }} [o]
 * @returns {(...args: unknown[]) => unknown}
 */
function interpreted(kernel, helpers, { nudge = 0, calls = { n: 0 } } = {}) {
  /** @type {RunEnv} */
  const env = {
    helpers, globals: { Math },
    host: { store: (p, recv, value) => { /** @type {any} */ (recv)[p.name] = typeof value === "number" ? value + nudge : value; } },
  };
  return (...args) => { calls.n++; return run(kernel, args, env); };
}

/**
 * Preset `id`'s lambdas as interpreted functions by slot id, with the helpers they call.
 * @param {string} id
 * @param {{ nudge?: number, calls?: { n: number } }} [o]
 */
function interpretedLambdas(id, o) {
  const lowered = lowerPreset(dmg, id);
  /** @type {Record<string, Kernel>} */
  const helpers = {};
  for (const h of lowered.helpers) if (h.kind === "fn" && h.result.kernel) helpers[h.name] = h.result.kernel;
  /** @type {Map<string, (...args: unknown[]) => unknown>} */
  const fns = new Map();
  for (const e of lowered.entries) if (e.result.kernel && !fns.has(e.slot.id)) fns.set(e.slot.id, interpreted(e.result.kernel, helpers, o));
  return fns;
}

for (const id of ["04", "05", "06", "07"]) {
  test(`preset ${id}: each lambda run by the interpreter, swapped in alone, leaves the trace unchanged; so do all of them at once`, () => {
    const input = inputTrace(SEED, FRAMES);
    const original = runTrace(dmg.build(id), { seed: SEED, frames: FRAMES, input });
    assert.equal(original.ticks.length, FRAMES);
    const calls = { n: 0 };
    const fns = interpretedLambdas(id, { calls });
    assert.ok(fns.size > 0);
    for (const [slotId, fn] of fns) {
      const build = dmg.build(id);
      swapLambda(build.spec, slotId, fn);
      const swapped = runTrace(build, { seed: SEED, frames: FRAMES, input });
      assert.equal(firstDifference(original, swapped), null, `${id} ${slotId}`);
    }
    const all = dmg.build(id);
    for (const [slotId, fn] of fns) swapLambda(all.spec, slotId, fn);
    assert.equal(firstDifference(original, runTrace(all, { seed: SEED, frames: FRAMES, input })), null, `${id} all lambdas at once`);
    assert.ok(calls.n > FRAMES, `the interpreter ran ${calls.n} times: the swap took effect`);
  });
}

test("a planted fault is caught: the same swap, with every store off by one, changes the trace", () => {
  const input = inputTrace(SEED, FRAMES);
  const original = runTrace(dmg.build("04"), { seed: SEED, frames: FRAMES, input });
  const build = dmg.build("04");
  for (const [slotId, fn] of interpretedLambdas("04", { nudge: 1 })) swapLambda(build.spec, slotId, fn);
  assert.notEqual(firstDifference(original, runTrace(build, { seed: SEED, frames: FRAMES, input })), null);
});
