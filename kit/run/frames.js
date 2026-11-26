// Display frames: the sorted stamps a display run steps its frame parts at (from the log's frame entries), the frames
// runUntil logs when it moves a display run itself, and the one N001 a run of capped frames writes.

import { q, cmp, add, mul, sub, floorDiv, toNumber, qText } from "../define/rational.js";
import { NOMINAL_FRAME } from "../compose/queues.js";

/** @import { Q } from "../define/rational.js" */
/** @import { RunDiagnostic } from "./codes.js" */
/** @import { Entry } from "./log.js" */

/** A display run's frame stamps, sorted; a frame costs the same at any length of run (binary search). */
export function createFrameLog() {
  /** @type {Q[]} */
  const ts = [];
  /** How many frames are at or before `t`. @param {Q} t */
  const through = (t) => { let lo = 0, hi = ts.length; while (lo < hi) { const m = (lo + hi) >> 1; if (cmp(ts[m], t) <= 0) lo = m + 1; else hi = m; } return lo; };
  /** How many frames are before `t`. @param {Q} t */
  const before = (t) => { let lo = 0, hi = ts.length; while (lo < hi) { const m = (lo + hi) >> 1; if (cmp(ts[m], t) < 0) lo = m + 1; else hi = m; } return lo; };
  return {
    through, before,
    /** The i-th frame, or null past the last. @param {number} i */
    at: (i) => ts[i] ?? null,
    /** Adds a frame, after every one at the same or an earlier stamp. @param {Q} T */
    add(T) { let j = ts.length; while (j > 0 && cmp(ts[j - 1], T) > 0) j--; ts.splice(j, 0, T); },
    /** Whether a frame is logged at T (a display run starts at one at T = 0). @param {Q} T */
    isFrame: (/** @type {Q} */ T) => T.n === 0 || (through(T) > 0 && cmp(ts[through(T) - 1], T) === 0),
    /** The last frame at or before `t`; T = 0 when none is logged. @param {Q} t */
    lastAt(t) { const i = through(t); return i > 0 ? ts[i - 1] : q(0); },
    /** Drops every frame after `t` (a rewind). @param {Q} t */
    dropAfter(t) { for (let k = ts.length - 1; k >= 0; k--) if (cmp(ts[k], t) > 0) ts.splice(k, 1); },
  };
}
/** @typedef {ReturnType<typeof createFrameLog>} FrameLog */

/**
 * The frames runUntil logs on a display run it moves itself (ruling R1, 2026-11-26): the points of the nominal grid
 * from the last frame at or before `target` (last + k/60) after the run's T and at or before `target`, never one at
 * `target` off the grid, so where runUntil is cut changes nothing. The driver logs its frame and then runs to it, so
 * it gets none. When T has run past the last frame without frames (advance from the log alone), the grid resumes at
 * its first point after T, but never past the cap from the last frame (`catchUp`, which need not be a multiple of
 * 1/60): when the next grid point is past it and the cap is after T, the first frame is the cap, and the grid goes on
 * from there. That frame depends only on the last frame and T. Frames a hand-written log holds ahead of T are kept
 * as they are, gaps and all, and the grid then starts from the last of them at or before `target`, so such a log is
 * the one case where cutting runUntil differently changes the frames.
 * @param {FrameLog} log @param {Q} now  the run's T @param {Q} target @param {Q} catchUp @returns {Q[]}
 */
export function framesTo(log, now, target, catchUp) {
  /** @type {Q[]} */
  const out = [];
  if (cmp(target, now) <= 0) return out;
  let from = log.lastAt(target);
  let k = 1;
  if (cmp(now, from) > 0) {
    k = floorDiv(sub(now, from), NOMINAL_FRAME) + 1;
    const cap = add(from, catchUp);
    if (cmp(add(from, mul(NOMINAL_FRAME, q(k))), cap) > 0 && cmp(cap, now) > 0) {
      if (cmp(cap, target) > 0) return out;
      out.push(cap);
      from = cap; k = 1;
    }
  }
  for (; ; k++) {
    const T = add(from, mul(NOMINAL_FRAME, q(k)));
    if (cmp(T, target) > 0) return out;
    out.push(T);
  }
}

/**
 * The N001 of capped frames. A run of capped frames is one N001, written at its first capped frame and rewritten at
 * each one after, so a run that never catches up still says so; the first frame that is not capped closes it.
 * @param {RunDiagnostic[]} diagnostics  the run's, which it writes into
 */
export function createSlowdown(diagnostics) {
  /** @typedef {{ from: Q, to: Q, wall: number, index: number }} Slow */
  /** The run of capped frames under way, and its N001's index in diagnostics. @type {Slow | null} */
  let slow = null;
  /** The last frame applied (the run starts at one at T = 0). @type {Q} */
  let lastFrameSeen = q(0);
  return {
    /** A frame entry, applied. @param {Entry} e */
    frame(e) {
      if (!e.capped) {
        if (slow) diagnostics[slow.index] = slowReport(slow, false);
        slow = null; lastFrameSeen = e.T; return;
      }
      if (!slow) { slow = { from: lastFrameSeen, to: e.T, wall: 0, index: diagnostics.length }; diagnostics.push(/** @type {any} */ (null)); }
      slow = { ...slow, to: e.T, wall: slow.wall + e.capped.wall };
      lastFrameSeen = e.T;
      diagnostics[slow.index] = slowReport(slow, true);
    },
    /** What a checkpoint keeps. */
    save() { return { slow, lastFrameSeen, slowDiag: slow ? diagnostics[slow.index] : null }; },
    /** Back to a checkpoint's, after the diagnostics were cut back to its length. @param {{ slow: Slow | null, lastFrameSeen: Q, slowDiag: RunDiagnostic | null }} cp */
    restore(cp) {
      ({ slow, lastFrameSeen } = cp);
      if (slow) diagnostics[slow.index] = /** @type {RunDiagnostic} */ (cp.slowDiag);
    },
  };
}

/** The N001 for a run of capped frames, open (still behind) or closed. @param {{ from: Q, to: Q, wall: number }} sp @param {boolean} open @returns {RunDiagnostic} */
function slowReport(sp, open) {
  const r3 = (/** @type {number} */ x) => Math.round(x * 1000) / 1000;
  const wall = r3(sp.wall), work = r3(toNumber(sub(sp.to, sp.from))), ratio = r3(work / sp.wall);
  const span = `for ${wall} s of wall time (T advanced ${work} s, from ${qText(sp.from)} to ${qText(sp.to)})`;
  return { code: "N001", severity: "warning", T: qText(sp.to), message: open ? `the run is behind wall time: it has run at ${ratio.toFixed(2)}× ${span}, and has not caught up; no record was dropped` : `the run fell behind wall time: it ran at ${ratio.toFixed(2)}× ${span}; no record was dropped` };
}
