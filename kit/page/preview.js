// How the page logs a target's preview (a Grip's drag, a part-local Control's move, a release's last value), which
// page.js's `preview` takes and grip-desk.js and controls.js pass.

/**
 * `FRAME`: for the frame that flushes it, which applies it before it draws, or at once while paused (a paused run has
 * no next frame); `NOW`: at once (kit/run's inputNow), as a release's last value is, so the write-back's rebuild that
 * follows it at once is never overtaken by it; `CHECK`: judged and not logged (a wired Control's commit, which has no
 * preview to show).
 */
export const PREVIEW = Object.freeze({ FRAME: "frame", NOW: "now", CHECK: "check" });

/** @typedef {typeof PREVIEW[keyof typeof PREVIEW]} PreviewMode */
