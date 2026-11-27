// Argument addresses (project/2026-11-27-controls-draft.md, requirement 8): one argument of one builder call, named by
// the call's Ref id (kit/define's README, "Ref ids": `<tag>.<slot>`, `#<n>` unless the slot is once), `:<i>` and a path
// (`.key`, `[i]`). `siteOf(record, target)` finds a target's call in a built record, with where the builder made it
// and the argument's Grammar bounds; `applyArgs(program, args)` puts a value in at one call before its checks, for
// `run(fn, { args })` and a glue's `callGlue(…, { args })`. Every call has an id and a site, a call of literals alone
// included: the record keeps each call's place (record.js's LOCS) and lowering numbers every call (lower.js's
// instancesOf), so nothing here needs a lambda.

import { TAG, tagged } from "./tags.js";
import { instancesOf } from "./lower.js";
import { instanceName, matchArgs } from "./record.js";

/** @import { Loc } from "../parse/ast.js" */

/** The Grammar each built record came from, so a record alone names its calls. @type {WeakMap<object, any>} */
export const GRAMMARS = new WeakMap();
/**
 * What an override replaced: by Program (applyArgs), then by the record it builds (grammar.js), each overridden
 * argument's value before the override, keyed `<tag>.<slot>[#<n>]:<i>`, and each param's declared value that
 * `run(fn, { values })` replaced, keyed `param.<name>`. So a preview's record still says what its
 * text holds at the call, and write-back can tell a stale text (H012) from a preview. @type {WeakMap<object, Map<string, unknown>>}
 */
export const REPLACED = new WeakMap();
/**
 * The records built together with each record, as one composition's parts (kit/compose sets it): a glue helper that
 * makes two parts makes both parts' calls at one place, so siteOf counts the calls at a place across all of them.
 * @type {WeakMap<object, object[]>}
 */
export const BUILT_WITH = new WeakMap();
/** The key of one argument of one call. @param {{ tag: string, slot: string, n: number | null, arg: number }} a */
const argKey = (a) => `${a.tag}.${a.slot}${a.n === null ? "" : `#${a.n}`}:${a.arg}`;

