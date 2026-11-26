// createRun: a composed workbench, run (the clocks draft, as ruled 2026-11-26). One workbench time T in exact
// rationals; at each instant the parts due step in wire order (a producer before its consumers), each reading its
// producers' latest snapshots (a delayed wire, the previous instant's) and taking its Events exactly once, in order.
// Outside inputs come from the input log, stamped with T; rebuilds land between instants (kit/build keys them and
// writes their events). A run is a pure function of the composed record, the params and the log.

import { q, cmp, add, mul, sub, floorDiv, ceilDiv, toNumber, qText, parseQ, fromNumber } from "../define/rational.js";
import { needsRebuild } from "../define/params.js";
import { clockOf } from "../define/runtime.js";
import { queueProblems, catchUpOf, NOMINAL_FRAME, MIN_FRAME } from "../compose/queues.js";
import { partKey, compositionKey, canonical, stateHash, nextRevision, buildEvent, paramTrigger, packageTrigger, glueTrigger } from "../build/index.js";
import { compilePart } from "./compile.js";
import { carry } from "./carry.js";
import { RunError } from "./codes.js";
import { makePart, runInit, runStep, defaults, deepFreeze, PART_FIELDS } from "./part.js";
import { slowdowns, inputEntry, afterMs } from "./log.js";

/** @import { Q } from "../define/rational.js" */
/** @import { Runtime } from "../define/runtime.js" */
/** @import { Composed } from "../compose/compose.js" */
/** @import { Part } from "./part.js" */
/** @import { RunDiagnostic } from "./codes.js" */
/** @import { BuildEvent } from "../build/event.js" */
/** @import { Entry } from "./log.js" */

/**
 * What a run takes besides the composed record. `runtimes` match parts by Dialect name; `packages` give each part's
 * package content key (kit/package's) by name; `params` each part's param values; `inputs` the input log to run
 * (a replay, or a scripted run); `frames` is "nominal" (frame parts every 1/60 s: headless) or "display" (at the
 * log's frame entries: the real-time driver writes them); `build(part, params)` rebuilds a part whose build-time
 * param changed (the host runs its Program again); `dev` (default true) freezes state and checks each step twice.
 * @typedef {{ runtimes: Runtime[], packages?: Array<{ name: string, content?: string | null }>, params?: Record<string, Record<string, unknown>>, inputs?: Array<Record<string, any>>, seed?: number, dev?: boolean, frames?: "nominal" | "display", catchUp?: number, checkpointEvery?: number, build?: (part: string, params: Record<string, unknown>) => Record<string, any> }} RunOptions
 */
/** @typedef {{ index: number, from: { part: string, port: string }, to: { part: string, port: string }, event: boolean, delay: boolean, keepLast: number | null, convert: any[], rename: Record<string, string>, dropped: string[], queue: Array<{ T: Q, record: unknown }>, drops: number, stopDrops: number, text: string }} Wire */
/** @typedef {{ T: string, hash: string, parts: Record<string, string> }} InstantHash */

