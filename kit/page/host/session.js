// A loaded workbench, running: kit/page's page, plus what the host adds on top of it: the scrubber (a rewind through
// the run, a step while paused), a param edit and a UI button as run inputs, and a snapshot for the panels each frame.
// It takes the canvas context and the frame source from the host, so Node tests drive it by hand. The UI's values,
// its Controls, its annotations and its sweeps are the kit's (kit/define's ui.compile, kit/page's sweepRuns). The
// stage side (project/2026-11-27-controls-draft.md, requirements 7 to 10): the Grips in canvas pixels and their drags,
// the host's zoom and pan, a custom element stage's events, and a new text of the Program put in force (`install`).

import { createPage, sweepRuns, targetProblem } from "../index.js";
import { siteOf } from "../../define/index.js";
import { RunError } from "../../run/index.js";
import { shownTiles, SeriesStore, numberPaths } from "./ui-eval.js";
import { createElementEvents } from "./element-events.js";
import { FIT } from "./viewport.js";

/** What a composition is made of, for telling a new text that only changes records from one that changes the run. @param {any} c */
const shapeOf = (c) => JSON.stringify({ parts: c.parts.map((/** @type {any} */ p) => [p.name, p.dialect, p.layer ?? null]), wires: c.wires.map((/** @type {any} */ w) => [w.from, w.to]), show: c.show ?? null });

