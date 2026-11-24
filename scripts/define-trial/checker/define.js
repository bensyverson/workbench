// The module the checker supplies as `kit/define` to a candidate's files: the real kit/define, with
// defineDialect and defineGrammar wrapped so that a refused definition is recorded (each problem at its
// line) instead of ending the load, and so the checker learns which Dialect and Grammar the candidate made.
// Nothing here checks anything itself.

import * as kit from "../../../kit/define/index.js";
import { session, callSite } from "./session.js";

/** @import { Dialect, DialectDef, GrammarDef } from "../../../kit/define/define.js" */

export * from "../../../kit/define/index.js";

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
  try {
    const d = kit.defineDialect(def);
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
    session.grammar ??= g;
    return g;
  } catch (e) {
    if (!(e instanceof kit.DefinitionError)) throw e;
    const notADialect = (/** @type {{ code: string, path: unknown[], message: string }} */ d) => d.code === "D011" && d.path.length === 0 && /first argument is not a Dialect/.test(d.message);
    session.report(site, e.diagnostics.filter((d) => !(insteadOfRefused && notADialect(d))));
    session.refused = true;
    return refusedBuilder;
  }
}

/** What a refused defineGrammar returns: the examples are not run, so it is never called by the checker. */
function refusedBuilder() {
  throw new Error("the Grammar was refused; fix the definition files first");
}
