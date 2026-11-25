// defineGrammar's checks: every problem in a Grammar definition, collected (D001, D009–D011, D014, D015).

import { didYouMean, an } from "./codes.js";
import { checkKeys, listed } from "./types.js";
import { TAG, isPlainObject, kindOf, describe, tagged } from "./tags.js";
import { openKey } from "./record.js";

/** @import { Problem } from "./types.js" */
/** @import * as T from "./define.js" */

const GRAMMAR_KEYS = Object.freeze(["root", "constructs"]);
const GRAMMAR_OPTIONAL = Object.freeze(["params"]);
const CONSTRUCT_KEYS = Object.freeze(["opens", "parent", "required", "slots", "record", "state", "names", "rejected", "check"]);
const SLOT_KEYS = Object.freeze(["kind", "args", "unit", "once", "required", "as", "check"]);
const SLOT_KINDS = Object.freeze(["decl", "unit"]);
export const SHAPE_NAMES = Object.freeze(["number", "string", "boolean", "string[]", "number[]"]);
/** Properties a runtime or test library probes on any object; the builder answers them with undefined, so no slot or construct may take one. */
export const PROBES = Object.freeze(["then", "toJSON", "constructor", "inspect", "asymmetricMatch", "nodeType", "$$typeof", "valueOf", "toString", "prototype"]);
/**
 * The probes that are Object.prototype's own members. A param may take one of these names, since a lambda reads
 * it like any other (`u.constructor`), and the run's `$` answers a declared one by name; any other probe is B004
 * as a param's name.
 */
export const OBJECT_PROBES = Object.freeze(["constructor", "valueOf", "toString"]);
/** The bounds a number shape takes in data("number", { … }). */
const BOUNDS = Object.freeze(["min", "max", "whole"]);
/** The keys a spec's trailing options object may hold, by spec; any other spec takes only `as`. */
const SPEC_OPTIONS = /** @type {Record<string, string[]>} */ ({ name: ["as", "within"], data: ["as", ...BOUNDS] });
/** Methods every builder has, which no slot or construct may take. */
export const KIT_METHODS = Object.freeze(["check", "build"]);

/**
 * A construct's ancestors, nearest first; stops at a cycle or an unknown parent.
 * @param {Record<string, any>} cs @param {string} name
 */
export function ancestors(cs, name) {
  /** @type {string[]} */
  const out = [];
  let p = cs[name]?.parent;
  while (typeof p === "string" && cs[p] && p !== name && !out.includes(p)) { out.push(p); p = cs[p].parent; }
  return out;
}

/**
 * A construct's own methods: its slots and the child constructs opened from it.
 * @param {Record<string, any>} cs @param {string} name
 */
export function ownMethods(cs, name) {
  const slots = isPlainObject(cs[name]?.slots) ? Object.keys(cs[name].slots) : [];
  return [...slots, ...Object.entries(cs).filter(([, c]) => c.parent === name).map(([n]) => n)];
}

/**
 * Every namespace a spec list declares into with name(ns), walking shapes too.
 * @param {unknown[]} specs @param {string} construct
 * @param {Set<string>} into
 */
function declared(specs, construct, into) {
  for (const s of specs) {
    const t = tagged(s);
    if (t?.[TAG] === "name") into.add(typeof t.ns === "string" ? t.ns : construct);
    if (t?.[TAG] === "rest" || t?.[TAG] === "opt") declared([/** @type {any} */ (t).spec ?? /** @type {any} */ (t).of], construct, into);
  }
}

/**
 * Every name() a construct declares with, at the top of its opens and slots' args: the spec, its namespace,
 * and where it sits.
 * @param {Record<string, any>} cs
 * @returns {Array<{ cn: string, spec: T.NameTag, ns: string, path: Array<string | number> }>}
 */
function nameSpecs(cs) {
  /** @type {Array<{ cn: string, spec: T.NameTag, ns: string, path: Array<string | number> }>} */
  const out = [];
  for (const [cn, c] of Object.entries(cs)) {
    const lists = [[["constructs", cn, "opens"], c.opens], ...Object.entries(isPlainObject(c.slots) ? c.slots : {}).map(([sn, s]) => [["constructs", cn, "slots", sn, "args"], /** @type {any} */ (s)?.args])];
    for (const [path, specs] of lists) {
      if (!Array.isArray(specs)) continue;
      specs.forEach((s, i) => { const t = tagged(s); if (t?.[TAG] === "name") out.push({ cn, spec: /** @type {T.NameTag} */ (t), ns: typeof t.ns === "string" ? t.ns : cn, path: [...path, i] }); });
    }
  }
  return out;
}

