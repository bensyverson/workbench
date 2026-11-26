// Run control. The real-time driver advances workbench time by each display frame's wall time, capped: a frame may
// cover at most `catchUp` seconds of T (default 1/15), so a machine that cannot keep up runs in slow motion and drops
// nothing. Each frame it runs is written to the input log (a capped one with its wall time), so a replay steps frame
// parts at the same T. Frame times are kept to the millisecond, and frames closer than MIN_FRAME are merged.
// Headless runs need no driver: run.runUntil(T) runs as fast as it can, with frame parts at a nominal 60 Hz.

import { q, cmp, toNumber } from "../define/rational.js";
import { catchUpOf, MIN_FRAME } from "../compose/queues.js";

/** @import { Q } from "../define/rational.js" */

/**
 * A real-time driver over a run created with `frames: "display"`. The page calls `frame(wallSeconds)` once per
 * display frame (requestAnimationFrame's delta); `pause`, `resume` and `step` are run control.
 * @param {ReturnType<typeof import("./scheduler.js").createRun>} run @param {{ catchUp?: number }} [o]
 */
export function createDriver(run, o = {}) {
  const cap = toNumber(catchUpOf(o.catchUp));
  const min = toNumber(MIN_FRAME);
  let paused = false;
  /** Where the display is in workbench time, unrounded, and the wall time not yet run (a frame shorter than MIN_FRAME). */
  let ideal = toNumber(run.T);
  let pendingWall = 0;
  let pendingCapped = false;
  return {
    get paused() { return paused; },
    pause() { paused = true; },
    resume() { paused = false; ideal = toNumber(run.T); },
    /** Runs the next instant, paused or not. */
    step() { const i = run.step(); ideal = toNumber(run.T); return i; },
    /**
     * One display frame of `wall` seconds: T advances by it, at most the catch-up cap. Returns the frame's T as text,
     * or null when paused or merged into the next frame.
     * @param {number} wall
     */
    frame(wall) {
      if (paused || !(wall > 0)) return null;
      const capped = wall > cap;
      ideal += Math.min(wall, cap);
      pendingWall += wall;
      pendingCapped ||= capped;
      /** @type {Q} */
      const target = q(Math.round(ideal * 1000), 1000);
      if (cmp(target, run.T) <= 0 || toNumber(target) - toNumber(run.T) < min) return null;
      run.input({ kind: "frame", T: target, ...(pendingCapped ? { capped: { wall: Math.round(pendingWall * 1000) / 1000, kept: cap } } : {}) });
      pendingWall = 0;
      pendingCapped = false;
      run.runUntil(target);
      return `${target.n}/${target.d}`;
    },
  };
}
