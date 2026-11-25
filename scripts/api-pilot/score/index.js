// The API pilot's scorer: runs a hand-in's budget.dialect.js and budget.grammar.js over the hidden programs with
// the define-trial checker (the real kit/define), one temp directory holding them all as examples. An accept
// program passes when its file gets no error; a reject program passes when it gets an error that is a refusal
// (not C001, LOAD or C005, which say the candidate's own code failed), and is warned about when none is a code
// it declares. An error in the definitions fails every program, since none of them could be judged.
//
// The definitions are candidate code, so the check runs in a child process (worker.js) with a timeout: a
// candidate that exits, loops or crashes leaves no result, which fails every program. Candidate code runs in
// that process, so it could write the result file itself: the result must list exactly the hidden programs, and
// only its error codes are used; every pass and tally is recomputed here.

import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { LANG, KINDS, NOT_REFUSALS, listPrograms, expectedCodes, summarize } from "./programs.js";

export { LANG, KINDS, NOT_REFUSALS };
/** @typedef {import("./programs.js").Score} Score */
/** @typedef {import("./programs.js").ProgramResult} ProgramResult */

/** How long the worker may run, by default. */
export const DEFAULT_TIMEOUT_MS = 60_000;
/** The longest timeout setTimeout holds; above it, it fires after 1 ms. */
export const MAX_TIMEOUT_MS = 2 ** 31 - 1;
/** How much of the worker's stderr is kept to show with a missing result: its tail, where a crash is printed. */
const STDERR_KEEP = 4000;
const WORKER = join(dirname(fileURLToPath(import.meta.url)), "worker.js");

/**
 * Scores the hand-in in `handin` against the hidden programs in `hidden` (its `accept/` and `reject/`).
 * @param {string} handin @param {string} hidden
 * @param {{ timeoutMs?: number }} [options]  timeoutMs above 0 and at most MAX_TIMEOUT_MS, else a RangeError
 * @returns {Promise<Score>}
 */
export async function score(handin, hidden, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  if (!(timeoutMs > 0 && timeoutMs <= MAX_TIMEOUT_MS)) throw new RangeError(`timeoutMs must be above 0 and at most ${MAX_TIMEOUT_MS}, not ${timeoutMs}`);
  const programs = listPrograms(hidden);
  const dir = mkdtempSync(join(tmpdir(), "api-pilot-result-"));
  const out = join(dir, "result.json");
  try {
    let stderr = "";
    const { code, signal, timedOut } = await new Promise((resolve) => {
      const child = spawn(process.execPath, [WORKER, handin, hidden, out], { stdio: ["ignore", "ignore", "pipe"] });
      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (/** @type {string} */ s) => { stderr = (stderr + s).slice(-STDERR_KEEP); });
      const timer = setTimeout(() => { child.kill("SIGKILL"); resolve({ code: null, signal: "SIGKILL", timedOut: true }); }, timeoutMs);
      child.on("close", (code, signal) => { clearTimeout(timer); resolve({ code, signal, timedOut: false }); });
      child.on("error", () => { clearTimeout(timer); resolve({ code: null, signal: null, timedOut: false }); });
    });
    /** @type {unknown} */
    let parsed = null;
    try { parsed = JSON.parse(readFileSync(out, "utf8")); } catch { /* no result: the definitions never finished */ }
    const codes = parsed === null ? null : resultCodes(parsed, programs);
    const verdicts = (/** @type {(i: number) => string[]} */ codesOf) => programs.map(({ kind, file, path }, i) => ({ kind, file, codes: codesOf(i), expected: kind === "reject" ? expectedCodes(path) : [] }));
    if (codes) return summarize({ codes: codes.definitions }, verdicts((i) => codes.programs[i]));
    const why = timedOut ? "TIMEOUT" : parsed === null ? "NO_RESULT" : "BAD_RESULT";
    const how = timedOut ? `no answer in ${timeoutMs} ms`
      : parsed === null ? `child exited with ${code ?? signal}`
      : "its result does not list exactly the hidden programs, each with a list of codes";
    console.error(`the check left no usable result (${how}): every program fails`);
    if (!timedOut && stderr.trim()) console.error(`the check's stderr${stderr.length >= STDERR_KEEP ? ` (its last ${STDERR_KEEP} characters)` : ""}:\n${stderr.trimEnd()}`);
    return summarize({ codes: [why] }, verdicts(() => []));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * The error codes a worker's result gives the definitions and each program, in `programs`' order; null unless
 * it lists exactly those programs, once each, and every list of codes is a list of strings.
 * @param {unknown} result @param {Array<{ kind: string, file: string }>} programs
 * @returns {{ definitions: string[], programs: string[][] } | null}
 */
function resultCodes(result, programs) {
  const isCodes = (/** @type {unknown} */ c) => Array.isArray(c) && c.every((x) => typeof x === "string");
  const r = /** @type {{ definitions?: { codes?: unknown }, results?: unknown }} */ (result);
  if (typeof r !== "object" || r === null || !isCodes(r.definitions?.codes) || !Array.isArray(r.results)) return null;
  /** @type {Map<string, string[]>} */
  const byName = new Map();
  for (const x of r.results) {
    if (typeof x !== "object" || x === null || !isCodes(x.codes)) return null;
    const name = `${x.kind}/${x.file}`;
    if (byName.has(name)) return null;
    byName.set(name, x.codes);
  }
  if (byName.size !== programs.length) return null;
  /** @type {string[][]} */
  const codes = [];
  for (const p of programs) {
    const c = byName.get(`${p.kind}/${p.file}`);
    if (!c) return null;
    codes.push(c);
  }
  return { definitions: /** @type {string[]} */ (r.definitions?.codes), programs: codes };
}
