// How the page logs a target's preview (a Grip's drag, a part-local Control's move, a release's last value), which
// page.js's `preview` takes and grip-desk.js and controls.js pass.

/**
 * `LOG`: logged to take effect at once (kit/run's inputNow), running or paused, a drag's preview as its release's last
 * value: so a target's previews and its release take effect in the order they were logged, and the write-back's
 * rebuild that follows the release at once is never overtaken by any of them; `CHECK`: judged and not logged (a wired
 * Control's commit, which has no preview to show).
 */
export const PREVIEW = Object.freeze({ LOG: "log", CHECK: "check" });

/** @typedef {typeof PREVIEW[keyof typeof PREVIEW]} PreviewMode */