/**
 * @typedef {object} SessionOptions
 * @property {any} context  a Canvas 2D context
 * @property {(callback: (ms: number) => void) => unknown} requestFrame
 * @property {(bytes: Uint8Array, info: any) => any} [decode]
 * @property {(snapshot: Snapshot) => void} [onFrame]  called after each display frame and each step, rewind or input made through the session
 * @property {{ inputs?: Array<Record<string, any>>, seed?: number }} [run]  a run to start from (Open on a failed test: its input log and seed)
 * @property {(message: string) => void} [onProblem]  a snapshot or an `onFrame` that throws, said once while it keeps throwing the same (the frames go on)
 * @property {(commit: { part: string, to: string, value: unknown }) => void} [onCommit]  a release to write back into the part's text (the editor's write, kit/page's writeBack): a Control with `to`, a Grip, a custom element's commit
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
  /** Flushes a custom element's argument previews, once a frame (set below). @type {() => void} */
  let flushEdits = () => {};
  /** The user parts: not the page, not a layer. */
  const userParts = composed.parts.filter((/** @type {any} */ p) => p.name !== "page" && p.layer === undefined).map((/** @type {any} */ p) => /** @type {string} */ (p.name));
  /** Each part's Program text now (the glue's, or the preset's example): `install` changes it. @type {Record<string, string>} */
  const texts = loaded.source ? Object.fromEntries(userParts.map((/** @type {string} */ n) => [n, loaded.source])) : {};
  /**
   * The text the record in force in the run was built from, by part, which the page reads to tell a literal (H011) and
   * a stale span (H012). kit/run keeps its old record on a rebuild with the same content key (a release that writes
   * back the last preview's value), so until the run takes a record of the new text the page reads the old one.
   * @type {Record<string, string>}
   */
  const pageTexts = { ...texts };
  /** An installed text's record the run has not taken yet: its record, its text, and the record in force when it was logged. @type {Map<string, { record: any, text: string, kept: any }>} */
  const pending = new Map();
  /** The build in force: `install` swaps in the new text's, so a preview builds the text the record came from. */
  let rebuild = loaded.rebuild;
  const page = createPage({
    composed, runtimes: loaded.runtimes, packages: loaded.packages.map((p) => p.loaded), context: options.context,
    requestFrame: (cb) => frame((ms) => { syncAll(); flushEdits(); cb(ms); notify(); }),
    texts: pageTexts,
    ...(options.decode ? { decode: options.decode } : {}),
    ...(loaded.rebuild || options.run ? { run: { ...(loaded.rebuild ? { build: (/** @type {string} */ part, /** @type {Record<string, unknown>} */ params, /** @type {any} */ more) => /** @type {NonNullable<typeof rebuild>} */ (rebuild)(part, params, more) } : {}), ...(options.run ?? {}) } } : {}),
  });
  /** The record in force in the run for a part (a rebuild changes it). @param {string} part @returns {Record<string, any>} */
  const runRecord = (part) => (page.run.composed ?? composed).parts.find((/** @type {any} */ p) => p.name === part)?.record ?? {};
  /** Follows the run: once it holds a record of an installed text (that one, or a later build of it), the page reads that text. @param {string} part */
  const sync = (part) => {
    const w = pending.get(part);
    if (!w || runRecord(part) === w.kept) return w ?? null;
    pageTexts[part] = w.text;
    pending.delete(part);
    return null;
  };
  /** The record the Program's text now was built from: an installed one the run kept its old record for, else the run's. @param {string} part @returns {Record<string, any>} */
  const recordOf = (part) => sync(part)?.record ?? runRecord(part);
  const syncAll = () => { for (const p of pending.keys()) sync(p); };
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
  /** Each part's UI compiled against its record in force (kit/define's `ui.compile`), made once per record. @type {Map<string, { record: any, ui: import("../../define/ui/compile.js").UICompiled | null }>} */
  const compiled = new Map();
  /** @param {string} part */
  const compiledOf = (part) => {
    const record = recordOf(part);
    if (compiled.get(part)?.record !== record) compiled.set(part, { record, ui: uiOf(part)?.compile(record) ?? null });
    return compiled.get(part)?.ui ?? null;
  };
  /**
   * Why a target of a part cannot be written, or null: the H011 or H012 kit/page's writeback finds in the part's text,
   * or, with no text, the record's own site (no call there, or a call that runs several times).
   * @param {string} part @param {string} to @returns {{ code: string, message: string, fix?: string } | null}
   */
  const writeProblem = (part, to) => {
    if (!/^(param|arg)\./.test(to)) return { code: "H011", message: `the target ${JSON.stringify(to)} is neither "param.<name>" nor "arg.<address>"` };
    const record = recordOf(part);
    if (texts[part]) return targetProblem(texts[part], record, to);
    // with no text there is nothing to read the argument from: only the record's own site
    const site = siteOf(record, to);
    if (!site) return { code: "H011", message: to.startsWith("param.") ? `the Program declares no param '${to.slice(6)}'` : `no call of part ${part}'s Program is at ${to}` };
    return site.calls > 1 ? { code: "H011", message: `this call runs ${site.calls} times, so its argument is not one value` } : null;
  };
  /** The host's zoom and pan of the stage, which kit/page draws through (not logged). */
  /** @type {{ zoom: number, pan: number[] }} */
  let view = { zoom: FIT.zoom, pan: [...FIT.pan] };
  /** A shown-frame point from a canvas point, and back: kit/page's toStage, which is affine, inverted. @param {number[]} p */
  const toCanvas = (p) => {
    const o = page.toStage(0, 0), u = page.toStage(1, 1);
    return [(p[0] - o[0]) / (u[0] - o[0]), (p[1] - o[1]) / (u[1] - o[1])];
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

  /** @param {string} part @param {string} name @param {number | string | boolean} value @returns {Array<{ code: string, message: string, part?: string }>} */
  const setParam = (part, name, value) => {
    try { page.run.input({ kind: "param", part, name, value }); } catch (e) {
      if (e instanceof RunError) { notify(); return /** @type {any[]} */ (e.diagnostics); }
      throw e;
    }
    notify();
    return [];
  };
  /** @param {string} control @param {Record<string, unknown>} value @param {{ timeStamp?: number, phase?: "preview" | "commit" }} [event] @returns {Array<{ code: string, message: string }>} */
  const control = (control, value, event = {}) => {
    /** @type {{ part: string, to: string, value: unknown } | null} */
    let commit;
    try { commit = page.control(control, { ...value }, event); } catch (e) {
      if (e instanceof RunError) { notify(); return /** @type {any[]} */ (e.diagnostics); }
      throw e;
    }
    if (commit) options.onCommit?.(commit);
    notify();
    return [];
  };
  const elements = createElementEvents({
    shown: () => String(composed.show ?? ""),
    controls: () => /** @type {Array<{ name: string }>} */ (page.controls()),
    control, setParam, writeProblem,
    build: (part, to, value) => {
      if (!rebuild) throw new Error("this workbench has no build to preview an argument with");
      return rebuild(part, { ...page.run.params(part) }, { args: { [to.slice(4)]: value } });
    },
    logRebuild: (part, record) => { page.run.input({ kind: "rebuild", part, record }); },
    commit: (c) => options.onCommit?.(c),
    problem: (m) => options.onProblem?.(m),
  });
  flushEdits = () => elements.flush();

  return {
    page, series, snapshot, compiledOf, recordOf,
    /** Each part's Program text, as the page reads it (`install` changes it). */
    texts,
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
     */
    setParam,
    /**
     * A declared Control's change from an on-screen form or a custom element's wb-control, through kit/page's
     * `page.control`: a Control with an input logs it as the page's input, stamped from the event's own time when it
     * has one; one with `to` previews (`phase: "preview"`) or, released, hands its commit to `onCommit`. Throws for a
     * Control the page lacks, and a run's refusal (N012: a value that does not fit) comes back as its diagnostics.
     */
    control,
    /**
     * The on-screen forms the generated controls view shows: each wired Control in declaration order, then each part's
     * part-local one, with what a form needs (its kind, label and kind keys, `keyed`, a keyed one's `instances`, and
     * with `to` its part, target and `disabled`). An unwired Control with an input has no form.
     */
    forms: () => page.controls().map((c) => {
      const { each: _, ...decl } = c.decl ?? {};
      return {
        name: c.name, kind: c.kind, records: c.records, ...(decl.label ? { label: decl.label } : {}), ...decl, keyed: !!c.keyed,
        ...(c.local ? { local: true } : {}), ...(c.part ? { part: c.part } : {}), ...(c.to ? { to: c.to, disabled: c.disabled } : {}), ...(c.instances ? { instances: c.instances } : {}),
      };
    }),
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

    /**
     * The Grips over the stage, in canvas pixels (kit/page's `page.grips()` through the zoom and pan): what the host
     * draws in a layer above the canvas, a disabled one with its H011.
     */
    grips: () => { syncAll(); return page.grips().map((g) => {
      const [x, y] = toCanvas(g.at);
      return { part: g.part, grip: g.grip, index: g.index, kind: g.kind, ...(g.label ? { label: g.label } : {}), x, y, to: g.to, disabled: g.disabled };
    }); },
    /**
     * Takes hold of a Grip at a canvas point: its moves preview through the log (kit/page's `page.grab`, at most one
     * input a frame), and its release hands `{ part, to, value }` to `onCommit` and returns it.
     * @param {{ part: string, grip: string, index: number }} ref @param {number} x @param {number} y
     */
    grab(ref, x, y) {
      syncAll();
      const drag = page.grab(ref, page.toStage(x, y));
      return {
        /** @param {number} px @param {number} py @param {{ alt?: boolean }} [o] */
        move: (px, py, o = {}) => drag.move(page.toStage(px, py), o),
        release() {
          const commit = { part: ref.part, ...drag.release() };
          options.onCommit?.(commit);
          notify();
          return commit;
        },
      };
    },
    /** The host's zoom and pan now. */
    get view() { return { zoom: view.zoom, pan: [...view.pan] }; },
    /** Sets the zoom and pan (viewport.js's navigator gives them) and draws through it: not logged. @param {{ zoom: number, pan: readonly number[] }} v */
    setView(v) { view = { zoom: v.zoom, pan: [...v.pan] }; page.setView(view); changed(); },
    /** Fit: the unzoomed stage. */
    fit() { view = { zoom: FIT.zoom, pan: [...FIT.pan] }; page.setView(view); changed(); },
    /**
     * A custom element stage's event (`wb-control`, `wb-param`, `wb-edit`, element-events.js): the refusals with the
     * kit's own codes, empty when it was logged.
     * @param {string} type @param {any} detail
     */
    element: (type, detail) => elements.handle(type, detail),
    /**
     * A new text of the Program put in force (load.js's `reloadText` built it): when the composition's parts, wires and
     * shown part are the same, each part's rebuild is logged (built with the run's params, so the record is the last
     * preview's and the part does not restart again), a param whose declared value changed gets it as an input, and
     * the texts follow. Otherwise the run cannot take it: `{ ok: false, reload: true, why }`, and the host starts a new
     * run on it.
     * @param {import("./load.js").Loaded} next
     * @returns {{ ok: true } | { ok: false, reload: true, why: string }}
     */
    install(next) {
      if (!next.composed) return { ok: false, reload: true, why: "the text did not build" };
      if (shapeOf(next.composed) !== shapeOf(composed)) return { ok: false, reload: true, why: "the composition's parts or wires changed, so it runs again as a new run" };
      rebuild = next.rebuild;
      for (const part of userParts) {
        const was = recordOf(part);
        const record = next.rebuild ? next.rebuild(part, { ...page.run.params(part) }) : next.composed.parts.find((/** @type {any} */ p) => p.name === part).record;
        const kept = runRecord(part);
        page.run.input({ kind: "rebuild", part, record });
        if (next.source) { texts[part] = next.source; pending.set(part, { record, text: next.source, kept }); }
        const now = page.run.params(part);
        for (const [name, decl] of Object.entries(/** @type {Record<string, any>} */ (record.params ?? {}))) {
          if (decl?.value !== was.params?.[name]?.value && decl?.value !== now[name]) setParam(part, name, decl.value);
        }
      }
      changed();
      return { ok: true };
    },
  };
}
