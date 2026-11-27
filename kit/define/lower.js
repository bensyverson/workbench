// Lowering a record: every Runtime Lambda in it through the kit's own lowering (lowerProgram) against the
// Dialect's Environment, with the Library units it uses and the Program's helpers. A construct with state
// (`record: "calls"`) is built call by call: its refs are checked against the state at that step, each
// lambda is lowered with the state in hand, and its inferred type is passed to `step` (the draft's
// "Construct state"). It lives on the grammar because only the grammar knows where lambdas sit in a record.

import { lowerProgram } from "../lower/index.js";
import { didYouMean, dialectError } from "./codes.js";
import { enumOf, opt, list, struct, union, kindOf } from "./tags.js";
import { rematch, single, nameOf, openKey, setOwn, LOCS } from "./record.js";
import { bindings } from "./params.js";
import { lowerPorts } from "./port-lower.js";

/** @import * as T from "./define.js" */
/** @import { Type } from "../ir/ir.js" */
/** @import { Loc } from "../parse/ast.js" */
/** @import { LowerResult, HelperResult } from "../lower/index.js" */
/** @import { HelperSource } from "../lower/environment.js" */
/** @import { Construct } from "./record.js" */

/**
 * @typedef {object} Lowered
 * @property {import("../lower/environment.js").Environment} environment
 * @property {Array<{ ref: T.DefineSlotRef, src: string, result: LowerResult, alias?: string }>} lambdas  in record order;
 *   `alias` is `<instance>.<slot>.<name>` for the one lambda of a call whose slot declares a name (ruling 1, 2026-11-26),
 *   unless an id is spelled that way
 * @property {HelperResult[]} helpers  the Library units used, then the Program's own
 * @property {Array<T.BuildDiagnostic | LowerDiagnostic>} diagnostics  state refusals (B003, B010, B011), then each lambda's and helper's, each tied to its call or lambda
 * @property {Record<string, unknown>} states  each stateful construct instance's final state, by name
 * @property {Record<string, import("./params.js").Binding>} params  each declared param's binding time: read at build (by which call) or only in Kernels (which)
 * @property {import("./port-lower.js").LoweredSeams} [seams]  for a Dialect with seams: each frame's box, its edges, each output lambda's lowering
 */

/**
 * A lowering diagnostic with where it belongs: `file` and `ref` for a lambda's (its `loc` is inside the lambda's
 * source), `unit` for a helper's or constant's.
 * @typedef {import("../parse/ast.js").Diagnostic & { file?: string, ref?: T.DefineSlotRef, unit?: string }} LowerDiagnostic
 */

/** @typedef {{ slot: string, args: unknown[], index: number, once: boolean, at: { file: string, loc: Loc } }} RecCall */
/** @typedef {{ construct: Construct, rec: Record<string, any>, name: string, opens: RecCall, calls: RecCall[], at: { file: string, loc: Loc } }} RecInstance */

const NOWHERE = { file: "", loc: { start: { line: 1, column: 0 }, end: { line: 1, column: 0 } } };

/** A stateOf that comes back to an instance being built: `chain` runs from that instance round to itself. */
class Cycle extends Error {
  /** @param {RecInstance[]} chain */
  constructor(chain) { super(chain.map((i) => i.name).join(" → ")); this.chain = chain; }
}

/**
 * A core Type in a definition's terms, so a step can put a lambda's inferred type into its state.
 * @param {Type} t
 * @returns {unknown}
 */
export function fromCore(t) {
  if (typeof t === "string") return t;
  if ("vec" in t) return t.name ?? "unknown";
  if ("scalar" in t) return t.scalar;
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
 * What a call's lambdas inferred, as `step` receives it: all keyed, an object by key (a key with several
 * lambdas holds the list of their types); all unkeyed, the lone type or the list in call order; a mix of
 * keyed and unkeyed, the list of every lambda's type in call order.
 * @param {Array<{ key?: string }>} here @param {unknown[]} types
 * @returns {unknown}
 */
function inferredOf(here, types) {
  const keyed = here.filter((l) => l.key !== undefined).length;
  if (keyed === 0) return types.length > 1 ? types : types[0] ?? "unknown";
  if (keyed < here.length) return types;
  /** @type {Record<string, unknown>} */
  const out = {};
  const keys = [...new Set(here.map((l) => /** @type {string} */ (l.key)))];
  for (const k of keys) {
    const ts = types.filter((_, i) => here[i].key === k);
    setOwn(out, k, ts.length > 1 ? ts : ts[0]);
  }
  return out;
}

