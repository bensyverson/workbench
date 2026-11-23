// Runs the kit's subset parser and check over every runtime lambda in the DMG
// presets and prints how many were rejected, by diagnostic code.
// Usage: node scripts/parse-corpus.js [--presets 04,05] [--verbose]
import { parseLambda, checkSubset } from "../kit/parse/index.js";
import { inventory } from "./dmg-oracle/inventory.js";

const args = process.argv.slice(2);
const only = args.includes("--presets") ? args[args.indexOf("--presets") + 1].split(",") : null;
const verbose = args.includes("--verbose");
const inv = inventory().filter((e) => !only || only.includes(e.preset));

/** @type {Map<string, { message: string, lambdas: Set<string> }>} */
const byCode = new Map();
let clean = 0, parseFailed = 0;
for (const e of inv) {
  const r = parseLambda(e.src);
  const ds = r.ok ? checkSubset(r.ast, e.src) : r.diagnostics;
  if (!r.ok) parseFailed++;
  if (!ds.some((d) => d.severity === "error")) clean++;
  for (const d of ds) {
    const entry = byCode.get(d.code) ?? { message: d.message, lambdas: new Set() };
    entry.lambdas.add(`${e.preset} ${e.id}`);
    byCode.set(d.code, entry);
    if (verbose) console.log(`${e.preset} ${e.id}  ${d.code} L${d.loc.start.line}  ${d.message}  → ${d.tip}`);
  }
}
console.log(`${inv.length} lambdas: ${clean} pass the subset parser and check, ${parseFailed} fail to parse, ${inv.length - clean - parseFailed} parse with subset errors`);
for (const [code, { message, lambdas }] of [...byCode].sort()) console.log(`  ${code}  ${String(lambdas.size).padStart(3)}  ${message}  (${[...lambdas].slice(0, 3).join(", ")}${lambdas.size > 3 ? ", …" : ""})`);
console.log("Not checked here: free identifiers, dynamic property names and types, which belong to lowering.");
