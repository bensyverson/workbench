// Plays the double-descent session on the real kit/compose and kit/run, and writes its record:
//   node scripts/why-trial/run-scenario.js <out-dir> [--scenario <dir>]
// <out-dir> gets log.json (the run's input log, a rebuild input's record cut to its keys), builds.json (the build
// events), why.txt (the why text for every part), states.json (each part's last state) and replay.json (whether a
// replay of the record matches). --scenario runs another copy of the scenario folder (a blind agent's fixed copy,
// with its imports rewritten to the kit, as packet.js writes them back).

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { replay } from "../../kit/run/index.js";
import { why } from "./why.js";

const args = process.argv.slice(2);
const out = args[0];
if (!out || out.startsWith("--")) {
  console.error("usage: node scripts/why-trial/run-scenario.js <out-dir> [--scenario <dir>]");
  process.exit(2);
}
const si = args.indexOf("--scenario");
const dir = resolve(si >= 0 ? args[si + 1] : new URL("./scenario", import.meta.url).pathname);
const { session } = await import(pathToFileURL(join(dir, "session.js")).href);
const host = await import(pathToFileURL(join(dir, "host.js")).href);

const run = session();
const base = pathToFileURL(dir).href + "/";
mkdirSync(out, { recursive: true });
const log = { ...run.log, inputs: run.log.inputs.map((/** @type {any} */ e) => (e.kind === "rebuild" ? { ...e, record: `{ ${Object.keys(e.record).join(", ")} }` } : e)) };
const builds = run.builds.map((/** @type {any} */ b) => (b.trigger.kind === "param" ? { ...b, trigger: { ...b.trigger, reads: b.trigger.reads.map((/** @type {any} */ r) => ({ ...r, file: r.file.startsWith(base) ? r.file.slice(base.length) : r.file })) } } : b));
writeFileSync(join(out, "log.json"), JSON.stringify(log, null, 2) + "\n");
writeFileSync(join(out, "builds.json"), JSON.stringify(builds, null, 2) + "\n");
writeFileSync(join(out, "why.txt"), why(builds, log) + "\n");
writeFileSync(join(out, "states.json"), JSON.stringify({ T: run.T, game: run.state("game"), cave: run.state("cave") }, null, 2) + "\n");
const r = replay(host.buildComposition(), { runtimes: host.runtimes, build: host.buildPart }, run.record());
writeFileSync(join(out, "replay.json"), JSON.stringify({ ok: r.ok, diagnostics: r.diagnostics }, null, 2) + "\n");
console.log(`depth ${run.state("game").depth}, ${run.builds.length} builds, replay ${r.ok ? "matches" : "differs"}; wrote ${out}`);
