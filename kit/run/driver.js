// Run control. The real-time driver advances workbench time by each display frame's wall time, capped: no logged
// frame covers more than the run's `catchUp` seconds of T since the frame before it (the run starts at a frame at
// T = 0), which is the window kit/compose's S116 sized each queue for. A machine that cannot keep up runs in slow
// motion and drops nothing. Each frame it runs is written to the input log (a capped one with its wall time), so a
// replay steps frame parts at the same T. The driver's frame times are kept to the millisecond (a capped one lands
// exactly on the cap past the last frame; run.runUntil logs its own on the nominal grid), and a frame closer than
// MIN_FRAME to the last is merged into the next. Headless runs need no driver: run.runUntil(T) runs as fast as it
// can, with frame parts at a nominal 60 Hz.

import { q, add, cmp, sub, toNumber } from "../define/rational.js";
import { MIN_FRAME, NOMINAL_FRAME } from "../compose/queues.js";
import { afterMs } from "./log.js";

/** The nearest millisecond to `t` seconds. @param {number} t */
const roundMs = (t) => q(Math.round(t * 1000), 1000);

/**
 * A real-time driver over a run created with `frames: "display"`. The page calls `frame(wallSeconds)` once per
 * display frame (requestAnimationFrame's delta); `pause`, `resume` and `step` are run control. The catch-up cap is
 * the run's (`createRun`'s `catchUp`), the one its queues were sized for.
 * @param {ReturnType<typeof import("./scheduler.js").createRun>} run @param {Record<string, never>} [o]
 */
export function createDriver(run, o = {}) {
  if (o && typeof o === "object" && "catchUp" in o) throw new Error("catchUp is the run's: pass it to createRun, which sizes the queues for it (S116); the driver uses the run's");
  let paused = false;
  /** Where the display is in workbench time, unrounded; the wall time and cap of frames merged into the next. */
  let ideal = toNumber(run.T);
  let pendingWall = 0;
  let pendingCapped = false;
  /** The run's T after the driver last moved it: anything else moving it (a rewind, runUntil) resets the display. */
  let mark = run.T;
  const sync = () => {
    if (cmp(run.T, mark) === 0) return;
    ideal = toNumber(run.T); pendingWall = 0; pendingCapped = false; mark = run.T;
  };
  /** Whether the window from the last frame still reaches past the run's T (T moved without frames when not). */
  const open = () => cmp(add(run.lastFrame, run.catchUp), run.T) > 0;
  /**
   * The latest frame stamp the window allows: the cap past the last frame, or, when T has run a whole cap past it
   * without frames (advance from the log alone), the cap past T, so no frame is capped that wall time did not slow.
   */
  const limit = () => add(open() ? run.lastFrame : run.T, run.catchUp);
  return {
    get paused() { return paused; },
    pause() { paused = true; },
    resume() { paused = false; ideal = toNumber(run.T); pendingWall = 0; pendingCapped = false; mark = run.T; },
    /**
     * Runs the next instant, paused or not. Frame parts step on frames, so when the run has any, a step is at most
     * one nominal frame (1/60 s) after the last frame, and lands on a logged frame when it reaches that far.
     */
    step() {
      sync();
      const next = run.nextInstant();
      if (run.framed) {
        let frame = add(run.lastFrame, NOMINAL_FRAME);
        if (cmp(frame, run.T) <= 0) frame = open() ? limit() : afterMs(run.T);
        if (!next || cmp(next, frame) >= 0) run.input({ kind: "frame", T: frame });
      }
      const i = run.step();
      ideal = toNumber(run.T); mark = run.T;
      return i;
    },
    /**
     * One display frame of `wall` seconds: T advances by it, at most to the catch-up cap past the last frame.
     * Returns the frame's T as text, or null when paused or merged into the next frame.
     * @param {number} wall
     */
    frame(wall) {
      if (paused || !(wall > 0)) return null;
      sync();
      ideal += wall;
      pendingWall += wall;
      let target = roundMs(ideal);
      const most = limit();
      if (cmp(target, most) > 0) { target = most; pendingCapped = true; ideal = toNumber(target); }
      if (cmp(target, run.T) <= 0 || cmp(sub(target, run.lastFrame), MIN_FRAME) < 0) return null;
      run.input({ kind: "frame", T: target, ...(pendingCapped ? { capped: { wall: Math.round(pendingWall * 1000) / 1000, kept: toNumber(run.catchUp) } } : {}) });
      run.runUntil(target);
      mark = run.T;
      pendingWall = 0;
      pendingCapped = false;
      return `${target.n}/${target.d}`;
    },
  };
}
