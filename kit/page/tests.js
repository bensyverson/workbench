// runTests: a package's manifest `tests` run (kit/package/README.md, "Tests"). Each test is built alone from its example
// (examplePreset, with the page's controls unwired: its records go in by `in`), run headless on kit/run with its inputs
// as `in` records and `taps` on the Event outputs it expects, each `at` read as the run reaches it, and its record
// replayed. kit/package judges the tests' names and records first (checkTests, K020 and K021) and nothing runs when it
// reports anything. kit/page does the running because kit/package may not import kit/run. No DOM, no Node built-ins.

import { createRun, replay } from "../run/index.js";
import { checkTests, readStatePath, sameData, stampOf } from "../package/index.js";
import { parseQ, toNumber } from "../define/rational.js";
import { examplePreset } from "./preset.js";

/** Run time between checks of the wall-time budget, in seconds, as sweepRuns slices. */
const SLICE = 1 / 4;
/** Wall time held between yields, in ms, by default. */
const BUDGET_MS = 12;
const nextTask = () => new Promise((resolve) => setTimeout(resolve, 0));
/** @param {unknown} e */
const messageOf = (e) => (e instanceof Error ? e.message : String(e));
/** @param {unknown} v */
const show = (v) => JSON.stringify(v);

/**
 * One test diagnostic: H006, H007 or H008. `at` is the instant to open the test at (a failed expectation's).
 * @typedef {{ code: "H006" | "H007" | "H008", severity: "error", message: string, test: string, at?: number }} TestDiagnostic
 */
/**
 * @typedef {{ name: string, ok: boolean, diagnostics: TestDiagnostic[], warnings: Array<{ code: string, message: string, T: string | null }>, log: any, T: number }} TestResult
 */

/**
 * @typedef {object} TestsOptions
 * @property {(path: string) => Promise<Record<string, unknown>>} importModule  the host's, for each test's example
 * @property {(path: string, module: Record<string, unknown>) => import("../define/define.js").BuildOptions} [buildOptions]  an example's module scope, as checkExamples takes it
 * @property {AbortSignal} [signal]  stops at the next yield: the results so far, `cancelled`
 * @property {(fraction: number) => void} [onProgress]  the share of the tests' run time done, 0..1
 * @property {number} [budgetMs]  wall time held between yields (default 12 ms)
 * @property {() => Promise<void>} [yieldFn]  how to give the thread back (default a zero-delay timer)
 */

/**
 * Runs a loaded package's tests: `{ results, diagnostics }` (one result per test in manifest order, and every
 * diagnostic, after any K020 or K021, flattened), or `cancelled` with those so far. Never rejects. A package with no
 * tests is clean and imports nothing.
 * @param {any} loaded  kit/package's loadPackage result
 * @param {TestsOptions} options
 * @returns {Promise<{ results: TestResult[], diagnostics: any[], cancelled?: true }>}
 */
export async function runTests(loaded, { importModule, buildOptions, signal, onProgress, budgetMs = BUDGET_MS, yieldFn = nextTask }) {
  /** @type {TestResult[]} */
  const results = [];
  const tests = /** @type {any[]} */ (loaded.tests ?? []);
  if (!tests.length) return { results, diagnostics: [] };
  const refused = checkTests(loaded);
  if (refused.length) return { results, diagnostics: refused };
  const flat = () => results.flatMap((r) => r.diagnostics);
  if (signal?.aborted) return { results, diagnostics: [], cancelled: true };
  const total = tests.reduce((n, t) => n + endOf(t), 0);
  let done = 0;
  let held = Date.now();
  /** Gives the thread back once the budget is spent; true when cancelled meanwhile. @param {number} extra */
  const pause = async (extra) => {
    if (Date.now() - held < budgetMs) return false;
    onProgress?.(total > 0 ? Math.min(1, (done + extra) / total) : 1);
    await yieldFn();
    held = Date.now();
    return signal?.aborted ?? false;
  };
  for (const t of tests) {
    const r = await runOne(loaded, t, { importModule, buildOptions, pause });
    if (r === "cancelled") return { results, diagnostics: flat(), cancelled: true };
    results.push(r);
    done += endOf(t);
  }
  onProgress?.(1);
  return { results, diagnostics: flat() };
}

