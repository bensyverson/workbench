// The M1 report's numbers: `survey` lowers every preset and classifies each rejection;
// `diff` runs the differential cases. A thin adapter over survey.js and differential.js.

import { fileURLToPath } from "node:url";
import { loadDmg } from "../dmg-oracle/load.js";
import { survey, tally, REJECTION } from "./survey.js";
import { CASES, runCase } from "./differential.js";
import { MUTANTS, probe } from "./sensitivity.js";

const USAGE = `dmg-diff: M1's lowering survey and differential run over the DMG presets.

  survey [--json]                       lower all 22 presets; one row per preset, then every rejected lambda
  diff [--seeds 7,11,23] [--frames 3000] [--case <label prefix>] [--json]
                                        swap emitted lambdas into presets 04-07 and compare traces
  mutants [--seeds 7,11,23] [--frames 3000] [--json]
                                        run planted faults in emitted lambdas through the diff cases

Exit codes: 0 all match / every non-equivalent mutant caught, 1 a trace differs / a mutant missed, 2 usage error.
Start with: node scripts/dmg-diff/cli.js survey`;

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
    const cases = CASES.filter((c) => !only || c.label.startsWith(only));
    if (!cases.length) { console.error(`no case starts with '${only}'; cases: ${CASES.map((c) => c.label).join(", ")}`); return 2; }
    const results = cases.flatMap((c) => seeds.map((seed) => runCase(dmg, c, { seed, frames })));
    if (json) console.log(JSON.stringify(results, null, 2));
    else {
      for (const r of results) {
        const cov = r.coverage;
        console.log(`${r.label.padEnd(26)} seed ${String(r.seed).padStart(3)}  ${r.frames} frames  swapped ${r.swapped.length}${r.skipped.length ? ` (skipped ${r.skipped.join(", ")})` : ""}  over ${cov.overTicks}  wraps ${cov.wraps}  rng ${cov.rng}  ${r.mismatches.length ? "DIFFERS" : "match"}`);
        for (const m of r.mismatches) console.log(`  ${m.slot}: ${JSON.stringify(m.diff).slice(0, 240)}`);
      }
      const bad = results.filter((r) => r.mismatches.length).length;
      console.log(`${results.length} runs, ${bad} with a difference`);
    }
    return results.some((r) => r.mismatches.length) ? 1 : 0;
  }
  if (verb === "mutants") {
    const seeds = (flag("--seeds") ?? "7,11,23").split(",").map(Number);
    const frames = Number(flag("--frames") ?? 3000);
    if (seeds.some((s) => !Number.isInteger(s)) || !Number.isInteger(frames) || frames <= 0) { console.error(`bad --seeds or --frames\n\n${USAGE}`); return 2; }
    const results = MUTANTS.map((m) => ({ ...m, cases: probe(dmg, m, { seeds, frames }) }));
    if (json) { console.log(JSON.stringify(results, null, 2)); return 0; }
    for (const r of results) {
      const caught = r.cases.some((c) => c.caught.length);
      console.log(`${r.preset} ${r.slot}: ${r.label} — ${caught ? "caught" : r.equivalent ? "equivalent" : "MISSED"}`);
      for (const c of r.cases) console.log(`  ${c.label.padEnd(26)} ${c.caught.length ? `seeds ${c.caught.join(",")}` : "-"}`);
      if (!caught && r.equivalent) console.log(`  why: ${r.equivalent}`);
    }
    return results.some((r) => !r.equivalent && r.cases.every((c) => !c.caught.length)) ? 1 : 0;
  }
  console.error(`unknown verb '${verb}'\n\n${USAGE}`);
  return 2;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
