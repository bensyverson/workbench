// A loaded workbench, running: kit/page's page, plus what the host adds on top of it: the scrubber (a rewind through
// the run, a step while paused), a param edit and a UI button as run inputs, and a snapshot for the panels each frame.
// It takes the canvas context and the frame source from the host, so Node tests drive it by hand. The UI's values,
// its Controls, its annotations and its sweeps are the kit's (kit/define's ui.compile, kit/page's sweepRuns).

import { createPage, sweepRuns } from "../index.js";
import { RunError } from "../../run/index.js";
import { shownTiles, SeriesStore, numberPaths } from "./ui-eval.js";

/**
 * @typedef {object} SessionOptions
 * @property {any} context  a Canvas 2D context
 * @property {(callback: (ms: number) => void) => unknown} requestFrame
 * @property {(bytes: Uint8Array, info: any) => any} [decode]
 * @property {(snapshot: Snapshot) => void} [onFrame]  called after each display frame and each step, rewind or input made through the session
 * @property {{ inputs?: Array<Record<string, any>>, seed?: number }} [run]  a run to start from (Open on a failed test: its input log and seed)
 * @property {(message: string) => void} [onProblem]  a snapshot or an `onFrame` that throws, said once while it keeps throwing the same (the frames go on)
 */

/**
 * What the panels show at one moment.
 * @typedef {object} Snapshot
 * @property {any} status  `page.status()`
 * @property {number} head  the furthest time the run has reached, which the scrubber's top is
 * @property {{ part: string, tiles: ReturnType<typeof shownTiles>, state: any, params: Record<string, any>, traces: { path: string, value: number }[] }[]} parts
 */

