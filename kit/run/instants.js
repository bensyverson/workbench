// Which instant comes next, and which parts are due at one: a tick part on the multiples of its period, a frame part
// on the nominal 1/60 s grid (headless) or at the logged frames (display), a demand part at every instant.

import { q, cmp, mul, floorDiv, ceilDiv } from "../define/rational.js";
import { NOMINAL_FRAME } from "../compose/queues.js";

/** @import { Q } from "../define/rational.js" */
/** @import { Part } from "./part.js" */
/** @import { FrameLog } from "./frames.js" */

/**
 * Where the run stands, as instant selection reads it. `lastT` the last instant run (null at the start); `floor` no
 * instant comes before it (the stamp of the last input applied ahead of the next instant: a part it restarted counts
 * its clock from there, ruling R2).
 * @typedef {{ lastT: Q | null, floor: Q | null, frames: "nominal" | "display", log: FrameLog }} Place
 */

/** @param {Part} p */
export const running = (p) => !p.stopped && p.state !== null;

/** @param {Q} T @param {Q} period */
export const onGrid = (T, period) => { const r = mul(T, q(period.d, period.n)); return r.d === 1; };

/** The next multiple of `period` after lastT (0 at the start), and not before the floor. @param {Q} period @param {Place} at */
const nextMultiple = (period, { lastT, floor }) => {
  const m = lastT === null ? q(0) : mul(period, q(floorDiv(lastT, period) + 1));
  return floor && cmp(m, floor) < 0 ? mul(period, q(ceilDiv(floor, period))) : m;
};

/**
 * The next logged frame after lastT and not before the floor, or null when none is logged yet. A display run starts
 * at a frame at T = 0, as a headless one does: the first frame's window is then half-open; a part fixed at T = 0
 * steps there too.
 * @param {Place} at
 */
export const nextFrame = ({ lastT, floor, log }) => {
  if (lastT === null && (!floor || floor.n === 0)) return q(0);
  const i = Math.max(lastT === null ? 0 : log.through(lastT), floor ? log.before(floor) : 0);
  return log.at(i);
};

/** Whether the next instant waits on a display frame not yet logged (a running part steps on frames). @param {Part[]} parts @param {Place} at */
export const awaitingFrame = (parts, at) => at.frames === "display" && nextFrame(at) === null && parts.some((p) => p.clock.kind === "frame" && running(p));

/** The next instant at which a tick or frame part is due, or null. @param {Part[]} parts @param {Place} at @returns {Q | null} */
export function nextInstant(parts, at) {
  /** @type {Q | null} */
  let best = null;
  for (const p of parts) {
    if (!running(p)) continue;
    const c = p.clock.kind === "tick" ? nextMultiple(p.clock.period, at) : p.clock.kind === "frame" ? (at.frames === "nominal" ? nextMultiple(NOMINAL_FRAME, at) : nextFrame(at)) : null;
    if (c && (!best || cmp(c, best) < 0)) best = c;
  }
  return best;
}

/** Whether a part steps at instant T (a demand part may still skip: nothing it reads changed). @param {Part} p @param {Q} T @param {"nominal" | "display"} frames @param {FrameLog} log */
export function due(p, T, frames, log) {
  if (!running(p)) return false;
  if (p.clock.kind === "tick") return onGrid(T, p.clock.period);
  if (p.clock.kind === "frame") return frames === "nominal" ? onGrid(T, NOMINAL_FRAME) : log.isFrame(T);
  return true;
}
