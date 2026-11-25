// Lowering a record against the Environment the draft would make, without a kit change: kit/define's lowerRecord is
// called with the Compiled grammar rebuilt from the Grammar definition (as defineGrammar builds it) and a Dialect
// whose environment() is the real one, patched. The patch (a shim, not the draft's design) gives:
//  - each writable member and each total a store rule and a `read Obj.member` effect, as DMG's attributes have, so
//    lowering accepts a write (and a bump, which lowers as a read and a write) and records reads of what changes.
//    The store rule is { type: "f64" } for every one, vectors included: lowering never reads the rule's type, and
//    no Coerce type holds a vector (the draft's "a store rule for a vector place" gap). The IR verifier, which runs
//    under `npm test` (kit/test/verify-lowering.js), would report that as V002 ("a vec2 place is stored as f64") and
//    drop the kernel, so it is switched off while this lowering runs: kernels lowered here are the shim's, not the
//    kit's, and are not verified;
//  - each verb its `effects`, and each object with a `call` that call (with its `effects`) back from CALL_MEMBER.
// Slot conventions keep `forbid: []`, as kit/define makes them: `may` is checked after lowering (check.js).

import { lowerRecord } from "../../../../kit/define/lower.js";
import { switches } from "../../../../kit/lower/index.js";
import { CALL_MEMBER, noProgram } from "./strip.js";

/** @import { EffectsInfo } from "./strip.js" */
/** @import { Environment } from "../../../../kit/lower/environment.js" */

/** The store rule every writable member and total gets (see above). */
export const SHIM_STORE = Object.freeze({ type: /** @type {const} */ ("f64") });

/**
 * The Environment with the draft's effects patched in (in place; environmentOf makes a fresh one per call).
 * @param {Environment} env @param {EffectsInfo} info
 * @returns {Environment}
 */
export function patchEnvironment(env, info) {
  const names = new Set([...Object.keys(info.objects), ...Object.keys(info.current.members)]);
  for (const o of names) {
    const decl = env.objects[o];
    if (!decl) continue;
    const flags = { ...(info.objects[o]?.members ?? {}), ...(info.current.members[o] ?? {}) };
    for (const [m, f] of Object.entries(flags)) {
      const member = decl.members[m];
      if (member?.kind === "value" && (f.write || f.bump)) Object.assign(member, { store: SHIM_STORE, effect: `read ${o}.${m}` });
    }
    for (const [m, effects] of Object.entries(info.objects[o]?.verbs ?? {})) {
      const member = decl.members[m];
      if (member?.kind === "fn") member.effects = /** @type {any} */ ([...effects]);
    }
    const call = decl.members[CALL_MEMBER];
    if (call?.kind === "fn") {
      const { kind: _, ...sig } = call;
      decl.call = { ...sig, effects: /** @type {any} */ ([...(info.objects[o]?.callEffects ?? [])]) };
      delete decl.members[CALL_MEMBER];
    }
  }
  return env;
}

/**
 * A lower(record) for the Grammar, against the patched Environment.
 * @param {any} dialect  what defineDialect made (of the stripped definition)
 * @param {Record<string, any>} grammarDef  the Grammar definition defineGrammar accepted
 * @param {EffectsInfo} info
 * @returns {(record: Record<string, any>) => import("../../../../kit/define/lower.js").Lowered}
 */
export function effectsLowerer(dialect, grammarDef, info) {
  // As defineGrammar builds its Compiled grammar; lowerRecord reads the constructs' def, name and children.
  /** @type {Record<string, any>} */
  const cs = {};
  for (const [n, c] of Object.entries(grammarDef.constructs)) cs[n] = { name: n, def: c, parent: null, children: [], rejected: {} };
  for (const c of Object.values(cs)) if (c.def.parent && cs[c.def.parent]) { c.parent = cs[c.def.parent]; c.parent.children.push(c); }
  const patched = { ...dialect, environment: (/** @type {any} */ record, /** @type {any} */ states) => patchEnvironment(dialect.environment(record, states), info) };
  const g = { dialect: patched, def: grammarDef, constructs: cs, root: cs[grammarDef.root], scoped: new Map() };
  return (record) => {
    info.current = noProgram();
    const verify = switches.verify;
    switches.verify = false;
    try {
      return lowerRecord(/** @type {any} */ (g), record);
    } finally {
      switches.verify = verify;
    }
  };
}