/** @typedef {{ running: boolean, progress: number, result: import("../sweep.js").Sweep | null, abort: AbortController }} SweepState */

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
    ...(loaded.rebuild || options.run ? { run: { ...(loaded.rebuild ? { build: loaded.rebuild } : {}), ...(options.run ?? {}) } } : {}),
  });
  const series = new SeriesStore();
  let head = 0;
  const uiOf = (/** @type {string} */ part) => {
    const dialect = composed.parts.find((/** @type {any} */ p) => p.name === part)?.dialect;
    return loaded.packages.find((p) => p.name === dialect)?.loaded.ui ?? null;
  };
  /**
   * Each runs component's sweep, by part and the component's id (its `y`): two parts' tiles with one label are two
   * sweeps. `result` is the last finished one; `progress` the running one's share done.
   * @type {Map<string, SweepState>}
   */
  const sweeps = new Map();
  /** @param {string} part @param {{ y: string }} spec */
  const sweepKey = (part, spec) => JSON.stringify([part, spec.y]);
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
    // the page and a layer have no state, params or UI of their own: a layer's picture is its producers'
    const parts = composed.parts.filter((/** @type {any} */ p) => p.name !== "page" && p.layer === undefined).map((/** @type {any} */ p) => {
      const state = page.run.state(p.name);
      // the run's params, which follow a rewind, not a copy of what the person set
      const params = page.run.params(p.name);
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
  /** The last problem said, so one that repeats every frame is said once. @type {string | null} */
  let said = null;
  /** Set by `stop()`: a stopped session tells its panels nothing more (a page loaded after it owns them). */
  let stopped = false;
  notify = () => {
    if (stopped) return;
    try { options.onFrame?.(snapshot()); said = null; } catch (e) {
      const m = `the panels threw: ${e instanceof Error ? e.message : e}`;
      if (m !== said) { said = m; options.onProblem?.(m); }
    }
  };
  const changed = () => { page.draw(); notify(); };

  return {
    page, series, snapshot, compiledOf,
    start() { if (stopped) throw new Error("this session is stopped, and a stopped session is final: create a new one"); page.start(); },
    /** Stops the frames and aborts every running sweep, so nothing of this session reaches the panels afterward. Final: a later sweep runs nothing, and start throws. */
    stop() { stopped = true; page.stop(); for (const s of sweeps.values()) s.abort.abort(); },
    pause() { page.driver.pause(); notify(); },
    resume() { page.driver.resume(); notify(); },
    /** One instant forward (paused or not). */
    step() { page.driver.step(); changed(); },
    /** Runs to `seconds` and stops there, paused: where Open puts a failed test, at the instant its expectation read (the scrubber's top is then that instant). @param {number} seconds */
    seek(seconds) {
      page.driver.pause();
      page.run.runUntil(seconds);
      changed();
    },
    /** Moves to `seconds`: a rewind below where the run is, a run forward up to the furthest point it reached. Pauses. @param {number} seconds */
    scrub(seconds) {
      page.driver.pause();
      const t = Math.max(0, Math.min(seconds, head));
      if (t < page.run.seconds) page.run.rewind(t); else page.run.runUntil(t);
      changed();
    },
    /**
     * A param edit, as a logged input the run applies at its next instant: the diagnostics the run refused it with
     * (N008: a value that does not fit the param's declaration), empty when it was logged.
     * @param {string} part @param {string} name @param {number | string | boolean} value
     * @returns {Array<{ code: string, message: string, part?: string }>}
     */
    setParam(part, name, value) {
      try { page.run.input({ kind: "param", part, name, value }); } catch (e) {
        if (e instanceof RunError) { notify(); return /** @type {any[]} */ (e.diagnostics); }
        throw e;
      }
      notify();
      return [];
    },
    /**
     * A declared Control's change from an on-screen form or a custom element's wb-control: logged as the page's
     * input, stamped from the event's own time when it has one (kit/page's stampOf). Throws for a Control the page
     * does not wire, and a run's refusal (N012: a value that does not fit) comes back as its diagnostics.
     * @param {string} control @param {Record<string, unknown>} value @param {{ timeStamp?: number }} [event]
     * @returns {Array<{ code: string, message: string }>}
     */
    control(control, value, event = {}) {
      if (!page.controls().some((c) => c.name === control)) throw new Error(`the page wires no Control '${control}': its Controls are ${page.controls().map((c) => c.name).join(", ") || "none"}`);
      try { page.run.input({ kind: "control", part: "page", name: control, value: { ...value }, ...(typeof event.timeStamp === "number" ? { T: page.stampOf(event.timeStamp) } : {}) }); } catch (e) {
        if (e instanceof RunError) { notify(); return /** @type {any[]} */ (e.diagnostics); }
        throw e;
      }
      notify();
      return [];
    },
    /**
     * The on-screen forms the generated controls view shows: each wired Control, in declaration order, with what a
     * form needs (its kind, label and kind keys). An unwired Control has no form.
     */
    forms: () => page.controls().map((c) => ({ name: c.name, kind: c.kind, records: c.records, ...(c.decl.label ? { label: c.decl.label } : {}), ...c.decl })),
    /** A param's annotation in the params view (the compiled UI's `annotation`). @param {string} part @param {string} name @param {any} state @param {Record<string, any>} params */
    paramAnnotation: (part, name, state, params) => compiledOf(part)?.annotation("params", name, state, params) ?? {},
    /**
     * A runs tile's sweep (kit/page's sweepRuns), in slices that yield, so the page stays live; one of the same
     * component already running is cancelled. Its state is `sweepState`, and each change notifies.
     * @param {string} part @param {any} spec @returns {Promise<import("../sweep.js").Sweep>}
     */
    async sweep(part, spec) {
      if (stopped) return { points: [], cancelled: true };
      const key = sweepKey(part, spec);
      const was = sweeps.get(key);
      was?.abort.abort();
      const ui = compiledOf(part);
      if (!ui) return { points: [], error: `part ${part} has no UI` };
      const abort = new AbortController();
      /** @type {SweepState} */
      const state = { running: true, progress: 0, result: was?.result ?? null, abort };
      sweeps.set(key, state);
      notify();
      const r = await sweepRuns({ composed, runtimes: loaded.runtimes, packages: loaded.packages.map((p) => p.loaded), part, spec, compiled: ui, ...(loaded.rebuild ? { build: loaded.rebuild } : {}), signal: abort.signal, onProgress: (f) => { state.progress = f; notify(); } });
      // a sweep a rerun cancelled leaves the rerun's state alone
      if (sweeps.get(key) === state) { Object.assign(state, { running: false, ...(r.cancelled ? {} : { result: r }) }); notify(); }
      return r;
    },
    /** A component's sweep as it stands, or null when none ran. @param {string} part @param {{ y: string }} spec */
    sweepState(part, spec) {
      const s = sweeps.get(sweepKey(part, spec));
      return s ? { running: s.running, progress: s.progress, result: s.result } : null;
    },
    /** Cancels a component's running sweep. @param {string} part @param {{ y: string }} spec */
    cancelSweep(part, spec) { sweeps.get(sweepKey(part, spec))?.abort.abort(); },
    /** A key as the page's control: true when it was one (the host prevents its default). @param {{ type: string, code: string }} event */
    key: (event) => page.key(event),
    why: () => page.why(),
  };
}