/**
 * Each namespace a `name(ns, { within })` scopes, to the construct it is unique within (a namespace without
 * `within` spans the whole Program and is not listed). The builder resolves names and refs by it.
 * @param {Record<string, any>} cs
 * @returns {Map<string, string>}
 */
export function scopedNamespaces(cs) {
  /** @type {Map<string, string>} */
  const out = new Map();
  for (const { spec, ns } of nameSpecs(cs)) if (typeof spec.within === "string" && !out.has(ns)) out.set(ns, spec.within);
  return out;
}

/**
 * Every ref() a spec list holds, at any depth (through opt, rest and data shapes), with the argument it sits in.
 * @param {unknown} spec @param {(ns: unknown) => void} found
 */
function refsIn(spec, found) {
  if (Array.isArray(spec)) { spec.forEach((x) => refsIn(x, found)); return; }
  const t = tagged(spec);
  if (!t) { if (isPlainObject(spec)) Object.values(spec).forEach((x) => refsIn(x, found)); return; }
  const any = /** @type {any} */ (t);
  switch (t[TAG]) {
    case "ref": found(any.ns); return;
    case "opt": case "recordOf": case "listOf": case "oneOf": refsIn(any.of, found); return;
    case "rest": refsIn(any.spec, found); return;
    case "data": refsIn(any.shape, found);
  }
}

/**
 * name()'s `within`: a construct that is the declaring one or an ancestor of it, one scope per namespace, and
 * every ref into a scoped namespace inside an instance of its `within` construct (D011).
 * @param {Record<string, any>} cs @param {Problem[]} out
 */
function checkWithin(cs, out) {
  const names = Object.keys(cs);
  /** @type {Map<string, { within: unknown, cn: string }>} */
  const first = new Map();
  for (const { cn, spec, ns, path } of nameSpecs(cs)) {
    const w = spec.within;
    const enclosing = [cn, ...ancestors(cs, cn)];
    if (w !== undefined) {
      if (typeof w !== "string") out.push({ code: "D011", path, message: `construct '${cn}': name("${ns}")'s within must be the name of a construct, not ${describe(w)}.`, tip: `name("${ns}", { within: "${cn}" })` });
      else if (!cs[w]) out.push({ code: "D011", path, message: `construct '${cn}': name("${ns}")'s within '${w}' names no construct.${didYouMean(w, names)}`, tip: `within: one of ${listed(enclosing)}` });
      else if (!enclosing.includes(w)) out.push({ code: "D011", path, message: `construct '${cn}': name("${ns}")'s within '${w}' is not '${cn}' or one of its ancestors, so no '${w}' instance encloses the name.`, tip: `within: one of ${listed(enclosing)}` });
    }
    const seen = first.get(ns);
    if (!seen) first.set(ns, { within: w, cn });
    else if (seen.within !== w) out.push({ code: "D011", path, message: `construct '${cn}': the namespace '${ns}' is declared ${w === undefined ? "Program-wide" : `within '${String(w)}'`} here and ${seen.within === undefined ? "Program-wide" : `within '${String(seen.within)}'`} in '${seen.cn}'; a namespace has one scope.`, tip: `give every name("${ns}") the same within, or use two namespaces` });
  }
  const scoped = scopedNamespaces(cs);
  for (const [cn, c] of Object.entries(cs)) {
    const enclosing = [cn, ...ancestors(cs, cn)];
    const where = [[["constructs", cn, "opens"], c.opens], ...Object.entries(isPlainObject(c.slots) ? c.slots : {}).map(([sn, s]) => [["constructs", cn, "slots", sn, "args"], /** @type {any} */ (s)?.args])];
    for (const [path, specs] of where) refsIn(specs, (ns) => {
      const w = typeof ns === "string" ? scoped.get(ns) : undefined;
      if (typeof ns === "string" && w !== undefined && cs[w] && !enclosing.includes(w)) out.push({ code: "D011", path, message: `construct '${cn}': ref("${ns}") stands outside every ${w}, but ${an(ns)} is unique only within one ${w} (name("${ns}", { within: "${w}" })), so it would name no ${ns}.`, tip: `move the ref into '${w}' or a construct under it, or declare name("${ns}") without within` });
    });
  }
}

