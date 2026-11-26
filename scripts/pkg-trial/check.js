// The package trial's checker, as a command: `node scripts/pkg-trial/check.js <dir>`.
// The logic is in checker/; this file parses the arguments, prints, logs and sets the exit code.
// Every invocation is appended as one JSON line to the file named by PKG_TRIAL_LOG, if set.

import { appendFileSync } from "node:fs";
import { join, resolve, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { checkPackageDir, CheckTargetError } from "./checker/index.js";

/** @import { CheckResult } from "./checker/index.js" */

export const EXIT = Object.freeze({ ok: 0, violations: 1, usage: 2, crash: 3, target: 4 });

const SELF = relative(process.cwd(), fileURLToPath(import.meta.url)) || "check.js";
const PRIMER = `usage: node ${SELF} <dir> [--json]

Checks the Dialect package in <dir> (a folder with a wb-package.json): the manifest, the kit version, that every file
is listed and matches its hash, every file's imports, that the entry modules load and export one Dialect, one Grammar
built on it and (if named) one UI built on that Grammar, that the modules can be uploaded (no import cycle), and the
defineUI checks of the UI. Prints every violation as
  <file>:<line>: <code> <message>
    fix: <what to write instead>
K… codes are kit/package's (kit/package/README.md); U… are defineUI's (scripts/ui-trial/README.md).
Exit 0: no violations. 1: violations. 2: bad invocation. 3: the checker itself failed. 4: <dir> is missing.
--json prints the result as one JSON object instead.`;

/** @param {CheckResult} r @param {string} dirArg */
export function format(r, dirArg) {
  const out = [];
  for (const d of r.diagnostics) out.push(`${join(dirArg, d.file)}:${d.line}: ${d.code} ${d.message}`, `  fix: ${d.fix}`);
  out.push(r.ok ? `${dirArg}: no violations` : `${dirArg}: ${r.diagnostics.length} violation${r.diagnostics.length === 1 ? "" : "s"}`);
  return out.join("\n");
}

/** @param {string[]} argv @returns {Promise<number>} */
async function main(argv) {
  const log = process.env.PKG_TRIAL_LOG;
  /** The log line of this invocation: filled in as far as the arguments get, and appended whatever the outcome. @type {Record<string, unknown>} */
  const entry = { time: new Date().toISOString(), dir: null, ok: false, loadError: null, diagnostics: [], files: [] };
  /** @param {number} code @param {string | null} [problem] */
  const finish = (code, problem = null) => {
    if (problem !== null) entry.loadError = problem;
    if (log) try { appendFileSync(log, JSON.stringify(entry) + "\n"); } catch (e) { console.error(`warning: cannot write PKG_TRIAL_LOG: ${/** @type {Error} */ (e).message}`); }
    return code;
  };
  if (argv.includes("--help") || argv.includes("-h")) { console.log(PRIMER); entry.ok = true; return finish(EXIT.ok); }
  const json = argv.includes("--json");
  const rest = argv.filter((a) => a !== "--json");
  if (rest.length !== 1 || rest[0].startsWith("-")) { console.error(PRIMER); return finish(EXIT.usage, "usage: expected one <dir>"); }
  const dirArg = rest[0];
  entry.dir = resolve(dirArg);
  try {
    const r = await checkPackageDir(dirArg);
    console.log(json ? JSON.stringify(r) : format(r, dirArg));
    Object.assign(entry, { ok: r.ok, diagnostics: r.diagnostics, files: r.files });
    return finish(r.ok ? EXIT.ok : EXIT.violations);
  } catch (e) {
    const err = /** @type {Error} */ (e);
    if (e instanceof CheckTargetError) { console.error(`error: ${err.message}`); return finish(EXIT.target, err.message); }
    console.error(`error: the checker itself failed: ${err.stack ?? err.message}`);
    return finish(EXIT.crash, `the checker failed: ${err.message}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = await main(process.argv.slice(2));
