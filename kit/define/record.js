// The record a Program builds ("The record" in the draft), and the lambdas in it: one walk over a construct
// instance's calls, by the grammar, serves `.build()`, the free-name rule and lowering.

import { TAG, tagged } from "./tags.js";
import { matchArg, matchShape, found } from "./shapes.js";

/** @import * as T from "./define.js" */
/** @import { Loc } from "../parse/ast.js" */
/** @import { Found } from "./shapes.js" */

/**
 * One construct of a compiled grammar.
 * @typedef {object} Construct
 * @property {string} name
 * @property {Record<string, any>} def
 * @property {Construct | null} parent
 * @property {Construct[]} children
 * @property {Record<string, { message: string, tip?: string, fix?: string }>} rejected  its own and its ancestors'
 */

/**
 * One call on a construct instance, as the builder recorded it.
 * @typedef {object} Call
 * @property {string} slot
 * @property {unknown[]} args  as the record holds them: lambdas as source text
 * @property {Loc} loc
 * @property {string} file
 * @property {Found} found  the refs and lambdas the call holds
 */

/**
 * @typedef {object} Instance
 * @property {Construct} construct
 * @property {Record<string, unknown>} opened  the opening arguments, by record key
 * @property {Instance | null} parent
 * @property {Instance[]} children
 * @property {Call[]} calls
 * @property {Loc} loc
 * @property {string} file
 */

/**
 * Where the builder made each record and each recorded call, for diagnostics found when lowering. A by-slot
 * record also keeps where each of its slots' calls were, in call order, since its values cannot be keys.
 * @typedef {{ file: string, loc: Loc, slots?: Record<string, Array<{ file: string, loc: Loc }>> }} Site
 */
export const LOCS = /** @type {WeakMap<object, Site>} */ (new WeakMap());

/**
 * The record key of an opening argument: its `as`, else its namespace, else `name`; an `opt()` takes the key
 * of the spec it wraps.
 * @param {T.Tagged} spec @param {number} i
 * @returns {string}
 */
export function openKey(spec, i) {
  const s = /** @type {any} */ (spec);
  if (s.as) return s.as;
  if (spec[TAG] === "opt") { const inner = tagged(s.of); return inner ? openKey(inner, i) : `arg${i}`; }
  if (spec[TAG] === "name") return typeof s.ns === "string" ? s.ns : "name";
  if (spec[TAG] === "ref") return s.ns;
  return `arg${i}`;
}

/**
 * The name an instance goes by (`ref.on`, the state namespace, ids): the value of its construct's name()
 * opening under whatever record key that opening has, else the construct's own name. No other record key
 * (a slot or child called `name`) renames an instance; the builder and lowering both ask here.
 * @param {{ def: Record<string, any>, name: string }} c @param {Record<string, any>} rec  the opening arguments, or a record
 */
export function nameOf(c, rec) {
  const specs = /** @type {T.Tagged[]} */ (c.def.opens ?? []);
  const i = specs.findIndex((s) => s[TAG] === "name");
  const v = i < 0 ? undefined : rec[openKey(specs[i], i)];
  return v === undefined || v === null ? c.name : String(v);
}

/** @param {Instance} inst */
export const instanceName = (inst) => nameOf(inst.construct, inst.opened);

/**
 * Sets an own key, even `__proto__`, which a plain assignment would take for the prototype.
 * @param {Record<string, any>} o @param {string} k @param {unknown} v
 */
export function setOwn(o, k, v) { Object.defineProperty(o, k, { value: v, writable: true, enumerable: true, configurable: true }); }

/**
 * Whether a decl slot's record value is its one argument (a single spec that is not rest) or the list of them.
 * @param {unknown[]} specs
 */
export const single = (specs) => specs.length === 1 && tagged(specs[0])?.[TAG] !== "rest";

/**
 * The record of one instance and its children.
 * @param {Instance} inst
 * @returns {Record<string, unknown>}
 */
