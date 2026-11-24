// The M1 pipeline over one DMG preset: build it with the oracle, describe its
// program to the kit's DMG environment, lower every runtime lambda to IR, and emit JS.

import { lambdaSlots } from "../dmg-oracle/lambdas.js";
import { topLevelBindings, topLevelRefs } from "../dmg-oracle/toplevel.js";
import { parseLambda } from "../../kit/parse/index.js";
import { declarationsOf } from "../dmg-oracle/declarations.js";
import { dmgEnvironment, WORLD } from "../../kit/dialects/dmg/index.js";
import { lowerProgram } from "../../kit/lower/index.js";
import { emitKernel, instantiate, emitHelpers } from "../../kit/emit/js/index.js";

/** @import { Slot } from "../dmg-oracle/lambdas.js" */
/** @import { DmgBuild } from "../dmg-oracle/dmg.js" */
/** @import { SlotRef, Signatures, Environment, HelperSource } from "../../kit/lower/environment.js" */
/** @import { LowerResult, HelperResult } from "../../kit/lower/index.js" */
/** @import { Emitted } from "../../kit/emit/js/emit.js" */

/**
 * @typedef {object} Entry
 * @property {Slot} slot    The oracle's slot, which can swap the lambda.
 * @property {SlotRef} ref  The slot as the environment sees it, for one of the parts that runs it.
 * @property {LowerResult} result
 * @property {() => Record<string, (...args: any[]) => unknown>} scope  The program's helpers, made callable once.
 */

/**
 * The top-level helpers and constants of `code` that runtime lambdas use, directly or through
 * one another. A `const` bound to an arrow is a helper function, even one that breaks the subset; any other `const` is a constant.
 * A `let` is mutable state, not a constant, and a `function` declaration is not read: both stay
 * undeclared to the lambdas that name them.
 * @param {string} code
 * @param {string[]} lambdaSrcs
 * @returns {HelperSource[]}
 */
export function helperSources(code, lambdaSrcs) {
  const bindings = topLevelBindings(code).filter((b) => b.keyword === "const");
  const names = bindings.map((b) => b.name);
  const wanted = new Set(lambdaSrcs.flatMap((s) => topLevelRefs(s, names)));
  for (const n of wanted) {
    const b = bindings.find((x) => x.name === n);
    if (b) for (const m of topLevelRefs(b.init, names)) wanted.add(m);
  }
  // P003 means "not an arrow"; an arrow that breaks the subset is still a function, and lowering reports why.
  const isArrow = (/** @type {string} */ src) => !parseLambda(src).diagnostics.some((d) => d.code === "P003");
  return bindings.filter((b) => wanted.has(b.name)).map((b) => ({ name: b.name, kind: isArrow(b.init) ? "fn" : "const", src: b.init }));
}

/**
 * The environment's view of an oracle slot, for the part `user` that runs it.
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
 * @returns {{ build: DmgBuild, environment: Environment, entries: Entry[], sigs: Signatures, helpers: HelperResult[] }}
 */
export function lowerPreset(dmg, id) {
  const build = dmg.build(id);
  const spec = build.spec;
  const environment = dmgEnvironment(declarationsOf(spec));
  const pairs = lambdaSlots(spec).flatMap((slot) => slot.usedBy.map((user) => ({ slot, ref: slotRef(slot, user, spec.name) })));
  const code = build.code ?? /** @type {{ presets?: Array<{ id: string, code: string }> }} */ (dmg).presets?.find((p) => p.id === id)?.code ?? "";
  const sources = helperSources(code, pairs.map((p) => p.slot.src));
  const { results, sigs, helpers } = lowerProgram(environment, pairs.map((p) => ({ src: p.slot.src, slot: p.ref })), sources);
  /** @type {Record<string, (...args: any[]) => unknown> | null} */
  let made = null;
  const scope = () => (made ??= helperScope(helpers));
  return { build, environment, entries: pairs.map((p, i) => ({ ...p, result: results[i], scope })), sigs, helpers };
}

/**
 * The helper functions that lowered, emitted and callable. A helper that did not lower is left out, so a call to it fails loudly.
 * @param {HelperResult[]} helpers
 */
function helperScope(helpers) {
  const ok = helpers.filter((h) => h.kind === "fn" && h.result.kernel);
  return emitHelpers(ok.map((h) => emitKernel(/** @type {NonNullable<typeof h.result.kernel>} */ (h.result.kernel))));
}

/**
 * Emits a lowered entry as JS and makes it callable, ready for `swapLambda`.
 * @param {Entry} e
 * @returns {{ emitted: Emitted, fn: (...args: any[]) => unknown }}
 */
export function emitEntry(e) {
  if (!e.result.kernel) throw new Error(`${e.slot.id} did not lower: ${e.result.diagnostics.map((d) => d.code).join(", ")}`);
  const emitted = emitKernel(e.result.kernel);
  return { emitted, fn: instantiate(emitted, e.scope()) };
}
