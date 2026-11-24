// Runs the harness page through `sleepy` (a headless WebKit browser for agents) and hands back shader pixels.
// This is the only place that knows how: kit/harness builds the jobs and reads the results.

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { decodeFloats } from "../../kit/harness/gl.js";

/** @import { Render } from "../../kit/harness/run.js" */

const PAGE = fileURLToPath(new URL("../../kit/harness/page.html", import.meta.url));
const KIT_ROOT = fileURLToPath(new URL("../../kit/", import.meta.url));
/** The flags every page load takes: `--file-root` lets a file: page import its modules, and the page's script sets `workbenchHarness` once they load. */
const PAGE_FLAGS = ["--file-root", KIT_ROOT, "--wait-for", "js:!!window.workbenchHarness", "--budget", "600000"];
const FALLBACK = "/opt/homebrew/bin/sleepy";

/** The shaders one sleepy call may run before the page's results (base64 floats) get unwieldy to print. */
export const BATCH_BYTES = 24e6;

/**
 * The `sleepy` binary to run, or null when there is none on `PATH` or at Homebrew's default.
 * @returns {string | null}
 */
export function findSleepy() {
  const probe = spawnSync("sleepy", ["--version"], { encoding: "utf8" });
  if (!probe.error && probe.status === 0) return "sleepy";
  return existsSync(FALLBACK) ? FALLBACK : null;
}

/**
 * Whether the harness page can run here: sleepy exists and its page gets WebGL2 with float readback.
 * @returns {{ ok: true, renderer: { vendor: string, renderer: string, version: string, floatReadback: boolean } } | { ok: false, why: string }}
 */
export function probeSleepy() {
  const bin = findSleepy();
  if (!bin) return { ok: false, why: "`sleepy` is not installed (brew install bensyverson/tap/sleepy), so the GLSL half cannot run" };
  const run = spawnSync(bin, ["eval", `file://${PAGE}`, ...PAGE_FLAGS, "--budget", "20000", "--js", "return window.workbenchHarness.renderer();"], { encoding: "utf8" });
  if (run.status !== 0) return { ok: false, why: `sleepy could not load the harness page (exit ${run.status}): ${(run.stderr || run.stdout).trim().slice(0, 300)}. Inside a sandbox sleepy's directory may be unreadable.` };
  const renderer = JSON.parse(run.stdout);
  if (!renderer) return { ok: false, why: "the harness page got no WebGL2 context" };
  if (!renderer.floatReadback) return { ok: false, why: `${renderer.renderer} has no EXT_color_buffer_float, so pixels cannot be read back as floats` };
  return { ok: true, renderer };
}

/**
 * A `Render` that sends the jobs to the page in as few sleepy calls as the output size allows.
 * @param {string} [bin]
 * @returns {Render}
 */
export function sleepyRender(bin = findSleepy() ?? "sleepy") {
  return async (jobs) => {
    /** @type {Awaited<ReturnType<Render>>} */
    const out = [];
    /** @type {typeof jobs} */
    let batch = [];
    let bytes = 0;
    const flush = () => {
      if (!batch.length) return;
      out.push(...renderBatch(bin, batch));
      batch = [];
      bytes = 0;
    };
    for (const job of jobs) {
      const size = job.width * job.height * 16 * job.sets.length * 1.4;
      if (batch.length && bytes + size > BATCH_BYTES) flush();
      batch.push(job);
      bytes += size;
    }
    flush();
    return out;
  };
}

/**
 * @param {string} bin
 * @param {Parameters<Render>[0]} jobs
 * @returns {Awaited<ReturnType<Render>>}
 */
function renderBatch(bin, jobs) {
  const script = `const jobs = ${JSON.stringify(jobs)};\nreturn window.workbenchHarness.render(jobs);\n`;
  const run = spawnSync(bin, ["eval", `file://${PAGE}`, ...PAGE_FLAGS, "--file", "-"], { input: script, encoding: "utf8", maxBuffer: 1 << 30 });
  if (run.status !== 0) throw new Error(`sleepy eval failed (exit ${run.status}): ${(run.stderr || run.stdout).slice(0, 500)}`);
  /** @type {Array<{ id: string, error: string | null, sets: string[] }>} */
  const parsed = JSON.parse(run.stdout);
  return parsed.map((r) => ({ id: r.id, error: r.error, sets: r.sets.map(decodeFloats) }));
}