/**
 * @param {T.Dialect | null} dialect @param {unknown} def
 * @returns {Problem[]}
 */
export function validateGrammar(dialect, def) {
  /** @type {Problem[]} */
  const out = [];
  if (!dialect) out.push({ code: "D011", path: [], message: "defineGrammar's first argument is not a Dialect: pass what defineDialect returned.", tip: "defineGrammar(myDialect, { … })" });
  if (!isPlainObject(def)) return [...out, { code: "D011", path: [], message: `defineGrammar's second argument must be { root, constructs }, not ${describe(def)}.`, tip: `defineGrammar(d, { root: "program", constructs: { program: { … } } })` }];
  checkKeys(def, [...GRAMMAR_KEYS, ...GRAMMAR_OPTIONAL], GRAMMAR_KEYS, [], "defineGrammar", out);
  const raw = isPlainObject(def.constructs) ? def.constructs : {};
  if (def.constructs !== undefined && !isPlainObject(def.constructs)) out.push({ code: "D011", path: ["constructs"], message: "constructs must be an object of named constructs.", tip: "constructs: { program: { opens: [name()], slots: { … } } }" });
  /** @type {Record<string, any>} */
  const cs = Object.fromEntries(Object.entries(raw).filter(([, c]) => isPlainObject(c)));
  const names = Object.keys(cs);
  const conventions = dialect ? Object.keys(dialect.def.slots) : [];

  if ("root" in def) {
    if (typeof def.root !== "string" || !cs[def.root]) out.push({ code: "D010", path: ["root"], message: `root ${describe(def.root)} is not a construct.${typeof def.root === "string" ? didYouMean(def.root, names) : ""}`, tip: `root: one of ${listed(names)}` });
    else if (cs[def.root].parent !== undefined) out.push({ code: "D010", path: ["constructs", def.root, "parent"], message: `the root construct '${def.root}' has a parent; the root is the Program itself.`, tip: `remove parent from '${def.root}'` });
  }

  /** Program namespaces: what name(ns) declares anywhere. */
  const programNs = new Set();
  for (const [cn, c] of Object.entries(cs)) {
    if (Array.isArray(c.opens)) declared(c.opens, cn, programNs);
    for (const s of Object.values(isPlainObject(c.slots) ? c.slots : {})) if (Array.isArray(/** @type {any} */ (s)?.args)) declared(/** @type {any} */ (s).args, cn, programNs);
  }

  for (const [cn, c] of Object.entries(raw)) {
    const path = ["constructs", cn];
    if (!isPlainObject(c)) { out.push({ code: "D011", path, message: `construct '${cn}' must be an object with opens and slots.`, tip: `${cn}: { opens: [name()], slots: { … } }` }); continue; }
    checkKeys(c, CONSTRUCT_KEYS, [], path, `construct '${cn}'`, out);
    if (KIT_METHODS.includes(cn)) out.push({ code: "D010", path, message: `construct '${cn}' takes the name of a method every builder has.`, tip: `rename it; ${listed([...KIT_METHODS])} are the kit's` });
    if (c.parent !== undefined) {
      if (typeof c.parent !== "string" || !cs[c.parent] || c.parent === cn) out.push({ code: "D010", path: [...path, "parent"], message: `construct '${cn}' has parent ${describe(c.parent)}, which is not ${c.parent === cn ? "another" : "a"} construct.${typeof c.parent === "string" ? didYouMean(c.parent, names.filter((n) => n !== cn)) : ""}`, tip: `parent: one of ${listed(names.filter((n) => n !== cn))}` });
      else if (typeof def.root === "string" && !ancestors(cs, cn).includes(def.root)) out.push({ code: "D010", path: [...path, "parent"], message: `construct '${cn}' does not reach the root through parent.`, tip: "make the parents form a tree under the root" });
    }
    if (PROBES.includes(cn)) out.push({ code: "D018", path, message: `construct '${cn}' takes a name that runtimes and test libraries probe on every object (${listed([...PROBES])}); its method could never be called.`, tip: `rename '${cn}'` });
    if (c.opens !== undefined) {
      checkSpecs(c.opens, conventions, [...path, "opens"], `construct '${cn}', opens`, out);
      if (Array.isArray(c.opens)) c.opens.forEach((/** @type {unknown} */ spec, /** @type {number} */ i) => { if (holdsLambda(spec)) out.push({ code: "D019", path: [...path, "opens", i], message: `construct '${cn}', opens, argument ${i + 1}: a lambda in an opening is not built yet; only a slot's lambdas are lowered.`, tip: `put the lambda in a decl slot of '${cn}'` }); });
    }
    if (c.required !== undefined) {
      if (typeof c.required !== "boolean") out.push({ code: "D011", path: [...path, "required"], message: `construct '${cn}': required must be true or false, not ${describe(c.required)}.`, tip: "required: true" });
      else if (c.parent === undefined) out.push({ code: "D011", path: [...path, "required"], message: `construct '${cn}' is required but has no parent; the root is the Program itself, and only a child construct can be required of its parent.`, tip: `remove required from '${cn}'` });
    }
    if (c.record !== undefined && c.record !== "calls") out.push({ code: "D011", path: [...path, "record"], message: `construct '${cn}': record must be "calls", not ${describe(c.record)}.`, tip: `record: "calls", or remove it` });
    if (c.check !== undefined && typeof c.check !== "function") out.push({ code: "D011", path: [...path, "check"], message: `construct '${cn}': check must be a function (record, ctx) => ….`, tip: "check(record, ctx) { … }" });
    if (c.state !== undefined) {
      const st = c.state;
      if (c.record !== "calls") out.push({ code: "D015", path: [...path, "state"], message: `construct '${cn}' has a state but no record: "calls"; state is threaded through calls in order.`, tip: `add record: "calls" to '${cn}'` });
      if (!isPlainObject(st)) out.push({ code: "D015", path: [...path, "state"], message: `construct '${cn}': state must be { init, step, names }.`, tip: "state: { init(opened, ctx) { … }, step(state, call, inferred, ctx) { … } }" });
      else {
        checkKeys(st, ["init", "step", "names"], [], [...path, "state"], `construct '${cn}''s state`, out);
        for (const k of ["init", "step"]) if (typeof st[k] !== "function") out.push({ code: "D015", path: [...path, "state", k], message: `construct '${cn}''s state has no ${k} function.`, tip: k === "init" ? "init(opened, { program, stateOf }) { return { … }; }" : "step(state, call, inferred, { program, stateOf, error }) { return state; }" });
        if (st.names !== undefined && !(isPlainObject(st.names) && Object.values(st.names).every((f) => typeof f === "function"))) out.push({ code: "D015", path: [...path, "state", "names"], message: `construct '${cn}': state.names must map each namespace to a function of the state.`, tip: "names: { column: (state) => Object.keys(state.columns) }" });
        for (const ns of Object.keys(isPlainObject(st.names) ? st.names : {})) if (programNs.has(ns)) out.push({ code: "D015", path: [...path, "state", "names", ns], message: `construct '${cn}''s state namespace '${ns}' is also a Program namespace (a name("${ns}") declares into it).`, tip: `rename the state namespace or the name() namespace` });
      }
    }
    if (c.names !== undefined) {
      if (c.state !== undefined) out.push({ code: "D015", path: [...path, "names"], message: `construct '${cn}' has both state and names; a construct with state declares its namespaces in state.names.`, tip: `move them to state.names, as (state) => […]` });
      else if (!(isPlainObject(c.names) && Object.values(c.names).every((f) => typeof f === "function"))) out.push({ code: "D015", path: [...path, "names"], message: `construct '${cn}': names must map each namespace to a function (record, { program, stateOf }) => names.`, tip: "names: { column: (record, { stateOf }) => Object.keys(stateOf(record.table).columns) }" });
      for (const ns of Object.keys(isPlainObject(c.names) ? c.names : {})) if (programNs.has(ns)) out.push({ code: "D015", path: [...path, "names", ns], message: `construct '${cn}''s namespace '${ns}' is also a Program namespace (a name("${ns}") declares into it).`, tip: `rename one of the two namespaces` });
    }
    if (c.rejected !== undefined) {
      if (!isPlainObject(c.rejected)) out.push({ code: "D011", path: [...path, "rejected"], message: `construct '${cn}': rejected must be an object of { message, tip, fix }.`, tip: `rejected: { sql: { message: "…", tip: "…" } }` });
      else for (const [rn, r] of Object.entries(c.rejected)) {
        if (!isPlainObject(r) || typeof r.message !== "string") { out.push({ code: "D011", path: [...path, "rejected", rn], message: `rejected '${rn}' must be { message, tip, fix }.`, tip: `${rn}: { message: "…", tip: "…" }` }); continue; }
        checkKeys(r, ["message", "tip", "fix"], ["message"], [...path, "rejected", rn], `rejected '${rn}'`, out);
        for (const k of ["tip", "fix"]) if (r[k] !== undefined && typeof r[k] !== "string") out.push({ code: "D011", path: [...path, "rejected", rn, k], message: `rejected '${rn}': ${k} must be text, not ${describe(r[k])}.`, tip: `${k}: "…"` });
      }
    }
    if (c.slots === undefined) continue;
    if (!isPlainObject(c.slots)) { out.push({ code: "D011", path: [...path, "slots"], message: `construct '${cn}': slots must be an object of named slots.`, tip: "slots: { … }" }); continue; }
    for (const [sn, s] of Object.entries(c.slots)) {
      if (KIT_METHODS.includes(sn)) out.push({ code: "D010", path: [...path, "slots", sn], message: `slot '${cn}.${sn}' takes the name of a method every builder has.`, tip: `rename it; ${listed([...KIT_METHODS])} are the kit's` });
      if (PROBES.includes(sn)) out.push({ code: "D018", path: [...path, "slots", sn], message: `slot '${cn}.${sn}' takes a name that runtimes and test libraries probe on every object (${listed([...PROBES])}); the method could never be called.`, tip: `rename it` });
      checkSlot(s, conventions, [...path, "slots", sn], `slot '${cn}.${sn}'`, out);
    }
  }

  for (const cn of names) collideKeys(cs, cn, cn === def.root, out);
  checkWithin(cs, out);

  // The slot that declares the Program's params: a root decl slot whose first argument is the param's name and
  // whose second is its declaration (its `value` the default a build-time read gets).
  if (def.params !== undefined) {
    const p = def.params;
    const rootSlots = typeof def.root === "string" && cs[def.root] && isPlainObject(cs[def.root].slots) ? cs[def.root].slots : {};
    const s = isPlainObject(p) && typeof p.slot === "string" && Object.hasOwn(rootSlots, p.slot) ? rootSlots[p.slot] : null;
    if (isPlainObject(p)) checkKeys(p, ["slot"], ["slot"], ["params"], "params", out);
    if (!(isPlainObject(s) && s.kind === "decl" && Array.isArray(s.args) && s.args.length === 2 && kindOf(s.args[0]) === "name" && kindOf(s.args[1]) === "data")) {
      out.push({ code: "D011", path: ["params"], message: `params must be { slot } naming a slot of the root construct that takes a name and a declaration, (name("param"), data(ParamShape)), not ${describe(p)}.`, tip: `params: { slot: "param" }, with param: { kind: "decl", args: [name("param"), data({ value: "number" })], as: "params" } on the root` });
    }
  }

  for (const cn of names) {
    const slots = isPlainObject(cs[cn].slots) ? Object.keys(cs[cn].slots) : [];
    for (const child of names.filter((n) => cs[n].parent === cn && slots.includes(n))) out.push({ code: "D010", path: ["constructs", cn, "slots", child], message: `construct '${cn}' has a slot '${child}' and a child construct of that name.`, tip: `rename the slot or the construct` });
    if (cs[cn].parent === undefined) continue;
    const own = ownMethods(cs, cn);
    for (const a of ancestors(cs, cn)) {
      for (const m of ownMethods(cs, a)) if (own.includes(m)) out.push({ code: "D010", path: ["constructs", cn, "slots", m], message: `construct '${cn}' has a method '${m}', and so does its ${a === cs[cn].parent ? "parent" : "ancestor"} '${a}'; a child's builder also has every method of its parent, so the two would clash.`, tip: `rename '${m}' in '${cn}' or in '${a}'` });
    }
  }
  return out;
}

