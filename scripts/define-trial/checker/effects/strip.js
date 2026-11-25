// Takes the per-slot effects draft's declarations out of a Dialect definition, so the real kit/define (which has no
// effects) accepts the rest, and keeps what it took for the patched Environment (env.js) and the effect check
// (check.js). Instance spaces become { pure: true }; `may` and `helpers` go; `{ value, write }` and `{ value, bump }`
// become the bare type; `effects` go from verbs, intrinsics and objects. An object's `call`, which kit/define does
// not take, rides through as a member named CALL_MEMBER (an { fn } member, so kit/define resolves its types) and
// env.js moves it back. Convention functions and environment(program) are wrapped so that what they return is
// stripped too and recorded per Program in `info.current`.

import { isPlainObject } from "../../../../kit/define/tags.js";
import { memberModel } from "./validate.js";

/**
 * A helper's `may` when the Dialect gives none: it reads the members of each object some instance space hands a
 * lambda (a helper may be passed that instance), and nothing else that changes: not a total.
 * @param {Record<string, string | null>} spaces  each space's instance, or null
 * @returns {string[]}
 */
export function helpersDefault(spaces) {
  return [...new Set(Object.values(spaces).filter((o) => o !== null))].map((o) => `read ${o}`);
}

/** The member an object's `call` travels as: not an identifier, so no lambda can name it. */
export const CALL_MEMBER = "call()";

/**
 * @typedef {object} ObjectInfo
 * @property {Record<string, { write?: true, bump?: true }>} members  writable members and totals, by name
 * @property {Record<string, string[]>} verbs  each verb's effects, by member name
 * @property {string[] | null} callEffects  the object's call's effects, when it has a call
 */

/**
 * @typedef {object} ProgramInfo  what one Program's environment(program) and convention functions declared
 * @property {Record<string, Record<string, { write?: true, bump?: true }>>} members  writable members and totals environment(program) added, by object
 * @property {Record<string, any>} added  what environment(program) returned, as written (for D022)
 * @property {Map<string, { kind: string, may: unknown, space: unknown, params: unknown }>} conventions  what each convention function returned, by lambda id
 */

/**
 * @typedef {object} EffectsInfo
 * @property {Record<string, string | null>} spaces  each space's instance, or null when it is pure
 * @property {Record<string, ObjectInfo>} objects
 * @property {Record<string, { may: unknown, space: unknown, params: unknown }>} slots  each static convention's may (absent: []), space and params
 * @property {unknown} helpers  helpers' may (default: helpersDefault, a read of each instance space's object)
 * @property {boolean} helpersDefault  whether the Dialect gave no helpers.may, so `helpers` is the default
 * @property {ProgramInfo} current  the Program being lowered
 */

/** @param {Record<string, any>} o @param {string[]} keys */
const without = (o, keys) => Object.fromEntries(Object.entries(o).filter(([k]) => !keys.includes(k)));

/** A member as kit/define takes it: write / bump gone, a value with nothing else left is its bare type. @param {unknown} m */
function stripMember(m) {
  if (!isPlainObject(m)) return m;
  const out = without(/** @type {Record<string, any>} */ (m), ["write", "bump", "effects"]);
  return "value" in out && Object.keys(out).length === 1 ? out.value : out;
}

/** @param {Record<string, any>} members @returns {Record<string, { write?: true, bump?: true }>} */
function flagsOf(members) {
  /** @type {Record<string, { write?: true, bump?: true }>} */
  const out = {};
  for (const [m, t] of Object.entries(members)) {
    const x = memberModel(t);
    if (x.kind !== "value" || !(x.write || x.bump)) continue;
    out[m] = { ...(x.write ? { write: /** @type {const} */ (true) } : {}), ...(x.bump ? { bump: /** @type {const} */ (true) } : {}) };
  }
  return out;
}

