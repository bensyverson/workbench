// createPage: a composed run mounted on a canvas (the draw-list draft's ruling of 2026-11-26, leaf hca0YM). It
// creates the run (kit/run, a display run under the real-time driver) and advances it on the frames the host
// gives it; draws the shown part's Draw list each frame on a 2D context with kit/draw's drawCanvas and the decoded
// image sources; turns key events into page inputs; runs the draw-time profile check where it draws, reporting a
// refusal as a page diagnostic; and exposes what a host UI needs next. It builds no UI and touches no DOM: the
// context, the frame source, the decoder and the key events are the host's, so Node tests drive it by hand.

import { createRun, createDriver, pageView } from "../run/index.js";
import { drawCanvas } from "../draw/index.js";
import { qText } from "../define/rational.js";
import { PAGE } from "../compose/page.js";
import { DEFAULT_KEYS, checkKeys, keyState } from "./keys.js";
import { decodeSources } from "./sources.js";

/** @typedef {import("./codes.js").PageDiagnostic} PageDiagnostic */
/** @typedef {import("./sources.js").Decode} Decode */
/**
 * What createPage takes. `composed` is kit/compose's built record (its `profile`, when it was built with one, is
 * the draw-time check's); `runtimes` kit/define's defineRuntime results; `packages` kit/package's loadPackage
 * results (each image file's bytes, and the content keys kit/run gives the parts); `context` a Canvas 2D context;
 * `requestFrame(callback)` asks for one display frame, calling back with a time in milliseconds
 * (requestAnimationFrame); `decode(bytes, info)` turns a PNG's bytes into a drawImage source, or a promise of one
 * (createImageBitmap in a browser); `keys` a key map from KeyboardEvent.code to a control (else DEFAULT_KEYS);
 * `run` more of createRun's options (seed, params, inputs, catchUp, checkpointEvery, build).
 * @typedef {{ composed: any, runtimes: any[], packages?: any[], context: import("../draw/canvas.js").Context2D & { clearRect: Function }, requestFrame: (callback: (ms: number) => void) => unknown, decode?: Decode, keys?: Record<string, string>, run?: Record<string, unknown> }} PageOptions
 */

/** @param {PageOptions} options */
export function createPage(options) {
  const { composed, runtimes, context: ctx, requestFrame } = options;
  const packages = options.packages ?? [];
  if (typeof requestFrame !== "function") throw new Error("createPage needs requestFrame(callback), the host's frame source (requestAnimationFrame in a browser)");
  const keys = checkKeys(options.keys ?? DEFAULT_KEYS);
  const run = createRun(composed, { ...(options.run ?? {}), runtimes, packages, frames: "display" });
  const driver = createDriver(run);
  const held = keyState(keys);
  const wired = composed.parts.some((/** @type {{ name: string }} */ p) => p.name === PAGE);
  /** @type {PageDiagnostic[]} */
  const diagnostics = [];
  /** @type {Record<string, unknown>} */
  let sources = {};
  const now = () => qText(run.T);

  /** The page's view now, or null when there is nothing to draw (H002, reported once, at creation). */
  const view = () => {
    if (!composed.show || !composed.parts.some((/** @type {{ name: string }} */ p) => p.name === composed.show)) return null;
    const v = pageView(run, composed, runtimes);
    return v.port ? v : null;
  };
  const first = view();
  if (!first) {
    const message = composed.show ? `the page shows ${composed.show}, which has no Draw output (a custom element stage or the text view draws it), so the canvas stays empty` : "the composition shows no part (.show(<part>) in the glue), so the canvas stays empty";
    diagnostics.push({ code: "H002", severity: "warning", message, T: now(), ...(composed.show ? { part: composed.show } : {}) });
  }
  const box = first?.box ?? null;
  const size = box ? { width: box.max[0] - box.min[0], height: box.max[1] - box.min[1] } : null;

  const ready = decodeSources(composed.parts, runtimes, packages, options.decode).then((r) => {
    sources = r.sources;
    for (const p of r.problems) diagnostics.push({ code: "H003", severity: "warning", message: p.message, T: now(), part: p.part });
  });

  /** The refusal last reported, so one refusal is one diagnostic while it lasts. @type {string | null} */
  let refused = null;
  /** Draws the shown list now, and reports a draw-time refusal once. */
  function draw() {
    const v = view();
    if (size) ctx.clearRect(0, 0, size.width, size.height);
    if (!v) return null;
    const moved = box && (box.min[0] !== 0 || box.min[1] !== 0);
    if (moved) { ctx.save(); ctx.translate(-box.min[0], -box.min[1]); }
    drawCanvas(ctx, [...v.list], { images: v.images, sources });
    if (moved) ctx.restore();
    const check = v.check;
    if (check && !check.ok) {
      const label = composed.profile.label;
      const why = check.diagnostics.map((d) => d.message.startsWith(`${label}: `) ? d.message.slice(label.length + 2) : d.message).join("; ");
      if (why !== refused) {
        // the instant the shown list was committed at (null: its init's, at 0), not the frame's time
        const T = run.snapshot(v.part).T ?? "0";
        diagnostics.push({ code: "H001", severity: "error", message: `the ${label} refuses ${v.part}.out.${v.port} at T = ${T}: ${why}. The page draws it anyway, on Canvas`, T, part: v.part, check: check.diagnostics });
        refused = why;
      }
    } else refused = null;
    return v;
  }

  let generation = 0;
  /** @type {number | null} */
  let last = null;
  /** @param {number} gen @returns {(ms: number) => void} */
  const tick = (gen) => (ms) => {
    if (gen !== generation) return;
    const wall = last === null ? 0 : (ms - last) / 1000;
    last = ms;
    if (wall > 0) driver.frame(wall);
    draw();
    requestFrame(tick(gen));
  };

  return {
    run, driver, ready, size, options,
    /** The page diagnostics, H…, in the order they arose. */
    diagnostics,
    /** The decoded image sources, by carried name (`<part>.<image>`). */
    get sources() { return sources; },
    /** Asks for frames: each one advances the run by its wall time (the driver caps it) and draws. */
    start() { generation += 1; last = null; requestFrame(tick(generation)); },
    /** Asks for no more frames; the run stays where it is. */
    stop() { generation += 1; },
    draw,
    /**
     * A key event (`{ type: "keydown" | "keyup", code }`, a KeyboardEvent will do) as a page input: true when the
     * key is the page's (the host may then preventDefault), false for a key the map lacks or a composition that
     * wires no page control.
     * @param {{ type: string, code: string }} event
     */
    key(event) {
      if (!wired || (event.type !== "keydown" && event.type !== "keyup")) return false;
      const change = held.press(event.code, event.type === "keydown");
      if (change === undefined) return false;
      if (change) run.input({ kind: "control", part: PAGE, name: change.name, value: change.value });
      return true;
    },
    /** What a host UI shows next: the instant, the run's N diagnostics, the page's H ones, and the shown view. */
    status() {
      const v = view();
      return {
        T: now(), seconds: run.seconds, paused: driver.paused, size,
        view: v ? { part: v.part, port: v.port, ops: v.list.length, check: v.check } : null,
        diagnostics: run.diagnostics, page: diagnostics,
      };
    },
    /** The run's why text (kit/run's run.why). @param {string} [part] @param {unknown} [since] */
    why: (part, since) => run.why(part, /** @type {any} */ (since)),
  };
}
