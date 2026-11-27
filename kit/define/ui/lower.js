// Lowering a UI against one Program: every UI lambda through the kit's own lowering (lowerProgram), as a Grammar's
// lower does for a Program's lambdas (../lower.js). defineUI checks them without a Program; their types need one,
// since `$` is typed by the Dialect's environment(program). The conventions live in this module's own wrapper of
// that Environment, not in the Dialect: an implied pure space (a view's lambda has no effect), `s` the Dialect's
// state Type, `$` its params object, a column's `row` the item Type of its table's list, and each key's result Type.

import { controlProblems } from "./controls.js";
import { lowerProgram } from "../../lower/index.js";
import { resolvePath } from "./shapes.js";
import { TONES } from "./validate.js";

/** @import * as T from "../define.js" */
/** @import { Type, Kernel } from "../../ir/ir.js" */
/** @import { Environment, SlotDecl, SlotRef } from "../../lower/environment.js" */
/** @import { LowerResult, HelperResult } from "../../lower/index.js" */

/**
 * What a key's lambda must give: a bool; a number (f32, f64 or a nominal scalar); a number or a string; a string;
 * a string or null; one of the tones or null.
 * @typedef {"bool" | "number" | "numberOrStr" | "str" | "strOrNull" | "toneOrNull" | "point"} Gives
 */

/**
 * One UI lambda: where it sits in the declaration and what its key requires.
 * @typedef {object} Site
 * @property {string} id  its place as one string: `tiles.live.body[0].badIf`, `annotate.params.rate.badge`
 * @property {Array<string | number>} path  the same place as defineUI's diagnostic paths give it
 * @property {string | null} tile  the tile it is in; null in `annotate`
 * @property {string} key  the key it is the value of: `badIf`, `value`, `badge`, …
 * @property {Function} fn
 * @property {Type | null} row  a column's row Type; null for an `(s, $)` lambda
 * @property {Gives} gives
 */

/** The convention a view's lambda runs in, by name: what messages call its space. */
const SPACE = "view";
/**
 * The max a state list declared `list(type)` gets in a UI kernel: the IR holds a max on every list (the verifier requires one),
 * and this is the largest whole number it can, so no check against it ever fails. A UI lambda never loops over such a list
 * (defineUI refuses it), so nothing sizes anything by it; `length` and an index are all it is read by.
 */
export const OPEN_MAX = Number.MAX_SAFE_INTEGER;

/** What a Grip's at, axis and center give: a point, two numbers. */
const POINT = /** @type {Type} */ ({ list: "f64", max: 2, len: 2 });

/** The object `$` is when the Dialect declares no params: one with no members. */
const NO_PARAMS = "(no params)";

/** @param {Type} t */
const isNumber = (t) => t === "f64" || t === "f32" || (typeof t === "object" && "scalar" in t);
/** @param {Type} t */
const isString = (t) => t === "str" || (typeof t === "object" && "enum" in t);

/** A path segment as an id writes it: `.name`, `[0]`, or `["bounds.width"]` for a key that is no identifier. @param {string | number} seg */
const segment = (seg) => (typeof seg === "number" ? `[${seg}]` : /^[A-Za-z_$][\w$]*$/.test(seg) ? `.${seg}` : `[${JSON.stringify(seg)}]`);
/** @param {Array<string | number>} path */
export const idOf = (path) => path.map(segment).join("").slice(1);

/**
 * Every lambda in a UI, in declaration order: the tiles' components (and their items and columns), then the
 * annotations.
 * @param {T.UI} ui @param {Type} state @param {Record<string, Record<string, string>>} aliases
 * @returns {Site[]}
 */
