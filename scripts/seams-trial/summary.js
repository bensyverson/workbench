// Prints one Markdown table row per relay leg: checker runs, every code they printed and the first clean run (from
// log.jsonl), and turns, time and cost (from the transcript's final result line, plain or gzipped).
// Usage: node scripts/seams-trial/summary.js <leg-dir>... [--skip-last]
//   --skip-last  ignores each log's last line (a recorded leg's log ends with the integrator's recheck)

import { readFileSync, existsSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { basename, join } from "node:path";

const args = process.argv.slice(2);
const skipLast = args.includes("--skip-last");
const dirs = args.filter((a) => a !== "--skip-last");
if (dirs.length === 0) {
  console.error("usage: node scripts/seams-trial/summary.js <leg-dir>... [--skip-last]");
  process.exit(2);
}

/** The transcript's text. @param {string} dir */
function transcript(dir) {
  const plain = join(dir, "transcript.jsonl");
  if (existsSync(plain)) return readFileSync(plain, "utf8");
  return gunzipSync(readFileSync(`${plain}.gz`)).toString("utf8");
}

/** Every code with its count, `N004 ×3`, in first-seen order. @param {string[]} codes */
function counted(codes) {
  /** @type {Map<string, number>} */
  const seen = new Map();
  for (const c of codes) seen.set(c, (seen.get(c) ?? 0) + 1);
  return [...seen].map(([c, n]) => (n > 1 ? `${c} ×${n}` : c)).join(", ");
}

console.log("| Leg | Model | Checks | Codes (all runs); first clean | Turns | Time | Cost |");
console.log("|---|---|---|---|---|---|---|");
for (const dir of dirs) {
  // a run the checker itself failed on logs `crash` and no codes: it counts as the code "crash"
  /** @type {{ codes: string[] }[]} */
  let runs = readFileSync(join(dir, "log.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l))
    .map((/** @type {{ codes?: string[], crash?: string }} */ r) => ({ codes: r.codes ?? (r.crash ? ["crash"] : []) }));
  if (skipLast) runs = runs.slice(0, -1);
  const firstClean = runs.findIndex((r) => r.codes.length === 0);
  const all = counted(runs.flatMap((r) => r.codes));
  const lastClean = runs.length > 0 && runs[runs.length - 1].codes.length === 0;
  const codes = `${all || "none"}; ${firstClean < 0 ? "never clean" : `first clean at run ${firstClean + 1}`}${lastClean ? "" : ", last run not clean"}`;
  const lines = transcript(dir).split("\n").filter(Boolean).map((l) => JSON.parse(l));
  const result = lines.findLast((l) => l.type === "result");
  const model = result ? Object.keys(result.modelUsage ?? {}).join("+") : "?";
  const cell = (/** @type {unknown} */ v) => (result ? String(v) : "?");
  console.log(`| ${basename(dir)} | ${model} | ${runs.length} | ${codes} | ${cell(result?.num_turns)} | ${cell(Math.round((result?.duration_ms ?? 0) / 1000))} s | ${cell("$" + (result?.total_cost_usd ?? 0).toFixed(2))} |`);
}