export function recordOf(inst) {
  const c = inst.construct;
  /** @type {Record<string, any>} */
  const rec = { ...inst.opened };
  /** @type {Record<string, Array<{ file: string, loc: Loc }>>} */
  const slotAt = {};
  if (c.def.record === "calls") {
    rec.calls = inst.calls.map((call) => {
      const made = { slot: call.slot, args: [...call.args] };
      LOCS.set(made, { file: call.file, loc: call.loc });
      return made;
    });
  } else {
    for (const [sn, s] of Object.entries(/** @type {Record<string, any>} */ (c.def.slots ?? {}))) {
      if (s.kind === "unit") rec.units = [];
      else if (s.args[0]?.[TAG] === "name") rec[s.as ?? sn] = {};
      else if (!s.once) rec[s.as ?? sn] = [];
    }
    for (const call of inst.calls) {
      (slotAt[call.slot] ??= []).push({ file: call.file, loc: call.loc });
      const s = c.def.slots[call.slot];
      if (s.kind === "unit") rec.units.push({ name: call.args[0], kind: s.unit, src: call.args[1] });
      else if (s.args[0]?.[TAG] === "name") setOwn(rec[s.as ?? call.slot], /** @type {string} */ (call.args[0]), single(s.args.slice(1)) ? call.args[1] : call.args.slice(1));
      else if (s.once) rec[s.as ?? call.slot] = single(s.args) ? call.args[0] : [...call.args];
      else rec[s.as ?? call.slot].push(single(s.args) ? call.args[0] : [...call.args]);
    }
  }
  for (const child of c.children) rec[child.name] = inst.children.filter((i) => i.construct === child).map(recordOf);
  LOCS.set(rec, { file: inst.file, loc: inst.loc, ...(c.def.record === "calls" ? {} : { slots: slotAt }) });
  return rec;
}

/**
 * Matches a call's arguments against a slot's specs: what they hold, normalized (lambdas as text). The
 * caller handles name() and units; here are ref, data, lambda, opt and rest.
 * @param {T.Tagged[]} specs @param {unknown[]} args
 * @returns {{ args: unknown[], found: Found }}
 */
export function matchArgs(specs, args) {
  const out = found();
  /** @type {unknown[]} */
  const made = [];
  let i = 0;
  for (const spec of specs) {
    if (spec[TAG] === "rest") {
      const inner = /** @type {T.Tagged} */ (tagged(/** @type {T.RestTag} */ (spec).spec));
      for (; i < args.length; i++) made.push(matchArg(inner, args[i], i, out));
      break;
    }
    if (spec[TAG] === "opt") {
      // an absent opt() still holds its place, so the arguments after it keep their positions in the record
      made.push(i < args.length && args[i] !== undefined ? matchArg(/** @type {T.Tagged} */ (tagged(/** @type {T.OptTag} */ (spec).of)), args[i], i, out) : undefined);
      i++;
      continue;
    }
    if (i >= args.length) out.errors.push({ code: "B004", path: [i], message: `argument ${i + 1} is missing` });
    else if (spec[TAG] === "name") made.push(args[i]);
    else {
      const before = out.errors.length;
      made.push(matchArg(spec, args[i], i, out));
      // a value after a name belongs to that name: say which, so the message does not leave it to the call site
      const owner = specs[0][TAG] === "name" && typeof args[0] === "string" && i > 0 ? args[0] : null;
      if (owner !== null) for (let e = before; e < out.errors.length; e++) out.errors[e].message = `for '${owner}', ${out.errors[e].message}`;
    }
    i++;
  }
  if (args.length > i) out.errors.push({ code: "B004", path: [i], message: `takes at most ${specs.length} argument${specs.length === 1 ? "" : "s"}, got ${args.length}` });
  while (made.length && made.at(-1) === undefined) made.pop();
  return { args: made, found: out };
}

/**
 * The lambdas and refs a recorded call holds, found again from its record form (for a record made elsewhere).
 * @param {T.Tagged[]} specs @param {unknown[]} args
 */
export function rematch(specs, args) {
  const out = found();
  let i = 0;
  for (const spec of specs) {
    const s = spec[TAG] === "opt" ? /** @type {T.Tagged} */ (tagged(/** @type {T.OptTag} */ (spec).of)) : spec[TAG] === "rest" ? /** @type {T.Tagged} */ (tagged(/** @type {T.RestTag} */ (spec).spec)) : spec;
    const n = spec[TAG] === "rest" ? args.length - i : 1;
    for (let k = 0; k < n && i < args.length; k++, i++) {
      if (spec[TAG] === "opt" && (args[i] === undefined || args[i] === null)) continue;
      if (s[TAG] === "data") matchShape(/** @type {T.DataTag} */ (s).shape, args[i], [i], out);
      else if (s[TAG] === "ref" || s[TAG] === "lambda") matchShape(s, args[i], [i], out);
    }
  }
  return out;
}
