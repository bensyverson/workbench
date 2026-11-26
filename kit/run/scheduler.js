// createRun: a composed workbench, run (the clocks draft, as ruled 2026-11-26). One workbench time T in exact
// rationals; at each instant the parts due step in wire order (a producer before its consumers), each reading its
// producers' latest snapshots (a delayed wire, the previous instant's) and taking its Events exactly once, in order.
// Outside inputs come from the input log, stamped with T; rebuilds land between instants (kit/build keys them and
// writes their events). A run is a pure function of the composed record, the params and the log. Instant selection
// is instants.js; frame stamps and the slowdown N001 frames.js; wires, queues and wire order wires.js.

import { q, cmp, sub, toNumber, qText, parseQ, fromNumber } from "../define/rational.js";
import { needsRebuild } from "../define/params.js";
import { clockOf } from "../define/runtime.js";
import { queueProblems, catchUpOf } from "../compose/queues.js";
import { PAGE, pageRuntime, pageInputProblem } from "../compose/page.js";
import { partKey, compositionKey, canonical, stateHash, nextRevision, buildEvent, paramTrigger, packageTrigger, glueTrigger, why as buildWhy } from "../build/index.js";
import { compilePart } from "./compile.js";
import { RunError } from "./codes.js";
import { makePart, runInit, runStep, deepFreeze, redraw, defaults, PART_FIELDS } from "./part.js";
import { slowdowns, inputEntry, afterMs } from "./log.js";
import { createFrameLog, framesTo, createSlowdown } from "./frames.js";
import { running, nextInstant as instantAfter, awaitingFrame as waitsOnFrame, due } from "./instants.js";
import { ends, makeWires, wireOrder, readInputs, intake } from "./wires.js";
import { createDelivery } from "./delivery.js";
import { createParamFeed, intoParam } from "./param-wires.js";

/** @import { Q } from "../define/rational.js" */
/** @import { Runtime } from "../define/runtime.js" */
/** @import { Composed } from "../compose/compose.js" */
/** @import { Part } from "./part.js" */
/** @import { RunDiagnostic } from "./codes.js" */
/** @import { BuildEvent } from "../build/event.js" */
/** @import { Entry } from "./log.js" */
/** @import { Place } from "./instants.js" */
/** @import { Wire, View } from "./wires.js" */

/**
 * What a run takes besides the composed record. `runtimes` match parts by Dialect name; `packages` give each part's
 * package content key (kit/package's) by name; `params` each part's param values; `inputs` the input log to run
 * (a replay, or a scripted run); `frames` is "nominal" (frame parts every 1/60 s: headless) or "display" (at the
 * log's frame entries: the real-time driver writes them); `build(part, params)` rebuilds a part whose build-time
 * param changed (the host runs its Program again); `dev` (default true) freezes state and checks each step twice.
 * @typedef {{ runtimes: Runtime[], packages?: Array<{ name: string, content?: string | null }>, params?: Record<string, Record<string, unknown>>, inputs?: Array<Record<string, any>>, seed?: number, dev?: boolean, frames?: "nominal" | "display", catchUp?: number, checkpointEvery?: number, build?: (part: string, params: Record<string, unknown>) => Record<string, any> }} RunOptions
 */
/** @typedef {{ T: string, hash: string, parts: Record<string, string> }} InstantHash */

/** What a consumer of the page reads of it: no state, and one revision. @type {View} */
const PAGE_VIEW = Object.freeze({ state: null, revision: 1, part: null });

/** A number, a rational or rational text, as a rational. @param {number | Q | string} t */
const toQ = (t) => {
  if (typeof t === "string") return parseQ(t);
  if (typeof t === "number") { const r = fromNumber(t); if (!r) throw new Error(`${t} is not a time a run can stamp: a fraction of a second with a denominator up to a million`); return r; }
  return t;
};

/**
 * Starts a run of a composed workbench: every part compiled, clocked and keyed, its init run. Throws a RunError when
 * a clock does not read (N006) or a reliable queue can overflow (S116).
 * @param {Composed} composed @param {RunOptions} options
 */
