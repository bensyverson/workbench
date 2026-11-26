// Checks a fix of the double descent by playing it: node scripts/why-trial/verify.js [<scenario-dir>] [--json]
// The scenario dir (default: the unfixed scenario/) holds host.js, glue.js, the packages and carve.js, importing the
// kit by relative path (packet.js `back` writes a blind agent's copy that way). Four sessions, each must end at the
// depth given: the bug session with the host's 1/10 s chunks (1), the same with 1/4 s (1) and 1/30 s (1) chunks,
// and a session that walks onto the second level's exit too (2). Exit 0 when all four pass, 1 otherwise.

import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";

const args = process.argv.slice(2);
const json = args.includes("--json");
const dir = resolve(args.find((a) => !a.startsWith("--")) ?? new URL("./scenario", import.meta.url).pathname);
const host = await import(pathToFileURL(join(dir, "host.js")).href);

/** @param {number} T @param {boolean} right */
const pad = (T, right) => ({ kind: "control", T, part: "game", name: "pad", value: { up: false, down: false, left: false, right } });
const once = () => [pad(1 / 30, true), pad(1 / 4, false)];
const twice = () => [...once(), pad(0.6, true), pad(39 / 60, false)];
const actions = () => [{ T: 1, slider: "roughness", value: 46 }, { T: 1.2, save: true }];

const cases = [
  { name: "bug session, 1/10 s chunks", inputs: once(), chunk: { n: 1, d: 10 }, want: 1 },
  { name: "bug session, 1/4 s chunks", inputs: once(), chunk: { n: 1, d: 4 }, want: 1 },
  { name: "bug session, 1/30 s chunks", inputs: once(), chunk: { n: 1, d: 30 }, want: 1 },
  { name: "two exits, 1/10 s chunks", inputs: twice(), chunk: { n: 1, d: 10 }, want: 2 },
];
const results = cases.map((c) => {
  try {
    const run = host.play({ inputs: c.inputs, actions: actions(), chunk: c.chunk, until: 1.5 });
    const depth = run.state("game")?.depth ?? null;
    const stopped = run.diagnostics.filter((/** @type {any} */ d) => d.severity !== "warning").map((/** @type {any} */ d) => `${d.code} ${d.message}`);
    return { name: c.name, want: c.want, depth, ok: depth === c.want && stopped.length === 0, diagnostics: stopped };
  } catch (e) {
    return { name: c.name, want: c.want, depth: null, ok: false, diagnostics: [String(/** @type {any} */ (e)?.message ?? e)] };
  }
});
if (json) console.log(JSON.stringify(results, null, 2));
else for (const r of results) console.log(`${r.ok ? "pass" : "FAIL"}  ${r.name}: depth ${r.depth}, want ${r.want}${r.diagnostics.length ? `; ${r.diagnostics.join("; ")}` : ""}`);
process.exit(results.every((r) => r.ok) ? 0 : 1);
