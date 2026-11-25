// The per-slot effects draft's definition checks (api-effects.md), on the Dialect definition before kit/define sees
// it: D012 widened (a space is pure or an instance space), D021 (a malformed effect declaration) and D022 (an
// instance a lambda could reach another way, or a change outside its instance space). A pure function of the
// definition: it returns problems in kit/define's shape ({ code, path, message, tip }) and changes nothing.
// `checkMay` and `reachProblems` are also run when a Program is lowered, on what environment(program) added and on
// what a convention function returned (checker/effects/check.js).

import { didYouMean } from "../../../../kit/lower/codes.js";
import { isPlainObject, kindOf } from "../../../../kit/define/tags.js";
import { VERBS, parseEffect, overlap } from "./effect.js";

/** @typedef {{ code: string, path: Array<string | number>, message: string, tip: string }} Problem */
/** @typedef {{ kind: "value" | "fn" | "keyed" | "other", type?: unknown, write?: boolean, bump?: boolean }} MemberModel */
/** @typedef {Record<string, Record<string, MemberModel>>} ObjectModel  each object's members, by name */

/** @param {unknown} v @returns {Array<[string, any]>} */
const entries = (v) => (isPlainObject(v) ? Object.entries(/** @type {object} */ (v)) : []);

/** @param {string[]} names */
const quoted = (names) => names.map((n) => `"${n}"`).join(", ");

/**
 * What one member declares, in the draft's terms.
 * @param {unknown} m
 * @returns {MemberModel}
 */
export function memberModel(m) {
  if (!isPlainObject(m)) return { kind: "value", type: m };
  const o = /** @type {Record<string, unknown>} */ (m);
  const flags = { ...(o.write === true ? { write: true } : {}), ...(o.bump === true ? { bump: true } : {}) };
  if ("value" in o) return { kind: "value", type: o.value, ...flags };
  if ("fn" in o) return { kind: "fn", ...flags };
  if ("keyed" in o) return { kind: "keyed", ...flags };
  return { kind: "other" };
}

/**
 * Every object's members as the definition declares them.
 * @param {Record<string, any>} def
 * @returns {ObjectModel}
 */
export function objectModel(def) {
  /** @type {ObjectModel} */
  const out = {};
  for (const [n, o] of entries(def.objects)) out[n] = Object.fromEntries(entries(o?.members).map(([m, t]) => [m, memberModel(t)]));
  return out;
}

/**
 * Each space's instance object, or null for a pure space; a malformed space is left out (its D012 is reported).
 * @param {Record<string, any>} def
 * @returns {Record<string, string | null>}
 */
export function spaceModel(def) {
  const objects = Object.keys(isPlainObject(def.objects) ? def.objects : {});
  /** @type {Record<string, string | null>} */
  const out = {};
  for (const [n, v] of entries(def.spaces)) {
    if (!isPlainObject(v)) continue;
    if (typeof v.instance === "string" && objects.includes(v.instance)) out[n] = v.instance;
    else if (!("instance" in v) && v.pure === true) out[n] = null;
  }
  return out;
}

/**
 * Every problem in the effect declarations of a Dialect definition.
 * @param {unknown} def
 * @returns {Problem[]}
 */