export function createRun(composed, options) {
  const dev = options.dev ?? true;
  const seed = options.seed ?? 0;
  const frames = options.frames ?? "nominal";
  const catchUp = catchUpOf(options.catchUp);
  const every = toQ(options.checkpointEvery ?? 1);
  /** @type {RunDiagnostic[]} */
  const diagnostics = [];
  /** @type {BuildEvent[]} */
  const builds = [];
  /** @type {InstantHash[]} */
  const hashes = [];
  /** @type {Entry[]} */
  const inputs = [];
  const frameLog = createFrameLog();
  const slowdown = createSlowdown(diagnostics);
  /** @type {any[]} */
  const checkpoints = [];
  /**
   * Where the run stands between instants (instants.js). An input applied ahead of the next instant sets the floor:
   * a part it restarted counts its clock from there, not from the last instant run (ruling R2).
   * @type {Place}
   */
  const at = { lastT: null, floor: null, frames, log: frameLog };

  /** Whether the composition has the built-in page part; a user part that happens to be named "page" is not it. */
  const hasPage = composed.parts.some((cp) => cp.dialect === PAGE && cp.name === PAGE);
  /** @type {Array<{ code: string, message: string }>} */
  const refused = [];
  for (const w of composed.wires) {
    if (w.overflow !== undefined && w.overflow !== null && w.overflow !== "keepLast" && w.overflow !== "keepFirst") refused.push({ code: "N007", message: `wire ${w.from} → ${w.to}: overflow is ${JSON.stringify(w.overflow)}, not "keepLast" or "keepFirst"` });
  }
  /** @type {Part[]} */
  const parts = [];
  composed.parts.forEach((cp, index) => {
    if (cp.dialect === PAGE && cp.name === PAGE) return; // the page never steps: its records are the log's page inputs
    const runtime = options.runtimes.find((r) => r.dialect.name === cp.dialect);
    if (!runtime) throw new Error(`part '${cp.name}' (${cp.dialect}) has no runtime: pass the ${cp.dialect} package's defineRuntime result in runtimes`);
    const compiled = compilePart(runtime, cp.record);
    if (!compiled.ok) throw new RunError(compiled.diagnostics.map((d) => ({ code: /** @type {any} */ (d).code, message: `part '${cp.name}': ${/** @type {any} */ (d).message}` })));
    const content = options.packages?.find((p) => p.name === cp.dialect)?.content ?? null;
    const p = makePart({ name: cp.name, index, dialect: cp.dialect, runtime, record: cp.record, compiled, key: partKey({ package: content, record: cp.record }), content, seed, params: options.params?.[cp.name] });
    if (typeof p === "string") { refused.push({ code: "N006", message: `part '${cp.name}' (${cp.dialect}): ${p}` }); return; }
    parts.push(p);
  });
  const sized = composed.parts.map((p) => ({ name: p.name, dialect: p.dialect, record: p.record }));
  const sizedWires = composed.wires.filter((w) => !intoParam(w) && w.overflow !== "keepLast" && w.overflow !== "keepFirst"); // a policy trims what a step takes (ruling 7)
  for (const pr of queueProblems(sized, sizedWires.map((w) => ({ from: { part: ends(w.from).part, name: ends(w.from).port }, to: { part: ends(w.to).part, name: ends(w.to).port }, delivery: w.delivery })), [...options.runtimes, pageRuntime], { catchUp })) {
    refused.push({ code: "S116", message: `${pr.message}\n  fix: ${pr.fix}` });
  }
  if (refused.length) throw new RunError(refused);
  const byName = new Map(parts.map((p) => [p.name, p]));

  const wires = makeWires(composed, byName);
  /** @type {Map<string, Wire>} */
  const wireTo = new Map(wires.map((w) => [`${w.to.part}.${w.to.port}`, w]));
  const order = wireOrder(parts, wires);

  let revision = 1;
  /** @type {Q} */
  let now = q(0);
  let cursor = 0;
  /** The parts' snapshots as the instant began, which a delayed wire reads. @type {Map<string, View>} */
  let startView = new Map();

  const nextInstant = () => instantAfter(parts, at);
  const awaitingFrame = () => waitsOnFrame(parts, at);

  /** @param {Omit<RunDiagnostic, "severity"> & { severity?: "error" | "warning" }} d */
  const report = (d) => { diagnostics.push({ severity: "error", ...d }); };
  const delivery = createDelivery(wires, byName, report);
  const { dropStopped } = delivery;
  const params = createParamFeed(composed, byName, report, options.params);
  /**
   * After the instant `T`, just run: each param wire's input, stamped `T`. The log's inputs stamped `T` not yet
   * applied go with it (a run from a log), so what the log holds is not added twice. @param {Q} T
   */
  const feedParams = (T) => {
    if (!params.any) return;
    /** @type {Entry[]} */
    const logged = [];
    for (let k = cursor; k < inputs.length && cmp(inputs[k].T, T) === 0; k++) logged.push(inputs[k]);
    params.feed(T, logged, insert);
  };
  /**
   * Stops a part: a stopped part takes no Events (Ben, 2026-11-26), so the records waiting for it are dropped and
   * counted, as are those sent to it until a rebuild restarts it with empty queues.
   * @param {Part} p @param {{ code: string, message: string }} r @param {Q | null} T
   */
  const stop = (p, r, T) => {
    p.stopped = true;
    report({ code: r.code, message: r.message, part: p.name, T: T ? qText(T) : null, revision: p.revision });
    for (const w of wires) if (w.to.part === p.name && w.queue.length) dropStopped(w, w.queue.splice(0).length, T);
  };
  /** @param {Part} p */
  const commitState = (p, /** @type {any} */ s, /** @type {import("./draw.js").Draws} */ draws) => { p.state = s; p.hash = stateHash(s); p.draws = draws; };

  for (const p of parts) {
    const r = runInit(p, dev);
    if ("state" in r) { commitState(p, r.state, r.draws); p.drawValues = defaults(p.runtime); } else stop(p, r, null);
  }

  for (const e of options.inputs ?? []) insert(inputEntry(e, toQ));

  /** Adds an input to the log, in stamp order (after every entry with the same or an earlier stamp). @param {Entry} e */
  function insert(e) {
    let i = inputs.length;
    while (i > 0 && cmp(inputs[i - 1].T, e.T) > 0) i--;
    if (i < cursor) {
      const { lastT } = at;
      if (lastT && cmp(e.T, lastT) <= 0) throw new Error(`an input stamped ${qText(e.T)} would change instants already run (the last ran at ${qText(lastT)})`);
      throw new Error(`an input stamped ${qText(e.T)} comes before one already applied, at ${qText(inputs[cursor - 1].T)} (the run is at ${qText(now)})`);
    }
    if (e.kind === "control" && e.part === PAGE && hasPage) {
      // the log holds its own copy, checked as it is copied: a host that reuses or changes its object changes nothing
      e = { ...e, value: structuredClone(e.value) };
      const bad = pageInputProblem(/** @type {string} */ (e.name), e.value);
      if (bad) throw new Error(bad);
    }
    inputs.splice(i, 0, e);
    if (e.kind === "frame") frameLog.add(e.T);
  }

  /**
   * Applies the log's inputs stamped at or before `T`, between instants: just before the instant `before` (null: at
   * their own stamp, ahead of the next instant), which is where a rebuild's event says it landed. A param wire's
   * input stamped `before` was made by that instant, so it and the log after it wait until the instant has run.
   * @param {Q} T @param {Q | null} before
   */
  function applyInputs(T, before) {
    while (cursor < inputs.length && cmp(inputs[cursor].T, T) <= 0) {
      if (before && inputs[cursor].wire && cmp(inputs[cursor].T, before) === 0) return;
      const e = inputs[cursor++];
      if (e.kind === "frame") { slowdown.frame(e); continue; }
      // a page input is the page part's Event: one record on each wire from that control, at the input's stamp; a
      // record its consumer has not yet taken is replaced, so a page wire holds the latest value per control per instant
      if (e.kind === "control" && e.part === PAGE && hasPage) { for (const w of wires) if (w.from.part === PAGE && w.from.port === e.name) delivery.deliver(w, [e.value], e.T, true); continue; }
      const p = byName.get(e.part ?? "");
      if (!p) throw new Error(`an input names no part '${e.part}': the parts are ${parts.map((x) => x.name).join(", ")}`);
      if (e.kind === "control") p.controls = { ...p.controls, [/** @type {string} */ (e.name)]: deepFreeze(structuredClone(e.value)) };
      else if (e.kind === "param") {
        const name = /** @type {string} */ (e.name), was = p.params[name];
        p.params = { ...p.params, [name]: e.value };
        params.noteSet(p.name, name);
        if (needsRebuild(p.record, [name])) {
          if (!options.build) throw new Error(`the param ${p.name}.$.${name} is read at build time, so changing it rebuilds the part, and the run was given no build(part, params)`);
          rebuild(p, options.build(p.name, { ...p.params }), paramTrigger(p.record, name, was, e.value), null, before ?? e.T);
        }
      } else if (e.kind === "rebuild") {
        const trigger = e.trigger ?? (e.package ? packageTrigger({ key: p.content }, { key: e.package.content ?? null }) : glueTrigger());
        rebuild(p, /** @type {Record<string, any>} */ (e.record), trigger, e.package ?? null, before ?? e.T);
      }
    }
  }

  /**
   * A rebuild between instants: the new record compiled and keyed; the revision bumps only when the key changes,
   * when init runs again; the Event queues are kept. A failed rebuild (one that does not lower, whose clock does not
   * read, or whose init throws or returns a state that does not fit) keeps the previous revision running.
   * @param {Part} p @param {Record<string, any>} record @param {any} trigger @param {{ content?: string | null } | null} pkg
   * @param {Q} before  the instant it lands before (when no part is due, its stamp)
   */
  function rebuild(p, record, trigger, pkg, before) {
    const boundary = { after: at.lastT ? qText(at.lastT) : null, before: qText(before) };
    const input = cursor - 1; // the log position of the input being applied
    const consumers = wires.filter((w) => w.from.part === p.name).map((w) => `${w.to.part}.in.${w.to.port}`);
    const was = { key: p.key, revision: p.revision, record: p.record, kernels: p.compiled.sources };
    const compiled = compilePart(p.runtime, record);
    const clock = compiled.ok ? clockOf(p.runtime, record) : null;
    if (!compiled.ok || !clock?.ok) {
      const diags = !compiled.ok ? compiled.diagnostics : [{ code: "N006", message: `part '${p.name}' (${p.dialect}): ${/** @type {any} */ (clock).error}` }];
      builds.push(buildEvent({ part: p.name, boundary, trigger, before: was, after: null, consumers, diagnostics: diags, input }));
      return;
    }
    const content = pkg && pkg.content !== undefined ? pkg.content : p.content;
    const key = partKey({ package: content, record });
    const after = { key, record, kernels: compiled.sources };
    // the record's declared values reach $ for the params nothing has set (a new default, a new param)
    if (key === was.key) { builds.push(buildEvent({ part: p.name, boundary, trigger, before: was, after, consumers, input })); p.params = params.after(p, record); return; }
    // init runs on a trial copy, so a throw or a state that does not fit leaves the running part as it was
    const next = { record, compiled, clock: clock.clock, key, content, revision: nextRevision({ key: was.key, revision: was.revision }, key), rng: /** @type {Part["rng"]} */ ([...p.rng]), params: params.after(p, record) };
    const r = runInit({ ...p, ...next }, dev);
    if (!("state" in r)) { builds.push(buildEvent({ part: p.name, boundary, trigger, before: was, after: null, consumers, diagnostics: [{ code: r.code, message: r.message }], input })); return; }
    builds.push(buildEvent({ part: p.name, boundary, trigger, before: was, after, consumers, input }));
    Object.assign(p, next, { lastFrameT: null, rebuilt: true, snapT: null, stopped: false, drawValues: defaults(p.runtime) });
    // a drop after a later stop is noted again: once per wire per stop (ruling R3)
    delivery.restarted(p.name);
    revision++;
    commitState(p, r.state, r.draws);
  }

  /** What a wire's consumer reads of its producer: now, or as the instant began. @param {Wire} w @returns {View} */
  const viewOf = (w) => {
    const p = byName.get(w.from.part);
    if (!p) return PAGE_VIEW;
    return w.delay ? startView.get(p.name) ?? { state: p.state, revision: p.revision, part: p, draws: p.draws } : { state: p.state, revision: p.revision, part: p, draws: p.draws };
  };

  /** One instant: inputs applied, the due parts stepped in wire order, the state hashes recorded. @param {Q} T */
  function instant(T) {
    applyInputs(T, T);
    startView = new Map(parts.map((p) => [p.name, { state: p.state, revision: p.revision, part: p, draws: p.draws }]));
    /** @type {string[]} */
    const stepped = [];
    for (const p of order) {
      if (!due(p, T, frames, frameLog)) continue;
      const { values, rev, pending } = readInputs(p, T, wireTo, viewOf);
      const shown = canonical(values);
      if (p.clock.kind === "demand" && p.stepped && !p.rebuilt && pending === 0 && shown === p.lastValues) continue;
      /** @type {Record<string, unknown>} */
      const inputs = { ...values, $rev: Object.freeze(rev) };
      const over = intake(p, T, wireTo, catchUp);
      if (over) { stop(p, { code: "N002", message: over }, T); continue; }
      for (const i of Object.values(/** @type {Record<string, any>} */ (p.runtime.dialect.seams.in))) {
        if (i.seam.kind !== "event") continue;
        const w = wireTo.get(`${p.name}.${i.name}`);
        inputs[i.name] = Object.freeze(w ? delivery.take(w, T, p.runtime.events.in[i.name]) : []);
      }
      const dt = p.clock.kind === "tick" ? toNumber(p.clock.period) : p.clock.kind === "frame" && p.lastFrameT ? toNumber(sub(T, p.lastFrameT)) : 0;
      const r = runStep(p, { T: toNumber(T), dt, inputs: Object.freeze(inputs), values, dev });
      if ("code" in r) { stop(p, r, T); continue; }
      commitState(p, r.state, r.draws);
      Object.assign(p, { rng: r.rng, snapT: T, stepped: true, rebuilt: false, lastValues: shown, drawValues: values, ...(p.clock.kind === "frame" ? { lastFrameT: T } : {}) });
      stepped.push(p.name);
      for (const [port, records] of Object.entries(r.events)) for (const w of wires) if (w.from.part === p.name && w.from.port === port) delivery.deliver(w, records, T);
    }
    at.lastT = T;
    if (cmp(now, T) < 0) now = T;
    hashes.push({ T: qText(T), hash: stateHash(parts.map((p) => [p.name, p.revision, p.stopped, p.hash])), parts: Object.fromEntries(parts.map((p) => [p.name, p.hash])) });
    feedParams(T);
    const lastCp = checkpoints.at(-1);
    if (!lastCp.T || cmp(sub(T, lastCp.T), every) >= 0) checkpoint();
    return { T: qText(T), stepped };
  }

  /**
   * The next instant at or before `limit` (any, when null), or null. The inputs stamped before it are applied first,
   * a stamp at a time, at their own stamps (ruling R2): a rebuild among them may restart a part, whose clock then
   * counts from that stamp, whatever other parts are due. A display run whose frame part waits on a frame not yet
   * logged applies none ahead of an instant it will not run now: they wait for that frame, which may come first, and
   * then take effect at their stamps.
   * @param {Q | null} limit
   */
  function upcoming(limit) {
    for (;;) {
      const T = nextInstant();
      const runs = T && (!limit || cmp(T, limit) <= 0);
      const e = inputs[cursor];
      if (e && (!T || cmp(e.T, T) < 0) && (!limit || cmp(e.T, limit) <= 0) && (runs || !awaitingFrame())) {
        applyInputs(e.T, null);
        at.floor = e.T;
        if (cmp(now, e.T) < 0) now = e.T;
        continue;
      }
      return runs ? T : null;
    }
  }

  /**
   * Runs every instant at or before `target` and applies the inputs stamped by it, from the log alone (what a replay
   * and a rewind do); in a display run whose next frame is not logged yet, those wait for it. @param {Q} target
   */
  function advance(target) {
    for (let T = upcoming(target); T; T = upcoming(target)) instant(T);
    if (cmp(now, target) < 0) now = target;
  }

  /** A display run moved by runUntil, not by the driver, logs its frames up to `target` first (frames.js). @param {Q} target */
  function logFrames(target) {
    if (frames !== "display") return;
    for (const T of framesTo(frameLog, now, target, catchUp)) insert({ kind: "frame", T });
  }

  function checkpoint() {
    checkpoints.push({
      T: at.lastT, now, cursor, revision,
      parts: parts.map((p) => Object.fromEntries(PART_FIELDS.map((f) => [f, f === "rng" ? [...p.rng] : p[f]]))),
      wires: wires.map((w) => ({ queue: [...w.queue], drops: w.drops, stopDrops: w.stopDrops, overflowDrops: w.overflowDrops })),
      lens: { hashes: hashes.length, builds: builds.length, diagnostics: diagnostics.length },
      ...delivery.save(), ...params.save(),
      floor: at.floor, ...slowdown.save(),
    });
  }
  checkpoint();

  const run = {
    /** The time the run has reached, as a rational. */
    get T() { return now; },
    /** The time the run has reached, in seconds. */
    get seconds() { return toNumber(now); },
    /** The most workbench time one display frame may cover (the real-time driver reads it), as a rational. */
    get catchUp() { return catchUp; },
    /** The last frame at or before the time the run has reached: a display run starts at one at T = 0. */
    get lastFrame() { return frameLog.lastAt(now); },
    /** Whether a part steps on frames now. */
    get framed() { return parts.some((p) => p.clock.kind === "frame" && running(p)); },
    /** The composition's revision: bumps when any part's does. */
    get revision() { return revision; },
    /** The composition's content key: its parts' keys by identity and its wires (kit/build). */
    get compositionKey() { return compositionKey(Object.fromEntries(parts.map((p) => [p.name, p.key])), composed.wires, composed.show); },
    diagnostics, builds, hashes, checkpoints,
    /** The input log as data: the header a replay needs and every outside input, stamped with T. */
    get log() { return { header: { name: composed.name, seed, frames, catchUp: qText(catchUp), params: options.params ?? {} }, inputs: inputs.map((e) => ({ ...e, T: qText(e.T) })) }; },
    /** What a replay compares: the log, each instant's state hashes, the build events; and the T it reached. */
    record() { return { log: run.log, hashes: [...hashes], builds: [...builds], T: qText(now) }; },
    /**
     * Why parts rebuilt, as text an agent reads cold (kit/build/why.js): the builds of `part` (every part's when
     * omitted) at or after `since` (seconds, a rational or its text), from the run's own build events and input log.
     * @param {string} [part] @param {number | Q | string} [since]
     */
    why(part, since) {
      if (part !== undefined && !byName.has(part)) throw new Error(`run.why: the composition has no part '${part}': the parts are ${parts.map((x) => x.name).join(", ")}`);
      return buildWhy(builds, run.log, { part, since: since === undefined ? undefined : qText(toQ(since)) });
    },
    /** The next instant a part is due at, not run; null when none is. */
    nextInstant() { return nextInstant(); },
    /** The next instant, run; null when no part has a clock. */
    step() {
      const T = upcoming(null);
      if (!T) return null;
      return instant(T);
    },
    /**
     * Runs every instant at or before `t` (seconds, or a rational), then applies the inputs stamped by it; a display
     * run with a frame part logs frames up to `t` first. @param {number | Q} t
     */
    runUntil(t) {
      const target = toQ(t);
      logFrames(target);
      advance(target);
      return run;
    },
    /** runUntil from the log alone, logging no frames: what a replay runs. @param {number | Q} t */
    advance(t) {
      advance(toQ(t));
      return run;
    },
    /**
     * Adds an outside input, stamped with T (by default, the next instant; when none is due yet, T itself or, when T
     * is the last instant run, the first millisecond after it). One stamped at or before T applies at once, as
     * runUntil(T) would apply it. @param {Record<string, any>} e
     */
    input(e) {
      const { lastT } = at;
      const entry = inputEntry({ ...e, T: e.T ?? nextInstant() ?? (lastT && cmp(now, lastT) <= 0 ? afterMs(now) : now) }, toQ);
      if (lastT && cmp(entry.T, lastT) <= 0) throw new Error(`an input stamped ${qText(entry.T)} is not after the last instant run, ${qText(lastT)}`);
      insert(entry);
      if (cmp(entry.T, now) <= 0) advance(now);
      return entry;
    },
    /** A part's state now; null when its init failed. @param {string} part */
    state(part) { return mustPart(part).state; },
    /** A part's snapshot: its state, revision and the instant it was committed at (null: init's). @param {string} part */
    snapshot(part) {
      const p = mustPart(part);
      // its Draw lists, for a part that has them (pageView reads them)
      return { state: p.state, revision: p.revision, T: p.snapT ? qText(p.snapT) : null, ...(Object.keys(p.draws).length ? { draws: p.draws } : {}) };
    },
    /** A part's content key. @param {string} part */
    key(part) { return mustPart(part).key; },
    /** Drops (by a keepLast input; to a stopped part; by a wire's overflow policy) and slowdowns so far. */
    stats() { return { ...delivery.counts(), slowdowns: slowdowns(inputs.slice(0, cursor)) }; },
    /**
     * Back to `t`: the nearest checkpoint at or before it restored, then run forward. Inputs stamped after `t` are
     * dropped: a rewind starts a new branch. @param {number | Q} t
     */
    rewind(t) {
      const target = toQ(t);
      let i = checkpoints.length - 1;
      while (i > 0 && checkpoints[i].T && cmp(checkpoints[i].T, target) > 0) i--;
      const cp = checkpoints[i];
      checkpoints.length = i + 1;
      parts.forEach((p, j) => Object.assign(p, cp.parts[j], { rng: [...cp.parts[j].rng] }));
      // a part's lists are built again from its restored state and the inputs they were built with
      parts.forEach(redraw);
      wires.forEach((w, j) => Object.assign(w, cp.wires[j], { queue: [...cp.wires[j].queue] }));
      hashes.length = cp.lens.hashes; builds.length = cp.lens.builds; diagnostics.length = cp.lens.diagnostics;
      delivery.restore(cp);
      params.restore(cp);
      slowdown.restore(cp);
      at.floor = cp.floor; at.lastT = cp.T;
      ({ now, cursor, revision } = cp);
      for (let k = inputs.length - 1; k >= cursor; k--) if (cmp(inputs[k].T, target) > 0) inputs.splice(k, 1);
      frameLog.dropAfter(target);
      advance(target);
      return run;
    },
  };
  /** @param {string} name */
  function mustPart(name) {
    const p = byName.get(name);
    if (!p) throw new Error(`the run has no part '${name}': ${parts.map((x) => x.name).join(", ")}`);
    return p;
  }
  return run;
}
