// Lowering a record: every Runtime Lambda in it through the kit's own lowering (lowerProgram) against the
// Dialect's Environment, with the Library units it uses and the Program's helpers. A construct with state
// (`record: "calls"`) is built call by call: its refs are checked against the state at that step, each
// lambda is lowered with the state in hand, and its inferred type is passed to `step` (the draft's
// "Construct state"). It lives on the grammar because only the grammar knows where lambdas sit in a record.

import { lowerProgram } from "../lower/index.js";
import { didYouMean } from "./codes.js";
import { enumOf, opt, list, struct, union, kindOf } from "./tags.js";
import { rematch, single, LOCS } from "./record.js";

/** @import * as T from "./define.js" */
/** @import { Type } from "../ir/ir.js" */
/** @import { Loc } from "../parse/ast.js" */
/** @import { LowerResult, HelperResult } from "../lower/index.js" */
/** @import { HelperSource } from "../lower/environment.js" */
/** @import { Construct } from "./record.js" */

/**
 * @typedef {object} Lowered
 * @property {import("../lower/environment.js").Environment} environment
 * @property {Array<{ ref: T.DefineSlotRef, src: string, result: LowerResult }>} lambdas  in record order
 * @property {HelperResult[]} helpers  the Library units used, then the Program's own
 * @property {Array<T.BuildDiagnostic | import("../parse/ast.js").Diagnostic>} diagnostics  state refusals (B003, B010, B011), then each lambda's and helper's
 * @property {Record<string, unknown>} states  each stateful construct instance's final state, by name
 */

/** @typedef {{ slot: string, args: unknown[], index: number, once: boolean, at: { file: string, loc: Loc } }} RecCall */
/** @typedef {{ construct: Construct, rec: Record<string, any>, name: string, calls: RecCall[], at: { file: string, loc: Loc } }} RecInstance */

const NOWHERE = { file: "", loc: { start: { line: 1, column: 0 }, end: { line: 1, column: 0 } } };

/** A stateOf that comes back to an instance being built. */
class Cycle extends Error {
  /** @param {string[]} chain */
  constructor(chain) { super(chain.join(" → ")); this.chain = chain; }
}

/**
 * A core Type in a definition's terms, so a step can put a lambda's inferred type into its state.
 * @param {Type} t
 * @returns {unknown}
 */
export function fromCore(t) {
  if (typeof t === "string") return t;
  if ("vec" in t) return t.name ?? "unknown";
  if ("obj" in t) return t.obj;
  if ("tvar" in t) return t.tvar;
  if ("enum" in t) return t.declared ? enumOf(t.enum) : "str";
  if ("opt" in t) return opt(fromCore(t.opt));
  if ("list" in t) return list(fromCore(t.list), t.max);
  if ("struct" in t) return struct(Object.fromEntries(Object.entries(t.struct).map(([k, v]) => [k, fromCore(v)])), t.optional ? { optional: t.optional } : undefined);
  if ("union" in t) return union(...t.union.map(fromCore));
  return "unknown";
}

/**
 * The instances of a record, by the grammar: each with its calls in order (a by-slot record's calls are
 * replayed in slot order, so `index` there counts in declaration order, not call order).
 * @param {import("./grammar.js").Compiled} g @param {Record<string, any>} record
 * @returns {RecInstance[]}
 */
