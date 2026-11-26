// Replay: a run is a pure function of the composed record, the params and the input log, so running the log again
// must give the same state hash at every instant. The first instant that differs is N005, naming the parts whose
// states differ.

import { createRun } from "./scheduler.js";
import { parseQ, toNumber } from "../define/rational.js";

/** @import { Composed } from "../compose/compose.js" */
/** @import { RunOptions, InstantHash } from "./scheduler.js" */
/** @import { RunDiagnostic } from "./codes.js" */

/**
 * Runs a recorded run's log again and compares each instant's state hashes, and the build events.
 * @param {Composed} composed
 * @param {Omit<RunOptions, "inputs" | "seed" | "frames" | "params" | "catchUp">} options  the runtimes (and a build function, packages, dev)
 * @param {{ log: { header: { seed: number, frames: "nominal" | "display", catchUp: string, params: Record<string, Record<string, unknown>> }, inputs: Array<Record<string, any>> }, hashes: InstantHash[], builds: unknown[] }} record  what run.record() gave
 * @returns {{ ok: boolean, diagnostics: RunDiagnostic[], run: ReturnType<typeof createRun> }}
 */
export function replay(composed, options, record) {
  const h = record.log.header;
  const run = createRun(composed, { ...options, seed: h.seed, frames: h.frames, catchUp: toNumber(parseQ(h.catchUp)), params: h.params, inputs: record.log.inputs });
  const last = record.hashes.at(-1);
  if (last) run.runUntil(parseQ(last.T));
  /** @type {RunDiagnostic[]} */
  const diagnostics = [];
  const n = Math.max(record.hashes.length, run.hashes.length);
  for (let i = 0; i < n; i++) {
    const want = record.hashes[i], got = run.hashes[i];
    if (want && got && want.T === got.T && want.hash === got.hash) continue;
    if (!want || !got || want.T !== got.T) {
      diagnostics.push({ code: "N005", severity: "error", message: `the replay's instants differ from the record's: the record has ${want ? want.T : "no instant"} where the replay has ${got ? got.T : "none"}`, T: (want ?? got).T });
      break;
    }
    const parts = Object.keys(want.parts).filter((p) => want.parts[p] !== got.parts[p]);
    diagnostics.push({ code: "N005", severity: "error", message: `the replay diverged at T = ${want.T}: ${parts.length ? `the state of ${parts.join(", ")} differs` : "a part's revision or stop differs"}; something in ${parts.length ? parts.join(", ") : "the run"} is not a function of the record, params and input log`, T: want.T, ...(parts.length === 1 ? { part: parts[0] } : {}) });
    break;
  }
  if (!diagnostics.length && JSON.stringify(run.builds) !== JSON.stringify(record.builds)) {
    diagnostics.push({ code: "N005", severity: "error", message: "the replay's build events differ from the record's: a rebuild landed elsewhere or gave another key", T: last ? last.T : null });
  }
  return { ok: diagnostics.length === 0, diagnostics, run };
}