/**
 * Whether an argument spec is or holds a lambda (through opt, rest and data shapes).
 * @param {unknown} spec
 * @returns {boolean}
 */
function holdsLambda(spec) {
  if (Array.isArray(spec)) return spec.some(holdsLambda);
  const t = tagged(spec);
  if (!t) return isPlainObject(spec) && Object.values(spec).some(holdsLambda);
  switch (t[TAG]) {
    case "lambda": return true;
    case "opt": return holdsLambda(/** @type {any} */ (t).of);
    case "rest": return holdsLambda(/** @type {any} */ (t).spec);
    case "data": return holdsLambda(/** @type {any} */ (t).shape);
    case "oneOf": return holdsLambda(/** @type {any} */ (t).of);
    case "recordOf": case "listOf": return holdsLambda(/** @type {any} */ (t).of);
    default: return false;
  }
}

/**
 * D017: two things of one construct that the record would put under one key. The keys are the opening
 * arguments' (as, else namespace or name), the child constructs', a by-slot slot's (as, else its name),
 * `units` when it has a unit slot or is the root (which takes the top-level bindings `.build({ scope })` resolves),
 * and `calls` for a record: "calls" construct.
 * @param {Record<string, any>} cs @param {string} cn @param {boolean} isRoot @param {Problem[]} out
 */
