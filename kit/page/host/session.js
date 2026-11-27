// A loaded workbench, running: kit/page's page, plus what the host adds on top of it: the scrubber (a rewind through
// the run, a step while paused), a param edit and a UI button as run inputs, and a snapshot for the panels each frame.
// It takes the canvas context and the frame source from the host, so Node tests drive it by hand. The UI's values,
// its control name, its annotations and its sweeps are the kit's (kit/define's ui.compile, kit/page's sweepRuns).

import { createPage, sweepRuns } from "../index.js";
import { paramValues, shownTiles, SeriesStore, numberPaths } from "./ui-eval.js";

/**
 * @typedef {object} SessionOptions
 * @property {any} context  a Canvas 2D context
 * @property {(callback: (ms: number) => void) => unknown} requestFrame
 * @property {(bytes: Uint8Array, info: any) => any} [decode]
 * @property {(snapshot: Snapshot) => void} [onFrame]  called after each display frame and each step, rewind or input made through the session
 */

/**
 * What the panels show at one moment.
 * @typedef {object} Snapshot
 * @property {any} status  `page.status()`
 * @property {number} head  the furthest time the run has reached, which the scrubber's top is
 * @property {{ part: string, tiles: ReturnType<typeof shownTiles>, state: any, params: Record<string, any>, traces: { path: string, value: number }[] }[]} parts
 */

/**
 * @param {import("./load.js").Loaded} loaded  a workbench that built (`composed` is not null)
 * @param {SessionOptions} options
 */
export function createSession(loaded, options) {
  const composed = loaded.composed;
  if (!composed) throw new Error("the workbench did not build, so there is nothing to run");
  const frame = options.requestFrame;
  /** @type {() => void} */
  let notify = () => {};
  const page = createPage({
    composed, runtimes: loaded.runtimes, packages: loaded.packages.map((p) => p.loaded), context: options.context,
    requestFrame: (cb) => frame((ms) => { cb(ms); notify(); }),
    ...(options.decode ? { decode: options.decode } : {}),
    ...(loaded.rebuild ? { run: { build: loaded.rebuild } } : {}),
  });
  /** @type {Map<string, Record<string, any>>} the params as the person set them, by part */
  const edits = new Map();
  const series = new SeriesStore();
  let head = 0;
  const uiOf = (/** @type {string} */ part) => {
    const dialect = composed.parts.find((/** @type {any} */ p) => p.name === part)?.dialect;
    return loaded.packages.find((p) => p.name === dialect)?.loaded.ui ?? null;
  };
  /** Each part's UI compiled against its record (kit/define's `ui.compile`), made once. @type {Map<string, import("../../define/ui/compile.js").UICompiled | null>} */
  const compiled = new Map();
  /** @param {string} part */
  const compiledOf = (part) => {
    if (!compiled.has(part)) compiled.set(part, uiOf(part)?.compile(composed.parts.find((/** @type {any} */ p) => p.name === part).record) ?? null);
    return compiled.get(part) ?? null;
  };

  /** @returns {Snapshot} */
  function snapshot() {
    const status = page.status();
    head = Math.max(head, status.seconds);
    const parts = composed.parts.filter((/** @type {any} */ p) => p.name !== "page").map((/** @type {any} */ p) => {
      const state = page.run.state(p.name);
      const params = paramValues(p.record, edits.get(p.name));
      const ui = compiledOf(p.name);
      const tiles = state && ui ? shownTiles(ui.evaluate(state, params).tiles) : [];
      for (const t of tiles) t.body.forEach((c, i) => plots(`${p.name}.${t.id}.${i}`, c, status.seconds));
      const traces = state ? numberPaths(state).map((path) => {
        const value = path.split(".").reduce((v, k) => v?.[k], state);
        series.add(`${p.name}/${path}`, status.seconds, value);
        return { path, value };
      }) : [];
      return { part: p.name, tiles, state, params, traces };
    });
    return { status, head, parts };
  }
  /** Records each plot component's value in the series store, under a key the page draws it from. @param {string} key @param {any} c @param {number} T */
  function plots(key, c, T) {
    if (c.kind === "plot") { series.add(key, T, c.y, c.window); c.key = key; }
    if (c.items) c.items.forEach((/** @type {any} */ i, /** @type {number} */ n) => plots(`${key}.${n}`, i, T));
  }
  notify = () => options.onFrame?.(snapshot());
  const changed = () => { page.draw(); notify(); };

  return {
    page, series, snapshot, compiledOf,
    start() { page.start(); },
    stop() { page.stop(); },
    pause() { page.driver.pause(); notify(); },
    resume() { page.driver.resume(); notify(); },
    /** One instant forward (paused or not). */
    step() { page.driver.step(); changed(); },
    /** Moves to `seconds`: a rewind below where the run is, a run forward up to the furthest point it reached. Pauses. @param {number} seconds */
    scrub(seconds) {
      page.driver.pause();
      const t = Math.max(0, Math.min(seconds, head));
      if (t < page.run.seconds) page.run.rewind(t); else page.run.runUntil(t);
      changed();
    },
    /** A param edit, as a logged input the run applies at its next instant. @param {string} part @param {string} name @param {number | string | boolean} value */
    setParam(part, name, value) {
      page.run.input({ kind: "param", part, name, value });
      edits.set(part, { ...edits.get(part), [name]: value });
      notify();
    },
    /** A UI button change: the buttons held, sent as the run control the part's UI names (kit/define's `ui.control`). @param {string} part @param {Record<string, boolean>} held */
    control(part, held) {
      const name = uiOf(part)?.control;
      if (!name) throw new Error(`part ${part}'s UI has no inputs, so it takes no button`);
      page.run.input({ kind: "control", part, name, value: { ...held } });
      notify();
    },
    /** A param's annotation in the params view (the compiled UI's `annotation`). @param {string} part @param {string} name @param {any} state @param {Record<string, any>} params */
    paramAnnotation: (part, name, state, params) => compiledOf(part)?.annotation("params", name, state, params) ?? {},
    /** A runs tile's sweep (kit/page's sweepRuns). @param {string} part @param {any} spec */
    sweep(part, spec) {
      const ui = compiledOf(part);
      if (!ui) return { points: [], error: `part ${part} has no UI` };
      return sweepRuns({ composed, runtimes: loaded.runtimes, packages: loaded.packages.map((p) => p.loaded), part, spec, compiled: ui, ...(loaded.rebuild ? { build: loaded.rebuild } : {}) });
    },
    /** A key as the page's control: true when it was one (the host prevents its default). @param {{ type: string, code: string }} event */
    key: (event) => page.key(event),
    why: () => page.why(),
  };
}
