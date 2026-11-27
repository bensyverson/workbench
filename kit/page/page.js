// createPage: a composed run mounted on a canvas (the draw-list draft's ruling of 2026-11-26, leaf hca0YM; declared
// Controls, 2026-11-27). It creates the run (kit/run, a display run under the real-time driver) and advances it on the
// frames the host gives it; draws the shown part's Draw list each frame through the host's zoom and pan; turns key
// events into the declared Controls' page inputs, stamped with the device's own time; routes the pointer to the part
// under it; lists and drags Grips; holds the run locked until one gesture; and runs the draw-time profile check where
// it draws. It builds no UI and touches no DOM: the context, the frame source, the decoder and the events are the
// host's, so Node tests drive it by hand.

import { createRun, createDriver, pageView } from "../run/index.js";
import { drawCanvas } from "../draw/index.js";
import { qText, toNumber } from "../define/rational.js";
import { siteOf } from "../define/index.js";
import { PAGE } from "../compose/page.js";
import { uiFor } from "../compose/page.js";
import { MAX_PAGE_DIAGNOSTICS } from "./codes.js";
import { keyMap, keyState } from "./keys.js";
import { decodeSources } from "./sources.js";
import { toStage, hitsOf, edgeInto, intoPart, fromPart, pointerRecord, PHASES } from "./pointer.js";
import { gripValue } from "./grips.js";
import { targetProblem } from "./writeback.js";

/** @typedef {import("./codes.js").PageDiagnostic} PageDiagnostic */
/** @typedef {import("./sources.js").Decode} Decode */
/**
 * What createPage takes. `composed` is kit/compose's built record (its `profile`, when it was built with one, is
 * the draw-time check's; its page entry's `controls`, the declared Controls); `runtimes` kit/define's defineRuntime
 * results; `packages` kit/package's loadPackage results (each image file's bytes, the content keys kit/run gives the
 * parts, and each part's UI, whose Grips the page lists); `context` a Canvas 2D context; `requestFrame(callback)` asks
 * for one display frame, calling back with a time in milliseconds (requestAnimationFrame); `decode(bytes, info)` turns
 * a PNG's bytes into a drawImage source, or a promise of one (createImageBitmap in a browser); `keys` the host's
 * override of the declared key codes, `{ "<code>": "<target>" }`; `texts` each part's Program text, by part, so a Grip
 * whose argument is not a literal shows disabled (H011); `run` more of createRun's options (seed, params, inputs,
 * catchUp, checkpointEvery, build: `build(part, params, { args })` also previews a Grip's argument).
 * @typedef {{ composed: any, runtimes: any[], packages?: any[], context: import("../draw/canvas.js").Context2D & { clearRect: Function }, requestFrame: (callback: (ms: number) => void) => unknown, decode?: Decode, keys?: Record<string, string>, texts?: Record<string, string>, run?: Record<string, any> }} PageOptions
 */

/** @param {unknown} e */
const messageOf = (e) => (e instanceof Error ? e.message : String(e));

