// A seams relay leg checked on the real kit and run on kit/run, as a command:
// `node scripts/seams-trial/check.js <dir> --role maze|particles|bounce|swarm|compose`. The logic is checker/legs.js's; this
// file parses the arguments, prints, logs and sets the exit code.

import { appendFileSync, existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { checkLeg } from "./checker/legs.js";

export const EXIT = Object.freeze({ ok: 0, violations: 1, usage: 2, crash: 3, target: 4 });
const ROLES = /** @type {const} */ (["maze", "particles", "bounce", "swarm", "compose"]);
const USAGE = `usage: node scripts/seams-trial/check.js <dir> --role maze|particles|bounce|swarm|compose

--role maze or particles: <dir> is a package folder (wb-package.json at its root), checked by kit/package on the
real kit/define (manifest, hashes, imports, examples, UI, ports and frames), then the task's checks (G001-G008)
and each example run headless on kit/run with the package's runtime.
--role compose: <dir> holds workbench.js beside maze/ and particles/: both packages, the glue's imports, the
composition (kit/compose's check), each wire's plan, the task's checks (G010, G011), then the composition run
headless with a D-pad steering to a coin, a burst expected near the pickup (G012, G013), and a replay.
--role bounce or swarm: the second pairing's packages (G001-G005, G014-G017; leaf UTdvE6). --role compose with
bounce/ and swarm/ beside workbench.js: that pairing's glue (G020-G023).
Warnings (S116 under an overflow policy, S206, N001) are printed with "(warning)" and are not violations.
Prints <file>:<line>: <code> <message> and a fix: line per problem, "wire …" per planned wire, and what the run saw.
Exit 0: no violations. 1: violations. 2: bad invocation. 3: the checker failed. 4: a folder is missing.
With SEAMS_TRIAL_LOG set, appends one JSON line per run to that file.`;

/** @param {string[]} argv @returns {Promise<number>} */
async function main(argv) {
  const i = argv.indexOf("--role");
  const role = /** @type {(typeof ROLES)[number] | undefined} */ (i >= 0 ? argv[i + 1] : undefined);
  const dirs = argv.filter((a, k) => !a.startsWith("--") && k !== i + 1);
  if (!role || !ROLES.includes(role) || dirs.length !== 1) { console.error(USAGE); return EXIT.usage; }
  const dir = resolve(dirs[0]);
  const pair = existsSync(resolve(dir, "bounce")) ? ["bounce", "swarm"] : ["maze", "particles"];
  const need = role === "compose" ? [dir, resolve(dir, "workbench.js"), ...pair.map((p) => resolve(dir, p))] : [dir];
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
    console.error(`the checker failed: ${/** @type {Error} */ (e)?.stack ?? String(e)}`);
    log({ role, dir, crash: String(/** @type {Error} */ (e)?.message ?? e) });
    return EXIT.crash;
  }
}

/** One line in the trial's log, when SEAMS_TRIAL_LOG names it. @param {Record<string, unknown>} entry */
function log(entry) {
  const path = process.env.SEAMS_TRIAL_LOG;
  if (path) appendFileSync(path, JSON.stringify({ at: new Date().toISOString(), ...entry }) + "\n");
}

process.exitCode = await main(process.argv.slice(2));
