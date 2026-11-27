// One part in a run: its build (record, compiled Kernels, clock, key, revision), its state and seeded stream, and
// what its init and step are handed. The checks a run makes of a step live here: N002 (a state that does not fit,
// or too many Events), N003 (a step that changed its input or kept memory, in development runs), N004 (a throw).

import { clockOf } from "../define/runtime.js";
import { canonical, stateHash } from "../build/index.js";
import { stateErrorMessage } from "../define/state.js";
import { seedRng, next } from "./rng.js";
import { drawAfter, NONE } from "./draw.js";

/** @import { Runtime, Clock } from "../define/runtime.js" */
/** @import { Q } from "../define/rational.js" */
/** @import { Compiled } from "./compile.js" */
/** @import { RngState } from "./rng.js" */

/**
 * A part's live record in the scheduler. `state` is null when init failed; `snapT` the instant of its last commit
 * (null for init's state); `lastValues` the canonical value inputs it last read (a demand part's wake test);
 * `draws` its committed state's Draw lists, by port; `drawValues` and `drawParams` the value and Draw inputs and the
 * params they were built with, which a checkpoint copies so a rewind can build them again (`redraw`).
 * @typedef {{ name: string, index: number, dialect: string, runtime: Runtime, record: Record<string, any>, compiled: Compiled, clock: Clock, key: string, revision: number, content: string | null, state: any, hash: string, snapT: Q | null, stopped: boolean, rng: RngState, lastFrameT: Q | null, stepped: boolean, rebuilt: boolean, lastValues: string | null, drawValues: Record<string, unknown> | null, drawParams: Record<string, unknown> | null, params: Record<string, unknown>, draws: import("./draw.js").Draws, files: Readonly<Record<string, unknown>> }} Part
 */

/** A part's own fields a checkpoint copies (everything that changes while it runs). */
export const PART_FIELDS = /** @type {const} */ (["record", "compiled", "clock", "key", "revision", "content", "state", "hash", "snapT", "stopped", "rng", "lastFrameT", "stepped", "rebuilt", "lastValues", "drawValues", "drawParams", "params"]);

/** Freezes plain data all the way down, so a step that changes what it was handed throws (N003). @param {any} v */
export function deepFreeze(v) {
  if (v === null || typeof v !== "object" || Object.isFrozen(v)) return v;
  Object.freeze(v);
  for (const k of Object.keys(v)) deepFreeze(v[k]);
  return v;
}

/** @param {unknown} e */
const isFrozenWrite = (e) => e instanceof TypeError && /read[- ]only|not extensible|Cannot assign|Cannot add property|Cannot delete|Cannot define property|frozen/i.test(e.message);

/** @param {unknown} e */
const why = (e) => /** @type {Error} */ (e)?.message ?? String(e);

/**
 * The params a part's Kernels read as `$`: each declared param's value, then the host's.
 * @param {Record<string, any>} record @param {Record<string, unknown>} [given]
 */
export function paramsOf(record, given = {}) {
  /** @type {Record<string, unknown>} */
  const out = {};
  for (const [n, d] of Object.entries(/** @type {Record<string, any>} */ (record.params ?? {}))) out[n] = d && typeof d === "object" && "value" in d ? d.value : d;
  return { ...out, ...given };
}

/** The name a part's Dialect reads its params by (`params.name`, `$` by default). @param {Part} p */
const paramsName = (p) => /** @type {string} */ (p.runtime.dialect.def?.params?.name ?? "$");

/**
 * The globals a part's Kernels read in one init or step: the params, by the Dialect's params name (fields names
 * them u), and the inputs object (the value inputs).
 * @param {Part} p @param {Record<string, unknown>} values @param {Record<string, unknown>} [params]  the params, if not the part's own
 */
function globalsFor(p, values, params = p.params) {
  /** @type {Record<string, unknown>} */
  const g = { [paramsName(p)]: Object.freeze({ ...params }) };
  const inputs = p.runtime.dialect.seams.inputs;
  if (inputs) g[inputs.name] = Object.freeze({ ...values });
  p.compiled.globals.current = g;
  return g;
}

/** Each compiled build's kernels with the part's own slots aliased, made once per build. @type {WeakMap<Compiled, Record<string, Function>>} */
const aliased = new WeakMap();

/**
 * The kernels a part's init and step are handed: every lambda by its full id (`level.control`, `pop.spawn`), the
 * part's own, its root instance's, by slot name too (`control`), and a named call's by `<instance>.<slot>.<name>`
 * (ruling 1, 2026-11-26). A full id holds a dot, so a slot name never meets one; the aliases are not enumerable, so
 * the keys stay the ids.
 * @param {Part} p
 */
