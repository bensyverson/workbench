// A loaded workbench, running: kit/page's page, plus what the host adds on top of it: the scrubber (a rewind through
// the run, a step while paused), a param edit and a UI button as run inputs, and a snapshot for the panels each frame.
// It takes the canvas context and the frame source from the host, so Node tests drive it by hand. The UI's values,
// its Controls, its annotations and its sweeps are the kit's (kit/define's ui.compile, kit/page's sweepRuns). The
// stage side (project/2026-11-27-controls-draft.md, requirements 7 to 10): the Grips in canvas pixels and their drags,
// the host's zoom and pan, a custom element stage's events, and a new text of the Program put in force (`install`).

import { createPage, sweepRuns } from "../index.js";
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
 * @property {(refusals: Array<{ code: string, severity: "error" | "warning", message: string, fix?: string }>) => void} [onStage]  a custom element's refusal found after its event (a preview that does not build when the frame builds it, H012), with its own code, for the stage's list; without it, said through onProblem
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
  /** The build in force: `install` swaps in the new text's, so a preview builds the text the record came from. */
  let rebuild = loaded.rebuild;
  /** The composition the text in force built (`install` swaps it), whose records a workbench with no rebuild puts in force. */
  let textComposed = composed;
  /**
   * The records built from the text in force: its build's, `install`'s, and a build-time param's rebuild of it (a
   * preview built with an argument overridden is not one). A record in force that is not among them came from another
   * text (a scrub back past a write-back), and the session puts the text in force again (`restoreText`).
   * @type {WeakSet<object>}
   */
  let ofText = new WeakSet(composed.parts.map((/** @type {any} */ p) => p.record).filter((/** @type {unknown} */ r) => r !== null && typeof r === "object"));
  /** @param {string} part @param {Record<string, unknown>} params @param {{ args?: Record<string, unknown> }} [more] */
  const built = (part, params, more) => {
    const record = /** @type {NonNullable<typeof rebuild>} */ (rebuild)(part, params, more);
    if (record !== null && typeof record === "object" && !Object.keys(more?.args ?? {}).length) ofText.add(record);
    return record;
  };
  const page = createPage({
    composed, runtimes: loaded.runtimes, packages: loaded.packages.map((p) => p.loaded), context: options.context,
    requestFrame: (cb) => frame((ms) => { flushEdits(); cb(ms); notify(); }),
    texts,
    ...(options.decode ? { decode: options.decode } : {}),
    ...(loaded.rebuild || options.run ? { run: { ...(loaded.rebuild ? { build: built } : {}), ...(options.run ?? {}) } } : {}),
  });
  /** The record in force for a part (a rebuild changes it, one that keeps the key included). @param {string} part @returns {Record<string, any>} */
  const recordOf = (part) => (page.run.composed ?? composed).parts.find((/** @type {any} */ p) => p.name === part)?.record ?? {};
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
  /** The host's zoom and pan of the stage, which kit/page draws through (not logged). */
  /** @type {{ zoom: number, pan: number[] }} */
  let view = { zoom: FIT.zoom, pan: [...FIT.pan] };

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
    // the scrubber's top, whether or not a panel reads the snapshot
    head = Math.max(head, page.run.seconds);
    try { options.onFrame?.(snapshot()); said = null; } catch (e) {
      const m = `the panels threw: ${e instanceof Error ? e.message : e}`;
      if (m !== said) { said = m; options.onProblem?.(m); }
    }
  };
  const changed = () => { page.draw(); notify(); };

  /** @param {string} part @param {string} name @param {number | string | boolean} value @returns {Array<{ code: string, message: string, part?: string }>} */
  const setParam = (part, name, value) => {
    // while paused there is no next frame to apply it at, so it is in force at once
    const e = { kind: "param", part, name, value };
    try { if (page.driver.paused) page.run.inputNow(e); else page.run.input(e); } catch (e) {
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
    control, setParam,
    writeProblem: (part, to) => page.writeProblem(part, to),
    declares: (part, name) => Object.hasOwn(recordOf(part).params ?? {}, name),
    build: (part, to, value) => {
      if (!rebuild) throw new Error("this workbench has no build to preview an argument with");
      return rebuild(part, { ...page.run.params(part) }, { args: { [to.slice(4)]: value } });
    },
    // a commit's at once (the write-back's rebuild follows it at once), and a preview at once while paused
    logRebuild: (part, record, phase) => { const e = { kind: "rebuild", part, record }; if (phase === "commit" || page.driver.paused) page.run.inputNow(e); else page.run.input(e); },
    commit: (c) => options.onCommit?.(c),
    refused: (r) => { if (options.onStage) options.onStage([r]); else options.onProblem?.(`${r.code} ${r.message}`); },
  });
  flushEdits = () => elements.flush();

  /**
   * Puts a record of the text in force at once (kit/run's inputNow: no frame shows the text new and the record old),
   * and, for each param whose declared value it changes from `was`'s, that value, unless the run already has it.
   * @param {string} part @param {Record<string, any>} record @param {Record<string, any>} was
   */
  function putInForce(part, record, was) {
    ofText.add(record);
    page.run.inputNow({ kind: "rebuild", part, record });
    const now = page.run.params(part);
    for (const [name, decl] of Object.entries(/** @type {Record<string, any>} */ (record.params ?? {}))) {
      if (decl?.value !== was.params?.[name]?.value && decl?.value !== now[name]) {
        try { page.run.inputNow({ kind: "param", part, name, value: decl.value }); } catch (e) { if (!(e instanceof RunError)) throw e; }
      }
    }
  }
  /**
   * The text is the source of truth, and a rewind is a branch of the run, not of the text (the integrator's ruling,
   * 2026-11-27): after a scrub or a seek, each part whose record in force is not the text's gets the text's, built with
   * the run's params, at the new T, as `install` does.
   */
  function restoreText() {
    for (const part of userParts) {
      const was = recordOf(part);
      if (ofText.has(was)) continue;
      const record = rebuild ? built(part, { ...page.run.params(part) }) : textComposed.parts.find((/** @type {any} */ p) => p.name === part)?.record;
      if (record) putInForce(part, record, was);
    }
  }

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
      restoreText();
      changed();
    },
    /** Moves to `seconds`: a rewind below where the run is, a run forward up to the furthest point it reached. Pauses. @param {number} seconds */
    scrub(seconds) {
      page.driver.pause();
      const t = Math.max(0, Math.min(seconds, head));
      if (t < page.run.seconds) page.run.rewind(t); else page.run.runUntil(t);
      restoreText();
      changed();
    },
    /** Whether every part's record in force was built from the text in force (a rewind past the session can leave one that was not). */
    textInForce: () => userParts.every((/** @type {string} */ part) => ofText.has(recordOf(part))),
    /**
     * A param edit, as a logged input the run applies at its next instant, or at once while paused: the diagnostics
     * the run refused it with (N008: a value that does not fit the param's declaration), empty when it was logged.
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
    grips: () => page.grips().map((g) => {
      const [x, y] = page.fromStage(g.at);
      return { part: g.part, grip: g.grip, index: g.index, kind: g.kind, ...(g.label ? { label: g.label } : {}), x, y, to: g.to, disabled: g.disabled };
    }),
    /**
     * Takes hold of a Grip at a canvas point: its moves preview through the log (kit/page's `page.grab`, at most one
     * input a frame), and its release hands `{ part, to, value }` to `onCommit` and returns it.
     * @param {{ part: string, grip: string, index: number }} ref @param {number} x @param {number} y
     */
    grab(ref, x, y) {
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
      textComposed = next.composed;
      ofText = new WeakSet();
      for (const part of userParts) {
        const was = recordOf(part);
        const record = next.rebuild ? built(part, { ...page.run.params(part) }) : next.composed.parts.find((/** @type {any} */ p) => p.name === part).record;
        if (next.source) texts[part] = next.source;
        putInForce(part, record, was);
      }
      changed();
      return { ok: true };
    },
  };
}
