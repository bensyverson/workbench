// The differential run: for one DMG program, swap each lowerable runtime lambda for
// its emitted JS, alone and then all at once, and compare seeded traces with the
// original's. A case names the program, its live params and its build-time overrides.

import { swapLambda } from "../dmg-oracle/lambdas.js";
import { runTrace, firstDifference } from "../dmg-oracle/trace.js";
import { inputTrace } from "../dmg-oracle/inputs.js";
import { lowerPreset, emitEntry } from "../dmg-lower/pipeline.js";

/** @import { loadDmg } from "../dmg-oracle/load.js" */
/** @import { DmgBuild } from "../dmg-oracle/dmg.js" */
/** @import { Trace } from "../dmg-oracle/trace.js" */

/**
 * @typedef {object} DiffCase
 * @property {string} label   e.g. `04 sweep`.
 * @property {string} preset
 * @property {string} why     What this case exercises that the default does not.
 * @property {Record<string, unknown>} [params]     Live params, applied before tick 0.
 * @property {Record<string, unknown>} [overrides]  Build-time params, as the DMG's DSL.run takes them.
 * @property {[string, string]} [edit]  A textual edit of the preset's source: a test program derived from it, not the preset.
 */

/**
 * @typedef {object} Coverage
 * @property {number} overTicks  Ticks on which the game was over.
 * @property {number} wraps      Host warnings that a stored integer wrapped.
 * @property {number} rng        RNG draws in the whole run.
 */

/**
 * @typedef {object} DiffResult
 * @property {string} label
 * @property {number} seed
 * @property {number} frames
 * @property {string[]} swapped   Slot ids swapped in (each alone, then all together).
 * @property {string[]} skipped   Slot ids that did not lower.
 * @property {Array<{ slot: string, diff: ReturnType<typeof firstDifference> }>} mismatches  `slot` is `*` for all at once.
 * @property {Coverage} coverage  Of the original run.
 */

/**
 * The cases M1's report runs: each preset's default, plus params and edits that reach arms the default never takes.
 * @type {DiffCase[]}
 */
export const CASES = [
  { label: "04 default", preset: "04", why: "random order, spawn every 600 ms" },
  { label: "04 sweep", preset: "04", params: { order: "sweep" }, why: "timer(spawn)'s sweep arm, w.board.at(w.next)" },
  { label: "04 fast, silent", preset: "04", params: { spawn: 150, sound: false }, why: "a full board, so w.rng.pick gets an empty list and the timer returns early; the sound toggle off" },
  { label: "04 linger 0 (edited)", preset: "04", edit: ["min: 0.5, max: 6, step: 0.5, value: 2,", "min: 0, max: 6, step: 0.5, value: 0,"], why: "ttl 0 on a mole that is up, so --self.ttl stores 65535 (the u16 wrap) while the compare sees -1; unreachable in the shipped preset, whose slider minimum is 0.5" },
  { label: "05 default", preset: "05", why: "methods, bake, a staggered pop" },
  { label: "05 linger 2.5", preset: "05", overrides: { linger: 2.5 }, why: "a longer stay, so more moles are up at once" },
  { label: "06 default", preset: "06", why: "fragments, events, input; done fires at tick 2399" },
  { label: "07 default", preset: "07", why: "pools, spawn and destroy, fixed point" },
  { label: "07 burst 6, gravity 0.4", preset: "07", params: { burst: 6, gravity: 0.4 }, why: "a full pool (spawn returns null, the loop breaks) and fast falls past y 144" },
  { label: "07 burst 1, gravity 0", preset: "07", params: { burst: 1, gravity: 0 }, why: "sparks that die of old age, not by falling" },
];

/**
 * A function that makes fresh builds of the case's program.
 * @param {ReturnType<typeof loadDmg>} dmg
 * @param {DiffCase} c
 * @returns {() => DmgBuild}
 */
export function builder(dmg, c) {
  let code = dmg.preset(c.preset).code;
  if (c.edit) {
    if (!code.includes(c.edit[0])) throw new Error(`${c.label}: the edit's text is not in preset ${c.preset}`);
    code = code.replace(c.edit[0], c.edit[1]);
  }
  return () => {
    const r = dmg.DSL.run(code, c.overrides ? { overrides: c.overrides } : undefined);
    if (!r.build) throw new Error(`${c.label}: build failed: ${r.error?.message ?? "no build"}`);
    return r.build;
  };
}

/**
 * What the original run reached, so a match can be read against what was exercised.
 * @param {Trace} t
 * @returns {Coverage}
 */
export function coverage(t) {
  let overTicks = 0, wraps = 0, rng = 0;
  for (const k of t.ticks) {
    if (k.over) overTicks++;
    rng += k.rng;
    for (const l of k.log) if (l.t === "warn" && /wrapped/.test(JSON.stringify(l))) wraps++;
  }
  return { overTicks, wraps, rng };
}

/**
 * Runs one case on one seed.
 * @param {ReturnType<typeof loadDmg>} dmg
 * @param {DiffCase} c
 * @param {{ seed: number, frames: number }} run
 * @returns {DiffResult}
 */
export function runCase(dmg, c, { seed, frames }) {
  const make = builder(dmg, c);
  const { entries } = lowerPreset({ build: make }, c.preset);
  /** @type {Map<string, typeof entries>} */
  const bySlot = new Map();
  for (const e of entries) bySlot.set(e.slot.id, [...(bySlot.get(e.slot.id) ?? []), e]);
  /** @type {Array<{ id: string, fn: (...a: any[]) => unknown }>} */
  const fns = [];
  /** @type {string[]} */
  const skipped = [];
  for (const [id, group] of bySlot) {
    if (group.every((e) => e.result.kernel)) fns.push({ id, fn: emitEntry(group[0]).fn });
    else skipped.push(id);
  }
  const opts = { seed, frames, input: inputTrace(seed, frames), ...(c.params ? { params: c.params } : {}) };
  const original = runTrace(make(), opts);
  /** @param {Array<{ id: string, fn: (...a: any[]) => unknown }>} swaps */
  const compare = (swaps) => {
    const b = make();
    for (const s of swaps) swapLambda(b.spec, s.id, s.fn);
    return firstDifference(original, runTrace(b, opts));
  };
  /** @type {DiffResult["mismatches"]} */
  const mismatches = [];
  for (const f of fns) {
    const diff = compare([f]);
    if (diff) mismatches.push({ slot: f.id, diff });
  }
  const all = compare(fns);
  if (all) mismatches.push({ slot: "*", diff: all });
  return { label: c.label, seed, frames, swapped: fns.map((f) => f.id), skipped, mismatches, coverage: coverage(original) };
}