/** The slot name of an instance's opening arguments, as a RecCall. */
const OPENS = "(opens)";
/** A call as a message names it: `, .x` for a slot, nothing for the opening. @param {RecCall} call */
const slotText = (call) => (call.slot === OPENS ? "" : `, .${call.slot}`);
/** A call's argument specs: a slot's, or the construct's opening specs. @param {Construct} c @param {RecCall} call */
const argSpecs = (c, call) => (call.slot === OPENS ? /** @type {any[]} */ (c.def.opens ?? []) : c.def.slots?.[call.slot]?.kind === "decl" ? c.def.slots[call.slot].args : null);

/**
 * The instances of a record, by the grammar: each with its calls in order (a by-slot record's calls are
 * replayed in slot order, so `index` there counts in declaration order, not call order).
 * @param {import("./grammar.js").Compiled} g @param {Record<string, any>} record
 * @returns {RecInstance[]}
 */
export function instancesOf(g, record) {
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
        const here = (/** @type {number} */ n) => (LOCS.get(rec)?.slots?.[sn]?.[n]) ?? at(rec);
        if (kindOf(s.args[0]) === "name") {
          for (const [n, rest] of Object.entries(v)) calls.push({ slot: sn, args: [n, ...list(s.args.slice(1), rest)], index: calls.length, once: false, at: here(calls.filter((x) => x.slot === sn).length) });
        } else if (s.once) calls.push({ slot: sn, args: list(s.args, v), index: calls.length, once: true, at: here(0) });
        else for (const x of v) calls.push({ slot: sn, args: list(s.args, x), index: calls.length, once: false, at: here(calls.filter((y) => y.slot === sn).length) });
      }
    }
    const specs = /** @type {any[]} */ (c.def.opens ?? []);
    /** @type {RecCall} the opening arguments, as a call: its refs are checked against a construct's names too */
    const opens = { slot: OPENS, args: specs.map((sp, i) => rec[openKey(sp, i)]), index: -1, once: true, at: at(rec) };
    out.push({ construct: c, rec, name: nameOf(c, rec), opens, calls, at: at(rec) });
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

  /** @type {Array<{ inst: RecInstance, call: RecCall, ref: T.DefineSlotRef, src: string, key?: string, alias?: string }>} */
  const lambdas = [];
  /** @type {Map<RecCall, typeof lambdas>} */
  const byCall = new Map();
  // An instance's id prefix is its name; a name an earlier instance already has (two unnamed instances of
  // one construct) gets `~2`, `~3`, … in record order. `ref.on` keeps the real name.
  /** @type {Map<RecInstance, string>} */
  const tags = new Map();
  const usedTags = new Set();
  for (const inst of instances) {
    let tag = inst.name;
    for (let n = 2; usedTags.has(tag); n++) tag = `${inst.name}~${n}`;
    usedTags.add(tag);
    tags.set(inst, tag);
  }
  const usedIds = new Set();
  /** The id, or the first of `id~2`, `id~3`, … not taken: a last guard for odd names and keys. @param {string} id */
  const unique = (id) => {
    let out = id;
    for (let n = 2; usedIds.has(out); n++) out = `${id}~${n}`;
    usedIds.add(out);
    return out;
  };
  for (const inst of instances) {
    for (const call of inst.calls) {
      const s = inst.construct.def.slots?.[call.slot];
      if (!s || s.kind !== "decl") continue;
      const found = rematch(s.args, call.args).lambdas;
      // A slot that declares a name tells its convention which entry it lowers by that name; a recordOf key wins.
      const declared = kindOf(s.args[0]) === "name" && typeof call.args[0] === "string" ? call.args[0] : undefined;
      // Lambdas that share a recordOf key (or have none) are told apart by their place among them, `[n]`;
      // a lambda alone under its key has no place. `[n]` is not `.n`, which a key "0" could spell.
      /** @param {string | undefined} key */
      const group = (key) => found.filter((l) => l.key === key);
      const here = found.map((l) => {
        const peers = group(l.key);
        const place = peers.length > 1 ? `[${peers.indexOf(l)}]` : "";
        const id = unique(`${tags.get(inst)}.${call.slot}${call.once ? "" : `#${call.index}`}${l.key !== undefined ? `.${l.key}` : ""}${place}`);
        const alias = declared !== undefined && l.key === undefined && found.length === 1 ? `${tags.get(inst)}.${call.slot}.${declared}` : undefined;
        return { inst, call, src: l.src, ...(l.key !== undefined ? { key: l.key } : {}), ...(alias ? { alias } : {}), ref: /** @type {T.DefineSlotRef} */ ({ id, kind: l.convention, on: inst.name, index: call.index, ...((l.key ?? declared) !== undefined ? { key: l.key ?? declared } : {}) }) };
      });
      byCall.set(call, here);
      lambdas.push(...here);
    }
  }
  // a declared name is unique in its namespace (B002); one an id already spells names nothing: the id is the stable one
  for (const l of lambdas) if (l.alias && usedIds.has(l.alias)) delete l.alias;
  /** Lambdas the Dialect refused, by identity (never by message text). @type {Set<(typeof lambdas)[number]>} */
  const refused = new Set();
  // A stateOf loop re-runs the calls of the instances on it, once per instance told about the loop, and each
  // re-run finds the same mistakes again: a call reports each of its diagnostics once.
  /** @type {Map<RecCall, Set<string>>} */
  const reported = new Map();
  /** @param {RecCall} call @param {Lowered["diagnostics"][number]} d */
  const report = (call, d) => {
    const seen = reported.get(call) ?? new Set();
    reported.set(call, seen);
    // the ref and arg tell apart two diagnostics of one call that share their text (two refused lambdas, two arguments)
    const key = JSON.stringify([d.code, d.message, d.tip, /** @type {any} */ (d).ref?.id ?? null, /** @type {any} */ (d).arg ?? null]);
    if (seen.has(key)) return;
    seen.add(key);
    diagnostics.push(d);
  };
  const units = unitsOf(instances);
  const helpers = [...g.dialect.libraryFor([...lambdas.map((l) => l.src), ...units.map((u) => u.src)]), ...units];

  /**
   * The convention for a lambda, or null after reporting why the Dialect refused it (B011).
   * @param {(typeof lambdas)[number]} l
   */
  const usable = (l) => {
    const decl = env.slot(l.ref);
    if (typeof decl !== "string") return true;
    refused.add(l);
    report(l.call, { code: "B011", severity: "error", message: `the ${l.ref.kind} lambda of ${l.inst.name}, .${l.call.slot}: ${decl}`, tip: `the ${g.dialect.name} Dialect's '${l.ref.kind}' convention refused it here`, ...l.call.at, range: [0, 0], ref: l.ref });
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
    if (building.includes(inst)) throw new Cycle([...building.slice(building.indexOf(inst)), inst]);
    building.push(inst);
    try {
      const st = inst.construct.def.state;
      const opened = Object.fromEntries(Object.entries(inst.rec).filter(([k]) => k !== "calls" && !inst.construct.children.some((c) => c.name === k)));
      const stateOf = (/** @type {string} */ n) => { const i = stateful.find((x) => x.name === n); return i ? finalState(i) : undefined; };
      let state = st.init(opened, { program: record, stateOf });
      for (const r of rematch(argSpecs(inst.construct, inst.opens) ?? [], inst.opens.args).refs) {
        const names = st.names?.[r.ns];
        if (!names) continue;
        const known = /** @type {string[]} */ (names(state));
        if (!known.includes(r.value)) report(inst.opens, { code: "B003", severity: "error", message: `${inst.construct.name} '${inst.name}': there is no ${r.ns} '${r.value}' when it opens.${didYouMean(r.value, known)}`, tip: known.length ? `name one of: ${known.join(", ")}` : `this ${inst.construct.name} has no ${r.ns} yet`, ...inst.opens.at, range: [0, 0] });
      }
      for (const call of inst.calls) {
        const s = inst.construct.def.slots?.[call.slot];
        if (!s || s.kind !== "decl") continue;
        for (const r of rematch(s.args, call.args).refs) {
          const names = st.names?.[r.ns];
          if (!names) continue;
          const known = /** @type {string[]} */ (names(state));
          if (!known.includes(r.value)) report(call, { code: "B003", severity: "error", message: `${inst.construct.name} '${inst.name}', .${call.slot}: there is no ${r.ns} '${r.value}' at this step.${didYouMean(r.value, known)}`, tip: known.length ? `name one of: ${known.join(", ")}` : `this ${inst.construct.name} has no ${r.ns} yet`, ...call.at, range: [0, 0] });
        }
        const here = byCall.get(call) ?? [];
        /** @type {unknown[]} */
        const types = here.map((l) => {
          states.set(l.ref.id, state);
          return usable(l) ? fromCore(lowerProgram(env, [{ src: l.src, slot: l.ref }], helpers).results[0].returns) : "unknown";
        });
        // A refusal does not stop the state: step's return still applies, so later calls type and one mistake is one diagnostic.
        /** @param {string} code @param {string} message @param {T.ErrorOptions | string} [o]  a check's options, or a tip */
        const error = (code, message, o = {}) => {
          report(call, { ...dialectError("step", code, message, typeof o === "string" ? { tip: o } : o, call.args), ...call.at, range: [0, 0], on: inst.name, slot: call.slot });
        };
        state = st.step(state, { slot: call.slot, args: call.args }, inferredOf(here, types), { program: record, stateOf, error });
      }
      finals.set(inst, state);
      return state;
    } finally { building.pop(); }
  };
  for (const inst of stateful) {
    try { finalState(inst); } catch (e) {
      if (!(e instanceof Cycle)) throw e;
      failed.add(inst);
      const route = e.chain.map((i) => i.name).join(" → ");
      // an instance on the loop depends on itself; one that only reads a looping state depends on something that does
      if (e.chain.includes(inst)) diagnostics.push({ code: "B010", severity: "error", message: `${inst.construct.name} '${inst.name}' depends on its own state through stateOf: ${route}`, tip: `build '${inst.name}' from something that is not built from it`, ...inst.at, range: [0, 0] });
      else diagnostics.push({ code: "B010", severity: "error", message: `${inst.construct.name} '${inst.name}' reads, through stateOf, a state that depends on itself: ${route}`, tip: `build '${e.chain[0].name}' from something that is not built from it`, ...inst.at, range: [0, 0] });
    }
  }

  // A stateless construct's `names`: its refs against names drawn from the record and other instances' final states.
  for (const inst of instances.filter((i) => i.construct.def.names && !i.construct.def.state)) {
    const ns = /** @type {Record<string, (record: Record<string, any>, ctx: { program: Record<string, any>, stateOf: (name: string) => unknown }) => string[]>} */ (inst.construct.def.names);
    const stateOf = (/** @type {string} */ n) => {
      const i = stateful.find((x) => x.name === n);
      if (!i || failed.has(i)) return undefined;
      try { return finalState(i); } catch (e) { if (e instanceof Cycle) return undefined; throw e; }
    };
    /** @type {Map<string, string[]>} */
    const known = new Map();
    for (const call of [inst.opens, ...inst.calls]) {
      const specs = argSpecs(inst.construct, call);
      if (!specs) continue;
      for (const r of rematch(specs, call.args).refs) {
        if (!ns[r.ns]) continue;
        if (!known.has(r.ns)) known.set(r.ns, ns[r.ns](inst.rec, { program: record, stateOf }));
        const names = /** @type {string[]} */ (known.get(r.ns));
        if (!names.includes(r.value)) report(call, { code: "B003", severity: "error", message: `${inst.construct.name} '${inst.name}'${slotText(call)}: there is no ${r.ns} '${r.value}'.${didYouMean(r.value, names)}`, tip: names.length ? `name one of: ${names.join(", ")}` : `this ${inst.construct.name} has no ${r.ns}`, ...call.at, range: [0, 0] });
      }
    }
  }

  // Every lambda, with its state fixed, through one program lowering (helpers inferred across all of them).
  const live = lambdas.filter((l) => !failed.has(l.inst) && (l.inst.construct.def.state ? states.has(l.ref.id) && !refused.has(l) : usable(l)));
  const { results, helpers: helperResults } = lowerProgram(env, live.map((l) => ({ src: l.src, slot: l.ref })), helpers);
  results.forEach((r, i) => diagnostics.push(...r.diagnostics.map((d) => ({ ...d, file: live[i].call.at.file, ref: live[i].ref }))));
  for (const h of helperResults) diagnostics.push(...h.result.diagnostics.map((d) => ({ ...d, unit: h.name })));
  const s = g.dialect.seams;
  const ported = s && (Object.keys(s.out).length || Object.keys(s.frames).length || s.edges) ? lowerPorts(g.dialect, record) : null;
  if (ported) diagnostics.push(.../** @type {any[]} */ (ported.diagnostics));
  return {
    ...(ported ? { seams: { extents: ported.extents, edges: ported.edges, outputs: ported.outputs, draws: ported.draws, drawHelpers: ported.drawHelpers } } : {}),
    environment: env,
    lambdas: live.map((l, i) => ({ ref: l.ref, src: l.src, result: results[i], ...(l.alias ? { alias: l.alias } : {}) })),
    helpers: helperResults,
    diagnostics,
    states: Object.fromEntries([...finals].map(([i, s]) => [i.name, s])),
    params: bindings(g, record, [
      ...live.map((l, i) => ({ id: l.ref.id, kernel: results[i].kernel })),
      ...helperResults.filter((h) => units.some((u) => u.name === h.name)).map((h) => ({ id: `helper '${h.name}'`, kernel: /** @type {any} */ (h.result).kernel })),
    ]),
  };
}