export function kernelsFor(p) {
  const hit = aliased.get(p.compiled);
  if (hit) return hit;
  /** @type {Record<string, Function>} */
  const out = { ...p.compiled.kernels };
  const own = `${p.name}.`;
  for (const [id, k] of Object.entries(p.compiled.kernels)) {
    if (id.startsWith(own) && !id.slice(own.length).includes(".")) Object.defineProperty(out, id.slice(own.length), { value: k, enumerable: false });
  }
  for (const [alias, id] of Object.entries(p.compiled.aliases)) if (!Object.hasOwn(out, alias)) Object.defineProperty(out, alias, { value: p.compiled.kernels[id], enumerable: false });
  Object.freeze(out);
  aliased.set(p.compiled, out);
  return out;
}

/**
 * The value inputs a part gets when nothing is wired: each input's default.
 * @param {Runtime} runtime
 */
export function defaults(runtime) {
  /** @type {Record<string, unknown>} */
  const out = {};
  for (const i of Object.values(/** @type {Record<string, any>} */ (runtime.dialect.seams.in))) if (i.seam.kind !== "event") out[i.name] = i.default ?? null;
  return out;
}

/**
 * A state checked against its part's Program's state (the Dialect's, with the fields the Program declares): N003 when
 * it keeps a field the Program does not declare in the extensible struct (memory outside its state), N002 when it
 * does not fit otherwise, or null.
 * @param {Part} p @param {unknown} s @param {string} what
 * @returns {{ code: "N002" | "N003", message: string } | null}
 */
function stateProblem(p, s, what) {
  const bad = p.runtime.dialect.checkState?.(s, p.record) ?? [];
  if (!bad.length) return null;
  const outside = bad.filter((/** @type {{ outside?: true }} */ m) => m.outside);
  if (outside.length) {
    const misfits = bad.filter((/** @type {{ outside?: true }} */ m) => !m.outside);
    const also = misfits.length ? `\n  and it does not fit otherwise: ${stateErrorMessage(p.dialect, misfits)}` : "";
    return { code: "N003", message: `part '${p.name}' (${p.dialect}): ${what} a state that kept memory outside its state: ${stateErrorMessage(p.dialect, outside)}${also}` };
  }
  return { code: "N002", message: `part '${p.name}': ${what} a state that does not fit: ${stateErrorMessage(p.dialect, bad)}` };
}

/**
 * Runs a part's init on its record: the state, or an error message (N004 when it threw, N002 or N003 when it does
 * not fit; a J code when a Draw output does not build).
 * @param {Part} p @param {boolean} dev
 * @returns {{ state: any, draws: import("./draw.js").Draws } | { code: string, message: string }}
 */
export function runInit(p, dev) {
  const globals = globalsFor(p, defaults(p.runtime));
  const ctx = { part: p.name, revision: p.revision, record: p.record, kernels: kernelsFor(p), rng: () => next(p.rng), params: globals[paramsName(p)], globals, files: p.files };
  /** @type {any} */
  let s;
  try { s = p.runtime.init(p.record, ctx); } catch (e) { return { code: "N004", message: `part '${p.name}' (${p.dialect}): init threw: ${why(e)}` }; }
  const bad = stateProblem(p, s, "init returned");
  if (bad) return bad;
  const state = dev ? deepFreeze(s) : s;
  globalsFor(p, defaults(p.runtime));
  const d = drawAfter(p, state);
  return "code" in d ? d : { state, draws: d.draws };
}

/**
 * One step of a part. Returns the new state and the Events it pushed, or the diagnostic that stops it.
 * @param {Part} p @param {{ T: number, dt: number, inputs: Record<string, unknown>, values: Record<string, unknown>, dev: boolean }} o
 * @returns {{ state: any, events: Record<string, unknown[]>, rng: RngState, draws: import("./draw.js").Draws } | { code: string, message: string }}
 */