/** @param {PageOptions} options */
export function createPage(options) {
  const { composed, runtimes, context: ctx, requestFrame } = options;
  const packages = options.packages ?? [];
  if (typeof requestFrame !== "function") throw new Error("createPage needs requestFrame(callback), the host's frame source (requestAnimationFrame in a browser)");
  /** The page's declared Controls, as composed, and the ones some wire takes: a key for any other is not the page's. */
  const allControls = /** @type {Record<string, any>} */ (composed.parts.find((/** @type {any} */ p) => p.name === PAGE && p.dialect === PAGE)?.controls ?? {});
  const wiredNames = new Set(composed.wires.flatMap((/** @type {{ from: string }} */ w) => (w.from.startsWith(`${PAGE}.out.`) ? [w.from.slice(PAGE.length + 5)] : [])));
  const controls = Object.fromEntries(Object.entries(allControls).filter(([n]) => wiredNames.has(n)));
  const keys = keyMap(allControls, options.keys ?? {});
  const held = keyState(allControls, keys);
  const run = createRun(composed, { ...(options.run ?? {}), runtimes, packages, frames: "display" });
  const driver = createDriver(run);
  /** @type {PageDiagnostic[]} */
  const diagnostics = [];
  /** Adds a diagnostic, keeping the list to MAX_PAGE_DIAGNOSTICS (the oldest go, in place: hosts hold the array). @param {PageDiagnostic} d */
  const report = (d) => {
    diagnostics.push(d);
    if (diagnostics.length > MAX_PAGE_DIAGNOSTICS) diagnostics.splice(0, diagnostics.length - MAX_PAGE_DIAGNOSTICS);
  };
  /** @type {Record<string, unknown>} */
  let sources = {};
  const now = () => qText(run.T);

  // the lock (requirement 13): a page whose Controls take keys, MIDI, a gamepad or direct latency waits for one gesture
  let locked = Object.values(controls).some((c) => c.decl.keys !== undefined || c.decl.midi !== undefined || c.decl.gamepad !== undefined || c.latency !== undefined);
  if (locked) driver.pause();
  /** @type {Array<() => unknown>} */
  const unlockHooks = [];
  /** The text Control that has focus, which takes every key. @type {string | null} */
  let focused = null;
  /** The host's zoom and pan of the stage: not logged, as a window size is not. */
  let viewport = { zoom: 1, pan: [0, 0] };
  /** The last display frame: its wall time and the run's T after it, for device stamps. @type {{ ms: number, T: number } | null} */
  let lastFrame = null;

  /** The page's view now, or null when there is nothing to draw (H002, reported once, at creation). */
  const view = () => {
    if (!composed.show || !composed.parts.some((/** @type {{ name: string }} */ p) => p.name === composed.show)) return null;
    const v = pageView(run, composed, runtimes);
    return v.port ? v : null;
  };
  const first = view();
  if (!first) {
    const message = composed.show ? `the page shows ${composed.show}, which has no Draw output (a custom element stage or the text view draws it), so the canvas stays empty` : "the composition shows no part (.show(<part>) in the glue), so the canvas stays empty";
    report({ code: "H002", severity: "warning", message, T: now(), ...(composed.show ? { part: composed.show } : {}) });
  }
  /** The box in force: pageView's, which a rebuild that changes the shown picture's extent changes (leaf EggIAM). */
  let box = first?.box ?? null;
  const shown = composed.parts.find((/** @type {{ name: string }} */ p) => p.name === composed.show);
  if (first && !box && shown?.layer !== undefined) {
    report({ code: "H010", severity: "warning", message: `the page shows layer ${shown.name}, whose bottom frame ${shown.layer.frame} has no extent, so the page has no size and the canvas stays hidden (a layer has no text stage to fall back on)`, T: now(), part: shown.name });
  }
  /** @param {{ min: number[], max: number[] } | null} b */
  const sizeOf = (b) => (b ? { width: b.max[0] - b.min[0], height: b.max[1] - b.min[1] } : null);
  let size = sizeOf(box);

  const ready = decodeSources(composed.parts, runtimes, packages, options.decode).then((r) => {
    sources = r.sources;
    for (const p of r.problems) report({ code: "H003", severity: "warning", message: p.message, T: now(), part: p.part });
  });

  /**
   * The refusal last reported, so one refusal is one diagnostic while it lasts. Its key is what stays the same
   * while the picture moves: the output and the J codes the check found. @type {string | null}
   */
  let refused = null;
  /** Draws the shown list now, through the host's zoom and pan, and reports a draw-time refusal once. */
  function draw() {
    const v = view();
    // a host that keeps its canvas at the old size until it reads the new one is cleared over both
    const was = size;
    if (v?.box && box && (v.box.min.some((x, i) => x !== box?.min[i]) || v.box.max.some((x, i) => x !== box?.max[i]))) { box = v.box; size = sizeOf(box); }
    if (size) ctx.clearRect(0, 0, Math.max(size.width, was?.width ?? 0), Math.max(size.height, was?.height ?? 0));
    if (!v) return null;
    const moved = box && (box.min[0] !== 0 || box.min[1] !== 0);
    const zoomed = viewport.zoom !== 1 || viewport.pan[0] !== 0 || viewport.pan[1] !== 0;
    if (moved || zoomed) ctx.save();
    if (zoomed) { ctx.translate(viewport.pan[0], viewport.pan[1]); ctx.scale(viewport.zoom, viewport.zoom); }
    if (moved && box) ctx.translate(-box.min[0], -box.min[1]);
    drawCanvas(ctx, [...v.list], { images: v.images, sources });
    if (moved || zoomed) ctx.restore();
    const check = v.check;
    if (check && !check.ok) {
      const label = composed.profile.label;
      const why = check.diagnostics.map((d) => d.message.startsWith(`${label}: `) ? d.message.slice(label.length + 2) : d.message).join("; ");
      const key = `${v.part}.${v.port}: ${[...new Set(check.diagnostics.map((d) => d.code))].sort().join(" ")}`;
      if (key !== refused) {
        // the instant the shown list was committed at (null: its init's, at 0), not the frame's time
        const T = run.snapshot(v.part).T ?? "0";
        report({ code: "H001", severity: "error", message: `the ${label} refuses ${v.part}.out.${v.port} at T = ${T}: ${why}. The page draws it anyway, on Canvas`, T, part: v.part, check: check.diagnostics });
        refused = key;
      }
    } else refused = null;
    return v;
  }

  // ---- Grips (requirements 7 and 8) ----
  /** Each part's UI compiled against its record, made once per record. @type {Map<string, { record: any, compiled: any }>} */
  const compiled = new Map();
  /** @param {string} part */
  const uiOfPart = (part) => {
    const cp = composed.parts.find((/** @type {any} */ p) => p.name === part);
    const rt = runtimes.find((r) => r.dialect?.name === cp?.dialect);
    return rt ? uiFor(packages, rt.dialect) : null;
  };
  /** The record in force for a part. @param {string} part @returns {Record<string, any>} */
  const recordOf = (part) => (run.composed ?? composed).parts.find((/** @type {any} */ p) => p.name === part)?.record ?? {};
  /** @param {string} part */
  const compiledOf = (part) => {
    const record = recordOf(part);
    const had = compiled.get(part);
    if (had && had.record === record) return had.compiled;
    const ui = uiOfPart(part);
    const c = ui ? ui.compile(record) : null;
    compiled.set(part, { record, compiled: c });
    return c;
  };
  /** The H011s already listed, so one is one diagnostic. */
  const said = new Set();
  /** Why a target cannot be written, or null. @param {string} part @param {string} to */
  const writeProblem = (part, to) => {
    const record = recordOf(part);
    if (typeof to !== "string" || !/^(param|arg)\./.test(to)) return { code: "H011", message: `the target ${JSON.stringify(to)} is neither "param.<name>" nor "arg.<address>"` };
    const site = siteOf(record, to);
    if (!site) return { code: "H011", message: `no call of part ${part}'s Program is at ${to}` };
    if (site.calls > 1) return { code: "H011", message: `this call runs ${site.calls} times, so its argument is not one value` };
    const text = options.texts?.[part];
    return text ? targetProblem(text, record, to) : null;
  };
  /** Every Grip on the stage now, in the shown frame. */
  function grips() {
    /** @type {Array<{ part: string, grip: string, index: number, kind: string, label?: string, at: number[], to: string, disabled: { code: string, message: string } | null, item: unknown, axis?: number[], center?: number[], decl: any }>} */
    const out = [];
    const v = view();
    for (const cp of composed.parts) {
      if (cp.name === PAGE || cp.layer !== undefined) continue;
      const ui = uiOfPart(cp.name);
      if (!ui || !Object.keys(ui.grips ?? {}).length) continue;
      const c = compiledOf(cp.name);
      const state = run.state(cp.name);
      if (!c || state === null || state === undefined) continue;
      const params = run.params(cp.name);
      const edge = v ? edgeInto(run.composed ?? composed, v.part, cp.name, String(ui.stage?.draw ?? "view")) : null;
      for (const [name, g] of Object.entries(/** @type {Record<string, any>} */ (ui.grips))) {
        const items = typeof g.each === "string" ? /** @type {unknown[]} */ (g.each.split(".").reduce((/** @type {any} */ o, /** @type {string} */ k) => o?.[k], state) ?? []) : [null];
        items.forEach((item, index) => {
          const args = typeof g.each === "string" ? [item, state, params] : [state, params];
          /** @param {string} key */
          const at = (key) => (g[key] === undefined ? undefined : /** @type {number[]} */ (c.value(`grips.${name}.${key}`, ...args)));
          let to, where, disabled = null;
          try { to = /** @type {string} */ (c.value(`grips.${name}.to`, ...args)); where = /** @type {number[]} */ (at("at")); } catch (e) { disabled = { code: "H011", message: messageOf(e) }; }
          if (!disabled) disabled = writeProblem(cp.name, /** @type {string} */ (to));
          if (disabled) {
            const key = `${cp.name}.${name}[${index}] ${to}`;
            if (!said.has(key)) { said.add(key); report({ code: "H011", severity: "warning", message: `the Grip ${name} [${index}] of part ${cp.name} is drawn disabled: ${disabled.message}`, T: now(), part: cp.name }); }
          }
          out.push({ part: cp.name, grip: name, index, kind: g.kind, ...(g.label ? { label: g.label } : {}), at: where ? fromPart(where, edge) : [NaN, NaN], to: /** @type {string} */ (to), disabled, item, axis: at("axis"), center: at("center"), decl: g });
        });
      }
    }
    return out;
  }
  /** The previews that failed and were reported, by part and target, until one builds again. */
  const failing = new Set();
  /**
   * Previews a target's value through the log: a `param` input, or a `rebuild` built with the argument overridden
   * (createPage's `run.build`). A preview whose build fails (no record, or a throw: the Grammar or the Dialect refused
   * the value) is skipped and reported once as H012, so the drag goes on and its release gives the last value that
   * built. True when it was logged, or, with `log` false (a wired Control's commit, which has no preview to show),
   * when the value builds.
   * @param {string} part @param {string} to @param {unknown} value @param {string} what @param {boolean} [log]
   */
  function preview(part, to, value, what, log = true) {
    const param = to.startsWith("param.") ? to.slice(6) : null;
    const build = options.run?.build;
    if (param === null && typeof build !== "function") throw new Error("a Grip or a Control on an argument previews by building the part with the argument overridden: pass run: { build(part, params, { args }) }");
    const key = `${part} ${to}`;
    try {
      if (param !== null) {
        // a commit with no preview to log is checked by building the part with the value
        if (log) logInput({ kind: "param", part, name: param, value });
        else if (typeof build === "function") build(part, { ...run.params(part), [param]: value }, {});
      } else {
        const record = /** @type {Function} */ (build)(part, { ...run.params(part) }, { args: { [to.slice(4)]: value } });
        if (record === null || typeof record !== "object") throw new Error("its build gave no record (the Program refused the value)");
        if (log) logInput({ kind: "rebuild", part, record });
      }
      failing.delete(key);
      return true;
    } catch (e) {
      if (!failing.has(key)) {
        failing.add(key);
        report({ code: "H012", severity: "error", message: `the preview of ${what} of part ${part} at ${to} = ${JSON.stringify(value)} does not build, so it is skipped and the drag goes on: ${messageOf(e)}`, T: now(), part });
      }
      return false;
    }
  }
  /** The drags in flight, each with its latest unflushed value. @type {Set<{ flush: () => void }>} */
  const drags = new Set();
  /**
   * Takes hold of a Grip at a point of the shown frame. Its moves preview through the log, at most one input a frame
   * (a param input, or a rebuild built with the argument overridden), and its release gives the commit, `{ to, value }`,
   * for the host to write back. A disabled Grip cannot be taken (its H011).
   * @param {{ part: string, grip: string, index: number }} ref @param {number[]} point
   */
  function grab(ref, point) {
    const g = grips().find((x) => x.part === ref.part && x.grip === ref.grip && x.index === ref.index);
    if (!g) throw new Error(`no Grip ${ref.grip} [${ref.index}] on part ${ref.part}`);
    if (g.disabled) throw new Error(`${g.disabled.code} ${g.disabled.message}`);
    const record = recordOf(g.part);
    const site = siteOf(record, g.to);
    const param = g.to.startsWith("param.") ? g.to.slice(6) : null;
    const v0 = param !== null ? run.params(g.part)[param] ?? site?.value : site?.value;
    const edge = (() => { const v = view(); return v ? edgeInto(run.composed ?? composed, v.part, g.part, String(uiOfPart(g.part)?.stage?.draw ?? "view")) : null; })();
    const p0 = intoPart(point, edge);
    /** @type {unknown} */
    let pending;
    /** @type {unknown} */
    let last = v0;
    const flush = () => {
      if (pending === undefined) return;
      const value = pending;
      pending = undefined;
      if (preview(g.part, g.to, value, `the Grip ${g.grip} [${g.index}]`)) last = value;
    };
    const drag = { flush };
    drags.add(drag);
    return {
      /** @param {number[]} p @param {{ alt?: boolean }} [o] */
      move(p, o = {}) {
        pending = gripValue({ kind: /** @type {any} */ (g.kind), v0: /** @type {any} */ (v0), p0, p: intoPart(p, edge), axis: g.axis, center: g.center, unit: g.decl.unit, step: g.decl.step, min: site?.min, max: site?.max, whole: site?.whole, alt: o.alt });
      },
      release() { flush(); drags.delete(drag); return { to: g.to, value: last }; },
    };
  }

  // ---- Controls with `to` (requirements 1, 2 and 8) ----
  /** The part whose UI declares a Control, and that UI: a page Control's (S119 keeps one with `to` to one part), or a part-local one's. @param {string} name */
  const ownerOf = (name) => {
    for (const cp of composed.parts) {
      if (cp.name === PAGE || cp.layer !== undefined) continue;
      const ui = uiOfPart(cp.name);
      if (ui && Object.hasOwn(ui.controls ?? {}, name)) return { part: /** @type {string} */ (cp.name), ui };
    }
    return null;
  };
  /** Why a Control's target cannot be written, reported once as H011, or null. @param {string} part @param {string} what @param {string} to */
  const controlProblem = (part, what, to) => {
    const d = writeProblem(part, to);
    if (d) {
      const key = `${part}.${what} ${to}`;
      if (!said.has(key)) { said.add(key); report({ code: "H011", severity: "warning", message: `the Control ${what} of part ${part} cannot write back to ${to}: ${d.message}`, T: now(), part }); }
    }
    return d ? { code: d.code, message: d.message } : null;
  };
  /**
   * The page's Controls: the wired page Controls in declaration order, then each part's part-local ones (a name that
   * is no Event input, with `to`). A Control with `to` carries its part, its target and why it cannot be written (or
   * null); a keyed one its instances for the record in force, each with its own `to`.
   * @returns {Array<Record<string, any>>}
   */
  function controlList() {
    /** @param {string} name @param {Record<string, any>} c @param {{ part: string, ui: any } | null} own */
    const entry = (name, c, own) => {
      const decl = own?.ui.controls?.[name]?.decl ?? c.decl ?? {};
      const to = typeof decl.to === "string" ? decl.to : undefined;
      /** @type {Record<string, any>} */
      const item = { name, ...c, ...(own ? { part: own.part } : {}), ...(to && own ? { to, disabled: controlProblem(own.part, name, to) } : {}) };
      if (c.keyed && own) {
        const instances = /** @type {Array<Record<string, any>>} */ (compiledOf(own.part)?.instances?.[name] ?? []);
        item.instances = instances.map(({ each: _, ...i }) => ({ ...i, ...(typeof i.to === "string" ? { disabled: controlProblem(own.part, `${name} [${i.key}]`, i.to) } : {}) }));
      }
      return item;
    };
    const out = Object.entries(controls).map(([name, c]) => entry(name, c, ownerOf(name)));
    for (const cp of composed.parts) {
      if (cp.name === PAGE || cp.layer !== undefined) continue;
      const ui = uiOfPart(cp.name);
      for (const [name, c] of Object.entries(/** @type {Record<string, any>} */ (ui?.controls ?? {}))) {
        if (!c.local) continue;
        const { input: _, ...rest } = c;
        out.push(entry(name, rest, { part: cp.name, ui }));
      }
    }
    return out;
  }
  /** A part-local Control's previews waiting for the next frame, the latest of each target. @type {Map<string, { part: string, to: string, value: unknown, what: string }>} */
  const waiting = new Map();
  const flushControls = () => {
    const all = [...waiting.values()];
    waiting.clear();
    for (const w of all) preview(w.part, w.to, w.value, w.what);
  };
  /**
   * A Control's change from an on-screen form or a custom element (`record` is the Control's record, a keyed one's
   * with its `key`). A Control with an input logs it as a page input, stamped as a key is (`o.timeStamp`), and its
   * input carries the live value. With `to`, a `phase: "preview"` (a drag in flight) commits nothing, and a part-local
   * Control previews its target through the log, at most once a frame, as a Grip does; the release (`phase` "commit",
   * the default) gives the commit `{ part, to, value }` for the host to write back, a part-local one's preview logged
   * at once and a wired one's value checked by a build, so a commit is only ever a value some build accepted (a value
   * that does not build gives null and the page diagnostic H012). A target that cannot be written is H011: a part-local Control's change then throws, and one with an
   * input still plays and commits nothing. Throws for a Control the page lacks or an instance a keyed one lacks.
   * @param {string} name @param {Record<string, any>} record @param {{ phase?: "preview" | "commit", timeStamp?: number }} [o]
   * @returns {{ part: string, to: string, value: unknown } | null}
   */
  function control(name, record, o = {}) {
    const phase = o.phase ?? "commit";
    if (phase !== "preview" && phase !== "commit") throw new TypeError(`a Control's phase is "preview" or "commit", not ${JSON.stringify(phase)}`);
    const list = controlList();
    const c = list.find((x) => x.name === name);
    if (!c) throw new Error(`the page has no Control '${name}' (a page Control some wire takes, or a part-local one): its Controls are ${list.map((x) => x.name).join(", ") || "none"}`);
    let to = c.to, disabled = c.disabled ?? null, what = name;
    // a keyed Control whose UI the page cannot read has no instances to check: its input alone judges the record
    if (c.keyed && c.instances) {
      const inst = /** @type {Array<Record<string, any>>} */ (c.instances).find((i) => i.key === record?.key);
      if (!inst) throw new Error(`the Control '${name}' has no instance '${record?.key}': its keys are ${(c.instances ?? []).map((/** @type {any} */ i) => i.key).join(", ") || "none"}`);
      to = inst.to; disabled = inst.disabled ?? null; what = `${name} [${inst.key}]`;
    }
    if (!c.local) logInput({ kind: "control", part: PAGE, name, value: { ...record } }, o);
    if (typeof to !== "string") return null;
    if (disabled) { if (c.local) throw new Error(`${disabled.code} ${disabled.message}`); return null; }
    if (!record || !("value" in record)) throw new TypeError(`the Control '${name}' writes its record's value back to ${to}, and ${JSON.stringify(record)} has none`);
    const part = /** @type {string} */ (c.part), value = record.value;
    if (c.local) {
      const key = `${part} ${to}`;
      if (phase === "preview") { waiting.set(key, { part, to, value, what: `the Control ${what}` }); return null; }
      waiting.delete(key);
      if (!preview(part, to, value, `the Control ${what}`)) return null;
    } else if (phase === "preview") return null;
    else if (!preview(part, to, value, `the Control ${what}`, false)) return null;
    return { part, to, value };
  }

  // ---- the pointer (requirements 5 and 10) ----
  /** The part a pointer is captured by, from its down to its up or cancel, and where it last was. @type {Map<number, { part: string, output: string, at?: number[] }>} */
  const captured = new Map();
  /** Which parts take the pointer, on which output. @param {string} part @param {string} output */
  const takes = (part, output) => composed.parts.find((/** @type {any} */ p) => p.name === part)?.pointer?.[output];
  /** The shown point's hits. @param {number} x @param {number} y */
  const hits = (x, y) => { const v = view(); return v ? hitsOf(v, toStage(x, y, viewport, box), run.composed ?? composed) : []; };
  /** The bottom part of the shown stage, and its output. */
  const bottom = () => {
    if (shown?.layer === undefined) return shown ? { part: shown.name, output: view()?.port ?? "view" } : null;
    /** @param {string} layer @returns {{ part: string, output: string }} */
    const under = (layer) => { const [part, , output] = composed.parts.find((/** @type {any} */ p) => p.name === layer).layer.inputs[0].split("."); return composed.parts.find((/** @type {any} */ p) => p.name === part)?.layer !== undefined ? under(part) : { part, output }; };
    return under(shown.name);
  };
  /**
   * A pointer event on the canvas (`{ type, x, y, pointerId, buttons, detail, deltaX, deltaY, shiftKey, altKey, metaKey,
   * ctrlKey, timeStamp? }`): logged for the topmost hit part that takes the pointer, else the next hit down, else the
   * bottom part; captured from a down to its up or cancel. True when a part took it. The first down unlocks the page.
   * @param {Record<string, any>} event
   */
  function pointer(event) {
    const phase = /** @type {Record<string, string>} */ (PHASES)[event.type];
    if (!phase) return false;
    if (locked) { if (phase !== "down") return false; unlock(); }
    const v = view();
    if (!v) return false;
    const point = toStage(event.x, event.y, viewport, box);
    const all = hitsOf(v, point, run.composed ?? composed);
    const id = Number(event.pointerId ?? 0);
    /** @type {{ part: string, output: string } | null} */
    let target = captured.get(id) ?? null;
    if (!target) {
      const hit = all.find((h) => takes(h.part, h.output));
      target = hit ? { part: hit.part, output: hit.output } : bottom();
    }
    if (!target || !takes(target.part, target.output)) return false;
    const at = intoPart(point, edgeInto(run.composed ?? composed, v.part, target.part, target.output));
    const own = all.find((h) => h.part === target.part);
    if (phase === "down") captured.set(id, { ...target, at });
    else if (captured.has(id)) /** @type {any} */ (captured.get(id)).at = at;
    if (phase === "up" || phase === "cancel") captured.delete(id);
    logInput({ kind: "pointer", part: target.part, output: target.output, value: pointerRecord(event, at, own?.id ?? "") }, event);
    return true;
  }

  /**
   * The latest stamp the page has logged a page input at, in seconds: no later page input is stamped before it. A
   * rewind starts a new branch (kit/run drops the inputs after it), so the run's T going back clears it.
   */
  let latest = 0;
  /** The run's T when the page last looked (each frame, each input). */
  let latestAt = 0;
  /** Whether the log still holds an input stamped at `t` seconds: a rewind to exactly the page's last T drops one stamped ahead without T going back. @param {number} t */
  const logged = (t) => run.log.inputs.some((/** @type {{ kind: string, T: unknown }} */ e) => { const [n, d = "1"] = String(e.T).split("/"); return e.kind !== "frame" && Number(n) / Number(d) === t; });
  const latestNow = () => { const t = toNumber(run.T); if (t < latestAt || (latest > t && !logged(latest))) latest = 0; latestAt = t; return latest; };
  /** The first millisecond after the run's T, in seconds. */
  const afterNow = () => (Math.floor(toNumber(run.T) * 1000) + 1) / 1000;
  /**
   * Logs a page input (a Control's record, a pointer event, a Grip's preview) at the event's device time when it has
   * one, else the first millisecond after T, and never before the latest stamp the page logged: inputs reach the
   * log in the order the page made them, so a blur's release cannot precede the press it releases.
   * @param {Record<string, any>} e @param {{ timeStamp?: number }} [event]
   */
  const logInput = (e, event = {}) => {
    const T = Math.max(typeof event.timeStamp === "number" ? stampOf(event.timeStamp) : afterNow(), latestNow());
    latest = T;
    return run.input({ ...e, T });
  };
  /**
   * A device time (an event's timeStamp, in ms) as a stamp in seconds: mapped onto T through the last display frame,
   * never at or before the last instant run (then the first millisecond after it), never past the furthest the
   * following frame can reach (the run's catch-up cap past the last frame: a late frame callback runs capped), never
   * before the latest stamp the page logged, and while paused the next instant.
   * @param {number} ms
   */
  function stampOf(ms) {
    const after = Math.max(afterNow(), latestNow());
    if (driver.paused || !lastFrame) return after;
    const t = Math.round((lastFrame.T + (ms - lastFrame.ms) / 1000) * 1000) / 1000;
    const cap = toNumber(run.catchUp);
    const open = toNumber(run.lastFrame) + cap > toNumber(run.T);
    const most = Math.floor(((open ? toNumber(run.lastFrame) : toNumber(run.T)) + cap) * 1000) / 1000;
    return Math.max(after, Math.min(t, most));
  }

  /**
   * The one gesture: the run started, then every hook (MIDI access, an AudioContext). A hook that throws is H014 (a
   * device adapter refused), and the other hooks and adapters still work: the run never stays paused for it.
   */
  function unlock() {
    if (!locked) return;
    locked = false;
    driver.resume();
    for (const h of unlockHooks) {
      try { h(); } catch (e) { report({ code: "H014", severity: "warning", message: `an unlock hook threw ${messageOf(e)}: that device is not available, and the other adapters still work`, T: now() }); }
    }
  }

  let generation = 0;
  /** The H004 that stopped the frame loop, or null. @type {PageDiagnostic | null} */
  let halted = null;
  /** @type {number | null} */
  let last = null;
  /** @param {number} gen @returns {(ms: number) => void} */
  const tick = (gen) => (ms) => {
    if (gen !== generation) return;
    const wall = last === null ? 0 : (ms - last) / 1000;
    last = ms;
    try {
      for (const d of drags) d.flush();
      flushControls();
      if (wall > 0) driver.frame(wall);
      lastFrame = { ms, T: toNumber(run.T) };
      latestNow();
      draw();
    } catch (e) {
      // a frame that throws would throw again on the next, so the loop stops and the host sees why
      const what = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
      halted = { code: "H004", severity: "error", message: `a frame threw ${what}; the page stopped its frame loop (page.start() runs it again)`, T: now() };
      report(halted);
      generation += 1;
      return;
    }
    requestFrame(tick(gen));
  };

  return {
    run, driver, ready, options,
    /** The canvas size the box in force needs, or null; a host resizes its canvas when this changes. */
    get size() { return size; },
    /** The page diagnostics, H…, in the order they arose. */
    diagnostics,
    /** The decoded image sources, by carried name (`<part>.<image>`). */
    get sources() { return sources; },
    /** Whether the page waits for its one gesture (requirement 13). */
    get locked() { return locked; },
    /** Asks for frames: each one advances the run by its wall time (the driver caps it) and draws. */
    start() { generation += 1; halted = null; last = null; requestFrame(tick(generation)); },
    /** Asks for no more frames; the run stays where it is. */
    stop() { generation += 1; },
    draw, stampOf, unlock, grips, grab,
    /** Registers a hook the gesture calls (MIDI access, an AudioContext's resume). @param {() => unknown} hook */
    onUnlock(hook) { unlockHooks.push(hook); },
    /**
     * The page's Controls: the wired ones in declaration order, then each part's part-local ones; with `to`, their
     * part, target and H011 (`disabled`), and a keyed one's instances: what the generated controls view shows.
     */
    controls: controlList,
    control,
    /** Gives a text Control focus (it takes every key), or none. @param {string | null} name */
    focus(name) { focused = name; },
    /**
     * A key event (`{ type: "keydown" | "keyup", code, timeStamp? }`, a KeyboardEvent will do) as a page input: true
     * when the key is the page's (the host may then preventDefault), false while locked, while a text Control has
     * focus, or for a key no wired Control binds.
     * @param {{ type: string, code: string, timeStamp?: number }} event
     */
    key(event) {
      if (event.type !== "keydown" && event.type !== "keyup") return false;
      if (locked || focused !== null) return false;
      const hit = keys.get(event.code);
      if (!hit || !Object.hasOwn(controls, hit.control)) return false;
      const change = held.press(event.code, event.type === "keydown");
      if (change === undefined) return false;
      if (change) logInput({ kind: "control", part: PAGE, name: change.name, value: change.value }, event);
      return true;
    },
    pointer,
    /** The ops under a canvas point, topmost first, each in its part's own frame. @param {number} x @param {number} y */
    hits,
    /** A canvas point in the shown frame. @param {number} x @param {number} y */
    toStage: (x, y) => toStage(x, y, viewport, box),
    /** The host's zoom and pan of the stage (not logged). @param {{ zoom?: number, pan?: number[] }} v */
    setView(v) { viewport = { zoom: v.zoom ?? viewport.zoom, pan: v.pan ?? viewport.pan }; },
    /** The focus left: every held button and trigger is let go, and a captured pointer is cancelled; the run goes on. */
    blur() {
      for (const change of held.release()) if (Object.hasOwn(controls, change.name)) logInput({ kind: "control", part: PAGE, name: change.name, value: change.value });
      for (const [id, target] of captured) {
        logInput({ kind: "pointer", part: target.part, output: target.output, value: pointerRecord({ type: "pointercancel", pointerId: id }, target.at ?? [0, 0], "") });
      }
      captured.clear();
    },
    /** What a host UI shows next: the instant, the run's N diagnostics, the page's H ones, and the shown view. */
    status() {
      const v = view();
      return {
        T: now(), seconds: run.seconds, paused: driver.paused, halted, size, locked,
        view: v ? { part: v.part, port: v.port, ops: v.list.length, check: v.check } : null,
        diagnostics: run.diagnostics, page: diagnostics,
      };
    },
    /** The run's why text (kit/run's run.why). @param {string} [part] @param {unknown} [since] */
    why: (part, since) => run.why(part, /** @type {any} */ (since)),
  };
}
