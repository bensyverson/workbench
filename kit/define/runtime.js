// defineRuntime: a package's runtime module (the clocks draft, as ruled 2026-11-26). Plain trusted JavaScript over
// the package's own state: `clock(record)` says when a part steps, `init(record, ctx)` gives the run's first state,
// `step(state, ctx)` the state after one step, pushing Event outputs into `ctx.events.<port>`. `events` bounds each
// Event port per step, which the composition's queue check reads (S116). The scheduler is kit/run; this file only
// checks the declaration (D033) and reads the clock.

import { refuse, isDialect } from "./dialect.js";
import { didYouMean } from "./codes.js";
import { isPlainObject, describe } from "./tags.js";
import { fromNumber } from "./rational.js";

/** @import { Q } from "./rational.js" */
/** @import { Problem } from "./types.js" */

/**
 * A part's clock, read: a tick every `period` seconds of workbench time, once per display frame, or on demand.
 * @typedef {{ kind: "tick", period: Q } | { kind: "frame" } | { kind: "demand" }} Clock
 */
/**
 * What a package's runtime module declares.
 * @typedef {{ clock: (record: Record<string, any>) => unknown, init: (record: Record<string, any>, ctx: any) => unknown, step: (state: any, ctx: any) => unknown, events?: { out?: Record<string, number>, in?: Record<string, number> } }} RuntimeDecl
 */
/**
 * A Runtime: its Grammar and Dialect, the three functions, and each Event port's per-step max.
 * @typedef {{ grammar: any, dialect: any, clock: RuntimeDecl["clock"], init: RuntimeDecl["init"], step: RuntimeDecl["step"], events: { out: Record<string, number>, in: Record<string, number> } }} Runtime
 */

const KEYS = ["clock", "init", "step", "events"];
const TIP = `defineRuntime(grammar, { clock: (record) => ({ tick: record.tick ?? 1 / 8 }), init(record, ctx) { … }, step(state, ctx) { … }, events: { out: { picked: 8 } } })`;

/** What defineRuntime made. */
const MADE = new WeakSet();
/** @param {unknown} v @returns {v is Runtime} */
export const isRuntime = (v) => typeof v === "object" && v !== null && MADE.has(v);

/** @param {unknown} v */
const isGrammar = (v) => typeof v === "function" && isDialect(/** @type {any} */ (v).dialect) && /** @type {any} */ (v).grammar !== undefined;

/**
 * Declares a package's runtime on its Grammar. Throws a DefinitionError (D033) holding every problem.
 * @param {unknown} grammar  the package's defineGrammar builder
 * @param {RuntimeDecl} decl
 * @returns {Runtime}
 */