function collideKeys(cs, cn, isRoot, out) {
  const c = cs[cn];
  /** @type {Map<string, Array<{ who: string, explicit: boolean, kind: "opening" | "child" | "slot" | "units" | "calls" }>>} */
  const keys = new Map();
  const put = (/** @type {string} */ key, /** @type {string} */ who, /** @type {boolean} */ explicit, /** @type {"opening" | "child" | "slot" | "units" | "calls"} */ kind) => keys.set(key, [...(keys.get(key) ?? []), { who, explicit, kind }]);
  if (Array.isArray(c.opens)) c.opens.forEach((/** @type {unknown} */ spec, /** @type {number} */ i) => { if (kindOf(spec)) put(String(openKey(/** @type {T.Tagged} */ (spec), i)), `opening argument ${i + 1}`, Boolean(/** @type {any} */ (spec).as), "opening"); });
  for (const n of Object.keys(cs).filter((x) => cs[x].parent === cn)) put(n, `child construct '${n}'`, false, "child");
  if (isRoot) put("units", "the Program's units (its helpers and constants, the top-level bindings its lambdas read among them)", false, "units");
  if (isRoot) put("reads", "the params build-time code read (kept by run)", false, "units");
  if (c.record === "calls") put("calls", "the calls", false, "calls");
  else for (const [sn, s] of Object.entries(isPlainObject(c.slots) ? c.slots : {})) {
    if (!isPlainObject(s)) continue;
    if (s.kind === "unit") { if (!keys.get("units")?.some((w) => w.kind === "units")) put("units", `unit slots`, false, "units"); }
    else put(typeof s.as === "string" ? s.as : sn, `slot '${sn}'`, typeof s.as === "string", "slot");
  }
  for (const [key, who] of keys) {
    // a plain slot against a child of its name is D010's
    if (who.length < 2 || who.every((w) => !w.explicit && (w.kind === "slot" || w.kind === "child"))) continue;
    out.push({ code: "D017", path: ["constructs", cn], message: `construct '${cn}': ${who.map((w) => w.who).join(" and ")} would all be the record key '${key}'; the record keeps only one.`, tip: `give one of them another as: key` });
  }
}

