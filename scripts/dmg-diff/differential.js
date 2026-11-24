// The differential run: for one DMG program, swap each lowerable runtime lambda for
// its emitted JS, alone and then all at once, and compare seeded traces with the
// original's. A case names the program, its live params and its build-time overrides.

import { swapLambda } from "../dmg-oracle/lambdas.js";
import { runTrace, firstDifference, hash } from "../dmg-oracle/trace.js";
import { inputTrace } from "../dmg-oracle/inputs.js";
import { lowerPreset, emitEntry } from "../dmg-lower/pipeline.js";
import { instantiate } from "../../kit/emit/js/index.js";

/** @import { loadDmg } from "../dmg-oracle/load.js" */
/** @import { DmgBuild } from "../dmg-oracle/dmg.js" */
/** @import { Trace } from "../dmg-oracle/trace.js" */
/** @import { Entry } from "../dmg-lower/pipeline.js" */

/** @typedef {(slot: string, source: string) => string} SourceTransform */

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
 * @property {number} ticks   Ticks the original ran: fewer than `frames` when it stopped on a runtime error.
 * @property {string | null} error  The original's runtime error message, or null.
 * @property {string} fingerprint  Hash of the original trace: two runs with the same label and fingerprint are the same run.
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
    // The source stays with the build, as loadDmg's builds keep it, so lowering finds the program's top-level helpers.
    return Object.assign(r.build, { code });
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
 * Groups lowered entries by slot id: a fragment lambda run by several parts has one entry per part.
 * @param {Entry[]} entries
 * @returns {Map<string, Entry[]>}
 */
export function groupBySlot(entries) {
  /** @type {Map<string, Entry[]>} */
  const by = new Map();
  for (const e of entries) by.set(e.slot.id, [...(by.get(e.slot.id) ?? []), e]);
  return by;
}

/**
 * Emits one slot's lowered entries as a single function to swap in. `swapLambda`
 * replaces the slot's one function, so a fragment lambda whose parts emit different
 * code cannot be swapped faithfully; that throws rather than test only the first part.
 * @param {Entry[]} group  Entries of one slot, all lowered.
 * @param {SourceTransform} [transform]  Rewrites the emitted source before it is instantiated (planting a fault).
 * @returns {(...a: any[]) => unknown}
 */
export function emitGroup(group, transform) {
  const id = group[0].slot.id;
  const { emitted } = emitEntry(group[0]);
  for (const e of group.slice(1)) {
    if (emitEntry(e).emitted.source !== emitted.source) throw new Error(`${id}: the parts that run this fragment lambda emit different code, so one swapped function cannot stand for them all`);
  }
  return instantiate({ ...emitted, source: transform ? transform(id, emitted.source) : emitted.source }, group[0].scope());
}

/**
 * Emits every slot that lowered for all its parts; the rest are skipped.
 * @param {Entry[]} entries
 * @param {SourceTransform} [transform]
 * @returns {{ fns: Array<{ id: string, fn: (...a: any[]) => unknown }>, skipped: string[] }}
 */
export function emitSlots(entries, transform) {
  /** @type {Array<{ id: string, fn: (...a: any[]) => unknown }>} */
  const fns = [];
  /** @type {string[]} */
  const skipped = [];
  for (const [id, group] of groupBySlot(entries)) {
    if (group.every((e) => e.result.kernel)) fns.push({ id, fn: emitGroup(group, transform) });
    else skipped.push(id);
  }
  return { fns, skipped };
}

/**
 * One default case per preset that has runtime lambdas, for the survey's lowered count to be run against the originals.
 * @param {ReturnType<typeof loadDmg>} dmg
 * @returns {DiffCase[]}
 */
export function allPresetCases(dmg) {
  return dmg.presets.filter((p) => lowerPreset(dmg, p.id).entries.length > 0)
    .map((p) => ({ label: `${p.id} default`, preset: p.id, why: "the preset as shipped" }));
}

/**
 * Identifies a trace by content. The host's first log entry names the seed ("seed 7"),
 * which is the seed's label and not behavior, so it is blanked: two seeds that drive
 * the same game then hash alike.
 * @param {Trace} t
 * @param {number} seed
 */
export function fingerprint(t, seed) {
  return hash(new TextEncoder().encode(JSON.stringify(t).replaceAll(`"seed ${seed}"`, '"seed"')));
}

/**
 * A run fails when a swapped trace differs, or when the original stopped short of its frames (a match over a truncated run proves little).
 * @param {DiffResult} r
 */
export const failed = (r) => r.mismatches.length > 0 || r.ticks < r.frames;

/**
 * Runs one case on one seed.
 * @param {ReturnType<typeof loadDmg>} dmg
 * @param {DiffCase} c
 * @param {{ seed: number, frames: number, transform?: SourceTransform }} run
 * @returns {DiffResult}
 */
export function runCase(dmg, c, { seed, frames, transform }) {
  const make = builder(dmg, c);
  const { entries } = lowerPreset({ build: make }, c.preset);
  const { fns, skipped } = emitSlots(entries, transform);
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
  const last = original.ticks.at(-1);
  return {
    label: c.label, seed, frames, swapped: fns.map((f) => f.id), skipped, mismatches, coverage: coverage(original),
    ticks: original.ticks.length, error: last?.error ?? null, fingerprint: fingerprint(original, seed),
  };
}
