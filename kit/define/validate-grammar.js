// defineGrammar's checks: every problem in a Grammar definition, collected (D001, D009–D011, D014, D015).
// Adapted from the trial checker (scripts/define-trial/checker/grammar.js), which leaf O63kB5 retires.

import { didYouMean } from "./codes.js";
import { checkKeys, listed } from "./types.js";
import { TAG, isPlainObject, kindOf, describe, tagged } from "./tags.js";

/** @import { Problem } from "./types.js" */
/** @import * as T from "./define.js" */

const GRAMMAR_KEYS = Object.freeze(["root", "constructs"]);
const CONSTRUCT_KEYS = Object.freeze(["opens", "parent", "slots", "record", "state", "rejected", "check"]);
const SLOT_KEYS = Object.freeze(["kind", "args", "unit", "once", "required", "as", "check"]);
const SLOT_KINDS = Object.freeze(["decl", "unit"]);
export const SHAPE_NAMES = Object.freeze(["number", "string", "boolean", "string[]", "number[]"]);
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
 * @param {T.Dialect | null} dialect @param {unknown} def
 * @returns {Problem[]}
 */
export function validateGrammar(dialect, def) {
  /** @type {Problem[]} */
  const out = [];
  if (!dialect) out.push({ code: "D011", path: [], message: "defineGrammar's first argument is not a Dialect: pass what defineDialect returned.", tip: "defineGrammar(myDialect, { … })" });
  if (!isPlainObject(def)) return [...out, { code: "D011", path: [], message: `defineGrammar's second argument must be { root, constructs }, not ${describe(def)}.`, tip: `defineGrammar(d, { root: "program", constructs: { program: { … } } })` }];
  checkKeys(def, GRAMMAR_KEYS, GRAMMAR_KEYS, [], "defineGrammar", out);
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
    if (c.opens !== undefined) checkSpecs(c.opens, conventions, [...path, "opens"], `construct '${cn}', opens`, out);
    if (c.record !== undefined && c.record !== "calls") out.push({ code: "D011", path: [...path, "record"], message: `construct '${cn}': record must be "calls", not ${describe(c.record)}.`, tip: `record: "calls", or remove it` });
    if (c.check !== undefined && typeof c.check !== "function") out.push({ code: "D011", path: [...path, "check"], message: `construct '${cn}': check must be a function (record, ctx) => ….`, tip: "check(record, ctx) { … }" });
    if (c.state !== undefined) {
      const st = c.state;
      if (c.record !== "calls") out.push({ code: "D015", path: [...path, "state"], message: `construct '${cn}' has a state but no record: "calls"; state is threaded through calls in order.`, tip: `add record: "calls" to '${cn}'` });
      if (!isPlainObject(st)) out.push({ code: "D015", path: [...path, "state"], message: `construct '${cn}': state must be { init, step, names }.`, tip: "state: { init(opened, ctx) { … }, step(state, call, inferred) { … } }" });
      else {
        checkKeys(st, ["init", "step", "names"], [], [...path, "state"], `construct '${cn}''s state`, out);
        for (const k of ["init", "step"]) if (typeof st[k] !== "function") out.push({ code: "D015", path: [...path, "state", k], message: `construct '${cn}''s state has no ${k} function.`, tip: k === "init" ? "init(opened, { program, stateOf }) { return { … }; }" : "step(state, call, inferred) { return state; }" });
        if (st.names !== undefined && !(isPlainObject(st.names) && Object.values(st.names).every((f) => typeof f === "function"))) out.push({ code: "D015", path: [...path, "state", "names"], message: `construct '${cn}': state.names must map each namespace to a function of the state.`, tip: "names: { column: (state) => Object.keys(state.columns) }" });
        for (const ns of Object.keys(isPlainObject(st.names) ? st.names : {})) if (programNs.has(ns)) out.push({ code: "D015", path: [...path, "state", "names", ns], message: `construct '${cn}''s state namespace '${ns}' is also a Program namespace (a name("${ns}") declares into it).`, tip: `rename the state namespace or the name() namespace` });
      }
    }
    if (c.rejected !== undefined) {
      if (!isPlainObject(c.rejected)) out.push({ code: "D011", path: [...path, "rejected"], message: `construct '${cn}': rejected must be an object of { message, tip }.`, tip: `rejected: { sql: { message: "…", tip: "…" } }` });
      else for (const [rn, r] of Object.entries(c.rejected)) {
        if (!isPlainObject(r) || typeof r.message !== "string") { out.push({ code: "D011", path: [...path, "rejected", rn], message: `rejected '${rn}' must be { message, tip }.`, tip: `${rn}: { message: "…", tip: "…" }` }); continue; }
        checkKeys(r, ["message", "tip"], ["message"], [...path, "rejected", rn], `rejected '${rn}'`, out);
      }
    }
    if (c.slots === undefined) continue;
    if (!isPlainObject(c.slots)) { out.push({ code: "D011", path: [...path, "slots"], message: `construct '${cn}': slots must be an object of named slots.`, tip: "slots: { … }" }); continue; }
    for (const [sn, s] of Object.entries(c.slots)) {
      if (KIT_METHODS.includes(sn)) out.push({ code: "D010", path: [...path, "slots", sn], message: `slot '${cn}.${sn}' takes the name of a method every builder has.`, tip: `rename it; ${listed([...KIT_METHODS])} are the kit's` });
      checkSlot(s, conventions, [...path, "slots", sn], `slot '${cn}.${sn}'`, out);
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
  if (s && "opts" in s && s.opts !== undefined && !(isPlainObject(s.opts) && Object.keys(s.opts).every((key) => key === "as") && typeof s.as === "string")) bad("a spec's last argument may only be { as: \"key\" }.", `ref("table", { as: "from" })`);
  switch (s?.[TAG]) {
    case "name": if (s.count > 1 || (s.ns !== undefined && typeof s.ns !== "string")) bad("name() takes at most one namespace string.", `name("table") or name()`); return;
    case "ref": if (s.count !== 1 || typeof s.ns !== "string") bad("ref() takes the namespace it refers to, as one string.", `ref("table")`); return;
    case "lambda": checkLambda(s.convention, s.count, conventions, path, where, out); return;
    case "data":
      if (s.count !== 1) bad(s.count === 0 ? "data() has no shape." : "data() takes one shape.", `data("number"), data({ value: "number" }) or data(oneOf(…))`);
      else checkShape(s.shape, conventions, path, where, out);
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
 * A data shape: a shape name, an object of shapes (keys may end in `?`), oneOf, enumOf, recordOf, listOf, ref, lambda.
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
  }
  bad(`${describe(shape)} is not a shape.`, `use ${listed([...SHAPE_NAMES])}, an object of shapes, oneOf, enumOf, recordOf, listOf, ref or lambda`);
}
