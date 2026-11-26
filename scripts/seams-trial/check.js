// A seams leg checked on the real kit, as a command: `node scripts/seams-trial/check.js <dir> --role maze|particles|compose`.
// The logic is real.js's; this file parses the arguments, prints and sets the exit code.

import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { checkPackageDir } from "../pkg-trial/checker/index.js";
import { checkComposeReal } from "./real.js";

export const EXIT = Object.freeze({ ok: 0, violations: 1, usage: 2, crash: 3, target: 4 });
const ROLES = ["maze", "particles", "compose"];
const USAGE = `usage: node scripts/seams-trial/check.js <dir> --role maze|particles|compose

--role maze or particles: <dir> is a package folder (wb-package.json at its root), checked by kit/package on the
real kit/define (manifest, hashes, imports, examples, UI, ports and frames).
--role compose: <dir> holds workbench.js beside maze/ and particles/: both packages, then the glue's imports
(kit/compose's scanGlue), then the composition it returns (kit/compose's check), and each wire's plan.
Exit 0: no violations. 1: violations. 2: bad invocation. 3: the checker failed. 4: a folder is missing.`;

/** @param {string[]} argv @returns {Promise<number>} */
async function main(argv) {
  const i = argv.indexOf("--role");
  const role = i >= 0 ? argv[i + 1] : undefined;
  const dirs = argv.filter((a, k) => !a.startsWith("--") && k !== i + 1);
  if (!role || !ROLES.includes(role) || dirs.length !== 1) { console.error(USAGE); return EXIT.usage; }
  const dir = resolve(dirs[0]);
  const need = role === "compose" ? [dir, resolve(dir, "workbench.js"), resolve(dir, "maze"), resolve(dir, "particles")] : [dir];
  for (const p of need) if (!existsSync(p) || (p === dir && !statSync(p).isDirectory())) { console.error(`${p} does not exist`); return EXIT.target; }
  try {
    const r = role === "compose" ? await checkComposeReal(dir) : { ...(await checkPackageDir(dir)), plan: [] };
    for (const d of r.diagnostics) console.log(`${d.file}:${d.line}: ${d.code} ${d.message}`);
    for (const p of r.plan) console.log(`wire ${p}`);
    console.log(r.diagnostics.length ? `${dirs[0]}: ${r.diagnostics.length} violation${r.diagnostics.length === 1 ? "" : "s"}` : `${dirs[0]}: no violations`);
    return r.diagnostics.length ? EXIT.violations : EXIT.ok;
  } catch (e) {
    console.error(`the checker failed: ${/** @type {Error} */ (e)?.stack ?? String(e)}`);
    return EXIT.crash;
  }
}

process.exitCode = await main(process.argv.slice(2));