export function sitesOf(ui, state, aliases) {
  /** @type {Site[]} */
  const out = [];
  /** @param {Array<string | number>} path @param {string | null} tile @param {unknown} fn @param {Gives} gives @param {Type | null} [row] */
  const add = (path, tile, fn, gives, row = null) => {
    if (typeof fn === "function") out.push({ id: idOf(path), path, tile, key: String(path.at(-1)), fn, row, gives });
  };
  /** @param {unknown} list @param {Array<string | number>} at @param {string} tile */
  const components = (list, at, tile) => {
    if (!Array.isArray(list)) return;
    list.forEach((/** @type {Record<string, any>} */ c, i) => {
      const p = [...at, i];
      const k = (/** @type {string} */ key) => [...p, key];
      if (c.kind === "stat") { add(k("value"), tile, c.value, "numberOrStr"); add(k("max"), tile, c.max, "number"); }
      if (c.kind === "text") add(k("value"), tile, c.value, "str");
      add(k("badIf"), tile, c.badIf, "bool");
      add(k("expect"), tile, c.expect, "bool");
      add(k("y"), tile, c.y, "number");
      if (c.kind === "table" && Array.isArray(c.columns)) {
        const r = typeof c.rows === "string" ? resolvePath(state, c.rows, aliases) : null;
        const t = r && "type" in r ? unwrap(r.type) : null;
        const row = t && typeof t === "object" && "list" in t ? t.list : null;
        c.columns.forEach((/** @type {any} */ col, /** @type {number} */ j) => { if (col && typeof col === "object") add([...p, "columns", j, "value"], tile, col.value, "numberOrStr", row); });
      }
      components(c.items, k("items"), tile);
    });
  };
  for (const [id, t] of Object.entries(ui.tiles)) components(/** @type {any} */ (t).body, ["tiles", id, "body"], id);
  for (const [name, g] of Object.entries(/** @type {Record<string, Record<string, any>>} */ (ui.grips ?? {}))) {
    const r = typeof g.each === "string" ? resolvePath(state, g.each, aliases) : null;
    const t = r && "type" in r ? unwrap(r.type) : null;
    // a Grip with each reads its item first, as a table column reads its row
    const item = t && typeof t === "object" && "list" in t ? t.list : null;
    for (const key of ["at", "axis", "center"]) add(["grips", name, key], null, g[key], "point", item);
    add(["grips", name, "to"], null, g.to, "str", item);
  }
  for (const [view, marks] of Object.entries(/** @type {Record<string, Record<string, any>>} */ (ui.annotate))) {
    for (const [key, a] of Object.entries(marks)) {
      add(["annotate", view, key, "badge"], null, a.badge, "strOrNull");
      add(["annotate", view, key, "tone"], null, a.tone, "toneOrNull");
    }
  }
  return out;
}

/** `t` with every list that has no max given OPEN_MAX; `t` itself when it has none. @param {Type} t @returns {Type} */
export function closeLists(t) {
  if (typeof t !== "object") return t;
  if ("list" in t) return { ...t, list: closeLists(t.list), max: t.max ?? OPEN_MAX };
  if ("opt" in t) { const o = closeLists(t.opt); return o === t.opt ? t : { ...t, opt: o }; }
  if ("struct" in t) {
    const fields = Object.fromEntries(Object.entries(t.struct).map(([k, v]) => [k, closeLists(v)]));
    return Object.entries(fields).every(([k, v]) => v === t.struct[k]) ? t : { ...t, struct: fields };
  }
  if ("union" in t) return { ...t, union: t.union.map(closeLists) };
  return t;
}

/** @param {Type} t @returns {Type} */
const unwrap = (t) => (typeof t === "object" && "opt" in t ? unwrap(t.opt) : t);

/**
 * The Type a lambda must return, given what it gives and what it returned when lowered with `infer`: a number
 * key takes the number type the lambda gave (so a nominal scalar passes; a union may not mix number types), else
 * the Dialect's number type, which lowering then reports against.
 * @param {Gives} gives @param {Type} inferred @param {"f32" | "f64"} numberType
 * @returns {Type}
 */
function required(gives, inferred, numberType) {
  const number = isNumber(inferred) ? inferred : numberType;
  switch (gives) {
    case "bool": return "bool";
    case "number": return number;
    case "numberOrStr": return isNumber(inferred) ? inferred : isString(inferred) ? "str" : { union: [numberType, "str"] };
    case "str": return "str";
    case "strOrNull": return { opt: "str" };
    case "toneOrNull": return { opt: { enum: [...TONES] } };
    case "point": return typeof inferred === "object" && "list" in inferred && isNumber(inferred.list) && inferred.len === 2 ? inferred : POINT;
  }
}

/**
 * A UI lowering diagnostic: a lowering one, with the lambda it came from (`id`, `path`, `tile`, `key`; its `loc` is
 * inside the lambda's source), or a Library unit's (`unit`).
 * @typedef {import("../../parse/ast.js").Diagnostic & ({ id: string, path: Array<string | number>, tile: string | null, key: string } | { unit: string })} UILowerDiagnostic
 */