function instancesOf(g, record) {
  /** @type {RecInstance[]} */
  const out = [];
  const walk = (/** @type {Construct} */ c, /** @type {Record<string, any>} */ rec) => {
    /** @type {RecCall[]} */
    const calls = [];
    const slots = /** @type {Record<string, any>} */ (c.def.slots ?? {});
    const at = (/** @type {object} */ o) => LOCS.get(o) ?? NOWHERE;
    if (c.def.record === "calls") {
      (rec.calls ?? []).forEach((/** @type {{ slot: string, args: unknown[] }} */ call, /** @type {number} */ index) => calls.push({ slot: call.slot, args: call.args, index, once: false, at: at(call) }));
    } else {
      for (const [sn, s] of Object.entries(slots)) {
        if (s.kind === "unit") continue;
        const v = rec[s.as ?? sn];
        if (v === undefined) continue;
        const list = (/** @type {unknown[]} */ specs, /** @type {unknown} */ x) => (single(specs) ? [x] : /** @type {unknown[]} */ (x));
        if (kindOf(s.args[0]) === "name") {
          for (const [n, rest] of Object.entries(v)) calls.push({ slot: sn, args: [n, ...list(s.args.slice(1), rest)], index: calls.length, once: false, at: at(rec) });
        } else if (s.once) calls.push({ slot: sn, args: list(s.args, v), index: calls.length, once: true, at: at(rec) });
        else for (const x of v) calls.push({ slot: sn, args: list(s.args, x), index: calls.length, once: false, at: at(rec) });
      }
    }
    out.push({ construct: c, rec, name: String(rec.name ?? c.name), calls, at: at(rec) });
    for (const child of c.children) for (const r of rec[child.name] ?? []) walk(child, r);
  };
  walk(g.root, record);
  return out;
}

/**
 * The Program's helpers and constants, from every construct's `units` and unit calls.
 * @param {RecInstance[]} instances
 * @returns {HelperSource[]}
 */
function unitsOf(instances) {
  /** @type {HelperSource[]} */
  const out = [];
  for (const inst of instances) {
    for (const u of inst.rec.units ?? []) out.push({ name: u.name, kind: u.kind, src: u.src });
    for (const call of inst.calls) {
      const s = inst.construct.def.slots?.[call.slot];
      if (s?.kind === "unit") out.push({ name: /** @type {string} */ (call.args[0]), kind: s.unit, src: /** @type {string} */ (call.args[1]) });
    }
  }
  return out;
}

/**
 * @param {import("./grammar.js").Compiled} g @param {Record<string, any>} record
 * @returns {Lowered}
 */