export function validateEffects(def) {
  /** @type {Problem[]} */
  const out = [];
  if (!isPlainObject(def)) return out;
  const d = /** @type {Record<string, any>} */ (def);
  const objectNames = Object.keys(isPlainObject(d.objects) ? d.objects : {});
  const model = objectModel(d);
  const spaces = spaceModel(d);
  const defer = typeof d.environment === "function";

  for (const [n, v] of entries(d.spaces)) {
    const path = ["spaces", n];
    const tip = `${n}: { pure: true }, or ${n}: { instance: "${objectNames[0] ?? "Obj"}" } for a space whose lambdas are each handed one ${objectNames[0] ?? "Obj"}`;
    if (!isPlainObject(v)) { out.push({ code: "D012", path, message: `space '${n}' must be { pure: true } or { instance: "Obj" }.`, tip }); continue; }
    const hasPure = "pure" in v, hasInstance = "instance" in v;
    if (hasPure && hasInstance) out.push({ code: "D012", path, message: `space '${n}' has both pure and instance; a space has exactly one of pure: true or instance.`, tip });
    else if (!hasPure && !hasInstance) out.push({ code: "D012", path, message: `space '${n}' has neither pure: true nor instance; a space has exactly one of them.`, tip });
    else if (hasPure && v.pure !== true) out.push({ code: "D012", path: [...path, "pure"], message: `space '${n}': pure must be true; a space that changes its instance is an instance space, { instance: "Obj" }.`, tip });
    if (hasInstance && !(typeof v.instance === "string" && objectNames.includes(v.instance))) {
      out.push({ code: "D012", path: [...path, "instance"], message: `space '${n}': instance ${JSON.stringify(v.instance)} is not one of the Dialect's objects.${typeof v.instance === "string" ? didYouMean(v.instance, objectNames) : ""}`, tip: `instance: one of ${quoted(objectNames)}` });
    }
  }

  for (const [n, o] of entries(d.objects)) {
    const path = ["objects", n];
    if (!isPlainObject(o)) continue;
    for (const [m, t] of entries(o.members)) memberProblems(n, m, t, [...path, "members", m], model, out);
    if ("effects" in o && !("call" in o)) out.push({ code: "D021", path: [...path, "effects"], message: `object '${n}' has effects but no call; effects beside an object say what calling it does.`, tip: `add call: { params: [], returns: "f64" }, or move the effects onto a verb, { fn: { … }, effects: [ … ] }` });
    if ("effects" in o) effectListProblems(`object '${n}''s call`, o.effects, [...path, "effects"], model, out);
  }

  for (const [n, i] of entries(d.intrinsics)) {
    if (isPlainObject(i) && "effects" in i) out.push({ code: "D021", path: ["intrinsics", n, "effects"], message: `intrinsic '${n}' has effects; an intrinsic is pure: its ref and every spelling compute a value and change nothing.`, tip: `remove effects; an operation with an effect is a verb on an object the host hands the lambda, { fn: { … }, effects: [ … ] }` });
  }

  if ("helpers" in d) {
    const h = d.helpers;
    if (!isPlainObject(h)) out.push({ code: "D021", path: ["helpers"], message: "helpers must be { may: [ … ] }.", tip: `helpers: { may: ["read Plant"] }` });
    else {
      for (const k of Object.keys(h)) if (k !== "may") out.push({ code: "D021", path: ["helpers", k], message: `helpers takes only may, not '${k}'.${didYouMean(k, ["may"])}`, tip: `helpers: { may: ["read …"] }` });
      if ("may" in h) out.push(...checkMay(h.may, { who: "helpers", instance: null, helpers: true, path: ["helpers", "may"] }, model, { defer }));
    }
  }

  for (const [n, s] of entries(d.slots)) {
    if (!isPlainObject(s) || typeof s.space !== "string" || !(s.space in spaces)) continue;
    const path = ["slots", n];
    if ("may" in s) out.push(...checkMay(s.may, { who: `slot '${n}'`, instance: spaces[s.space], helpers: false, path: [...path, "may"] }, model, { defer }));
    out.push(...paramProblems(n, s.params, spaces[s.space], Object.values(spaces).filter((x) => x !== null), path));
  }

  out.push(...reachProblems(d, Object.values(spaces).filter((x) => x !== null)));
  return out;
}

/**
 * D021 for one member's write / bump / effects.
 * @param {string} o @param {string} m @param {unknown} t @param {Array<string | number>} path @param {ObjectModel} model @param {Problem[]} out
 */
