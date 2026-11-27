// defineUI: the UI that rides with a package's Dialect and Grammar (stage, inputs, tiles, annotations), checked like a
// Dialect: one DefinitionError holding every U problem. The checks are in ui/validate.js; this reads the Dialect
// (its declared run's state, objects, globals) and builds the frozen UI value, whose lower(record) types its lambdas
// against one Program (ui/lower.js).

import { refuse, isDialect } from "./dialect.js";
import { validate as validateUI } from "./ui/validate.js";
import { lowerUI } from "./ui/lower.js";
import { isPlainObject, kindOf as tagKind } from "./tags.js";

/** @import * as T from "./define.js" */

/** A copy of part of the declaration with its arrays and plain objects frozen deeply; functions stay. @param {unknown} v @returns {any} */
function freezeDeep(v) {
  if (Array.isArray(v)) return Object.freeze(v.map(freezeDeep));
  if (isPlainObject(v)) return Object.freeze(Object.fromEntries(Object.entries(v).map(([k, x]) => [k, freezeDeep(x)])));
  return v;
}

/** What defineUI made, so a host can tell a UI from a look-alike. */
const MADE = new WeakSet();

/** @param {unknown} v @returns {v is T.UI} */
export const isUI = (v) => typeof v === "object" && v !== null && MADE.has(v);

/**
 * @param {T.GrammarBuilder} builder  what the package's defineGrammar returned
 * @param {T.UIDef} decl  the declaration: { stage?, inputs?, tiles?, annotate? }; the run's state is the Dialect's
 * @param {T.UIOptions} [options]  `moduleText(path)`: the text of a package file, for the custom element module checks (U008)
 * @returns {T.UI}
 */
export function defineUI(builder, decl, options = {}) {
  const b = /** @type {any} */ (builder);
  if (typeof b !== "function" || !isDialect(b.dialect) || b.grammar === undefined) {
    refuse("defineUI", [{ code: "U013", path: [], message: "defineUI's first argument is not the package's Grammar builder (what defineGrammar returned).", tip: "pass the builder first: defineUI(orbits, { tiles, … })" }]);
  }
  const dialect = /** @type {T.Dialect} */ (b.dialect);
  const def = /** @type {Record<string, any>} */ (dialect.def);
  /** @type {Record<string, Record<string, string>>} */
  const aliases = {};
  /** @type {Set<string>} */
  const free = new Set([...Object.keys(def.globals ?? {}), ...Object.keys(def.intrinsics ?? {}), ...Object.keys(def.library ?? {})]);
  for (const [n, t] of Object.entries(def.types ?? {})) {
    if (tagKind(t) !== "vector") continue;
    free.add(n);
    const a = /** @type {any} */ (t).options?.aliases;
    if (a) aliases[n] = a;
  }
  const objects = def.objects ?? {};
  const globalObjects = Object.fromEntries(Object.entries(def.globals ?? {}).filter(([, o]) => typeof o === "string" && Object.hasOwn(objects, o)).map(([n, o]) => [n, objects[/** @type {string} */ (o)]]));
  const problems = validateUI(decl, {
    pkg: String(dialect.name), state: dialect.stateType ?? null, objects, aliases, free, globalObjects,
    outputs: Object.fromEntries(Object.entries(/** @type {Record<string, any>} */ (dialect.seams?.out ?? {})).map(([n, o]) => [n, { seam: String(o.seamText), draw: o.seam?.kind === "draw" }])),
    moduleText: typeof options.moduleText === "function" ? options.moduleText : null,
  });
  if (!dialect.stateType) problems.unshift({ code: "U013", path: [], message: `the ${dialect.name} Dialect declares no state, so a UI has nothing to read.`, tip: "declare the run's state in defineDialect: state: { score: \"f64\", … }" });
  refuse("defineUI", problems);
  const d = /** @type {Record<string, unknown>} */ (decl);
  const ui = Object.freeze({
    package: dialect.name, builder, dialect,
    ...(d.stage !== undefined ? { stage: freezeDeep(d.stage) } : {}),
    ...(d.inputs !== undefined ? { inputs: freezeDeep(d.inputs) } : {}),
    tiles: freezeDeep(d.tiles ?? {}), annotate: freezeDeep(d.annotate ?? {}),
    /** Lowers every UI lambda against one Program's record: see ui/lower.js. @param {Record<string, any>} record */
    lower: (record) => lowerUI(/** @type {T.UI} */ (ui), record),
  });
  MADE.add(ui);
  return /** @type {T.UI} */ (ui);
}
