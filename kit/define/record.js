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
 * @property {Record<string, { message: string, tip?: string }>} rejected  its own and its ancestors'
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

/** Where the builder made each record and each recorded call, for diagnostics found when lowering. */
export const LOCS = /** @type {WeakMap<object, { file: string, loc: Loc }>} */ (new WeakMap());

/**
 * The record key of an opening argument: its `as`, else its namespace, else `name`.
 * @param {T.Tagged} spec @param {number} i
 */
export function openKey(spec, i) {
  const s = /** @type {any} */ (spec);
  if (s.as) return s.as;
  if (spec[TAG] === "name") return typeof s.ns === "string" ? s.ns : "name";
  if (spec[TAG] === "ref") return s.ns;
  return `arg${i}`;
}

/** The name an instance goes by in `ref.on`: its opening name, else its construct's. @param {Instance} inst */
export const instanceName = (inst) => String(inst.opened.name ?? inst.construct.name);

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
      const s = c.def.slots[call.slot];
      if (s.kind === "unit") rec.units.push({ name: call.args[0], kind: s.unit, src: call.args[1] });
      else if (s.args[0]?.[TAG] === "name") rec[s.as ?? call.slot][/** @type {string} */ (call.args[0])] = single(s.args.slice(1)) ? call.args[1] : call.args.slice(1);
      else if (s.once) rec[s.as ?? call.slot] = single(s.args) ? call.args[0] : [...call.args];
      else rec[s.as ?? call.slot].push(single(s.args) ? call.args[0] : [...call.args]);
    }
  }
  for (const child of c.children) rec[child.name] = inst.children.filter((i) => i.construct === child).map(recordOf);
  LOCS.set(rec, { file: inst.file, loc: inst.loc });
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
      if (i < args.length && args[i] !== undefined) made.push(matchArg(/** @type {T.Tagged} */ (tagged(/** @type {T.OptTag} */ (spec).of)), args[i], i, out));
      i++;
      continue;
    }
    if (i >= args.length) out.errors.push({ code: "B004", path: [i], message: `argument ${i + 1} is missing` });
    else made.push(spec[TAG] === "name" ? args[i] : matchArg(spec, args[i], i, out));
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
      if (s[TAG] === "data") matchShape(/** @type {T.DataTag} */ (s).shape, args[i], [i], out);
      else if (s[TAG] === "ref" || s[TAG] === "lambda") matchShape(s, args[i], [i], out);
    }
  }
  return out;
}