function memberProblems(o, m, t, path, model, out) {
  if (!isPlainObject(t)) return;
  const x = /** @type {Record<string, unknown>} */ (t);
  const where = `member ${o}.${m}`;
  const hasWrite = "write" in x, hasBump = "bump" in x;
  if (hasWrite && hasBump) out.push({ code: "D021", path, message: `${where} has both write and bump; a member is writable (write: true) or a total (bump: true), not both.`, tip: `keep one: { value: "f64", write: true } or { value: "f64", bump: true }` });
  if ((hasWrite || hasBump) && !("value" in x)) out.push({ code: "D021", path, message: `${where}: ${hasWrite ? "write" : "bump"} goes only on a value member, { value: … }.`, tip: `remove ${hasWrite ? "write" : "bump"}; a verb says what it changes in effects: [ … ]` });
  else {
    if (hasWrite && x.write !== true) out.push({ code: "D021", path, message: `${where}: write must be true when present.`, tip: `{ value: …, write: true }, or leave write out for a read-only member` });
    if (hasBump && x.bump !== true) out.push({ code: "D021", path, message: `${where}: bump must be true when present.`, tip: `{ value: "f64", bump: true }` });
    if (x.bump === true && x.value !== "f64") out.push({ code: "D021", path, message: `${where}: a total (bump: true) is an "f64", not ${JSON.stringify(x.value)}.`, tip: `{ value: "f64", bump: true }` });
  }
  if ("effects" in x) {
    if (!("fn" in x)) out.push({ code: "D021", path, message: `${where}: effects go only on a verb, { fn: { … }, effects: [ … ] }.`, tip: "remove effects" });
    else effectListProblems(`verb ${o}.${m}`, x.effects, path, model, out);
  }
}

/**
 * D021 for a verb's or a call's `effects`: a list of effects naming known verbs, objects and members.
 * @param {string} who @param {unknown} list @param {Array<string | number>} path @param {ObjectModel} model @param {Problem[]} out
 */
function effectListProblems(who, list, path, model, out) {
  if (!Array.isArray(list)) { out.push({ code: "D021", path, message: `${who}: effects must be a list of effects such as "destroy Plant" or "rng".`, tip: `effects: ["destroy Plant"]` }); return; }
  for (const e of list) {
    const p = parseEffect(e);
    if (!p) { out.push({ code: "D021", path, message: `${who}: ${JSON.stringify(e)} is not an effect: write "verb", "verb Obj" or "verb Obj.member".`, tip: `one of ${VERBS.join(", ")}, as "destroy Plant" or "rng"` }); continue; }
    if (!VERBS.includes(p.verb)) { out.push({ code: "D021", path, message: `${who}: '${p.verb}' in ${JSON.stringify(e)} is not an effect verb.${didYouMean(p.verb, [...VERBS])}`, tip: `one of ${VERBS.join(", ")}` }); continue; }
    if (p.object !== undefined && !(p.object in model)) out.push({ code: "D021", path, message: `${who}: ${JSON.stringify(e)} names '${p.object}', which is not one of the Dialect's objects.${didYouMean(p.object, Object.keys(model))}`, tip: `name one of ${quoted(Object.keys(model))}` });
  }
}

/**
 * D021 and D022 for one `may` list: each pattern names a known verb, object and member, a non-read stays out of pure
 * spaces and helpers, a write or destroy names the space's instance, and no total is both read and bumped.
 * @param {unknown} may
 * @param {{ who: string, instance: string | null, helpers: boolean, path: Array<string | number> }} where
 * @param {ObjectModel} model
 * @param {{ defer?: boolean, perProgram?: boolean }} [options]  `defer`: a member or kind of member the definition lacks may come from environment(program), so check it when lowering; `perProgram`: checked when lowering, where an object with no writable member or total is only a Program that declared none
 * @returns {Problem[]}
 */
