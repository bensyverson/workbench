// The M1 pipeline over one DMG preset: build it with the oracle, describe its
// program to the kit's DMG dialect, lower every runtime lambda to IR, and emit JS.

import { lambdaSlots } from "../dmg-oracle/lambdas.js";
import { declarationsOf } from "../dmg-oracle/declarations.js";
import { dmgDialect, WORLD } from "../../kit/dialects/dmg/index.js";
import { lowerProgram } from "../../kit/lower/index.js";
import { emitKernel, instantiate } from "../../kit/emit/js/index.js";

/** @import { Slot } from "../dmg-oracle/lambdas.js" */
/** @import { DmgBuild } from "../dmg-oracle/dmg.js" */
/** @import { SlotRef, Signatures, Dialect } from "../../kit/lower/dialect.js" */
/** @import { LowerResult } from "../../kit/lower/index.js" */
/** @import { Emitted } from "../../kit/emit/js/emit.js" */

/**
 * @typedef {object} Entry
 * @property {Slot} slot    The oracle's slot, which can swap the lambda.
 * @property {SlotRef} ref  The slot as the dialect sees it, for one of the parts that runs it.
 * @property {LowerResult} result
 */

/**
 * The dialect's view of an oracle slot, for the part `user` that runs it.
 * @param {Slot} slot
 * @param {string} user  A component name, or the game's name for the world.
 * @param {string} game
 * @returns {SlotRef}
 */
export function slotRef(slot, user, game) {
  const key = /\((\w+)\)/.exec(slot.id)?.[1];
  const ref = { id: slot.id, kind: slot.kind, on: user === game ? WORLD : user };
  return slot.kind === "on" || slot.kind === "method" ? { ...ref, key } : ref;
}

/**
 * Builds preset `id` and lowers all its runtime lambdas as one program. A fragment
 * lambda run by several parts is lowered once per part.
 * @param {{ build(id: string): DmgBuild }} dmg
 * @param {string} id
 * @returns {{ build: DmgBuild, dialect: Dialect, entries: Entry[], sigs: Signatures }}
 */
export function lowerPreset(dmg, id) {
  const build = dmg.build(id);
  const spec = build.spec;
  const dialect = dmgDialect(declarationsOf(spec));
  const pairs = lambdaSlots(spec).flatMap((slot) => slot.usedBy.map((user) => ({ slot, ref: slotRef(slot, user, spec.name) })));
  const { results, sigs } = lowerProgram(dialect, pairs.map((p) => ({ src: p.slot.src, slot: p.ref })));
  return { build, dialect, entries: pairs.map((p, i) => ({ ...p, result: results[i] })), sigs };
}

/**
 * Emits a lowered entry as JS and makes it callable, ready for `swapLambda`.
 * @param {Entry} e
 * @returns {{ emitted: Emitted, fn: (...args: any[]) => unknown }}
 */
export function emitEntry(e) {
  if (!e.result.kernel) throw new Error(`${e.slot.id} did not lower: ${e.result.diagnostics.map((d) => d.code).join(", ")}`);
  const emitted = emitKernel(e.result.kernel);
  return { emitted, fn: instantiate(emitted) };
}
