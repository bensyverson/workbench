// defineGrammar's checks: D001, D009–D011 and D014 as rules.md defines them, every violation collected.

import { checkKeys, describe, didYouMean, kindOf, listed } from "./common.js";
import { isPlainObject } from "./tags.js";

/** @import { Problem } from "./session.js" */

export const GRAMMAR_KEYS = Object.freeze(["root", "constructs"]);
export const CONSTRUCT_KEYS = Object.freeze(["opens", "parent", "slots", "record", "rejected", "check"]);
export const SLOT_KEYS = Object.freeze(["kind", "args", "unit", "slot", "once", "required", "as", "check"]);
export const SLOT_KINDS = Object.freeze(["decl", "unit", "lambda"]);
export const SHAPE_NAMES = Object.freeze(["number", "string", "boolean", "string[]", "number[]"]);

/**
 * The constructs of a grammar definition, keyed by name; {} when it has none usable.
 * @param {unknown} def
 * @returns {Record<string, Record<string, unknown>>}
 */
export function constructsOf(def) {
  const cs = isPlainObject(def) && isPlainObject(def.constructs) ? def.constructs : {};
  return /** @type {Record<string, Record<string, unknown>>} */ (Object.fromEntries(Object.entries(cs).filter(([, c]) => isPlainObject(c))));
}

/**
 * A construct's ancestors, nearest first; stops at a cycle or an unknown parent.
 * @param {Record<string, Record<string, unknown>>} cs
 * @param {string} name
 */
export function ancestors(cs, name) {
  /** @type {string[]} */
  const out = [];
  let p = cs[name]?.parent;
  while (typeof p === "string" && cs[p] && p !== name && !out.includes(p)) { out.push(p); p = cs[p].parent; }
  return out;
}

/**
 * Whether following `parent` from a construct leads back to it.
 * @param {Record<string, Record<string, unknown>>} cs
 * @param {string} name
 */
function inCycle(cs, name) {
  let p = cs[name]?.parent;
  for (let i = 0; typeof p === "string" && cs[p] && i <= Object.keys(cs).length; i++) {
    if (p === name) return true;
    p = cs[p].parent;
  }
  return false;
}

/**
 * A construct's own methods: its slots and the child constructs opened from it.
 * @param {Record<string, Record<string, unknown>>} cs
 * @param {string} name
 */
export function ownMethods(cs, name) {
  const slots = isPlainObject(cs[name]?.slots) ? Object.keys(/** @type {object} */ (cs[name].slots)) : [];
  const children = Object.entries(cs).filter(([, c]) => c.parent === name).map(([n]) => n);
  return [...slots, ...children];
}

/**
 * Every problem in a Grammar definition.
 * @param {Record<string, unknown> | null} dialect  what defineDialect returned, or null when the first argument was not that
 * @param {unknown} def
 * @returns {Problem[]}
 */