export function checkMay(may, where, model, { defer = false, perProgram = false } = {}) {
  /** @type {Problem[]} */
  const out = [];
  const { who, instance, path } = where;
  const bad = (/** @type {string} */ message, /** @type {string} */ tip, code = "D021") => out.push({ code, path, message: `${who}: ${message}`, tip });
  if (!Array.isArray(may)) { bad(`may must be a list of effect patterns, not ${JSON.stringify(may)}.`, `may: ["read Totals"]`); return out; }
  /** @type {Array<{ verb: string, object?: string, member?: string, text: string }>} */
  const parsed = [];
  for (const text of may) {
    const p = parseEffect(text);
    if (!p) { bad(`${JSON.stringify(text)} is not an effect pattern: write "verb", "verb Obj" or "verb Obj.member".`, `as "write Plant", "read Totals.harvest" or "rng"`); continue; }
    if (!VERBS.includes(p.verb)) { bad(`'${p.verb}' in "${text}" is not an effect verb.${didYouMean(p.verb, [...VERBS])}`, `one of ${VERBS.join(", ")}`); continue; }
    if (where.helpers && p.verb !== "read") { bad(`"${text}" is not a read; a helper may only read (helpers takes reads only).`, `helpers: { may: ["read …"] }; do the ${p.verb} in the lambda that calls the helper`); continue; }
    if (!where.helpers && instance === null && p.verb !== "read") { bad(`"${text}" is not a read, and a slot in a pure space may list only reads${p.verb === "bump" ? ": a bump is allowed only in an instance space" : ""}.`, `remove it, or run the slot in an instance space, { instance: "Obj" }`); continue; }
    if (p.verb === "rng") { if (p.object !== undefined) bad(`"${text}": rng takes no object.`, `write "rng"`); else parsed.push({ ...p, text }); continue; }
    if (p.object === undefined) { if (p.verb === "read") parsed.push({ ...p, text }); else bad(`"${text}" names no object; a ${p.verb} names what it changes.`, `write "${p.verb} ${instance ?? "Obj"}"`); continue; }
    if (!(p.object in model)) { bad(`"${text}" names '${p.object}', which is not one of the Dialect's objects.${didYouMean(p.object, Object.keys(model))}`, `name one of ${quoted(Object.keys(model))}`); continue; }
    if ((p.verb === "write" || p.verb === "destroy") && p.object !== instance) {
      bad(`"${text}": a ${p.verb} of ${p.object} may appear only in a slot whose space's instance is ${p.object}${instance ? `, and this slot's is ${instance}` : ""}.`, instance ? `write "${p.verb} ${instance}…", or move the slot to a space { instance: "${p.object}" }` : `move the slot to a space { instance: "${p.object}" }`, "D022");
      continue;
    }
    if (p.verb === "destroy" && p.member !== undefined) { bad(`"${text}": destroy names an object, not a member.`, `write "destroy ${p.object}"`); continue; }
    const members = model[p.object];
    if (p.member !== undefined) {
      const m = members[p.member];
      if (!m) { if (!defer) bad(`"${text}" names '${p.member}', which is not a member of ${p.object}.${didYouMean(p.member, Object.keys(members))}`, `name one of ${quoted(Object.keys(members))}`); parsed.push({ ...p, text }); continue; }
      if (p.verb === "write" && !m.write) { bad(`"${text}": ${p.object}.${p.member} is not writable.`, `declare it { value: …, write: true }, or leave the write out`); continue; }
      if (p.verb === "bump" && !m.bump) { bad(`"${text}": ${p.object}.${p.member} is not a total.`, `declare it { value: "f64", bump: true }, or leave the bump out`); continue; }
    } else if (p.verb === "write" || p.verb === "bump") {
      const has = Object.values(members).some((m) => (p.verb === "write" ? m.write : m.bump));
      if (!has && !defer && !perProgram) { bad(`"${text}": ${p.object} has no ${p.verb === "write" ? "writable member" : "total"}.`, p.verb === "write" ? `declare a member { value: …, write: true }` : `declare a member { value: "f64", bump: true }`); continue; }
    }
    parsed.push({ ...p, text });
  }
  for (const r of parsed.filter((p) => p.verb === "read")) {
    for (const b of parsed.filter((p) => p.verb === "bump")) {
      if (overlap(r, b)) bad(`it may both read ("${r.text}") and bump ("${b.text}") a total; no slot may do both, so no lambda sees another's bump.`, `keep the bump here and read the total in another slot, or narrow the read to members that are not totals`);
    }
  }
  return out;
}

/**
 * D022 for a slot's parameters: a slot in an instance space takes its instance exactly once, and no slot takes an
 * instance object otherwise (outside its space, or inside another type).
 * @param {string} n @param {unknown} params @param {string | null} instance @param {string[]} instances @param {Array<string | number>} path
 * @returns {Problem[]}
 */
export function paramProblems(n, params, instance, instances, path) {
  /** @type {Problem[]} */
  const out = [];
  if (!Array.isArray(params)) return out;
  for (const o of instances) {
    const direct = params.filter((t) => t === o).length;
    const nested = params.some((t) => t !== o && mentions(t, o));
    if (o === instance) {
      if (direct !== 1) out.push({ code: "D022", path: [...path, "params"], message: `slot '${n}' runs in ${o}'s instance space, so it takes a ${o} exactly once, not ${direct === 0 ? "never" : `${direct} times`}.`, tip: `params: ["${o}", …]: the one ${o} its lambda may change` });
    } else if (direct > 0) out.push({ code: "D022", path: [...path, "params"], message: `slot '${n}' takes a ${o}, but only a slot in ${o}'s instance space may.`, tip: `remove the ${o}, or run the slot in a space { instance: "${o}" }` });
    if (nested) out.push({ code: "D022", path: [...path, "params"], message: `slot '${n}' takes a ${o} inside another type; a lambda is handed a ${o} only as its slot's own parameter.`, tip: `pass the ${o} itself, once, in a space { instance: "${o}" }` });
  }
  return out;
}

/**
 * Whether a type, written in the definition's terms, holds the object `o` (a list item, an optional, a struct field,
 * a union member, an object(label, members) member).
 * @param {unknown} t @param {string} o
 * @returns {boolean}
 */
export function mentions(t, o) {
  if (t === o) return true;
  const k = kindOf(t);
  const x = /** @type {any} */ (t);
  if (k === "list" || k === "opt") return mentions(x.of, o);
  if (k === "union") return Array.isArray(x.of) && x.of.some((/** @type {unknown} */ u) => mentions(u, o));
  if (k === "struct") return isPlainObject(x.fields) && Object.values(x.fields).some((f) => mentions(f, o));
  if (k === "object") return isPlainObject(x.members) && Object.values(x.members).some((m) => memberMentions(m, o));
  return false;
}

/** A member that can hand a lambda an `o`: its value, or a method's result. @param {unknown} m @param {string} o */
export function memberMentions(m, o) {
  if (!isPlainObject(m)) return mentions(m, o);
  const x = /** @type {any} */ (m);
  if ("value" in x) return mentions(x.value, o);
  if ("fn" in x) return isPlainObject(x.fn) && mentions(x.fn.returns, o);
  if ("keyed" in x) return isPlainObject(x.keyed) && isPlainObject(x.keyed.keys) && Object.values(x.keyed.keys).some((s) => isPlainObject(s) && mentions(/** @type {any} */ (s).returns, o));
  return false;
}

/**
 * D022 for every other way an instance could reach a lambda: a member or method result, a global, a list member, an
 * intrinsic's result or an object's call result of the instance's type, or holding it. Also run on what
 * environment(program) returns ({ objects, globals }).
 * @param {Record<string, any>} d @param {string[]} instances
 * @returns {Problem[]}
 */
export function reachProblems(d, instances) {
  /** @type {Problem[]} */
  const out = [];
  for (const o of instances) {
    const why = `only a slot in ${o}'s instance space is handed a ${o}, so a lambda cannot reach a second one to change it`;
    const tip = `remove it, or give it a type that is not ${o}`;
    for (const [n, obj] of entries(d.objects)) {
      for (const [m, t] of entries(obj?.members)) if (memberMentions(t, o)) out.push({ code: "D022", path: ["objects", n, "members", m], message: `member ${n}.${m} gives a ${o}; ${why}.`, tip });
      if (isPlainObject(obj?.call) && mentions(obj.call.returns, o)) out.push({ code: "D022", path: ["objects", n, "call"], message: `calling object ${n} gives a ${o}; ${why}.`, tip });
    }
    for (const [n, t] of entries(d.globals)) if (mentions(t, o)) out.push({ code: "D022", path: ["globals", n], message: `global '${n}' holds a ${o}; ${why}.`, tip });
    for (const [n, t] of entries(d.list)) if (memberMentions(t, o)) out.push({ code: "D022", path: ["list", n], message: `list member '${n}' gives a ${o}; ${why}.`, tip });
    for (const [n, i] of entries(d.intrinsics)) if (isPlainObject(i) && mentions(i.returns, o)) out.push({ code: "D022", path: ["intrinsics", n], message: `intrinsic '${n}' returns a ${o}; ${why}.`, tip });
  }
  return out;
}