export function runStep(p, { T, dt, inputs, values, dev }) {
  const outs = Object.values(/** @type {Record<string, any>} */ (p.runtime.dialect.seams.out)).filter((o) => o.seam.kind === "event").map((o) => o.name);
  const attempt = () => {
    /** @type {RngState} */
    const rng = [...p.rng];
    const globals = globalsFor(p, values);
    /** @type {Record<string, unknown[]>} */
    const events = Object.fromEntries(outs.map((n) => [n, []]));
    const ctx = { part: p.name, revision: p.revision, record: p.record, T, dt, inputs, params: globals[paramsName(p)], kernels: kernelsFor(p), rng: () => next(rng), events, globals, files: p.files };
    const state = p.runtime.step(p.state, ctx);
    return { state, events, rng };
  };
  /** @type {{ state: any, events: Record<string, unknown[]>, rng: RngState }} */
  let r;
  try { r = attempt(); } catch (e) {
    if (dev && isFrozenWrite(e)) return { code: "N003", message: `part '${p.name}' (${p.dialect}): step changed the state it was handed (${why(e)}); return a new state instead` };
    return { code: "N004", message: `part '${p.name}' (${p.dialect}): step threw: ${why(e)}` };
  }
  for (const n of outs) {
    const max = p.runtime.events.out[n], got = r.events[n].length;
    if (got > max) return { code: "N002", message: `part '${p.name}': events.${n}: ${got} records, and the runtime declares at most ${max} per step (events: { out: { ${n}: … } })` };
  }
  const bad = stateProblem(p, r.state, "step returned");
  if (bad) return bad;
  if (dev) {
    // the same step on the same state must give the same result: anything else kept memory outside its state
    /** @type {any} */
    let again;
    try { again = attempt(); } catch (e) { again = { state: `threw: ${why(e)}`, events: {} }; }
    if (stateHash(again.state) !== stateHash(r.state) || canonical(again.events) !== canonical(r.events)) {
      return { code: "N003", message: `part '${p.name}' (${p.dialect}): step kept memory outside its state: a second step on the same state and inputs gave another result (a module-level variable, Math.random or a clock?)` };
    }
    deepFreeze(r.state);
  }
  globalsFor(p, values);
  const d = drawAfter(p, r.state);
  return "code" in d ? d : { ...r, draws: d.draws };
}

/** A part whose package holds no data files. */
const NO_FILES = Object.freeze({});

/**
 * A package's data files as a runtime reads them (`ctx.files`, ruling 5 of the declared Controls draft): each file the
 * Dialect names under `files`, decoded (kit/package's `data`), by its name, frozen deeply.
 * @param {any} pkg  kit/package's loadPackage result, or null @returns {Readonly<Record<string, unknown>>}
 */
export function filesOf(pkg) {
  /** @param {unknown} v @returns {unknown} */
  const freeze = (v) => { if (v !== null && typeof v === "object" && !Object.isFrozen(v)) { for (const x of Object.values(v)) freeze(x); Object.freeze(v); } return v; };
  const out = Object.fromEntries(Object.values(/** @type {Record<string, any>} */ (pkg?.data ?? {})).filter((d) => typeof d?.from === "string" && d.from.startsWith("files.")).map((d) => [d.from.slice(6), freeze(structuredClone(d.value ?? d.text))]));
  return Object.keys(out).length ? Object.freeze(out) : NO_FILES;
}

/**
 * A fresh part for the run: compiled, clocked, keyed, seeded. Init is the caller's.
 * @param {{ name: string, index: number, dialect: string, runtime: Runtime, record: Record<string, any>, compiled: Compiled, key: string, content: string | null, seed: number, params?: Record<string, unknown>, files?: Readonly<Record<string, unknown>> }} o
 * @returns {Part | string}  the part, or why its clock does not read
 */
export function makePart(o) {
  const c = clockOf(o.runtime, o.record);
  if (!c.ok) return c.error;
  return {
    name: o.name, index: o.index, dialect: o.dialect, runtime: o.runtime, record: o.record, compiled: o.compiled, clock: c.clock,
    key: o.key, revision: 1, content: o.content, state: null, hash: stateHash(null), snapT: null, stopped: false, rng: seedRng(o.seed, o.name),
    lastFrameT: null, stepped: false, rebuilt: false, lastValues: null, drawValues: null, drawParams: null, params: paramsOf(o.record, o.params), draws: NONE,
    files: o.files ?? NO_FILES,
  };
}

/**
 * Builds a part's Draw lists for its committed state again, from the inputs and the params they were last built
 * with: after a rewind restores the state. Lists are a pure function of the state, the record, the params and the
 * inputs, so they come out as they were when that state was committed. A part that stopped after a commit keeps
 * that commit's lists, as a straight run does; one whose init failed has no state, and so none.
 * @param {Part} p
 */
export function redraw(p) {
  if (p.state === null || typeof p.state !== "object") { p.draws = NONE; return; }
  globalsFor(p, p.drawValues ?? defaults(p.runtime), p.drawParams ?? p.params);
  const d = drawAfter(p, p.state);
  p.draws = "code" in d ? NONE : d.draws;
}
