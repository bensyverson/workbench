// The M1 report's numbers: `survey` lowers every preset and classifies each rejection;
// `diff` runs the differential cases. A thin adapter over survey.js and differential.js.

import { fileURLToPath } from "node:url";
import { loadDmg } from "../dmg-oracle/load.js";
import { survey, tally, REJECTION } from "./survey.js";
import { CASES, runCase, failed, allPresetCases } from "./differential.js";
import { MUTANTS, probe, mutantStatus } from "./sensitivity.js";

/** @import { DiffResult } from "./differential.js" */

const USAGE = `dmg-diff: M1's lowering survey and differential run over the DMG presets.

  survey [--json]                       lower all 22 presets; one row per preset, then every rejected lambda
  diff [--seeds 7,11,23] [--frames 3000] [--case <label prefix>] [--all-presets] [--json]
                                        swap emitted lambdas into presets 04-07 and compare traces;
                                        --all-presets runs one default case per preset that has runtime lambdas instead
  mutants [--seeds 7,11,23] [--frames 3000] [--json]
                                        run planted faults in emitted lambdas through the diff cases

Exit codes: 0 all match / every mutant as claimed, 1 a trace differs or a run stopped early / a mutant missed or wrongly marked equivalent, 2 usage error.
Start with: node scripts/dmg-diff/cli.js survey`;

/**
 * One run's report lines: its summary, then each mismatch. A run whose original stopped early says STOPPED, not match.
 * @param {DiffResult} r
 * @returns {string[]}
 */
export function describeRun(r) {
  const cov = r.coverage;
  const verdict = r.mismatches.length ? "DIFFERS" : r.ticks < r.frames ? "match (so far)" : "match";
  const lines = [`${r.label.padEnd(26)} seed ${String(r.seed).padStart(3)}  ${r.ticks} ticks  swapped ${r.swapped.length}${r.skipped.length ? ` (skipped ${r.skipped.join(", ")})` : ""}  over ${cov.overTicks}  wraps ${cov.wraps}  rng ${cov.rng}  ${verdict}`];
  if (r.ticks < r.frames) lines.push(`  STOPPED after ${r.ticks} of ${r.frames} frames: ${r.error ?? "no error recorded"}`);
  for (const m of r.mismatches) lines.push(`  ${m.slot}: ${JSON.stringify(m.diff).slice(0, 240)}`);
  return lines;
}

/**
 * @param {string[]} argv
 * @returns {number} exit code
 */
export function main(argv) {
  const [verb, ...rest] = argv;
  if (!verb || verb === "--help" || verb === "help") { console.log(USAGE); return 0; }
  /** @param {string} name */
  const flag = (name) => { const i = rest.indexOf(name); return i >= 0 ? rest[i + 1] : undefined; };
  const json = rest.includes("--json");
  const dmg = loadDmg();
  if (verb === "survey") {
    const rows = survey(dmg);
    if (json) { console.log(JSON.stringify({ rows, tally: tally(rows, dmg.presets.map((p) => p.id)) }, null, 2)); return 0; }
    console.log(`preset  total  lowered  ${REJECTION.join("  ")}  codes`);
    for (const t of tally(rows, dmg.presets.map((p) => p.id))) {
      console.log(`${t.preset.padEnd(6)}  ${String(t.total).padStart(5)}  ${String(t.lowered).padStart(7)}  ${String(t.helpers).padStart(7)}  ${String(t.subset).padStart(6)}  ${String(t["not-yet"]).padStart(7)}  ${Object.entries(t.codes).map(([c, n]) => `${c}×${n}`).join(" ")}`);
    }
    const n = (/** @type {string} */ s) => rows.filter((r) => r.status === s).length;
    console.log(`total ${rows.length}: lowered ${n("lowered")}, helpers ${n("helpers")}, subset ${n("subset")}, not-yet ${n("not-yet")}`);
    for (const r of rows.filter((x) => x.status !== "lowered")) {
      console.log(`\n${r.preset} ${r.id} [${r.status}]${r.topLevelRefs.length ? ` top-level: ${r.topLevelRefs.join(", ")}` : ""}`);
      for (const m of r.messages) console.log(`  ${m}`);
    }
    return 0;
  }
  if (verb === "diff") {
    const seeds = (flag("--seeds") ?? "7,11,23").split(",").map(Number);
    const frames = Number(flag("--frames") ?? 3000);
    const only = flag("--case");
    if (seeds.some((s) => !Number.isInteger(s)) || !Number.isInteger(frames) || frames <= 0) { console.error(`bad --seeds or --frames\n\n${USAGE}`); return 2; }
    const all = rest.includes("--all-presets");
    const pool = all ? allPresetCases(dmg) : CASES;
    const cases = pool.filter((c) => !only || c.label.startsWith(only));
    if (!cases.length) { console.error(`no case starts with '${only}'; cases: ${pool.map((c) => c.label).join(", ")}`); return 2; }
    const results = cases.flatMap((c) => seeds.map((seed) => runCase(dmg, c, { seed, frames })));
    if (json) console.log(JSON.stringify(results, null, 2));
    else {
      for (const r of results) for (const line of describeRun(r)) console.log(line);
      const distinct = new Set(results.map((r) => `${r.label}|${r.fingerprint}`)).size;
      const stopped = results.filter((r) => r.ticks < r.frames).length;
      const slots = [...new Map(results.map((r) => [r.label, r.swapped.length])).values()].reduce((a, b) => a + b, 0);
      console.log(`${results.length} runs (${distinct} distinct), ${results.filter((r) => r.mismatches.length).length} with a difference${stopped ? `, ${stopped} stopped early` : ""}`);
      if (all) console.log(`${slots} lambdas swapped over ${new Set(results.map((r) => r.label)).size} presets`);
    }
    return results.some(failed) ? 1 : 0;
  }
  if (verb === "mutants") {
    const seeds = (flag("--seeds") ?? "7,11,23").split(",").map(Number);
    const frames = Number(flag("--frames") ?? 3000);
    if (seeds.some((s) => !Number.isInteger(s)) || !Number.isInteger(frames) || frames <= 0) { console.error(`bad --seeds or --frames\n\n${USAGE}`); return 2; }
    const results = MUTANTS.map((m) => {
      const r = { ...m, cases: probe(dmg, m, { seeds, frames }) };
      return { ...r, ...mutantStatus(r) };
    });
    if (json) console.log(JSON.stringify(results, null, 2));
    else {
      for (const r of results) {
        console.log(`${r.preset} ${r.slot}: ${r.label} — ${r.text}`);
        for (const c of r.cases) console.log(`  ${c.label.padEnd(26)} ${c.caught.length ? `seeds ${c.caught.join(",")}` : "-"}`);
        if (r.equivalent) console.log(`  why (marked equivalent): ${r.equivalent}`);
      }
    }
    return results.every((r) => r.ok) ? 0 : 1;
  }
  console.error(`unknown verb '${verb}'\n\n${USAGE}`);
  return 2;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