export function validateGrammar(dialect, def) {
  /** @type {Problem[]} */
  const out = [];
  if (!dialect) out.push({ code: "D011", path: [], message: "defineGrammar's first argument is not a Dialect: pass what defineDialect returned.", fix: `import { data } from "./data.dialect.js"; then defineGrammar(data, { … })` });
  if (!isPlainObject(def)) {
    out.push({ code: "D011", path: [], message: `defineGrammar's second argument must be { root, constructs }, not ${describe(def)}.`, fix: "defineGrammar(data, { root: \"program\", constructs: { program: { … } } })" });
    return out;
  }
  checkKeys(def, GRAMMAR_KEYS, GRAMMAR_KEYS, [], "defineGrammar", out);
  if (def.constructs !== undefined && !isPlainObject(def.constructs)) out.push({ code: "D011", path: ["constructs"], message: "constructs must be an object of named constructs.", fix: "constructs: { program: { opens: [name()], slots: { … } } }" });
  const raw = isPlainObject(def.constructs) ? def.constructs : {};
  const cs = constructsOf(def);
  const names = Object.keys(cs);
  const conventions = dialect && isPlainObject(dialect.slots) ? Object.keys(dialect.slots) : [];

  if ("root" in def) {
    if (typeof def.root !== "string" || !cs[def.root]) out.push({ code: "D010", path: ["root"], message: `root ${describe(def.root)} is not a construct.${typeof def.root === "string" ? didYouMean(def.root, names) : ""}`, fix: `root: one of ${listed(names)}` });
    else if (cs[def.root].parent !== undefined) out.push({ code: "D010", path: ["constructs", def.root, "parent"], message: `the root construct '${def.root}' has a parent; the root is the Program itself.`, fix: `remove parent from '${def.root}'` });
  }

  for (const [cn, c] of Object.entries(raw)) {
    const path = ["constructs", cn];
    if (!isPlainObject(c)) { out.push({ code: "D011", path, message: `construct '${cn}' must be an object with opens and slots.`, fix: `${cn}: { opens: [name()], slots: { … } }` }); continue; }
    checkKeys(c, CONSTRUCT_KEYS, [], path, `construct '${cn}'`, out);
    if (c.parent !== undefined) {
      if (typeof c.parent !== "string" || !cs[c.parent] || c.parent === cn) out.push({ code: "D010", path: [...path, "parent"], message: `construct '${cn}' has parent ${describe(c.parent)}, which is not ${c.parent === cn ? "another" : "a"} construct.${typeof c.parent === "string" ? didYouMean(c.parent, names.filter((n) => n !== cn)) : ""}`, fix: `parent: one of ${listed(names.filter((n) => n !== cn))}` });
      else if (inCycle(cs, cn)) out.push({ code: "D010", path: [...path, "parent"], message: `construct '${cn}' is its own ancestor through parent.`, fix: "make the parents form a tree under the root" });
    }
    if (c.opens !== undefined) checkSpecs(c.opens, [...path, "opens"], `construct '${cn}', opens`, out);
    if (c.record !== undefined && c.record !== "calls") out.push({ code: "D011", path: [...path, "record"], message: `construct '${cn}': record must be "calls", not ${describe(c.record)}.`, fix: `record: "calls", or remove it` });
    if (c.check !== undefined && typeof c.check !== "function") out.push({ code: "D011", path: [...path, "check"], message: `construct '${cn}': check must be a function (record, ctx) => ….`, fix: "check(record, ctx) { … }" });
    if (c.rejected !== undefined) {
      if (!isPlainObject(c.rejected)) out.push({ code: "D011", path: [...path, "rejected"], message: `construct '${cn}': rejected must be an object of { message, tip }.`, fix: `rejected: { sql: { message: "…", tip: "…" } }` });
      else for (const [rn, r] of Object.entries(c.rejected)) {
        if (!isPlainObject(r)) { out.push({ code: "D011", path: [...path, "rejected", rn], message: `rejected '${rn}' must be { message, tip }.`, fix: `${rn}: { message: "…", tip: "…" }` }); continue; }
        checkKeys(r, ["message", "tip"], ["message"], [...path, "rejected", rn], `rejected '${rn}'`, out);
      }
    }
    if (c.slots === undefined) continue;
    if (!isPlainObject(c.slots)) { out.push({ code: "D011", path: [...path, "slots"], message: `construct '${cn}': slots must be an object of named slots.`, fix: "slots: { … }" }); continue; }
    for (const [sn, s] of Object.entries(c.slots)) checkSlot(s, conventions, [...path, "slots", sn], `slot '${cn}.${sn}'`, out);
  }

  for (const cn of names) {
    if (cs[cn].parent === undefined) continue;
    const own = ownMethods(cs, cn);
    for (const a of ancestors(cs, cn)) {
      const theirs = ownMethods(cs, a);
      for (const m of own) {
        if (theirs.includes(m)) out.push({ code: "D010", path: ["constructs", cn, "slots", m], message: `construct '${cn}' has a method '${m}', and so does its ${a === cs[cn].parent ? "parent" : "ancestor"} '${a}'; a child's builder also has every method of its parent, so the two would clash.`, fix: `rename '${m}' in '${cn}' or in '${a}'` });
      }
    }
  }
  return out;
}

/**
 * One slot: kind, and what that kind takes.
 * @param {unknown} s @param {string[]} conventions @param {Array<string | number>} path @param {string} where @param {Problem[]} out
 */
function checkSlot(s, conventions, path, where, out) {
  if (!isPlainObject(s)) { out.push({ code: "D014", path, message: `${where} must be an object with a kind.`, fix: `{ kind: "decl", args: [ … ] }` }); return; }
  checkKeys(s, SLOT_KEYS, [], path, where, out);
  if (!("kind" in s) || typeof s.kind !== "string" || !SLOT_KINDS.includes(s.kind)) {
    out.push({ code: "D014", path: "kind" in s ? [...path, "kind"] : path, message: `${where} has ${"kind" in s ? `kind ${describe(s.kind)}` : "no kind"}; a slot's kind is decl, unit or lambda.${typeof s.kind === "string" ? didYouMean(s.kind, SLOT_KINDS) : ""}`, fix: `kind: "decl" (data), "unit" (a .fn or .const) or "lambda" (a Runtime Lambda)` });
  }
  if (s.args !== undefined) checkSpecs(s.args, [...path, "args"], `${where}, args`, out);
  if (s.kind === "unit" && s.unit !== "fn" && s.unit !== "const") out.push({ code: "D011", path: [...path, "unit"], message: `${where}: a unit slot's unit must be "fn" or "const", not ${describe(s.unit)}.`, fix: `unit: "fn"` });
  if (s.kind === "lambda" && (typeof s.slot !== "string" || !conventions.includes(s.slot))) {
    out.push({ code: "D009", path: [...path, "slot"], message: `${where} names ${s.slot === undefined ? "no slot convention" : `slot convention ${describe(s.slot)}, which the Dialect does not declare`}.${typeof s.slot === "string" ? didYouMean(s.slot, conventions) : ""}`, fix: `slot: one of ${listed(conventions)}, or declare the convention in the Dialect's slots` });
  }
  for (const k of ["once", "required"]) if (s[k] !== undefined && typeof s[k] !== "boolean") out.push({ code: "D011", path: [...path, k], message: `${where}: ${k} must be true or false.`, fix: `${k}: true` });
  if (s.as !== undefined && typeof s.as !== "string") out.push({ code: "D011", path: [...path, "as"], message: `${where}: as must be a string, the record key.`, fix: `as: "params"` });
  if (s.check !== undefined && typeof s.check !== "function") out.push({ code: "D011", path: [...path, "check"], message: `${where}: check must be a function (call, ctx) => ….`, fix: "check(call, ctx) { … }" });
}