/** The seconds a test runs to: the largest of `until`, every input's T and every `at` and `to`. @param {any} t */
export function endOf(t) {
  const stamps = [t.until, ...t.inputs.map((/** @type {any} */ i) => i.T), ...t.expect.flatMap((/** @type {any} */ e) => [e.at, e.to])].filter((x) => x !== undefined);
  return Math.max(0, ...stamps.map((s) => /** @type {number} */ (stampOf(s))));
}

/**
 * @param {any} loaded @param {any} t
 * @param {{ importModule: TestsOptions["importModule"], buildOptions: TestsOptions["buildOptions"], pause: (extra: number) => Promise<boolean> }} env
 * @returns {Promise<TestResult | "cancelled">}
 */
async function runOne(loaded, t, { importModule, buildOptions, pause }) {
  const name = t.name;
  /** @type {TestDiagnostic[]} */
  const out = [];
  /** @param {"H006" | "H007" | "H008"} code @param {string} message @param {number} [at] */
  const fail = (code, message, at) => out.push({ code, severity: "error", message: `test ${name}: ${message}`, test: name, ...(at !== undefined ? { at } : {}) });
  /** @param {any} log @param {number} T @param {any[]} [warnings] @returns {TestResult} */
  const result = (log, T, warnings = []) => ({ name, ok: out.length === 0, diagnostics: out, warnings, log, T });
  const cantRun = (/** @type {string} */ why) => { fail("H008", `could not run: ${why}`); return result(null, 0); };
  /** @type {any} */
  let mod;
  try { mod = await importModule(t.example); } catch (e) { return cantRun(`${t.example} failed to import: ${messageOf(e)}`); }
  const preset = examplePreset(loaded.name, mod?.default, buildOptions?.(t.example, mod) ?? {}, { wirePage: false });
  const bad = preset.diagnostics.filter((d) => d.severity !== "warning");
  if (!preset.composition || bad.length) return cantRun(`its example ${t.example} does not build alone: ${bad.map((d) => `${d.code} ${d.message}`).join("; ")}`);
  /** @type {any} */
  let composed, run;
  /** @type {string} */
  let part = "";
  const packages = [{ name: loaded.name, content: loaded.content }];
  const taps = [];
  try {
    composed = preset.composition.build({ packages: [loaded], runtimes: [loaded.runtime] });
    part = composed.parts.find((/** @type {any} */ p) => p.dialect === loaded.name)?.name ?? "";
    for (const e of t.expect) if (e.events !== undefined) taps.push(`${part}.out.${e.events}`);
    const inputs = t.inputs.map((/** @type {any} */ i) => ({ kind: "in", T: i.T, part, name: i.in, value: i.value }));
    run = createRun(composed, { runtimes: [loaded.runtime], packages, seed: t.seed ?? 0, inputs, build: preset.build ?? undefined, taps: [...new Set(taps)] });
  } catch (e) {
    const ds = /** @type {any} */ (e)?.diagnostics;
    return cantRun(Array.isArray(ds) ? ds.map((/** @type {any} */ d) => `${d.code} ${d.message}`).join("; ") : messageOf(e));
  }
  const end = endOf(t);
  /** @type {Array<{ at: number, e: any }>} */
  const reads = t.expect.filter((/** @type {any} */ e) => e.state !== undefined || e.output !== undefined).map((/** @type {any} */ e) => ({ at: /** @type {number} */ (stampOf(e.at)), e })).sort((/** @type {any} */ a, /** @type {any} */ b) => a.at - b.at);
  // a run is the same however runUntil is chunked (kit/run), so the slices and the reads change no result
  let at = 0;
  /** @param {number} to @returns {Promise<boolean>} true when cancelled */
  const advance = async (to) => {
    while (at + SLICE < to) { at += SLICE; run.runUntil(at); if (await pause(at)) return true; }
    run.runUntil(to); at = Math.max(at, to);
    return false;
  };
  try {
    for (const { at: when, e } of reads) {
      if (await advance(when)) return "cancelled";
      if (e.state !== undefined) {
        for (const [path, want] of Object.entries(e.state)) {
          const got = readStatePath(run.state(part), path);
          if (!sameData(got, want, e.within ?? 0)) fail("H006", `state at ${e.at} s: ${path}: expected ${show(want)}, got ${show(got)}`, when);
        }
      } else {
        const got = run.output(part, e.output);
        if (!sameData(got, e.value, e.within ?? 0)) fail("H006", `output at ${e.at} s: ${e.output}: expected ${show(e.value)}, got ${show(got)}`, when);
      }
    }
    if (await advance(end)) return "cancelled";
  } catch (e) { return cantRun(`the run threw: ${messageOf(e)}`); }
  for (const e of t.expect) if (e.events !== undefined) eventsProblem(run, `${part}.out.${e.events}`, e, end, (m) => fail("H006", m, e.to !== undefined ? stampOf(e.to) ?? end : end));
  const expected = t.expect.filter((/** @type {any} */ e) => e.diagnostic !== undefined);
  for (const e of expected) {
    const hit = run.diagnostics.some((/** @type {any} */ d) => d.code === e.diagnostic && (e.at === undefined || d.T !== null && toNumber(parseQ(d.T)) === stampOf(e.at)));
    if (!hit) fail("H006", `expected ${e.diagnostic}${e.at !== undefined ? ` at ${e.at} s` : ""}; the run reported ${run.diagnostics.map((/** @type {any} */ d) => `${d.code} at ${d.T}`).join(", ") || "nothing"}`, e.at !== undefined ? stampOf(e.at) ?? end : end);
  }
  for (const d of run.diagnostics) {
    if (d.severity !== "error" || expected.some((/** @type {any} */ e) => e.diagnostic === d.code)) continue;
    fail("H007", `the run reported ${d.code}${d.part ? ` (${d.part})` : ""} at T=${d.T}: ${d.message}`);
  }
  const again = replay(composed, { runtimes: [loaded.runtime], packages, build: preset.build ?? undefined }, run.record());
  for (const d of again.diagnostics) fail("H007", `its replay from its own record diverged (${d.code}): ${d.message}`);
  return result(run.log, run.seconds, run.diagnostics.filter((/** @type {any} */ d) => d.severity === "warning"));
}