/** @param {any} o  an object as environment(program) or the definition writes it */
function stripObject(o) {
  if (!isPlainObject(o)) return o;
  const out = without(o, ["call", "effects"]);
  if (isPlainObject(o.members) || isPlainObject(o.call)) {
    out.members = Object.fromEntries(Object.entries(isPlainObject(o.members) ? o.members : {}).map(([m, t]) => [m, stripMember(t)]));
    if (isPlainObject(o.call)) out.members[CALL_MEMBER] = { fn: o.call };
  }
  return out;
}

/** An empty record of one Program. @returns {ProgramInfo} */
export const noProgram = () => ({ members: {}, added: {}, conventions: new Map() });

/**
 * The definition kit/define accepts, and what was taken out of it.
 * @param {Record<string, any>} def
 * @returns {{ def: Record<string, any>, info: EffectsInfo }}
 */
export function stripEffects(def) {
  const given = "helpers" in def && isPlainObject(def.helpers) && "may" in def.helpers;
  /** @type {EffectsInfo} */
  const info = { spaces: {}, objects: {}, slots: {}, helpers: given ? def.helpers.may : [], helpersDefault: !given, current: noProgram() };
  const out = without(def, ["helpers"]);
  if (isPlainObject(def.spaces)) {
    out.spaces = {};
    for (const [n, v] of Object.entries(def.spaces)) {
      out.spaces[n] = isPlainObject(v) ? { ...without(v, ["pure", "instance"]), pure: true } : { pure: true };
      info.spaces[n] = isPlainObject(v) && typeof v.instance === "string" ? v.instance : null;
    }
  }
  if (!given) info.helpers = helpersDefault(info.spaces);
  if (isPlainObject(def.objects)) {
    out.objects = {};
    for (const [n, o] of Object.entries(def.objects)) {
      out.objects[n] = stripObject(o);
      /** @type {Record<string, any>} */
      const members = isPlainObject(o) && isPlainObject(o.members) ? o.members : {};
      info.objects[n] = {
        members: flagsOf(members),
        verbs: Object.fromEntries(Object.entries(members).filter(([, t]) => isPlainObject(t) && "fn" in t && Array.isArray(t.effects)).map(([m, t]) => [m, [...t.effects]])),
        callEffects: isPlainObject(o) && isPlainObject(o.call) ? (Array.isArray(o.effects) ? [...o.effects] : []) : null,
      };
    }
  }
  if (isPlainObject(def.intrinsics)) out.intrinsics = Object.fromEntries(Object.entries(def.intrinsics).map(([n, i]) => [n, isPlainObject(i) ? without(i, ["effects"]) : i]));
  if (isPlainObject(def.slots)) {
    out.slots = {};
    for (const [n, s] of Object.entries(def.slots)) {
      if (typeof s === "function") {
        // kit/define calls a convention function with (ref, program, state) and reads only what it returns.
        out.slots[n] = (/** @type {any} */ ref, /** @type {any} */ program, /** @type {unknown} */ state) => {
          const c = s.call(def.slots, ref, program, state);
          if (!isPlainObject(c)) return c;
          info.current.conventions.set(ref.id, { kind: ref.kind, may: c.may, space: c.space, params: c.params });
          return without(c, ["may"]);
        };
        continue;
      }
      out.slots[n] = isPlainObject(s) ? without(s, ["may"]) : s;
      if (isPlainObject(s)) info.slots[n] = { may: "may" in s ? s.may : [], space: s.space, params: s.params };
    }
  }
  if (typeof def.environment === "function") {
    const environment = def.environment;
    out.environment = (/** @type {Record<string, any>} */ program) => {
      const added = environment.call(def, program);
      info.current = { ...noProgram(), conventions: info.current.conventions, added: isPlainObject(added) ? added : {} };
      if (!isPlainObject(added)) return added;
      const r = { ...added };
      if (isPlainObject(added.objects)) {
        r.objects = Object.fromEntries(Object.entries(added.objects).map(([n, o]) => [n, stripObject(o)]));
        for (const [n, o] of Object.entries(added.objects)) if (isPlainObject(o) && isPlainObject(o.members)) info.current.members[n] = flagsOf(o.members);
      }
      return r;
    };
  }
  return { def: out, info };
}
