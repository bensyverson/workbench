// The API pilot's scorer: runs a hand-in's budget.dialect.js and budget.grammar.js over the hidden programs with
// the define-trial checker (the real kit/define), one temp directory holding them all as examples. An accept
// program passes when its file gets no error; a reject program passes when it gets at least one, and is warned
// about when none is a code it declares. An error in the definitions fails every program, since none of them
// could be judged.
//
// The definitions are candidate code, so the check runs in a child process (worker.js) with a timeout: a
// candidate that exits, loops or crashes leaves no result, which fails every program.

import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { LANG, KINDS, listPrograms, expectedCodes, summarize } from "./programs.js";

export { LANG, KINDS };
/** @typedef {import("./programs.js").Score} Score */
/** @typedef {import("./programs.js").ProgramResult} ProgramResult */

/** How long the worker may run, by default. */
export const DEFAULT_TIMEOUT_MS = 60_000;
const WORKER = join(dirname(fileURLToPath(import.meta.url)), "worker.js");

/**
 * Scores the hand-in in `handin` against the hidden programs in `hidden` (its `accept/` and `reject/`).
 * @param {string} handin @param {string} hidden
 * @param {{ timeoutMs?: number }} [options]
 * @returns {Promise<Score>}
 */
export async function score(handin, hidden, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "api-pilot-result-"));
  const out = join(dir, "result.json");
  try {
    const { code, signal, timedOut } = await new Promise((resolve) => {
      const child = spawn(process.execPath, [WORKER, handin, hidden, out], { stdio: "ignore" });
      const timer = setTimeout(() => { child.kill("SIGKILL"); resolve({ code: null, signal: "SIGKILL", timedOut: true }); }, timeoutMs);
      child.on("exit", (code, signal) => { clearTimeout(timer); resolve({ code, signal, timedOut: false }); });
      child.on("error", () => { clearTimeout(timer); resolve({ code: null, signal: null, timedOut: false }); });
    });
    try {
      return /** @type {Score} */ (JSON.parse(readFileSync(out, "utf8")));
    } catch {
      // no result: the definitions never finished
      const why = timedOut ? "TIMEOUT" : "NO_RESULT";
      console.error(`the check left no result (${timedOut ? `no answer in ${timeoutMs} ms` : `child exited with ${code ?? signal}`}): every program fails`);
      return summarize({ ok: false, codes: [why] }, listPrograms(hidden).map(({ kind, file, path }) => ({ kind, file, pass: false, codes: [], expected: kind === "reject" ? expectedCodes(path) : [] })));
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