/**
 * A list of argument specs: name(ns?), ref(ns), data(shape), rest(spec).
 * @param {unknown} specs @param {Array<string | number>} path @param {string} where @param {Problem[]} out
 */
function checkSpecs(specs, path, where, out) {
  if (!Array.isArray(specs)) { out.push({ code: "D011", path, message: `${where} must be a list of argument specs.`, fix: "[name(\"table\"), data(\"number\")]" }); return; }
  specs.forEach((spec, i) => checkSpec(spec, path, `${where}, argument ${i + 1}`, out, i === specs.length - 1, false));
}

/**
 * @param {unknown} spec @param {Array<string | number>} path @param {string} where @param {Problem[]} out
 * @param {boolean} last @param {boolean} inRest
 */
function checkSpec(spec, path, where, out, last, inRest) {
  /** @param {string} m @param {string} fix */
  const bad = (m, fix) => out.push({ code: "D011", path, message: `${where}: ${m}`, fix });
  const k = kindOf(spec);
  if (k === "name") {
    const s = /** @type {import("./tags.js").NameTag} */ (spec);
    if (s.count > 1 || (s.ns !== undefined && typeof s.ns !== "string")) bad("name() takes at most one namespace string.", `name("table") or name()`);
  } else if (k === "ref") {
    const s = /** @type {import("./tags.js").RefTag} */ (spec);
    if (s.count !== 1 || typeof s.ns !== "string") bad("ref() takes the namespace it refers to, as one string.", `ref("table")`);
  } else if (k === "data") {
    const s = /** @type {import("./tags.js").DataTag} */ (spec);
    if (s.count !== 1) bad(s.count === 0 ? "data() has no shape." : "data() takes one shape.", `data("number"), data({ value: "number" }) or data(oneOf(…))`);
    else checkShape(s.shape, path, where, out);
  } else if (k === "rest") {
    const s = /** @type {import("./tags.js").RestTag} */ (spec);
    if (inRest || kindOf(s.spec) === "rest") bad("rest() cannot hold another rest().", `rest(data("string"))`);
    else if (s.count !== 1) bad("rest() takes one argument spec.", `rest(data("string"))`);
    else checkSpec(s.spec, path, where, out, true, true);
    if (!last) bad("rest() must be the last argument spec.", "move rest(…) to the end");
  } else bad(`${describe(spec)} is not an argument spec.`, "use name(ns), ref(ns), data(shape) or rest(spec)");
}

/**
 * A data shape: a shape name, an object of shapes (keys may end in `?`), oneOf, enumOf, recordOf, listOf.
 * @param {unknown} shape @param {Array<string | number>} path @param {string} where @param {Problem[]} out
 */
function checkShape(shape, path, where, out) {
  /** @param {string} m @param {string} fix */
  const bad = (m, fix) => out.push({ code: "D011", path, message: `${where}: ${m}`, fix });
  if (typeof shape === "string") {
    if (!SHAPE_NAMES.includes(shape)) bad(`'${shape}' is not a shape name.${didYouMean(shape, SHAPE_NAMES)}`, `use ${listed([...SHAPE_NAMES])}, an object of shapes, oneOf, enumOf, recordOf or listOf`);
    return;
  }
  if (isPlainObject(shape)) {
    for (const [key, v] of Object.entries(shape)) checkShape(v, path, `${where}, key '${key}'`, out);
    return;
  }
  const k = kindOf(shape);
  if (k === "oneOf") {
    const s = /** @type {import("./tags.js").OneOfTag} */ (shape);
    if (s.of.length < 2) bad("oneOf() needs at least two shapes.", "oneOf(a, b, …)");
    for (const x of s.of) checkShape(x, path, where, out);
  } else if (k === "enum") {
    const e = /** @type {import("./tags.js").EnumTag} */ (shape);
    if (!(Array.isArray(e.values) && e.values.length > 0 && e.values.every((v) => typeof v === "string"))) bad("enumOf() takes a non-empty list of strings.", `enumOf(["a", "b"])`);
  } else if (k === "recordOf" || k === "listOf") {
    checkShape(/** @type {import("./tags.js").RecordOfTag} */ (shape).of, path, where, out);
  } else bad(`${describe(shape)} is not a shape.`, `use ${listed([...SHAPE_NAMES])}, an object of shapes, oneOf, enumOf, recordOf or listOf`);
}