/**
 * @param {unknown} s @param {string[]} conventions @param {Array<string | number>} path @param {string} where @param {Problem[]} out
 */
function checkSlot(s, conventions, path, where, out) {
  if (!isPlainObject(s)) { out.push({ code: "D014", path, message: `${where} must be an object with a kind.`, tip: `{ kind: "decl", args: [ … ] }` }); return; }
  checkKeys(s, SLOT_KEYS, [], path, where, out);
  if (typeof s.kind !== "string" || !SLOT_KINDS.includes(s.kind)) {
    out.push({ code: "D014", path: [...path, "kind"], message: `${where} has ${"kind" in s ? `kind ${describe(s.kind)}` : "no kind"}; a slot's kind is decl or unit.${typeof s.kind === "string" ? didYouMean(s.kind, SLOT_KINDS) : ""}`, tip: `kind: "decl" (arguments, lambdas among them) or "unit" (a .fn or .const)` });
  }
  if (s.kind === "decl") {
    if (s.args === undefined) out.push({ code: "D011", path, message: `${where}: a decl slot needs args.`, tip: "args: [ … ]" });
    else checkSpecs(s.args, conventions, [...path, "args"], `${where}, args`, out);
  }
  if (s.kind === "unit" && s.unit !== "fn" && s.unit !== "const") out.push({ code: "D011", path: [...path, "unit"], message: `${where}: a unit slot's unit must be "fn" or "const", not ${describe(s.unit)}.`, tip: `unit: "fn"` });
  for (const k of ["once", "required"]) if (s[k] !== undefined && typeof s[k] !== "boolean") out.push({ code: "D011", path: [...path, k], message: `${where}: ${k} must be true or false.`, tip: `${k}: true` });
  if (s.as !== undefined && typeof s.as !== "string") out.push({ code: "D011", path: [...path, "as"], message: `${where}: as must be a string, the record key.`, tip: `as: "params"` });
  if (s.check !== undefined && typeof s.check !== "function") out.push({ code: "D011", path: [...path, "check"], message: `${where}: check must be a function (call, ctx) => ….`, tip: "check(call, ctx) { … }" });
}

