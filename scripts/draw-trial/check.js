// A draw-list trial leg checked on the real kit with Draw emulated, and run on kit/run, as a command:
// `node scripts/draw-trial/check.js <dir> --role maze|particles|compose`. The logic is checker/legs.js's; this file
// parses the arguments, prints, logs and sets the exit code.

import { appendFileSync, existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { checkLeg } from "./checker/legs.js";

export const EXIT = Object.freeze({ ok: 0, violations: 1, usage: 2, crash: 3, target: 4 });
const ROLES = /** @type {const} */ (["maze", "particles", "compose"]);
const USAGE = `usage: node scripts/draw-trial/check.js <dir> --role maze|particles|compose

--role maze or particles: <dir> is a package folder, checked as the seams relay's checker does (manifest, hashes,
examples, ports, runtime, G codes), then its Draw output (W001-W010): the declaration, the builders' source, and the
list it builds after every step of each example's run, typed and drawn by a Canvas stub and a Game Boy profile.
--role compose: <dir> holds workbench.js beside maze/, particles/ and one root package folder: the composition
(kit/compose, S codes), the shown root and its Draw wires (W020-W022), then the run, steering the maze to a coin:
the root's list is built from the converted lists after every step, typed, held to its max, and needs a HUD (W023)
and a burst over the maze at the coin (W024); then a replay.
Prints <file>:<line>: <code> <message> and a fix: line per problem, then what the run and the renderers saw.
Exit 0: no violations. 1: violations. 2: bad invocation. 3: the checker failed. 4: a folder is missing.
With DRAW_TRIAL_LOG set, appends one JSON line per run to that file.`;

/** @param {string[]} argv @returns {Promise<number>} */
async function main(argv) {
  const i = argv.indexOf("--role");
  const role = /** @type {(typeof ROLES)[number] | undefined} */ (i >= 0 ? argv[i + 1] : undefined);
  const dirs = argv.filter((a, k) => !a.startsWith("--") && k !== i + 1);
  if (!role || !ROLES.includes(role) || dirs.length !== 1) { console.error(USAGE); return EXIT.usage; }
  const dir = resolve(dirs[0]);
  const need = role === "compose" ? [dir, resolve(dir, "workbench.js"), resolve(dir, "maze"), resolve(dir, "particles")] : [dir];
  for (const p of need) if (!existsSync(p) || (p === dir && !statSync(p).isDirectory())) { console.error(`${p} does not exist`); return EXIT.target; }
  try {
    const r = await checkLeg(dir, role);
    for (const d of r.diagnostics) console.log([`${d.file}:${d.line}: ${d.code} ${d.message}`, ...(d.sides ?? []).map((l) => `  ${l}`), ...(d.fix ? [`  fix: ${d.fix}`] : [])].join("\n"));
    for (const p of r.plan) console.log(`wire ${p}`);
    for (const n of r.notes) console.log(n);
    console.log(r.diagnostics.length ? `${dirs[0]}: ${r.diagnostics.length} violation${r.diagnostics.length === 1 ? "" : "s"}` : `${dirs[0]}: no violations`);
    log({ role, dir, codes: r.diagnostics.map((d) => d.code) });
    return r.diagnostics.length ? EXIT.violations : EXIT.ok;
  } catch (e) {
    console.error(`the checker failed: ${/** @type {Error} */ (e)?.message ?? String(e)}`);
    log({ role, dir, crash: String(/** @type {Error} */ (e)?.stack ?? e) });
    return EXIT.crash;
  }
}

/** One line in the trial's log, when DRAW_TRIAL_LOG names it. @param {Record<string, unknown>} entry */
function log(entry) {
  const path = process.env.DRAW_TRIAL_LOG;
  if (path) appendFileSync(path, JSON.stringify({ at: new Date().toISOString(), ...entry }) + "\n");
}

process.exitCode = await main(process.argv.slice(2));
