// The tests dogfood's checker for an author leg (leaf mxxKTa):
//   node scripts/m4-trial/tests-dogfood/check.js --role game|score <package dir>
// The M4 trial's own author check (checker/legs.js), which runs the package's manifest tests on the real kit (kit/page's
// runTests: K002, K020, K021 and H006–H008), and this trial's two codes for tests: T030 (no tests) and T031 (an Event
// input no test sends a record to). Tests are optional in the kit; requiring them is this trial's rule, because the
// trial tests the tests design. Prints, logs and exits as check.js does (M4_TRIAL_LOG; exit 0 clean, 1 violations, 2
// usage, 3 the checker failed, 4 the folder is missing).

import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { checkAuthor, CheckTargetError } from "../checker/legs.js";

const PRIMER = `usage: check.sh <package folder>

Loads the package as the workbench page does, builds it and plays it on the page with a stub canvas, then runs the
tests in its manifest's "tests". Prints every problem as
  <file>:<line>: <code> <message>
    fix: <what to do>
K… are kit/package's, S… kit/compose's, H… kit/page's (H006–H008: your tests), N… kit/run's, LOAD the page host's,
T… this trial's. Exit 0: no violations. 1: violations. 2: bad invocation. 3: the checker itself failed. 4: the folder
is missing.`;

/** @param {string[]} argv */
function parse(argv) {
  let role;
  /** @type {string[]} */
  const rest = [];
  for (let i = 0; i < argv.length; i++) { if (argv[i] === "--role") role = argv[++i]; else rest.push(argv[i]); }
  if ((role !== "game" && role !== "score") || rest.length !== 1 || rest[0].startsWith("-")) return null;
  return { role: /** @type {"game" | "score"} */ (role), dir: rest[0] };
}

/** Whether the folder's manifest lists any test (unreadable JSON is kit/package's to report). @param {string} dir */
function listsTests(dir) {
  try { const t = JSON.parse(readFileSync(join(dir, "wb-package.json"), "utf8")).tests; return Array.isArray(t) ? t.length > 0 : t !== undefined; } catch { return true; }
}

/** @param {string[]} argv @returns {Promise<number>} */
async function main(argv) {
  const log = process.env.M4_TRIAL_LOG;
  /** @type {Record<string, unknown>} */
  const entry = { time: new Date().toISOString(), role: null, dir: null, ok: false, problem: null, diagnostics: [], tests: null };
  /** @param {number} code @param {string | null} [problem] */
  const finish = (code, problem = null) => {
    entry.problem = problem;
    if (log) try { appendFileSync(log, JSON.stringify(entry) + "\n"); } catch (e) { console.error(`warning: cannot write the log: ${/** @type {Error} */ (e).message}`); }
    return code;
  };
  if (argv.includes("--help") || argv.includes("-h")) { console.log(PRIMER); entry.ok = true; return finish(0); }
  const args = parse(argv);
  if (!args) { console.error(PRIMER); return finish(2, `usage: ${argv.join(" ")}`); }
  entry.role = args.role;
  entry.dir = resolve(args.dir);
  try {
    if (!existsSync(join(args.dir, "wb-package.json"))) throw new CheckTargetError(`${args.dir} has no wb-package.json; pass the package folder`);
    const r = await checkAuthor(args.dir, args.role);
    /** @type {any[]} */
    const ds = [...r.diagnostics];
    const counts = r.tests ?? { run: 0, passed: 0 };
    // T030 is a manifest that lists no tests, not one whose tests never ran (a package that did not load, an example that did not build)
    if (!listsTests(args.dir) && !ds.some((d) => d.code === "K002" || d.code === "K020" || d.code === "K021")) {
      ds.push({ code: "T030", severity: "error", message: "the manifest has no tests", fix: "list tests in the manifest's \"tests\": docs/kit/package/README.md, Tests", file: "wb-package.json", line: 1 });
    }
    for (const k of r.eventInputs ?? []) if (counts.run && !(r.testedInputs ?? []).includes(k)) ds.push({ code: "T031", severity: "error", message: `no test sends a record to the Event input ${k}`, fix: `add a test whose inputs send ${k} records, and expect what they do`, file: "wb-package.json", line: 1 });
    entry.tests = counts;
    for (const d of ds) console.log(`${join(args.dir, d.file)}:${d.line}: ${d.code}${d.severity === "warning" ? " (warning)" : ""} ${d.message}\n  fix: ${d.fix}`);
    const errors = ds.filter((d) => d.severity === "error");
    const ok = errors.length === 0;
    if (counts.run) console.log(`tests: ${counts.passed} of ${counts.run} passed`);
    console.log(ok ? `${args.dir}: no violations` : `${args.dir}: ${errors.length} violation${errors.length === 1 ? "" : "s"}`);
    Object.assign(entry, { ok, codes: errors.map((d) => d.code), diagnostics: ds });
    return finish(ok ? 0 : 1);
  } catch (e) {
    const err = /** @type {Error} */ (e);
    if (e instanceof CheckTargetError) { console.error(`error: ${err.message}`); return finish(4, err.message); }
    console.error(`error: the checker itself failed: ${err.message}`);
    return finish(3, `the checker failed: ${err.stack ?? err.message}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = await main(process.argv.slice(2));
