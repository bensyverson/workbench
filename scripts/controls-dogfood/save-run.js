// Saves one finished leg under runs/<date>/<name>/ and prints its turns, cost and duration.
// Usage: node scripts/controls-dogfood/save-run.js <leg folder> <run name> [<date>]
// Copies the folder's hand-in files (everything except transcript.jsonl and stderr.txt), writes the transcript's final
// message as REPLY.md (marked as saved by the integrator) and keeps the transcript gzipped. Also lists the files each
// Read, Write and Edit in the transcript touched outside the leg's folder, for the blindness check.
import { cpSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const [dirArg, name, date = "2026-11-27"] = process.argv.slice(2);
if (!dirArg || !name) {
  console.error("usage: save-run.js <leg folder> <run name> [<date>]");
  process.exit(2);
}
const dir = resolve(dirArg);
const out = fileURLToPath(new URL(`runs/${date}/${name}/`, import.meta.url));
mkdirSync(out, { recursive: true });
for (const f of readdirSync(dir)) if (f !== "transcript.jsonl" && f !== "stderr.txt") cpSync(`${dir}/${f}`, `${out}${f}`, { recursive: true });
const raw = readFileSync(`${dir}/transcript.jsonl`);
writeFileSync(`${out}transcript.jsonl.gz`, gzipSync(raw));
/** @type {any} */
let result = null;
/** @type {Set<string>} */
const outside = new Set();
for (const line of raw.toString("utf8").split("\n")) {
  if (!line.trim()) continue;
  const d = JSON.parse(line);
  if (d.type === "result") result = d;
  for (const c of d.message?.content ?? []) {
    const p = c?.type === "tool_use" ? c.input?.file_path ?? c.input?.path : null;
    if (typeof p === "string" && !resolve(dir, p).startsWith(dir)) outside.add(p);
  }
}
writeFileSync(`${out}REPLY.md`, `${result?.result ?? ""}\n\n(Saved by the integrator from the transcript's final message.)\n`);
console.log(JSON.stringify({ run: basename(out), turns: result?.num_turns, costUSD: result?.total_cost_usd, seconds: Math.round((result?.duration_ms ?? 0) / 1000), outsideFolder: [...outside] }));