export function defineRuntime(grammar, decl) {
  /** @type {Problem[]} */
  const out = [];
  /** @param {Array<string | number>} path @param {string} message @param {string} tip */
  const add = (path, message, tip) => out.push({ code: "D033", path, message, tip });
  if (!isGrammar(grammar)) add([], `defineRuntime takes the package's Grammar builder first, not ${describe(grammar)}`, TIP);
  if (!isPlainObject(decl)) {
    add([], `defineRuntime's declaration is { clock, init, step, events }, not ${describe(decl)}`, TIP);
    refuse("defineRuntime", out);
  }
  const d = /** @type {Record<string, unknown>} */ (decl);
  for (const k of Object.keys(d)) if (!KEYS.includes(k)) add([k], `defineRuntime takes no '${k}'.${didYouMean(k, KEYS)} Its keys: ${KEYS.join(", ")}`, `remove '${k}'`);
  for (const k of ["clock", "init", "step"]) if (typeof d[k] !== "function") add([k], `${k} must be a function, not ${describe(d[k])}`, TIP);
  /** @type {{ out: Record<string, number>, in: Record<string, number> }} */
  const events = { out: {}, in: {} };
  if (isGrammar(grammar)) {
    const seams = /** @type {any} */ (grammar).dialect.seams;
    const ev = d.events === undefined ? {} : d.events;
    if (!isPlainObject(ev)) add(["events"], `events is { out: { port: max }, in: { port: max } }, not ${describe(ev)}`, "events: { out: { picked: 8 } }");
    else {
      for (const k of Object.keys(ev)) if (k !== "out" && k !== "in") add(["events", k], `events takes out and in, not '${k}'`, "events: { out: { picked: 8 }, in: { burst: 8 } }");
      for (const side of /** @type {const} */ (["out", "in"])) {
        const given = ev[side] === undefined ? {} : ev[side];
        const ports = /** @type {Record<string, any>} */ (seams[side]);
        const eventPorts = Object.keys(ports).filter((n) => ports[n].seam.kind === "event");
        const what = side === "out" ? "output" : "input";
        if (!isPlainObject(given)) { add(["events", side], `events.${side} is { port: max }, not ${describe(given)}`, `events: { ${side}: { ${eventPorts[0] ?? "port"}: 8 } }`); continue; }
        for (const [n, m] of Object.entries(given)) {
          if (!Object.hasOwn(ports, n)) { add(["events", side, n], `the ${grammarName(grammar)} Dialect has no ${what} '${n}'.${didYouMean(n, eventPorts)} Its Event ${what}s: ${eventPorts.join(", ") || "none"}`, `name one of its Event ${what}s`); continue; }
          if (ports[n].seam.kind !== "event") { add(["events", side, n], `${what} '${n}' is a value (${ports[n].seamText}); only an Event port has a per-step max`, `remove '${n}'`); continue; }
          if (typeof m !== "number" || !Number.isInteger(m) || m < 1) { add(["events", side, n], `the max of ${what} '${n}' is a whole number of records per step, at least 1, not ${describe(m)}`, `${n}: 8`); continue; }
          const keep = side === "in" ? ports[n].delivery?.keepLast : undefined;
          if (keep !== undefined && m < keep) { add(["events", side, n], `input '${n}' keeps the last ${keep} records (its delivery), so a step may take ${keep}, and its max is ${m}`, `${n}: ${keep}, or keep fewer: delivery: { keepLast: ${m} }`); continue; }
          events[side][n] = m;
        }
        for (const n of eventPorts) {
          if (!Object.hasOwn(given, n)) add(["events", side, n], `Event ${what} '${n}' needs its max per step: ${side === "out" ? "how many records one step may push" : "how many records one step may take"}; the composition sizes its queues from it`, `events: { ${side}: { ${n}: 8 } }`);
        }
      }
    }
  }
  refuse("defineRuntime", out);
  const g = /** @type {any} */ (grammar);
  /** @type {Runtime} */
  const runtime = Object.freeze({
    grammar: g,
    dialect: g.dialect,
    clock: /** @type {any} */ (d.clock),
    init: /** @type {any} */ (d.init),
    step: /** @type {any} */ (d.step),
    events: Object.freeze({ out: Object.freeze(events.out), in: Object.freeze(events.in) }),
  });
  MADE.add(runtime);
  return runtime;
}

/** @param {unknown} g */
const grammarName = (g) => String(/** @type {any} */ (g).dialect.name);

/**
 * A runtime's clock for one built record, read: tick seconds as an exact rational (a float like 1/30 is read as
 * the simplest rational it rounds from), or why it is not a clock.
 * @param {Runtime} runtime @param {Record<string, any>} record
 * @returns {{ ok: true, clock: Clock } | { ok: false, error: string }}
 */
export function clockOf(runtime, record) {
  /** @type {unknown} */
  let c;
  try { c = runtime.clock(record); } catch (e) { return { ok: false, error: `clock(record) threw: ${/** @type {Error} */ (e)?.message ?? String(e)}` }; }
  const want = "clock(record) returns { tick: seconds } (a positive number), { frame: true } or { demand: true}";
  if (!isPlainObject(c)) return { ok: false, error: `${want}, not ${describe(c)}` };
  const keys = Object.keys(c);
  if (keys.length !== 1) return { ok: false, error: `${want}, not an object with ${keys.length ? keys.join(", ") : "no keys"}` };
  if (c.frame === true) return { ok: true, clock: { kind: "frame" } };
  if (c.demand === true) return { ok: true, clock: { kind: "demand" } };
  if (typeof c.tick === "number" && c.tick > 0) {
    const period = fromNumber(c.tick);
    if (period) return { ok: true, clock: { kind: "tick", period } };
    return { ok: false, error: `clock(record) gave tick ${c.tick}, which is no simple fraction of a second (a denominator up to a million); tick instants are exact rationals` };
  }
  return { ok: false, error: `${want}, not ${describe(c)}` };
}
