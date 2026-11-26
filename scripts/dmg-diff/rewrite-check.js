// Checks that a rewrite of the maintained presets (scripts/dmg-oracle/presets.json) behaves as the original: each
// preset whose code differs from the archived HTML's is run on the original runtime, original code and maintained
// code side by side, on the same seeds and input, and the two traces are compared tick by tick. A thin adapter
// over the oracle's runTrace; the cases are the differential's, so the params that reach a rewritten arm are used.

import { fileURLToPath } from "node:url";
import { loadDmg, originalPresets, maintainedPresets } from "../dmg-oracle/load.js";
import { inputTrace } from "../dmg-oracle/inputs.js";
import { runTrace, firstDifference } from "../dmg-oracle/trace.js";
import { CASES } from "./differential.js";

/** @import { DmgPreset } from "../dmg-oracle/dmg.js" */

/**
 * @typedef {object} RewriteRun
 * @property {string} preset
 * @property {string} label    The case: the preset's default, or a differential case's name.
 * @property {number} seed
 * @property {number} ticks    Ticks the original ran.
 * @property {ReturnType<typeof firstDifference>} diff  Null when the traces are identical.
 */

/**
 * The ids of the presets whose code the maintained file changed.
 * @param {DmgPreset[]} original
 * @param {DmgPreset[]} maintained
 * @returns {string[]}
 */
export function changedPresets(original, maintained) {
  return maintained.filter((m) => original.find((o) => o.id === m.id)?.code !== m.code).map((m) => m.id);
}

/**
 * Runs original and maintained code of each changed preset, in each of its cases and seeds.
 * @param {ReturnType<typeof loadDmg>} dmg
 * @param {DmgPreset[]} original
 * @param {{ seeds: number[], frames: number }} run
 * @returns {{ changed: string[], runs: RewriteRun[] }}
 */
export function compareRewrites(dmg, original, { seeds, frames }) {
  const maintained = dmg.presets;
  const changed = changedPresets(original, maintained);
  /** @type {RewriteRun[]} */
  const runs = [];
  for (const id of changed) {
    const was = /** @type {DmgPreset} */ (original.find((o) => o.id === id)).code;
    const now = dmg.preset(id).code;
    const cases = [{ label: `${id} default`, preset: id }, ...CASES.filter((c) => c.preset === id && !c.edit && (c.params || c.overrides))];
    for (const c of cases) {
      /** @param {string} code */
      const make = (code) => () => {
        const r = dmg.DSL.run(code, "overrides" in c && c.overrides ? { overrides: c.overrides } : undefined);
        if (!r.build) throw new Error(`${c.label}: build failed: ${r.error?.message ?? "no build"}`);
        return r.build;
      };
      for (const seed of seeds) {
        const opts = { seed, frames, input: inputTrace(seed, frames), ..."params" in c && c.params ? { params: c.params } : {} };
        const a = runTrace(make(was)(), opts), b = runTrace(make(now)(), opts);
        runs.push({ preset: id, label: c.label, seed, ticks: a.ticks.length, diff: firstDifference(a, b) });
      }
    }
  }
  return { changed, runs };
}

const USAGE = `rewrite-check: the maintained DMG presets against the archived originals, on the original runtime.

  node scripts/dmg-diff/rewrite-check.js [--seeds 7,11,23] [--frames 1200] [--json]

Exit codes: 0 every rewritten preset's traces match, 1 a trace differs or a run stopped short, 2 usage error.`;

/**
 * @param {string[]} argv
 * @returns {number} exit code
 */
export function main(argv) {
  if (argv.includes("--help")) { console.log(USAGE); return 0; }
  /** @param {string} name */
  const flag = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
  const seeds = (flag("--seeds") ?? "7,11,23").split(",").map(Number);
  const frames = Number(flag("--frames") ?? 1200);
  if (seeds.some(Number.isNaN) || Number.isNaN(frames)) { console.error(USAGE); return 2; }
  const dmg = loadDmg(undefined, maintainedPresets());
  const { changed, runs } = compareRewrites(dmg, originalPresets(), { seeds, frames });
  const bad = runs.filter((r) => r.diff || r.ticks < frames);
  if (argv.includes("--json")) console.log(JSON.stringify({ changed, runs: runs.length, bad }, null, 2));
  else {
    console.log(`rewritten presets: ${changed.join(", ")}`);
    for (const r of runs) console.log(`${r.label.padEnd(26)} seed ${String(r.seed).padStart(3)}  ${r.ticks} ticks  ${r.diff ? `DIFFERS ${JSON.stringify(r.diff).slice(0, 200)}` : r.ticks < frames ? "STOPPED EARLY" : "identical"}`);
    console.log(`${runs.length} runs, ${bad.length} differ or stopped early`);
  }
  return bad.length ? 1 : 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
