// createRun: a composed workbench, run (the clocks draft, as ruled 2026-11-26). One workbench time T in exact
// rationals; at each instant the parts due step in wire order (a producer before its consumers), each reading its
// producers' latest snapshots (a delayed wire, the previous instant's) and taking its Events exactly once, in order.
// Outside inputs come from the input log, stamped with T; rebuilds land between instants (kit/build keys them and
// writes their events). A run is a pure function of the composed record, the params and the log.

import { q, cmp, mul, sub, floorDiv, toNumber, qText, parseQ, fromNumber } from "../define/rational.js";
import { needsRebuild } from "../define/params.js";
import { clockOf } from "../define/runtime.js";
import { queueProblems, catchUpOf, NOMINAL_FRAME } from "../compose/queues.js";
import { partKey, compositionKey, canonical, stateHash, nextRevision, buildEvent, paramTrigger, packageTrigger, glueTrigger } from "../build/index.js";
import { compilePart } from "./compile.js";
import { carry } from "./carry.js";
import { RunError } from "./codes.js";
import { makePart, runInit, runStep, defaults, deepFreeze, PART_FIELDS } from "./part.js";
import { slowdowns, inputEntry } from "./log.js";

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
/** @typedef {{ index: number, from: { part: string, port: string }, to: { part: string, port: string }, event: boolean, delay: boolean, keepLast: number | null, convert: any[], rename: Record<string, string>, dropped: string[], queue: Array<{ T: Q, record: unknown }>, drops: number, text: string }} Wire */
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
 * a clock does not read (R006) or a reliable queue can overflow (S116).
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
    if (typeof p === "string") { refused.push({ code: "R006", message: `part '${cp.name}' (${cp.dialect}): ${p}` }); return; }
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
    return { index, from, to, event, delay: w.delay, keepLast, convert: w.convert, rename: w.rename, dropped: w.dropped, queue: [], drops: 0, text: `${w.from} → ${w.to}` };
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
  /** @param {Part} p @param {{ code: string, message: string }} r @param {Q | null} T */
  const stop = (p, r, T) => { p.stopped = true; report({ code: r.code, message: r.message, part: p.name, T: T ? qText(T) : null, revision: p.revision }); };
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

  /** The next multiple of `period` after lastT (0 at the start). @param {Q} period */
  const nextMultiple = (period) => (lastT === null ? q(0) : mul(period, q(floorDiv(lastT, period) + 1)));
  /** @param {Q} T @param {Q} period */
  const onGrid = (T, period) => { const r = mul(T, q(period.d, period.n)); return r.d === 1; };
  const nextFrame = () => frameTs.find((t) => lastT === null || cmp(t, lastT) > 0) ?? null;

  /** The next instant at which a tick or frame part is due, or null. @returns {Q | null} */
  function nextInstant() {
    /** @type {Q | null} */
    let best = null;
    for (const p of parts) {
      if (p.stopped || p.state === null) continue;
      const c = p.clock.kind === "tick" ? nextMultiple(p.clock.period) : p.clock.kind === "frame" ? (frames === "nominal" ? nextMultiple(NOMINAL_FRAME) : nextFrame()) : null;
      if (c && (!best || cmp(c, best) < 0)) best = c;
    }
    return best;
  }

  /** Applies the log's inputs stamped at or before `T`, between instants. @param {Q} T */
  function applyInputs(T) {
    while (cursor < inputs.length && cmp(inputs[cursor].T, T) <= 0) {
      const e = inputs[cursor++];
      if (e.kind === "frame") { frameSlowdown(e); continue; }
      const p = byName.get(e.part ?? "");
      if (!p) throw new Error(`an input names no part '${e.part}': the parts are ${parts.map((x) => x.name).join(", ")}`);
      if (e.kind === "control") p.controls = { ...p.controls, [/** @type {string} */ (e.name)]: deepFreeze(structuredClone(e.value)) };
      else if (e.kind === "param") {
        const name = /** @type {string} */ (e.name), from = p.params[name];
        p.params = { ...p.params, [name]: e.value };
        if (needsRebuild(p.record, [name])) {
          if (!options.build) throw new Error(`the param ${p.name}.$.${name} is read at build time, so changing it rebuilds the part, and the run was given no build(part, params)`);
          rebuild(p, options.build(p.name, { ...p.params }), paramTrigger(p.record, name, from, e.value), null);
        }
      } else if (e.kind === "rebuild") {
        const trigger = e.trigger ?? (e.package ? packageTrigger({ key: p.content }, { key: e.package.content ?? null }) : glueTrigger());
        rebuild(p, /** @type {Record<string, any>} */ (e.record), trigger, e.package ?? null);
      }
    }
  }

  /** A run of capped frames closes with an R001 at the first frame that is not capped. @param {Entry} e */
  function frameSlowdown(e) {
    if (e.capped) return;
    const prev = inputs.slice(0, cursor - 1).findLast((x) => x.kind === "frame");
    if (!prev?.capped) return;
    const last = /** @type {any} */ (slowdowns(inputs.slice(0, cursor)).at(-1));
    report({ code: "R001", severity: "warning", message: `the run fell behind wall time: it ran at ${last.ratio.toFixed(2)}× for ${last.wall} s of wall time (T advanced ${last.workbench} s, from ${last.from} to ${last.to}); no record was dropped`, T: last.to });
  }

  /**
   * A rebuild between instants: the new record compiled and keyed; the revision bumps only when the key changes,
   * when init runs again; the Event queues are kept. A failed rebuild keeps the previous revision running.
   * @param {Part} p @param {Record<string, any>} record @param {any} trigger @param {{ content?: string | null } | null} pkg
   */
  function rebuild(p, record, trigger, pkg) {
    const next = nextInstant();
    const boundary = { after: lastT ? qText(lastT) : null, before: next ? qText(next) : qText(now) };
    const consumers = wires.filter((w) => w.from.part === p.name).map((w) => `${w.to.part}.in.${w.to.port}`);
    const before = { key: p.key, revision: p.revision, record: p.record, kernels: p.compiled.sources };
    const compiled = compilePart(p.runtime, record);
    const clock = compiled.ok ? clockOf(p.runtime, record) : null;
    if (!compiled.ok || !clock?.ok) {
      const diags = !compiled.ok ? compiled.diagnostics : [{ code: "R006", message: `part '${p.name}' (${p.dialect}): ${/** @type {any} */ (clock).error}` }];
      builds.push(buildEvent({ part: p.name, boundary, trigger, before, after: null, consumers, diagnostics: diags }));
      return;
    }
    const content = pkg && pkg.content !== undefined ? pkg.content : p.content;
    const key = partKey({ package: content, record });
    const ev = buildEvent({ part: p.name, boundary, trigger, before, after: { key, record, kernels: compiled.sources }, consumers });
    builds.push(ev);
    if (!ev.changed) return;
    Object.assign(p, { record, compiled, clock: clock.clock, key, content, revision: nextRevision({ key: before.key, revision: before.revision }, key), lastFrameT: null, rebuilt: true, snapT: null, stopped: false });
    revision++;
    const r = runInit(p, dev);
    if ("state" in r) commitState(p, r.state); else stop(p, r, lastT);
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

  /** @param {Part} p @param {Q} T */
  function due(p, T) {
    if (p.stopped || p.state === null) return false;
    if (p.clock.kind === "tick") return onGrid(T, p.clock.period);
    if (p.clock.kind === "frame") return frames === "nominal" ? onGrid(T, NOMINAL_FRAME) : frameTs.some((t) => cmp(t, T) === 0);
    return true;
  }

  /** One instant: inputs applied, the due parts stepped in wire order, the state hashes recorded. @param {Q} T */
  function instant(T) {
    applyInputs(T);
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
        for (const rec of records) w.queue.push({ T, record: deepFreeze(carry(rec, w)) });
        if (w.keepLast !== null && w.queue.length > w.keepLast) {
          const n = w.queue.length - w.keepLast;
          w.queue.splice(0, n);
          w.drops += n;
          if (!dropNoted.has(w.index)) { dropNoted.add(w.index); report({ code: "R001", severity: "warning", message: `${w.text}: ${w.to.part}.in.${w.to.port} keeps the last ${w.keepLast} records (its delivery), and ${n} were dropped here; stats().dropped counts every drop`, part: w.to.part, T: qText(T) }); }
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

  function checkpoint() {
    checkpoints.push({
      T: lastT, now, cursor, revision,
      parts: parts.map((p) => Object.fromEntries(PART_FIELDS.map((f) => [f, f === "rng" ? [...p.rng] : p[f]]))),
      wires: wires.map((w) => ({ queue: [...w.queue], drops: w.drops })),
      lens: { hashes: hashes.length, builds: builds.length, diagnostics: diagnostics.length },
      dropNoted: [...dropNoted],
    });
  }
  checkpoint();

  const run = {
    /** The time the run has reached, as a rational. */
    get T() { return now; },
    /** The time the run has reached, in seconds. */
    get seconds() { return toNumber(now); },
    /** The composition's revision: bumps when any part's does. */
    get revision() { return revision; },
    /** The composition's content key: its parts' keys by identity and its wires (kit/build). */
    get compositionKey() { return compositionKey(Object.fromEntries(parts.map((p) => [p.name, p.key])), composed.wires, composed.show); },
    diagnostics, builds, hashes, checkpoints,
    /** The input log as data: the header a replay needs and every outside input, stamped with T. */
    get log() { return { header: { name: composed.name, seed, frames, catchUp: qText(catchUp), params: options.params ?? {} }, inputs: inputs.map((e) => ({ ...e, T: qText(e.T) })) }; },
    /** What a replay compares: the log, each instant's state hashes, the build events. */
    record() { return { log: run.log, hashes: [...hashes], builds: [...builds] }; },
    /** The next instant, run; null when no part has a clock. */
    step() {
      const T = nextInstant();
      if (!T) return null;
      return instant(T);
    },
    /** Runs every instant at or before `t` (seconds, or a rational), then applies the inputs stamped by it. @param {number | Q} t */
    runUntil(t) {
      const target = toQ(t);
      for (let T = nextInstant(); T && cmp(T, target) <= 0; T = nextInstant()) instant(T);
      applyInputs(target);
      if (cmp(now, target) < 0) now = target;
      return run;
    },
    /** Adds an outside input, stamped with T (by default, the next instant). @param {Record<string, any>} e */
    input(e) {
      const entry = inputEntry({ ...e, T: e.T ?? nextInstant() ?? now }, toQ);
      if (lastT && cmp(entry.T, lastT) <= 0) throw new Error(`an input stamped ${qText(entry.T)} is not after the last instant run, ${qText(lastT)}`);
      insert(entry);
      return entry;
    },
    /** A part's state now; null when its init failed. @param {string} part */
    state(part) { return mustPart(part).state; },
    /** A part's snapshot: its state, revision and the instant it was committed at (null: init's). @param {string} part */
    snapshot(part) { const p = mustPart(part); return { state: p.state, revision: p.revision, T: p.snapT ? qText(p.snapT) : null }; },
    /** A part's content key. @param {string} part */
    key(part) { return mustPart(part).key; },
    /** Drops and slowdowns so far. */
    stats() {
      /** @type {Record<string, number>} */
      const dropped = {};
      for (const w of wires) if (w.drops) dropped[w.text] = w.drops;
      return { dropped, slowdowns: slowdowns(inputs.slice(0, cursor)) };
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
      wires.forEach((w, j) => { w.queue = [...cp.wires[j].queue]; w.drops = cp.wires[j].drops; });
      hashes.length = cp.lens.hashes; builds.length = cp.lens.builds; diagnostics.length = cp.lens.diagnostics;
      dropNoted.clear(); for (const n of cp.dropNoted) dropNoted.add(n);
      ({ T: lastT, now, cursor, revision } = cp);
      for (let k = inputs.length - 1; k >= cursor; k--) if (cmp(inputs[k].T, target) > 0) inputs.splice(k, 1);
      for (let k = frameTs.length - 1; k >= 0; k--) if (cmp(frameTs[k], target) > 0) frameTs.splice(k, 1);
      return run.runUntil(target);
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
