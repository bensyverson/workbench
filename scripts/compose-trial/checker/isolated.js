// An isolated check: checkDir run in a child process, so a candidate that ends the process, never returns or
// crashes it after the build is a diagnostic (C005) and a nonzero exit, not a silent pass or a hang. The
// command line uses this; tests of the checker's own rules call checkDir directly, which is faster.

import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CheckTargetError, readCandidate, PROGRAM_FILE } from "./index.js";

/** @import { CheckResult } from "./index.js" */

const WORKER = fileURLToPath(new URL("./worker.js", import.meta.url));
export const DEFAULT_TIMEOUT_MS = 30000;

/**
 * @param {string} dir
 * @param {{ timeoutMs?: number }} [opts]
 * @returns {Promise<CheckResult>}
 */
export async function checkDirIsolated(dir, opts = {}) {
  const timeoutMs = opts.timeoutMs ?? (Number(process.env.COMPOSE_TRIAL_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS);
  const abs = resolve(dir);
  const tmp = mkdtempSync(join(tmpdir(), "compose-trial-run-"));
  const resultFile = join(tmp, "result.json");
  try {
    const r = spawnSync(process.execPath, [WORKER, abs, resultFile], { encoding: "utf8", timeout: timeoutMs, killSignal: "SIGKILL", stdio: ["ignore", "ignore", "pipe"] });
    if (existsSync(resultFile)) {
      const p = JSON.parse(readFileSync(resultFile, "utf8"));
      if (p.target) throw new CheckTargetError(p.target);
      if (p.result) return p.result;
      return failed(abs, `the checker itself failed: ${p.crash}`);
    }
    const timedOut = r.error && /** @type {any} */ (r.error).code === "ETIMEDOUT";
    const why = timedOut
      ? `did not finish within ${timeoutMs / 1000} s (an endless loop, or a wait that never ends)`
      : `ended the check before it finished (exit ${r.status ?? r.signal}), for example with process.exit() or a top-level await that never settles${firstLine(r.stderr)}`;
    return failed(abs, why);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

/** @param {string | null | undefined} text */
const firstLine = (text) => { const l = (text ?? "").split("\n").find((x) => x.trim()); return l ? `: ${l.trim().slice(0, 160)}` : ""; };

/**
 * The result for a check that never finished.
 * @param {string} dir @param {string} why
 * @returns {CheckResult}
 */
function failed(dir, why) {
  const { sources } = readCandidate(dir);
  const diagnostics = [{ file: PROGRAM_FILE, line: 1, code: "C005", severity: /** @type {"error"} */ ("error"), message: `${PROGRAM_FILE} (or a lib/ file it loads) ${why}.`, fix: "program.js must run top to bottom at build time and return: no process.exit(), no endless loop, no top-level await of something that never settles" }];
  return { ok: false, diagnostics, files: sources };
}
