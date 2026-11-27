// The tests dogfood's checker for an author leg (leaf mxxKTa):
//   node scripts/m4-trial/tests-dogfood/check.js --role game|score <package dir>
// The M4 trial's own author check (checker/legs.js) on a copy of the package whose manifest has its `tests` key
// removed (checkManifest refuses it today, K002), then the draft tests entry's static checks (tests-check.js: K002,
// K020, K021), then its tests run through the simulator (sim.js: H006–H008), and the trial's two codes for tests:
// T030 (no tests) and T031 (an Event input no test sends a record to). Prints, logs and exits as check.js does
// (M4_TRIAL_LOG; exit 0 clean, 1 violations, 2 usage, 3 the checker failed, 4 the folder is missing).

import { appendFileSync, cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { checkAuthor, CheckTargetError } from "../checker/legs.js";
import { checkTests } from "./tests-check.js";
import { runPackageTests, loadForTests } from "./sim.js";

const PRIMER = `usage: check.sh <package folder>

Loads the package as the workbench page does, builds it and plays it on the page with a stub canvas, then checks and
runs the tests in its manifest's "tests" (draft). Prints every problem as
  <file>:<line>: <code> <message>
    fix: <what to do>
K… are kit/package's, S… kit/compose's, H… kit/page's (H006–H008: your tests), N… kit/run's, LOAD the page host's,
T… this trial's. Exit 0: no violations. 1: violations. 2: bad invocation. 3: the checker itself failed. 4: the folder
is missing.`;

const FIX = {
  K002: "fix the tests entry's shape: docs/kit/package/README.md, Tests (draft)",
  K020: "name an Event input, an Event output or a state path your Dialect declares",
  K021: "give the record exactly its input's fields (a field with a default may be left out), each of its type",
  H006: "the package did not do what the test expects: fix the runtime, or the expectation if it was wrong",
  H007: "the run reported an error the test does not expect: fix the runtime, or expect the code with { diagnostic }",
  H008: "the test could not run: see the message",
};

/** @param {string[]} argv */
function parse(argv) {
  let role;
  /** @type {string[]} */
  const rest = [];
  for (let i = 0; i < argv.length; i++) { if (argv[i] === "--role") role = argv[++i]; else rest.push(argv[i]); }
  if ((role !== "game" && role !== "score") || rest.length !== 1 || rest[0].startsWith("-")) return null;
  return { role: /** @type {"game" | "score"} */ (role), dir: rest[0] };
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
    // the M4 check on a copy without the tests key
    const scratch = mkdtempSync(join(tmpdir(), "mxxKTa-strip-"));
    process.on("exit", () => rmSync(scratch, { recursive: true, force: true }));
    const copy = join(scratch, basename(resolve(args.dir)));
    cpSync(args.dir, copy, { recursive: true });
    const manifestPath = join(copy, "wb-package.json");
    let manifest;
    try { manifest = JSON.parse(readFileSync(manifestPath, "utf8")); } catch { manifest = null; }
    if (manifest && typeof manifest === "object") { delete manifest.tests; writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n"); }
    const r = await checkAuthor(copy, args.role);
    /** @type {any[]} */
    const ds = [...r.diagnostics];
    // the draft's tests
    const { tests, pkg } = await loadForTests(args.dir);
    const counts = { tests: Array.isArray(tests) ? tests.length : 0, passed: 0 };
    if (tests === null || (Array.isArray(tests) && tests.length === 0)) {
      ds.push({ code: "T030", severity: "error", message: "the manifest has no tests", fix: "list tests in the manifest's \"tests\" (draft): docs/kit/package/README.md, Tests (draft)", file: "wb-package.json", line: 1 });
    } else {
      const statics = await checkTests(args.dir);
      for (const d of statics) ds.push({ ...d, fix: FIX[/** @type {keyof typeof FIX} */ (d.code)] ?? "", file: "wb-package.json", line: 1 });
      if (!statics.length && pkg) {
        const run = await runPackageTests(args.dir);
        counts.passed = run.results.filter((x) => x.ok).length;
        for (const d of run.diagnostics) ds.push({ ...d, fix: FIX[/** @type {keyof typeof FIX} */ (d.code)] ?? "", file: "wb-package.json", line: 1 });
        const ins = pkg.loaded.dialect.seams?.in ?? {};
        const sent = new Set(/** @type {any[]} */ (tests).flatMap((t) => (t.inputs ?? []).map((/** @type {any} */ i) => i.in)));
        for (const k of Object.keys(ins)) if (ins[k].seam.kind === "event" && !sent.has(k)) ds.push({ code: "T031", severity: "error", message: `no test sends a record to the Event input ${k}`, fix: `add a test whose inputs send ${k} records, and expect what they do`, file: "wb-package.json", line: 1 });
      }
    }
    entry.tests = counts;
    for (const d of ds) console.log(`${join(args.dir, d.file)}:${d.line}: ${d.code}${d.severity === "warning" ? " (warning)" : ""} ${d.message}\n  fix: ${d.fix}`);
    const errors = ds.filter((d) => d.severity === "error");
    const ok = errors.length === 0;
    if (counts.tests) console.log(`tests: ${counts.passed} of ${counts.tests} passed`);
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