/**
 * An `events` expectation against the records the run tapped.
 * @param {any} run @param {string} handle @param {any} e @param {number} end @param {(message: string) => void} fail
 */
function eventsProblem(run, handle, e, end, fail) {
  const from = e.from === undefined ? 0 : /** @type {number} */ (stampOf(e.from)), to = e.to === undefined ? end : /** @type {number} */ (stampOf(e.to));
  const got = run.tapped(handle).filter((/** @type {{ T: number }} */ x) => x.T >= from && x.T <= to);
  const window = `${e.events} from ${from} s to ${to} s`;
  if (e.count !== undefined) {
    if (got.length !== e.count) fail(`events ${window}: ${got.length} records, expected ${e.count}${got.length ? `: ${got.slice(0, 4).map((/** @type {any} */ x) => `${show(x.record)} at ${x.T}`).join(", ")}` : ""}`);
    return;
  }
  const want = /** @type {any[]} */ (e.records);
  const i = got.findIndex((/** @type {any} */ x, /** @type {number} */ k) => k >= want.length || !sameData(x.record, want[k], e.within ?? 0));
  if (got.length === want.length && i < 0) return;
  const k = i >= 0 ? i : Math.min(got.length, want.length);
  fail(`events ${window}: ${got.length} records, expected ${want.length}; record ${k} is ${show(got[k]?.record ?? null)}${got[k] ? ` (at ${got[k].T} s)` : ""}, expected ${show(want[k] ?? null)}`);
}