/**
 * @param {unknown} specs @param {string[]} conventions @param {Array<string | number>} path @param {string} where @param {Problem[]} out
 */
function checkSpecs(specs, conventions, path, where, out) {
  if (!Array.isArray(specs)) { out.push({ code: "D011", path, message: `${where} must be a list of argument specs.`, tip: `[name("table"), data("number")]` }); return; }
  specs.forEach((spec, i) => {
    const k = kindOf(spec);
    if ((k === "opt" || k === "rest") && i !== specs.length - 1 && !(k === "opt" && specs.slice(i + 1).every((x) => kindOf(x) === "opt" || kindOf(x) === "rest"))) {
      out.push({ code: "D015", path, message: `${where}, argument ${i + 1}: ${k}() must come last${k === "opt" ? " (only other optional arguments may follow it)" : ""}.`, tip: `move ${k}(…) to the end` });
    }
    checkSpec(spec, conventions, path, `${where}, argument ${i + 1}`, out, false);
  });
}

/**
 * @param {unknown} spec @param {string[]} conventions @param {Array<string | number>} path @param {string} where @param {Problem[]} out @param {boolean} inner
 */
function checkSpec(spec, conventions, path, where, out, inner) {
  const bad = (/** @type {string} */ m, /** @type {string} */ tip) => out.push({ code: "D011", path, message: `${where}: ${m}`, tip });
  const s = tagged(spec);
  if (s && "opts" in s && s.opts !== undefined) {
    const keys = SPEC_OPTIONS[/** @type {string} */ (s[TAG])] ?? ["as"];
    const o = s.opts;
    if (!(isPlainObject(o) && Object.keys(o).every((key) => keys.includes(key)) && (!("as" in o) || typeof s.as === "string"))) {
      bad(`${String(s[TAG])}()'s last argument may only be { ${keys.join(", ")} }, each optional; as is the record key, a string.`,s[TAG] === "name" ? `name("flow", { within: "account" })` : `ref("table", { as: "from" })`);
    }
  }
  switch (s?.[TAG]) {
    case "name": if (s.count > 1 || (s.ns !== undefined && typeof s.ns !== "string")) bad("name() takes at most one namespace string.", `name("table") or name()`); return;
    case "ref": if (s.count !== 1 || typeof s.ns !== "string") bad("ref() takes the namespace it refers to, as one string.", `ref("table")`); return;
    case "lambda": checkLambda(s.convention, s.count, conventions, path, where, out); return;
    case "data":
      if (s.count !== 1) bad(s.count === 0 ? "data() has no shape." : "data() takes one shape.", `data("number"), data({ value: "number" }) or data(oneOf(…))`);
      else { checkShape(s.shape, conventions, path, where, out); checkBounds(s, path, where, out); }
      return;
    case "opt": case "rest": {
      const of = s[TAG] === "opt" ? /** @type {T.OptTag} */ (s).of : /** @type {T.RestTag} */ (s).spec;
      if (inner || kindOf(of) === "opt" || kindOf(of) === "rest") bad(`${s[TAG]}() cannot hold another opt() or rest().`, `${s[TAG]}(data("string"))`);
      else if (s[TAG] === "rest" && /** @type {T.RestTag} */ (s).count !== 1) bad("rest() takes one argument spec.", `rest(data("string"))`);
      else if (kindOf(of) === "name") bad(`${s[TAG]}(name()) would declare a name only sometimes.`, "declare names with a required name() argument");
      else checkSpec(of, conventions, path, where, out, true);
      return;
    }
  }
  bad(`${describe(spec)} is not an argument spec.`, "use name(ns), ref(ns), data(shape), lambda(convention), opt(spec) or rest(spec)");
}

/**
 * @param {unknown} convention @param {number} count @param {string[]} conventions @param {Array<string | number>} path @param {string} where @param {Problem[]} out
 */
function checkLambda(convention, count, conventions, path, where, out) {
  if (count !== 1 || typeof convention !== "string" || !conventions.includes(convention)) {
    out.push({ code: "D009", path, message: `${where}: lambda(${describe(convention)}) names no slot convention the Dialect declares.${typeof convention === "string" ? didYouMean(convention, conventions) : ""}`, tip: `lambda(one of ${listed(conventions)}), or declare the convention in the Dialect's slots` });
  }
}

