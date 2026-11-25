// The module the checker supplies as `kit/define` to a candidate's files: the real kit/define, with
// defineDialect and defineGrammar wrapped so that a refused definition is recorded (each problem at its
// line) instead of ending the load, and so the checker learns which Dialect and Grammar the candidate made.
// Nothing here checks anything itself, except in --effects mode, where the per-slot effects draft's declarations
// are checked and stripped before the kit sees the Dialect (checker/effects/).

import * as kit from "../../../kit/define/index.js";
import { session, callSite } from "./session.js";
import { validateEffects } from "./effects/validate.js";
import { stripEffects } from "./effects/strip.js";
import { effectsLowerer } from "./effects/lower.js";
import { checkLowered } from "./effects/check.js";

/** @import { Dialect, DialectDef, GrammarDef } from "../../../kit/define/define.js" */
/** @import { EffectsInfo } from "./effects/strip.js" */

export * from "../../../kit/define/index.js";

/** In --effects mode, what was taken out of each Dialect's definition before the kit saw it. @type {WeakMap<object, EffectsInfo>} */
const EFFECTS = new WeakMap();

/** The Dialects made in place of a refused one, so its Grammar can still be checked. */
const STAND_INS = new WeakSet();
/** Conventions the kit makes, which a stand-in may not declare (D007). */
const KIT_CONVENTIONS = ["helper", "const", "method"];

/**
 * A Dialect with the refused definition's convention names and nothing else, so that defineGrammar checks
 * the Grammar's lambda() specs against the names the author meant. Null if even that cannot be made.
 * @param {unknown} def
 * @returns {Dialect | null}
 */
function standIn(def) {
  const slots = /** @type {any} */ (def)?.slots;
  const names = slots !== null && typeof slots === "object" ? Object.keys(slots).filter((n) => /^[A-Za-z_$][\w$]*$/.test(n) && !KIT_CONVENTIONS.includes(n)) : [];
  try {
    const d = kit.defineDialect({
      name: "refused", numberType: "f64", text: () => "", spaces: { s: { pure: true } }, targets: { js: { accepts: "*", compare: kit.exact() } },
      slots: Object.fromEntries(names.map((n) => [n, { params: [], returns: "infer", space: "s" }])),
    });
    STAND_INS.add(d);
    return d;
  } catch {
    return null;
  }
}

/**
 * kit/define's defineDialect; a refusal is recorded and a stand-in returned.
 * @param {DialectDef} def
 * @returns {Dialect}
 */
export function defineDialect(def) {
  const site = callSite();
  if (!session.dialectSite) { session.dialectSite = site; session.dialectDef = /** @type {any} */ (def); }
  // --effects: the draft's declarations are checked here, then taken out so the kit as built accepts the rest.
  let given = def, info = null;
  if (session.effects && def !== null && typeof def === "object") {
    const problems = validateEffects(def);
    if (problems.length) { session.report(site, problems); session.refused = true; }
    ({ def: given, info } = /** @type {{ def: any, info: EffectsInfo }} */ (stripEffects(/** @type {any} */ (def))));
  }
  try {
    const d = kit.defineDialect(given);
    if (info) EFFECTS.set(d, info);
    session.dialect ??= d;
    return d;
  } catch (e) {
    if (!(e instanceof kit.DefinitionError)) throw e;
    session.report(site, e.diagnostics);
    session.refused = true;
    return /** @type {Dialect} */ (standIn(def));
  }
}

/**
 * kit/define's defineGrammar; a refusal is recorded. Against a refused Dialect the Grammar is checked but
 * not kept, and "not a Dialect" is not repeated.
 * @param {Dialect} dialect
 * @param {GrammarDef} def
 */
export function defineGrammar(dialect, def) {
  const site = callSite();
  const insteadOfRefused = session.refused && (dialect === null || STAND_INS.has(dialect));
  try {
    const g = kit.defineGrammar(dialect, def);
    if (insteadOfRefused) return refusedBuilder;
    if (!session.grammar) {
      session.grammar = g;
      const info = EFFECTS.get(dialect);
      if (session.effects && info) session.effectsLower = effectsLower(effectsLowerer(dialect, /** @type {any} */ (def), info), info);
    }
    return g;
  } catch (e) {
    if (!(e instanceof kit.DefinitionError)) throw e;
    const notADialect = (/** @type {{ code: string, path: unknown[], message: string }} */ d) => d.code === "D011" && d.path.length === 0 && /first argument is not a Dialect/.test(d.message);
    session.report(site, e.diagnostics.filter((d) => !(insteadOfRefused && notADialect(d))));
    session.refused = true;
    return refusedBuilder;
  }
}

/**
 * Lowering with the draft's checks after it (session.effectsLower).
 * @param {(record: Record<string, any>) => import("../../../kit/define/lower.js").Lowered} lower @param {EffectsInfo} info
 */
function effectsLower(lower, info) {
  return (/** @type {Record<string, any>} */ record) => {
    const lowered = lower(record);
    const { problems, diagnostics } = checkLowered(lowered, info);
    return { ...lowered, diagnostics: [...lowered.diagnostics, ...diagnostics], problems };
  };
}

/** What a refused defineGrammar returns: the examples are not run, so it is never called by the checker. */
function refusedBuilder() {
  throw new Error("the Grammar was refused; fix the definition files first");
}