/**
 * @typedef {object} UILowered
 * @property {Environment} environment  the UI's wrapper of the Program's Environment
 * @property {Record<string, Kernel>} kernels  each lambda's Kernel by id; a lambda that did not lower has none
 * @property {Array<{ id: string, path: Array<string | number>, tile: string | null, key: string, row: boolean, src: string, result: LowerResult }>} lambdas  in declaration order; `row` when it is a column's (`row, s, $`)
 * @property {HelperResult[]} helpers  the Library units the lambdas use
 * @property {UILowerDiagnostic[]} diagnostics  each lambda's, in declaration order, then the units', then each keyed Control's instances' (U017) and each param component's (U020)
 * @property {Record<string, Array<Record<string, any>>>} instances  each keyed Control's instances, by Control: what its `each` gave for this record, each entry's keys over the declaration's
 */

/**
 * Lowers every lambda of `ui` against one Program's record.
 * @param {T.UI} ui @param {Record<string, any>} record
 * @returns {UILowered}
 */
export function lowerUI(ui, record) {
  const dialect = ui.dialect;
  const def = /** @type {Record<string, any>} */ (dialect.def);
  const state = closeLists(/** @type {Type} */ (dialect.stateType));
  const numberType = dialect.numberType;
  const base = dialect.environment(record);
  /** @type {Record<string, Record<string, string>>} */
  const aliases = base.componentAliases ?? {};
  const sites = sitesOf(ui, state, aliases);

  const paramsObject = typeof def.params?.object === "string" && Object.hasOwn(base.objects, def.params.object) ? def.params.object : NO_PARAMS;
  /** @type {Type} */
  const params = { obj: paramsObject };

  /** Each lambda's convention by id, filled before each pass. @type {Map<string, SlotDecl>} */
  const decls = new Map();
  /** @type {Environment} */
  const env = {
    ...base,
    objects: paramsObject === NO_PARAMS ? { ...base.objects, [NO_PARAMS]: { label: "the params ($)", members: {} } } : base.objects,
    slot(ref) { return decls.get(ref.id) ?? base.slot(ref); },
  };
  /** @param {Site} s @param {Type | "infer"} returns @returns {SlotDecl} */
  const convention = (s, returns) => ({ params: s.row === null ? [state, params] : [s.row, state, params], returns, space: SPACE, forbid: [], may: [], forbidWhy: "a view's lambda only reads the state and the params; it never changes the run" });

  /** @type {SlotRef[]} */
  const refs = sites.map((s) => ({ id: s.id, kind: s.row === null ? "view" : "column", on: ui.package, key: s.key }));
  const srcs = sites.map((s) => String(s.fn));
  const helpers = dialect.libraryFor(srcs);
  /** @param {Array<Type | "infer">} returns */
  const pass = (returns) => {
    sites.forEach((s, i) => decls.set(s.id, convention(s, returns[i])));
    return lowerProgram(env, sites.map((_, i) => ({ src: srcs[i], slot: refs[i] })), helpers);
  };
  // First what each lambda gives, then each lowered against what its key requires.
  const inferred = pass(sites.map(() => "infer")).results.map((r) => r.returns);
  const { results, helpers: helperResults } = pass(sites.map((s, i) => required(s.gives, inferred[i], numberType)));

  /** @type {UILowerDiagnostic[]} */
  const diagnostics = [];
  /** @type {Record<string, Kernel>} */
  const kernels = {};
  sites.forEach((s, i) => {
    const r = results[i];
    diagnostics.push(...r.diagnostics.map((d) => ({ ...d, id: s.id, path: s.path, tile: s.tile, key: s.key })));
    if (r.kernel) kernels[s.id] = r.kernel;
  });
  for (const h of helperResults) diagnostics.push(...h.result.diagnostics.map((d) => ({ ...d, unit: h.name })));
  const instances = controlInstances(ui, record, diagnostics);
  paramComponents(ui, record, diagnostics);
  return {
    instances,
    environment: env,
    kernels,
    lambdas: sites.map((s, i) => ({ id: s.id, path: s.path, tile: s.tile, key: s.key, row: s.row !== null, src: srcs[i], result: results[i] })),
    helpers: helperResults,
    diagnostics,
  };
}

/** @param {unknown} e */
const messageOf = (e) => (e instanceof Error ? e.message : String(e));