const ADDRESS = /^(.+)\.([A-Za-z_$][\w$]*)(?:#(\d+))?:(\d+)((?:\.[A-Za-z_$][\w$]*|\[\d+\])*)$/;

/**
 * An Argument address, read: the instance's tag, the slot, the call's index (null for a once slot), the argument and
 * the path into it. Null when the text is not an address.
 * @param {string} address
 * @returns {{ tag: string, slot: string, n: number | null, arg: number, path: Array<string | number> } | null}
 */
export function parseAddress(address) {
  const m = typeof address === "string" ? ADDRESS.exec(address) : null;
  if (!m) return null;
  const path = [...m[5].matchAll(/\.([A-Za-z_$][\w$]*)|\[(\d+)\]/g)].map((p) => (p[1] !== undefined ? p[1] : Number(p[2])));
  return { tag: m[1], slot: m[2], n: m[3] === undefined ? null : Number(m[3]), arg: Number(m[4]), path };
}

/**
 * A site: where the builder made the call, the argument and path, its value in the record, its Grammar bounds
 * (`min`, `max`, `whole` of a number shape), and how many calls the record holds at that one place, with the records
 * of the composition it was built in (more than one: a call in a loop or a helper called twice, also one that makes
 * two parts, whose argument is not one value). A param's site is its declaration's
 * call, with the param's own bounds, its `value` the path. `slot` is the call's slot (the method the text calls), and
 * `source` the value the text held there when the record was built: `value`, unless the record is a preview built
 * with that argument overridden (`run(fn, { args })`) or a param's value (`run(fn, { values })`), whose text still holds the
 * value before the override. `callArgs` is the call's arguments as the text holds them, each override undone: what write-back
 * compares the call's other literals with, so a call that moved onto a neighbor is found.
 * @typedef {{ file: string, loc: Loc, slot: string, arg: number, path: Array<string | number>, value: unknown, source: unknown, callArgs: unknown[], calls: number, min?: number, max?: number, whole?: boolean, param?: string }} Site
 */

/**
 * The tags of a record's instances, in record order: each its name, or `<name>~2`, `~3`, … for a repeat.
 * @param {Array<{ name: string }>} instances
 */
function tagsOf(instances) {
  const used = new Set();
  return instances.map((inst) => {
    let tag = inst.name;
    for (let n = 2; used.has(tag); n++) tag = `${inst.name}~${n}`;
    used.add(tag);
    return tag;
  });
}

/** The spec of argument `i` of a slot: its own, or a rest's. @param {any[]} specs @param {number} i */
function specAt(specs, i) {
  let k = 0;
  for (const s of specs) {
    if (s?.[TAG] === "rest") return tagged(s.spec);
    if (k === i) return s?.[TAG] === "opt" ? tagged(s.of) : s;
    k++;
  }
  return undefined;
}

/**
 * The bounds at a path into a spec: a data tag's shape walked by the path, and the number shape's options it ends on.
 * A path that ends on a list (of numbers, or of lists of them) takes its element's bounds, which hold per component:
 * a translate Grip on a position clamps each coordinate.
 * @param {unknown} spec @param {Array<string | number>} path @returns {{ min?: number, max?: number, whole?: boolean }}
 */
function boundsAt(spec, path) {
  /** @type {any} */
  let s = spec;
  /** @type {Record<string, any> | undefined} */
  let opts;
  const rest = [...path];
  for (;;) {
    const t = /** @type {any} */ (tagged(s));
    if (t?.[TAG] === "data") { opts = t.opts; s = t.shape; continue; }
    if (t?.[TAG] === "opt") { s = t.of; continue; }
    if (!rest.length && t?.[TAG] === "listOf") { opts = undefined; s = t.of; continue; }
    if (!rest.length) break;
    const key = /** @type {string | number} */ (rest.shift());
    opts = undefined;
    if (t?.[TAG] === "listOf" || t?.[TAG] === "recordOf") s = t.of;
    else if (s !== null && typeof s === "object" && !t) s = s[key] ?? s[`${key}?`];
    else return {};
  }
  return opts ? { ...(typeof opts.min === "number" ? { min: opts.min } : {}), ...(typeof opts.max === "number" ? { max: opts.max } : {}), ...(opts.whole === true ? { whole: true } : {}) } : {};
}

/** A value at a path, or undefined. @param {unknown} v @param {Array<string | number>} path */
const at = (v, path) => path.reduce((/** @type {any} */ x, k) => (x !== null && typeof x === "object" ? x[k] : undefined), v);

/** Whether two sites are one place. @param {{ file: string, loc: Loc }} a @param {{ file: string, loc: Loc }} b */
const samePlace = (a, b) => a.file === b.file && a.loc.start.line === b.loc.start.line && a.loc.start.column === b.loc.start.column;

/**
 * Where a target is in a built record: `param.<name>` or `arg.<address>`. Null for a target no call reaches.
 * @param {Record<string, any>} record  what a Program's build (or `run`) gave, as it gave it (a copy has lost its Grammar)
 * @param {string} target
 * @returns {Site | null}
 */
export function siteOf(record, target) {
  const g = GRAMMARS.get(record);
  if (!g || typeof target !== "string") return null;
  const instances = instancesOf(g, record);
  const others = (BUILT_WITH.get(record) ?? []).filter((r) => r !== record && GRAMMARS.has(r));
  const all = [...instances, ...others.flatMap((r) => instancesOf(GRAMMARS.get(r), r))].flatMap((i) => i.calls);
  const count = (/** @type {{ file: string, loc: Loc }} */ site) => all.filter((c) => samePlace(c.at, site)).length;
  if (target.startsWith("param.")) {
    const name = target.slice(6);
    const slot = g.def.params?.slot;
    const call = instances[0]?.calls.find((c) => c.slot === slot && c.args[0] === name);
    if (!call) return null;
    const decl = /** @type {Record<string, any>} */ (call.args[1] ?? {});
    return { file: call.at.file, loc: call.at.loc, slot: call.slot, arg: 1, path: ["value"], value: decl.value, source: REPLACED.get(record)?.get(target) ?? decl.value, callArgs: [name, REPLACED.get(record)?.has(target) ? { ...decl, value: REPLACED.get(record)?.get(target) } : decl, ...call.args.slice(2)], calls: count(call.at), param: name, ...(typeof decl.min === "number" ? { min: decl.min } : {}), ...(typeof decl.max === "number" ? { max: decl.max } : {}) };
  }
  if (!target.startsWith("arg.")) return null;
  const a = parseAddress(target.slice(4));
  if (!a) return null;
  const tags = tagsOf(instances);
  const inst = instances[tags.indexOf(a.tag)];
  if (!inst) return null;
  const call = inst.calls.find((c) => c.slot === a.slot && (c.once ? a.n === null : c.index === a.n));
  if (!call || a.arg >= call.args.length) return null;
  const s = inst.construct.def.slots?.[call.slot];
  if (!s || s.kind !== "decl") return null;
  const value = at(call.args[a.arg], a.path);
  if (value === undefined && a.path.length) return null;
  const replaced = REPLACED.get(record);
  const source = replaced?.has(argKey(a)) ? at(replaced.get(argKey(a)), a.path) : value;
  return { file: call.at.file, loc: call.at.loc, slot: call.slot, arg: a.arg, path: a.path, value, source, callArgs: call.args.map((/** @type {unknown} */ v, /** @type {number} */ i) => (replaced?.has(argKey({ ...a, arg: i })) ? replaced.get(argKey({ ...a, arg: i })) : v)), calls: count(call.at), ...boundsAt(specAt(s.args, a.arg), a.path) };
}

/**
 * The calls of a Program not yet built, numbered as its record will be (lower.js's instancesOf): each instance's tag
 * in record order, and each call's index among the calls of its own slot. Unit calls take no number.
 * @param {any} root  the Program's root Instance
 * @returns {Array<{ tag: string, inst: any, call: any, index: number, once: boolean }>}
 */
function numberedCalls(root) {
  /** @type {any[]} */
  const order = [];
  const walk = (/** @type {any} */ inst) => {
    order.push(inst);
    for (const child of inst.construct.children) for (const i of inst.children.filter((/** @type {any} */ x) => x.construct === child)) walk(i);
  };
  walk(root);
  const tags = tagsOf(order.map((i) => ({ name: instanceName(i) })));
  /** @type {Array<{ tag: string, inst: any, call: any, index: number, once: boolean }>} */
  const out = [];
  order.forEach((inst, k) => {
    const slots = /** @type {Record<string, any>} */ (inst.construct.def.slots ?? {});
    if (inst.construct.def.record === "calls") {
      /** @type {Map<string, number>} */
      const seen = new Map();
      for (const call of inst.calls) {
        const index = seen.get(call.slot) ?? 0;
        seen.set(call.slot, index + 1);
        out.push({ tag: tags[k], inst, call, index, once: false });
      }
      return;
    }
    for (const [sn, s] of Object.entries(slots)) {
      if (s.kind === "unit") continue;
      inst.calls.filter((/** @type {any} */ c) => c.slot === sn).forEach((/** @type {any} */ call, /** @type {number} */ index) => out.push({ tag: tags[k], inst, call, index, once: !!s.once }));
    }
  });
  return out;
}

/** A copy of `v` with `value` at `path` (the path must reach an existing place). @param {unknown} v @param {Array<string | number>} path @param {unknown} value */
function put(v, path, value) {
  if (path.length === 0) return value;
  const [k, ...rest] = path;
  if (v === null || typeof v !== "object" || !Object.hasOwn(v, k)) throw new RangeError("no such place");
  const copy = Array.isArray(v) ? [...v] : { ...v };
  /** @type {any} */ (copy)[k] = put(/** @type {any} */ (v)[k], rest, value);
  return copy;
}

/**
 * Puts each address's value in at its call, before the Program is checked, so the Grammar's bounds judge it (B004).
 * Returns the addresses no call reaches. `report(errors, what, at)` is the Program's own refusal.
 * @param {any} program  a Program (grammar.js) whose root is open
 * @param {Record<string, unknown>} args  values by Argument address (no `arg.` prefix)
 * @returns {string[]}
 */
export function applyArgs(program, args) {
  const calls = program.root ? numberedCalls(program.root) : [];
  /** @type {string[]} */
  const missing = [];
  for (const [address, value] of Object.entries(args)) {
    const a = parseAddress(address);
    if (!a) { missing.push(address); continue; }
    const hit = calls.find((c) => c.tag === a.tag && c.call.slot === a.slot && (c.once ? a.n === null : c.index === a.n));
    const s = hit?.inst.construct.def.slots?.[hit.call.slot];
    if (!hit || !s || s.kind !== "decl" || a.arg >= hit.call.args.length) { missing.push(address); continue; }
    let args2;
    try { args2 = put(hit.call.args, [a.arg, ...a.path], value); } catch { missing.push(address); continue; }
    const replaced = REPLACED.get(program) ?? new Map();
    const key = argKey({ tag: hit.tag, slot: hit.call.slot, n: hit.once ? null : hit.index, arg: a.arg });
    if (!replaced.has(key)) replaced.set(key, hit.call.args[a.arg]);
    REPLACED.set(program, replaced);
    const m = matchArgs(s.args, /** @type {unknown[]} */ (args2));
    program.report(m.found.errors, `${hit.inst.construct.name} '${instanceName(hit.inst)}', .${hit.call.slot} (the override of ${address})`, { file: hit.call.file, loc: hit.call.loc });
    hit.call.args = m.args;
  }
  return missing;
}