/** @param {string} h  "level.out.picked" */
const ends = (h) => { const [part, , port] = h.split("."); return { part, port }; };
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
  /** @type {Q[]} */
  const frameTs = [];
  /** @type {any[]} */
  const checkpoints = [];
  /** @type {Set<number>} */
  const dropNoted = new Set();
  /** The wires whose records to a stopped consumer have been noted (N001, once per wire). @type {Set<number>} */
  const stopNoted = new Set();
  /** @typedef {{ from: Q, to: Q, wall: number, index: number }} Slow */
  /** The run of capped frames under way, and its N001's index in diagnostics. @type {Slow | null} */
  let slow = null;
  /** An instant inputs were applied before while the run stood between instants: it runs next. @type {Q | null} */
  let pinned = null;
  /**
   * No instant comes before this: the stamp of the last input applied while no part was due. A part a rebuild
   * restarted then counts its clock from that stamp, not from the last instant run. @type {Q | null}
   */
  let floor = null;
  /** The last frame applied (the run starts at one at T = 0). @type {Q} */
  let lastFrameSeen = q(0);

  /** @type {Array<{ code: string, message: string }>} */
  const refused = [];
  /** @type {Part[]} */
  const parts = [];
  composed.parts.forEach((cp, index) => {
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
  for (const pr of queueProblems(sized, composed.wires.map((w) => ({ from: { part: ends(w.from).part, name: ends(w.from).port }, to: { part: ends(w.to).part, name: ends(w.to).port }, delivery: w.delivery })), options.runtimes, { catchUp })) {
    refused.push({ code: "S116", message: `${pr.message}\n  fix: ${pr.fix}` });
  }
  if (refused.length) throw new RunError(refused);
  const byName = new Map(parts.map((p) => [p.name, p]));

  /** @type {Wire[]} */
  const wires = composed.wires.map((w, index) => {
    const from = ends(w.from), to = ends(w.to);
    const consumer = /** @type {Part} */ (byName.get(to.part));
    const event = consumer.runtime.dialect.seams.in[to.port].seam.kind === "event";
    const keepLast = w.delivery && typeof w.delivery === "object" ? w.delivery.keepLast : null;
    return { index, from, to, event, delay: w.delay, keepLast, convert: w.convert, rename: w.rename, dropped: w.dropped, fill: w.fill, queue: [], drops: 0, stopDrops: 0, text: `${w.from} → ${w.to}` };
  });
  /** @type {Map<string, Wire>} */
  const wireTo = new Map(wires.map((w) => [`${w.to.part}.${w.to.port}`, w]));
  const order = wireOrder(parts, wires);

  let revision = 1;
  /** @type {Q | null} */
  let lastT = null;
  /** @type {Q} */
  let now = q(0);
  let cursor = 0;
  /** The parts' snapshots as the instant began, which a delayed wire reads. @type {Map<string, { state: any, revision: number, part: Part }>} */
  let startView = new Map();

  /** @param {Omit<RunDiagnostic, "severity"> & { severity?: "error" | "warning" }} d */
  const report = (d) => { diagnostics.push({ severity: "error", ...d }); };
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
  /** Counts records a stopped consumer did not take, noting the first on each wire. @param {Wire} w @param {number} n @param {Q | null} T */
  function dropStopped(w, n, T) {
    w.stopDrops += n;
    if (stopNoted.has(w.index)) return;
    stopNoted.add(w.index);
    report({ code: "N001", severity: "warning", message: `${w.text}: ${w.to.part} is stopped, so it takes no Events: ${n === 1 ? "1 record was" : `${n} records were`} dropped here; stats().stopped counts every one, and a rebuild that restarts ${w.to.part} starts it with empty queues`, part: w.to.part, T: T ? qText(T) : null });
  }
  /** @param {Part} p */
  const commitState = (p, /** @type {any} */ s) => { p.state = s; p.hash = stateHash(s); };

  for (const p of parts) {
    const r = runInit(p, dev);
    if ("state" in r) commitState(p, r.state); else stop(p, r, null);
  }

  for (const e of options.inputs ?? []) insert(inputEntry(e, toQ));

  /** Adds an input to the log, in stamp order (after every entry with the same or an earlier stamp). @param {Entry} e */
  function insert(e) {
    let i = inputs.length;
    while (i > 0 && cmp(inputs[i - 1].T, e.T) > 0) i--;
    if (i < cursor) throw new Error(`an input stamped ${qText(e.T)} would change instants already run (the run is at ${lastT ? qText(lastT) : "its start"})`);
    inputs.splice(i, 0, e);
    if (e.kind === "frame") { let j = frameTs.length; while (j > 0 && cmp(frameTs[j - 1], e.T) > 0) j--; frameTs.splice(j, 0, e.T); }
  }

  /** The next multiple of `period` after lastT (0 at the start), and not before the floor. @param {Q} period */
  const nextMultiple = (period) => {
    const m = lastT === null ? q(0) : mul(period, q(floorDiv(lastT, period) + 1));
    return floor && cmp(m, floor) < 0 ? mul(period, q(ceilDiv(floor, period))) : m;
  };
  /** @param {Q} T @param {Q} period */
  const onGrid = (T, period) => { const r = mul(T, q(period.d, period.n)); return r.d === 1; };
  /** How many logged frames are at or before `t` (frameTs is sorted). @param {Q} t */
  const framesThrough = (t) => { let lo = 0, hi = frameTs.length; while (lo < hi) { const m = (lo + hi) >> 1; if (cmp(frameTs[m], t) <= 0) lo = m + 1; else hi = m; } return lo; };
  /** How many logged frames are before `t`. @param {Q} t */
  const framesBefore = (t) => { let lo = 0, hi = frameTs.length; while (lo < hi) { const m = (lo + hi) >> 1; if (cmp(frameTs[m], t) < 0) lo = m + 1; else hi = m; } return lo; };
  // a display run starts at a frame at T = 0, as a headless one does: the first frame's window is then half-open
  const nextFrame = () => {
    if (lastT === null && !floor) return q(0);
    const i = Math.max(lastT === null ? 0 : framesThrough(lastT), floor ? framesBefore(floor) : 0);
    return frameTs[i] ?? null;
  };
  /** @param {Q} T */
  const isFrame = (T) => T.n === 0 || (framesThrough(T) > 0 && cmp(frameTs[framesThrough(T) - 1], T) === 0);

  /** @param {Part} p */
  const running = (p) => !p.stopped && p.state !== null;
  /** Whether the next instant waits on a display frame not yet logged (a running part steps on frames). */
  const awaitingFrame = () => frames === "display" && nextFrame() === null && parts.some((p) => p.clock.kind === "frame" && running(p));

  /** The next instant at which a tick or frame part is due, or null. @returns {Q | null} */
  function nextInstant() {
    // inputs already applied before the pinned instant: nothing runs ahead of it
    if (pinned && (!lastT || cmp(pinned, lastT) > 0)) return pinned;
    /** @type {Q | null} */
    let best = null;
    for (const p of parts) {
      if (p.stopped || p.state === null) continue;
      const c = p.clock.kind === "tick" ? nextMultiple(p.clock.period) : p.clock.kind === "frame" ? (frames === "nominal" ? nextMultiple(NOMINAL_FRAME) : nextFrame()) : null;
      if (c && (!best || cmp(c, best) < 0)) best = c;
    }
    return best;
  }

  /**
   * Applies the log's inputs stamped at or before `T`, between instants: just before the instant `at` (null when no
   * part is due: then at its own stamp), which is where a rebuild's event says it landed. Returns how many it applied.
   * @param {Q} T @param {Q | null} at
   */
  function applyInputs(T, at) {
    const from = cursor;
    while (cursor < inputs.length && cmp(inputs[cursor].T, T) <= 0) {
      const e = inputs[cursor++];
      if (e.kind === "frame") { frameSlowdown(e); continue; }
      const p = byName.get(e.part ?? "");
      if (!p) throw new Error(`an input names no part '${e.part}': the parts are ${parts.map((x) => x.name).join(", ")}`);
      if (e.kind === "control") p.controls = { ...p.controls, [/** @type {string} */ (e.name)]: deepFreeze(structuredClone(e.value)) };
      else if (e.kind === "param") {
        const name = /** @type {string} */ (e.name), was = p.params[name];
        p.params = { ...p.params, [name]: e.value };
        if (needsRebuild(p.record, [name])) {
          if (!options.build) throw new Error(`the param ${p.name}.$.${name} is read at build time, so changing it rebuilds the part, and the run was given no build(part, params)`);
          rebuild(p, options.build(p.name, { ...p.params }), paramTrigger(p.record, name, was, e.value), null, at ?? e.T);
        }
      } else if (e.kind === "rebuild") {
        const trigger = e.trigger ?? (e.package ? packageTrigger({ key: p.content }, { key: e.package.content ?? null }) : glueTrigger());
        rebuild(p, /** @type {Record<string, any>} */ (e.record), trigger, e.package ?? null, at ?? e.T);
      }
    }
    return cursor - from;
  }

  /**
   * A run of capped frames is one N001, written at its first capped frame and rewritten at each one after, so a run
   * that never catches up still says so; the first frame that is not capped closes it.
   * @param {Entry} e
   */
  function frameSlowdown(e) {
    if (!e.capped) {
      if (slow) diagnostics[slow.index] = slowReport(slow, false);
      slow = null; lastFrameSeen = e.T; return;
    }
    if (!slow) { slow = { from: lastFrameSeen, to: e.T, wall: 0, index: diagnostics.length }; diagnostics.push(/** @type {any} */ (null)); }
    slow = { ...slow, to: e.T, wall: slow.wall + e.capped.wall };
    lastFrameSeen = e.T;
    diagnostics[slow.index] = slowReport(slow, true);
  }
  /** The N001 for a run of capped frames, open (still behind) or closed. @param {Slow} sp @param {boolean} open @returns {RunDiagnostic} */
  function slowReport(sp, open) {
    const r3 = (/** @type {number} */ x) => Math.round(x * 1000) / 1000;
    const wall = r3(sp.wall), work = r3(toNumber(sub(sp.to, sp.from))), ratio = r3(work / sp.wall);
    const span = `for ${wall} s of wall time (T advanced ${work} s, from ${qText(sp.from)} to ${qText(sp.to)})`;
    return { code: "N001", severity: "warning", T: qText(sp.to), message: open ? `the run is behind wall time: it has run at ${ratio.toFixed(2)}× ${span}, and has not caught up; no record was dropped` : `the run fell behind wall time: it ran at ${ratio.toFixed(2)}× ${span}; no record was dropped` };
  }

  /**
   * A rebuild between instants: the new record compiled and keyed; the revision bumps only when the key changes,
   * when init runs again; the Event queues are kept. A failed rebuild (one that does not lower, whose clock does not
   * read, or whose init throws or returns a state that does not fit) keeps the previous revision running.
   * @param {Part} p @param {Record<string, any>} record @param {any} trigger @param {{ content?: string | null } | null} pkg
   * @param {Q} at  the instant it lands before (when no part is due, its stamp)
   */
  function rebuild(p, record, trigger, pkg, at) {
    const boundary = { after: lastT ? qText(lastT) : null, before: qText(at) };
    const consumers = wires.filter((w) => w.from.part === p.name).map((w) => `${w.to.part}.in.${w.to.port}`);
    const before = { key: p.key, revision: p.revision, record: p.record, kernels: p.compiled.sources };
    const compiled = compilePart(p.runtime, record);
    const clock = compiled.ok ? clockOf(p.runtime, record) : null;
    if (!compiled.ok || !clock?.ok) {
      const diags = !compiled.ok ? compiled.diagnostics : [{ code: "N006", message: `part '${p.name}' (${p.dialect}): ${/** @type {any} */ (clock).error}` }];
      builds.push(buildEvent({ part: p.name, boundary, trigger, before, after: null, consumers, diagnostics: diags }));
      return;
    }
    const content = pkg && pkg.content !== undefined ? pkg.content : p.content;
    const key = partKey({ package: content, record });
    const after = { key, record, kernels: compiled.sources };
    if (key === before.key) { builds.push(buildEvent({ part: p.name, boundary, trigger, before, after, consumers })); return; }
    // init runs on a trial copy, so a throw or a state that does not fit leaves the running part as it was
    const next = { record, compiled, clock: clock.clock, key, content, revision: nextRevision({ key: before.key, revision: before.revision }, key), rng: /** @type {Part["rng"]} */ ([...p.rng]) };
    const r = runInit({ ...p, ...next }, dev);
    if (!("state" in r)) { builds.push(buildEvent({ part: p.name, boundary, trigger, before, after: null, consumers, diagnostics: [{ code: r.code, message: r.message }] })); return; }
    builds.push(buildEvent({ part: p.name, boundary, trigger, before, after, consumers }));
    Object.assign(p, next, { lastFrameT: null, rebuilt: true, snapT: null, stopped: false });
    revision++;
    commitState(p, r.state);
  }

  /** What a wire's consumer reads of its producer: now, or as the instant began. @param {Wire} w */
  const viewOf = (w) => {
    const p = /** @type {Part} */ (byName.get(w.from.part));
    return w.delay ? startView.get(p.name) ?? { state: p.state, revision: p.revision, part: p } : { state: p.state, revision: p.revision, part: p };
  };
  /** The records a consumer stepping at T may take: stamped at or before T (before T on a delayed wire). @param {Wire} w @param {Q} T */
  const ready = (w, T) => w.queue.filter((x) => (w.delay ? cmp(x.T, T) < 0 : cmp(x.T, T) <= 0)).length;

  /** A part's inputs at T, without taking any Event. @param {Part} p @param {Q} T */
  function readInputs(p, T) {
    /** @type {Record<string, unknown>} */
    const values = defaults(p.runtime);
    /** @type {Record<string, number | null>} */
    const rev = {};
    let pending = 0;
    for (const i of Object.values(/** @type {Record<string, any>} */ (p.runtime.dialect.seams.in))) {
      const w = wireTo.get(`${p.name}.${i.name}`);
      if (!w) { rev[i.name] = null; continue; }
      const v = viewOf(w);
      rev[i.name] = v.revision;
      if (w.event) { pending += ready(w, T); continue; }
      const read = v.state === null ? undefined : v.part.compiled.outputs[w.from.port]?.(v.state, v.part.params);
      if (read !== undefined) values[i.name] = deepFreeze(carry(read, w));
    }
    return { values, rev, pending };
  }

  /** Takes a wire's ready records, in stamp then push order. @param {Wire} w @param {Q} T */
  function take(w, T) {
    const n = ready(w, T);
    return w.queue.splice(0, n).map((x) => x.record);
  }

  /**
   * Why a part's step at T would take more records from an Event input than its runtime declares, or null. S116
   * sized each reliable queue for a window this run honors; a step past it is refused rather than handed the excess
   * (a log whose frames are farther apart than the cap, say).
   * @param {Part} p @param {Q} T @returns {string | null}
   */
  function intake(p, T) {
    for (const i of Object.values(/** @type {Record<string, any>} */ (p.runtime.dialect.seams.in))) {
      if (i.seam.kind !== "event") continue;
      const w = wireTo.get(`${p.name}.${i.name}`);
      const n = w ? ready(w, T) : 0, max = p.runtime.events.in[i.name];
      if (w && max !== undefined && n > max) return `part '${p.name}': in.${i.name}: ${n} records are ready, and the runtime declares at most ${max} per step (events: { in: { ${i.name}: … } }); ${w.text} was sized for steps at most ${qText(catchUp)} s apart (the catch-up cap) or its clocks' own spacing, and this step comes later than that; none were taken`;
    }
    return null;
  }

  /** @param {Part} p @param {Q} T */
  function due(p, T) {
    if (p.stopped || p.state === null) return false;
    if (p.clock.kind === "tick") return onGrid(T, p.clock.period);
    if (p.clock.kind === "frame") return frames === "nominal" ? onGrid(T, NOMINAL_FRAME) : isFrame(T);
    return true;
  }

  /** One instant: inputs applied, the due parts stepped in wire order, the state hashes recorded. @param {Q} T */
  function instant(T) {
    if (pinned && cmp(pinned, T) <= 0) pinned = null;
    applyInputs(T, T);
    startView = new Map(parts.map((p) => [p.name, { state: p.state, revision: p.revision, part: p }]));
    /** @type {string[]} */
    const stepped = [];
    for (const p of order) {
      if (!due(p, T)) continue;
      const { values, rev, pending } = readInputs(p, T);
      const shown = canonical(values);
      if (p.clock.kind === "demand" && p.stepped && !p.rebuilt && pending === 0 && shown === p.lastValues) continue;
      /** @type {Record<string, unknown>} */
      const inputs = { ...values, $rev: Object.freeze(rev) };
      const over = intake(p, T);
      if (over) { stop(p, { code: "N002", message: over }, T); continue; }
      for (const i of Object.values(/** @type {Record<string, any>} */ (p.runtime.dialect.seams.in))) {
        if (i.seam.kind !== "event") continue;
        const w = wireTo.get(`${p.name}.${i.name}`);
        inputs[i.name] = Object.freeze(w ? take(w, T) : []);
      }
      const dt = p.clock.kind === "tick" ? toNumber(p.clock.period) : p.clock.kind === "frame" && p.lastFrameT ? toNumber(sub(T, p.lastFrameT)) : 0;
      const r = runStep(p, { T: toNumber(T), dt, inputs: Object.freeze(inputs), values, dev });
      if ("code" in r) { stop(p, r, T); continue; }
      commitState(p, r.state);
      Object.assign(p, { rng: r.rng, snapT: T, stepped: true, rebuilt: false, lastValues: shown, ...(p.clock.kind === "frame" ? { lastFrameT: T } : {}) });
      stepped.push(p.name);
      for (const [port, records] of Object.entries(r.events)) for (const w of wires) {
        if (w.from.part !== p.name || w.from.port !== port) continue;
        if (!running(/** @type {Part} */ (byName.get(w.to.part)))) { if (records.length) dropStopped(w, records.length, T); continue; }
        for (const rec of records) w.queue.push({ T, record: deepFreeze(carry(rec, w)) });
        if (w.keepLast !== null && w.queue.length > w.keepLast) {
          const n = w.queue.length - w.keepLast;
          w.queue.splice(0, n);
          w.drops += n;
          if (!dropNoted.has(w.index)) { dropNoted.add(w.index); report({ code: "N001", severity: "warning", message: `${w.text}: ${w.to.part}.in.${w.to.port} keeps the last ${w.keepLast} records (its delivery), and ${n} were dropped here; stats().dropped counts every drop`, part: w.to.part, T: qText(T) }); }
        }
      }
    }
    lastT = T;
    if (cmp(now, T) < 0) now = T;
    hashes.push({ T: qText(T), hash: stateHash(parts.map((p) => [p.name, p.revision, p.stopped, p.hash])), parts: Object.fromEntries(parts.map((p) => [p.name, p.hash])) });
    const lastCp = checkpoints.at(-1);
    if (!lastCp.T || cmp(sub(T, lastCp.T), every) >= 0) checkpoint();
    return { T: qText(T), stepped };
  }

  /**
   * The next instant at or before `limit` (any, when null), or null. While no part is due, the inputs on the way are
   * applied a stamp at a time, at their stamps: a rebuild among them may restart a part, whose clock then counts from
   * that stamp. A display run whose frame part waits on its next frame applies none: they wait for that frame.
   * @param {Q | null} limit
   */
  function upcoming(limit) {
    for (;;) {
      const T = nextInstant();
      if (T) return !limit || cmp(T, limit) <= 0 ? T : null;
      if (awaitingFrame()) return null;
      const e = inputs[cursor];
      if (!e || (limit && cmp(e.T, limit) > 0)) return null;
      applyInputs(e.T, null);
      floor = e.T;
      if (cmp(now, e.T) < 0) now = e.T;
    }
  }

  /**
   * Runs every instant at or before `target`, then applies the inputs stamped by it, from the log alone (what a
   * replay and a rewind do). Those land before the instant due next, which then runs next even if a rebuild moved a
   * clock off it, as it would had the run gone on without stopping here; in a display run whose next frame is not
   * logged yet, they wait for it, since it may come first. @param {Q} target
   */
  function advance(target) {
    for (let T = upcoming(target); T; T = upcoming(target)) instant(T);
    const at = nextInstant();
    if (at && !awaitingFrame() && applyInputs(target, at)) pinned = at;
    if (cmp(now, target) < 0) now = target;
  }

  /**
   * A display run moved by runUntil, not by the driver, still steps its frame parts: frames are logged from the last
   * one to `target`, a nominal frame apart and the last two splitting what is left, so none is more than a nominal
   * frame (and so the catch-up cap) or less than MIN_FRAME from the one before, and the driver's next frame counts
   * from `target`. When T has passed the last frame (after a rewind, say), the first goes on the nominal grid past T,
   * within the cap of the last. A frame closer than MIN_FRAME to the one before is not logged, as the driver merges
   * one, so the last may fall just short of `target`. @param {Q} target
   */
  function logFrames(target) {
    if (frames !== "display" || !parts.some((p) => p.clock.kind === "frame" && running(p)) || cmp(target, now) <= 0) return;
    const i = framesThrough(target);
    let from = i > 0 ? frameTs[i - 1] : q(0);
    const frame = (/** @type {Q} */ T) => { insert({ kind: "frame", T }); from = T; };
    if (cmp(now, from) > 0) {
      const grid = add(from, mul(NOMINAL_FRAME, q(floorDiv(sub(now, from), NOMINAL_FRAME) + 1)));
      let first = cmp(grid, target) > 0 ? target : grid;
      // within the cap when T is (a frame must come after T: when T is a whole cap past the last frame, it cannot)
      const cap = add(from, catchUp);
      if (cmp(first, cap) > 0 && cmp(cap, now) > 0) first = cap;
      if (cmp(sub(first, from), MIN_FRAME) < 0) return;
      frame(first);
    }
    if (cmp(sub(target, from), MIN_FRAME) < 0) return;
    const m = ceilDiv(sub(target, from), NOMINAL_FRAME);
    for (let k = 1; k <= m - 2; k++) frame(add(from, NOMINAL_FRAME));
    if (m >= 2) frame(add(from, mul(sub(target, from), q(1, 2))));
    frame(target);
  }

  function checkpoint() {
    checkpoints.push({
      T: lastT, now, cursor, revision,
      parts: parts.map((p) => Object.fromEntries(PART_FIELDS.map((f) => [f, f === "rng" ? [...p.rng] : p[f]]))),
      wires: wires.map((w) => ({ queue: [...w.queue], drops: w.drops, stopDrops: w.stopDrops })),
      lens: { hashes: hashes.length, builds: builds.length, diagnostics: diagnostics.length },
      dropNoted: [...dropNoted], stopNoted: [...stopNoted],
      slow, lastFrameSeen, pinned, floor, slowDiag: slow ? diagnostics[slow.index] : null,
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
    get lastFrame() { const i = framesThrough(now); return i > 0 ? frameTs[i - 1] : q(0); },
    /** Whether a part steps on frames now. */
    get framed() { return parts.some((p) => p.clock.kind === "frame" && !p.stopped && p.state !== null); },
    /** The composition's revision: bumps when any part's does. */
    get revision() { return revision; },
    /** The composition's content key: its parts' keys by identity and its wires (kit/build). */
    get compositionKey() { return compositionKey(Object.fromEntries(parts.map((p) => [p.name, p.key])), composed.wires, composed.show); },
    diagnostics, builds, hashes, checkpoints,
    /** The input log as data: the header a replay needs and every outside input, stamped with T. */
    get log() { return { header: { name: composed.name, seed, frames, catchUp: qText(catchUp), params: options.params ?? {} }, inputs: inputs.map((e) => ({ ...e, T: qText(e.T) })) }; },
    /** What a replay compares: the log, each instant's state hashes, the build events; and the T it reached. */
    record() { return { log: run.log, hashes: [...hashes], builds: [...builds], T: qText(now) }; },
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
      const entry = inputEntry({ ...e, T: e.T ?? nextInstant() ?? (lastT && cmp(now, lastT) <= 0 ? afterMs(now) : now) }, toQ);
      if (lastT && cmp(entry.T, lastT) <= 0) throw new Error(`an input stamped ${qText(entry.T)} is not after the last instant run, ${qText(lastT)}`);
      insert(entry);
      if (cmp(entry.T, now) <= 0) advance(now);
      return entry;
    },
    /** A part's state now; null when its init failed. @param {string} part */
    state(part) { return mustPart(part).state; },
    /** A part's snapshot: its state, revision and the instant it was committed at (null: init's). @param {string} part */
    snapshot(part) { const p = mustPart(part); return { state: p.state, revision: p.revision, T: p.snapT ? qText(p.snapT) : null }; },
    /** A part's content key. @param {string} part */
    key(part) { return mustPart(part).key; },
    /** Drops (by a keepLast input; to a stopped part) and slowdowns so far. */
    stats() {
      /** @type {Record<string, number>} */
      const dropped = {};
      /** @type {Record<string, number>} */
      const stopped = {};
      for (const w of wires) { if (w.drops) dropped[w.text] = w.drops; if (w.stopDrops) stopped[w.text] = w.stopDrops; }
      return { dropped, stopped, slowdowns: slowdowns(inputs.slice(0, cursor)) };
    },
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
      wires.forEach((w, j) => { w.queue = [...cp.wires[j].queue]; w.drops = cp.wires[j].drops; w.stopDrops = cp.wires[j].stopDrops; });
      hashes.length = cp.lens.hashes; builds.length = cp.lens.builds; diagnostics.length = cp.lens.diagnostics;
      dropNoted.clear(); for (const n of cp.dropNoted) dropNoted.add(n);
      stopNoted.clear(); for (const n of cp.stopNoted) stopNoted.add(n);
      ({ slow, lastFrameSeen, pinned, floor } = cp);
      if (slow) diagnostics[slow.index] = cp.slowDiag;
      ({ T: lastT, now, cursor, revision } = cp);
      for (let k = inputs.length - 1; k >= cursor; k--) if (cmp(inputs[k].T, target) > 0) inputs.splice(k, 1);
      for (let k = frameTs.length - 1; k >= 0; k--) if (cmp(frameTs[k], target) > 0) frameTs.splice(k, 1);
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

/**
 * The order parts step in within an instant: each producer before its consumers along undelayed wires (a delayed
 * wire reads the previous instant, so it orders nothing); ties go by the order the glue added the parts.
 * @param {Part[]} parts @param {Wire[]} wires @returns {Part[]}
 */
function wireOrder(parts, wires) {
  const live = wires.filter((w) => !w.delay && w.from.part !== w.to.part);
  const indeg = new Map(parts.map((p) => [p.name, 0]));
  for (const w of live) indeg.set(w.to.part, (indeg.get(w.to.part) ?? 0) + 1);
  /** @type {Part[]} */
  const out = [];
  const left = [...parts];
  while (left.length) {
    const i = left.findIndex((p) => indeg.get(p.name) === 0);
    // kit/compose refuses an undelayed cycle (S115); if one reached here, keep glue order for the rest
    const p = left.splice(i < 0 ? 0 : i, 1)[0];
    out.push(p);
    for (const w of live) if (w.from.part === p.name) indeg.set(w.to.part, (indeg.get(w.to.part) ?? 0) - 1);
  }
  return out;
}
