// The legs' figures, one row each: node scripts/why-trial/summary.js [<round dir>]
// For each <tag>/ under the round dir (default runs/2026-11-26) holding a result.json: the turns, the wall time,
// the cost, whether claude reported an error, and verify.js's passes, from that leg's result.json and verify.txt.

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const dir = process.argv[2] ?? new URL("./runs/2026-11-26", import.meta.url).pathname;
console.log("| Leg | Turns | Time (s) | Cost (USD) | verify.js |");
console.log("|---|---|---|---|---|");
for (const tag of readdirSync(dir).sort()) {
  const result = join(dir, tag, "result.json");
  if (!existsSync(result)) continue;
  const r = JSON.parse(readFileSync(result, "utf8"));
  const verify = existsSync(join(dir, tag, "verify.txt")) ? readFileSync(join(dir, tag, "verify.txt"), "utf8") : "";
  const passes = (verify.match(/^pass /gm) ?? []).length, fails = (verify.match(/^FAIL /gm) ?? []).length;
  console.log(`| ${tag}${r.is_error ? " (error)" : ""} | ${r.num_turns} | ${(r.duration_ms / 1000).toFixed(0)} | ${r.total_cost_usd.toFixed(3)} | ${passes}/${passes + fails} |`);
}