export function lowerRecord(g, record) {
  /** @type {Lowered["diagnostics"]} */
  const diagnostics = [];
  /** @type {Map<string, unknown>} */
  const states = new Map();
  const env = g.dialect.environment(record, states);
  const instances = instancesOf(g, record);

  /** @type {Array<{ inst: RecInstance, call: RecCall, ref: T.DefineSlotRef, src: string, key?: string }>} */
  const lambdas = [];
  /** @type {Map<RecCall, typeof lambdas>} */
  const byCall = new Map();
  for (const inst of instances) {
    for (const call of inst.calls) {
      const s = inst.construct.def.slots?.[call.slot];
      if (!s || s.kind !== "decl") continue;
      const here = rematch(s.args, call.args).lambdas.map((l) => ({
        inst, call, src: l.src, ...(l.key !== undefined ? { key: l.key } : {}),
        ref: /** @type {T.DefineSlotRef} */ ({ id: `${inst.name}.${call.slot}${call.once ? "" : `#${call.index}`}${l.key !== undefined ? `.${l.key}` : ""}`, kind: l.convention, on: inst.name, index: call.index, ...(l.key !== undefined ? { key: l.key } : {}) }),
      }));
      byCall.set(call, here);
      lambdas.push(...here);
    }
  }
  const units = unitsOf(instances);
  const helpers = [...g.dialect.libraryFor([...lambdas.map((l) => l.src), ...units.map((u) => u.src)]), ...units];

  /**
   * The convention for a lambda, or null after reporting why the Dialect refused it (B011).
   * @param {(typeof lambdas)[number]} l
   */
  const usable = (l) => {
    const decl = env.slot(l.ref);
    if (typeof decl !== "string") return true;
    diagnostics.push({ code: "B011", severity: "error", message: `the ${l.ref.kind} lambda of ${l.inst.name}, .${l.call.slot}: ${decl}`, tip: `the ${g.dialect.name} Dialect's '${l.ref.kind}' convention refused it here`, ...l.call.at, range: [0, 0] });
    return false;
  };

  // Construct state, threaded call by call.
  const stateful = instances.filter((i) => i.construct.def.state);
  /** @type {Map<RecInstance, unknown>} */
  const finals = new Map();
  /** @type {RecInstance[]} */
  const building = [];
  /** @type {Set<RecInstance>} */
  const failed = new Set();
  /** @param {RecInstance} inst */
  const finalState = (inst) => {
    if (finals.has(inst)) return finals.get(inst);
    if (building.includes(inst)) throw new Cycle([...building.slice(building.indexOf(inst)), inst].map((i) => i.name));
    building.push(inst);
    try {
      const st = inst.construct.def.state;
      const opened = Object.fromEntries(Object.entries(inst.rec).filter(([k]) => k !== "calls" && !inst.construct.children.some((c) => c.name === k)));
      let state = st.init(opened, { program: record, stateOf: (/** @type {string} */ n) => { const i = stateful.find((x) => x.name === n); return i ? finalState(i) : undefined; } });
      for (const call of inst.calls) {
        const s = inst.construct.def.slots?.[call.slot];
        if (!s || s.kind !== "decl") continue;
        for (const r of rematch(s.args, call.args).refs) {
          const names = st.names?.[r.ns];
          if (!names) continue;
          const known = /** @type {string[]} */ (names(state));
          if (!known.includes(r.value)) diagnostics.push({ code: "B003", severity: "error", message: `${inst.construct.name} '${inst.name}', .${call.slot}: there is no ${r.ns} '${r.value}' at this step.${didYouMean(r.value, known)}`, tip: known.length ? `name one of: ${known.join(", ")}` : `this ${inst.construct.name} has no ${r.ns} yet`, ...call.at, range: [0, 0] });
        }
        const here = byCall.get(call) ?? [];
        /** @type {Record<string, unknown>} */
        const keyed = {};
        /** @type {unknown} */
        let lone = "unknown";
        for (const l of here) {
          states.set(l.ref.id, state);
          const t = usable(l) ? fromCore(lowerProgram(env, [{ src: l.src, slot: l.ref }], helpers).results[0].returns) : "unknown";
          if (l.key !== undefined) keyed[l.key] = t; else lone = t;
        }
        state = st.step(state, { slot: call.slot, args: call.args }, here.some((l) => l.key !== undefined) ? keyed : lone);
      }
      finals.set(inst, state);
      return state;
    } finally { building.pop(); }
  };
  for (const inst of stateful) {
    try { finalState(inst); } catch (e) {
      if (!(e instanceof Cycle)) throw e;
      failed.add(inst);
      diagnostics.push({ code: "B010", severity: "error", message: `${inst.construct.name} '${inst.name}' depends on its own state through stateOf: ${e.chain.join(" → ")}`, tip: `build '${inst.name}' from something that is not built from it`, ...inst.at, range: [0, 0] });
    }
  }

  // Every lambda, with its state fixed, through one program lowering (helpers inferred across all of them).
  const live = lambdas.filter((l) => !failed.has(l.inst) && (l.inst.construct.def.state ? states.has(l.ref.id) && !diagnostics.some((d) => d.code === "B011" && d.message.startsWith(`the ${l.ref.kind} lambda of ${l.inst.name}, .${l.call.slot}:`)) : usable(l)));
  const { results, helpers: helperResults } = lowerProgram(env, live.map((l) => ({ src: l.src, slot: l.ref })), helpers);
  for (const r of results) diagnostics.push(...r.diagnostics);
  for (const h of helperResults) diagnostics.push(...h.result.diagnostics);
  return {
    environment: env,
    lambdas: live.map((l, i) => ({ ref: l.ref, src: l.src, result: results[i] })),
    helpers: helperResults,
    diagnostics,
    states: Object.fromEntries([...finals].map(([i, s]) => [i.name, s])),
  };
}
