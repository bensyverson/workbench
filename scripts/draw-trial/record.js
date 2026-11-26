// Records one finished leg: `node scripts/draw-trial/record.js <leg-dir> <runs-dir>/<leg>`. Copies the hand-in
// folders (every package folder in the leg), workbench.js, REPORT.md and log.jsonl, and the transcript gzipped.

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const [from, to] = process.argv.slice(2);
if (!from || !to) { console.error("usage: node scripts/draw-trial/record.js <leg-dir> <record-dir>"); process.exit(2); }
mkdirSync(to, { recursive: true });
for (const e of readdirSync(from, { withFileTypes: true })) {
  if (e.isDirectory() && existsSync(join(from, e.name, "wb-package.json"))) cpSync(join(from, e.name), join(to, e.name), { recursive: true });
}
for (const f of ["workbench.js", "REPORT.md", "log.jsonl"]) if (existsSync(join(from, f))) cpSync(join(from, f), join(to, f));
if (existsSync(join(from, "transcript.jsonl"))) writeFileSync(join(to, "transcript.jsonl.gz"), gzipSync(readFileSync(join(from, "transcript.jsonl"))));
console.log(`recorded ${from} in ${to}`);