/**
 * A number shape's bounds (D011): only on "number", each of min and max a finite number with min at most max,
 * whole true or false. Unknown keys are refused with the options.
 * @param {T.DataTag} s @param {Array<string | number>} path @param {string} where @param {Problem[]} out
 */
function checkBounds(s, path, where, out) {
  const o = isPlainObject(s.opts) ? s.opts : {};
  const given = BOUNDS.filter((k) => o[k] !== undefined);
  if (!given.length) return;
  const bad = (/** @type {string} */ m, /** @type {string} */ tip) => out.push({ code: "D011", path, message: `${where}: ${m}`, tip });
  if (s.shape !== "number") { bad(`only a number shape takes min, max and whole, not ${describe(s.shape)}.`, `data("number", { min: 0 })`); return; }
  for (const k of ["min", "max"]) if (o[k] !== undefined && !(typeof o[k] === "number" && Number.isFinite(o[k]))) bad(`its ${k} must be a finite number, not ${describe(o[k])}.`, `data("number", { ${k}: 0 })`);
  if (o.whole !== undefined && typeof o.whole !== "boolean") bad(`its whole must be true or false, not ${describe(o.whole)}.`, `data("number", { whole: true })`);
  if (typeof o.min === "number" && typeof o.max === "number" && o.min > o.max) bad(`its min ${o.min} is above its max ${o.max}, so no value fits.`, `data("number", { min: ${o.max}, max: ${o.min} })`);
}

/**
 * A data shape: a shape name, an object of shapes (keys may end in `?`), oneOf, enumOf, recordOf, listOf, ref, lambda,
 * and data("number", { bounds }).
 * @param {unknown} shape @param {string[]} conventions @param {Array<string | number>} path @param {string} where @param {Problem[]} out
 */
function checkShape(shape, conventions, path, where, out) {
  const bad = (/** @type {string} */ m, /** @type {string} */ tip) => out.push({ code: "D011", path, message: `${where}: ${m}`, tip });
  if (typeof shape === "string") {
    if (!SHAPE_NAMES.includes(shape)) bad(`'${shape}' is not a shape name.${didYouMean(shape, SHAPE_NAMES)}`, `use ${listed([...SHAPE_NAMES])}, an object of shapes, oneOf, enumOf, recordOf, listOf, ref or lambda`);
    return;
  }
  if (isPlainObject(shape)) { for (const [key, v] of Object.entries(shape)) checkShape(v, conventions, path, `${where}, key '${key}'`, out); return; }
  const s = tagged(shape);
  switch (s?.[TAG]) {
    case "oneOf":
      if (s.of.length < 2) bad("oneOf() needs at least two shapes.", "oneOf(a, b, …)");
      for (const x of s.of) checkShape(x, conventions, path, where, out);
      return;
    case "enum":
      if (!(Array.isArray(s.values) && s.values.length > 0 && s.values.every((v) => typeof v === "string" || typeof v === "number"))) bad("enumOf() takes a non-empty list of strings or numbers.", `enumOf(["a", "b"])`);
      return;
    case "recordOf": case "listOf": checkShape(s.of, conventions, path, where, out); return;
    case "ref": if (s.count !== 1 || typeof s.ns !== "string") bad("ref() takes the namespace it refers to, as one string.", `ref("table")`); return;
    case "lambda": checkLambda(s.convention, s.count, conventions, path, where, out); return;
    case "data":
      // a bounded number inside a shape: data("number", { min: 0 }); a key inside a shape has no record key
      if (s.count !== 1) bad(s.count === 0 ? "data() has no shape." : "data() takes one shape.", `data("number", { min: 0 })`);
      else if (s.opts !== undefined && !(isPlainObject(s.opts) && Object.keys(s.opts).every((k) => BOUNDS.includes(k)))) bad(`data() inside a shape takes only { ${BOUNDS.join(", ")} }: a value inside a shape has no record key of its own.`, `data("number", { min: 0 })`);
      else { checkShape(s.shape, conventions, path, where, out); checkBounds(s, path, where, out); }
      return;
  }
  bad(`${describe(shape)} is not a shape.`,`use ${listed([...SHAPE_NAMES])}, an object of shapes, oneOf, enumOf, recordOf, listOf, ref or lambda`);
}