/**
 * Each keyed Control's instances for one record: its `each`, plain build-time JavaScript over the record, called, and
 * each entry's keys merged over the declaration's and checked as the declaration is (U017, at the instance's path).
 * @param {T.UI} ui @param {Record<string, any>} record @param {UILowerDiagnostic[]} diagnostics
 * @returns {Record<string, Array<Record<string, any>>>}
 */
function controlInstances(ui, record, diagnostics) {
  /** @type {Record<string, Array<Record<string, any>>>} */
  const out = {};
  const files = /** @type {Record<string, any>} */ (ui.dialect.def).files ?? {};
  const u017 = (/** @type {Array<string | number>} */ path, /** @type {string} */ message, /** @type {string} */ tip) => { diagnostics.push(/** @type {any} */ ({ code: "U017", severity: "error", message, tip, path, id: idOf(path), tile: null, key: String(path.at(-1)) })); };
  for (const [name, c] of Object.entries(/** @type {Record<string, any>} */ (ui.controls ?? {}))) {
    const decl = /** @type {Record<string, any>} */ (c.decl);
    if (typeof decl.each !== "function") continue;
    const at = ["controls", name, "each"];
    /** @type {unknown} */
    let got;
    try { got = decl.each(record); } catch (e) { u017(at, `the Control '${name}''s each threw: ${messageOf(e)}`, "each is plain JavaScript over the built record; make it total"); continue; }
    if (!Array.isArray(got)) { u017(at, `the Control '${name}''s each gave ${typeof got}, not a list of instances`, "return a list: (record) => record.<list>.map((<item>) => ({ key: … }))"); continue; }
    const { each: _, ...base } = decl;
    const keys = new Set();
    /** @type {Array<Record<string, any>>} */
    const list = [];
    got.forEach((entry, i) => {
      const path = [...at, i];
      if (entry === null || typeof entry !== "object" || Array.isArray(entry)) return u017(path, `instance ${i} of '${name}' is not an object`, "give each instance { key, … }");
      const merged = { ...base, ...entry };
      const problems = controlProblems(merged, ["controls", name], { files, instance: true });
      if (keys.has(entry.key)) problems.push({ code: "U017", path, message: `instance ${i} of '${name}' repeats the key '${entry.key}'`, tip: "give each instance its own key" });
      // a part-local Control has no input to carry its value, so each instance writes to its own target
      if (c.local && typeof merged.to !== "string") problems.push({ code: "U017", path, message: `instance ${i} of '${name}' has no to: the Control is part-local (no Event input of its name), so each instance needs a target`, tip: 'give the instance to: "param.<name>" or "arg.<address>", or the declaration a to they share' });
      keys.add(entry.key);
      for (const p of problems) u017(path, `instance ${i} of '${name}': ${p.message}`, p.tip);
      if (!problems.length) list.push(Object.freeze(merged));
    });
    out[name] = list;
  }
  return out;
}

/**
 * U020 for a param component naming a param the Program does not declare: params are per Program, so this waits for
 * the record.
 * @param {T.UI} ui @param {Record<string, any>} record @param {UILowerDiagnostic[]} diagnostics
 */
function paramComponents(ui, record, diagnostics) {
  // the builder's grammar is the Grammar's declaration
  const g = /** @type {any} */ (ui.builder).grammar;
  const slot = g?.params?.slot;
  const as = slot === undefined ? undefined : g.constructs?.[g.root]?.slots?.[slot]?.as ?? slot;
  const names = as === undefined ? [] : Object.keys(record[as] ?? {});
  /** @param {unknown} list @param {Array<string | number>} at @param {string} tile */
  const walk = (list, at, tile) => {
    if (!Array.isArray(list)) return;
    list.forEach((/** @type {any} */ c, i) => {
      const path = [...at, i];
      if (c?.kind === "param" && !names.includes(c.param)) diagnostics.push(/** @type {any} */ ({ code: "U020", severity: "error", message: `the param component names '${c.param}', which this Program does not declare${names.length ? ` (its params: ${names.join(", ")})` : ""}`, tip: names.length ? `name one of: ${names.join(", ")}` : "declare the param in the Program", path: [...path, "param"], id: idOf([...path, "param"]), tile, key: "param" }));
      walk(c?.items, [...path, "items"], tile);
    });
  };
  for (const [id, t] of Object.entries(ui.tiles)) walk(/** @type {any} */ (t).body, ["tiles", id, "body"], id);
}
