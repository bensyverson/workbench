// A Dialect's `state`: the shape of the RUN's state (the value text(state) and the UI's views are handed), not a
// Grammar construct's build-time state. Declared in the Dialect's own type vocabulary, so it resolves to core
// Types. Checking the declaration (D023), resolving it, and checking a value against it by path.

import { checkType } from "./types.js";
import { TAG, tagged, isPlainObject, describe } from "./tags.js";

/** @import { Type } from "../ir/ir.js" */
/** @import { Problem, TypeScope } from "./types.js" */

const TIP = `state: { score: "f64", player: struct({ x: "f64", y: "f64" }), bodies: list(struct({ mass: "f64" }), 100) }`;

/**
 * Every D023 for a Dialect's `state`. Members are types, never objects (a run's state is data).
 * `own: false` judges a Program's added fields, none of which may be extensible (a state has one extensible struct).
 * @param {unknown} state @param {TypeScope} scope @param {{ own?: boolean }} [opts] @returns {Problem[]}
 */
export function validateState(state, scope, { own: dialectOwn = true } = {}) {
  /** @type {Problem[]} */
  const out = [];
  if (!isPlainObject(state)) return [{ code: "D023", path: ["state"], message: `state must be an object of the run's members, not ${describe(state)}.`, tip: TIP }];
  if (Object.keys(state).length === 0) return [{ code: "D023", path: ["state"], message: "state declares no members.", tip: `declare what a run holds, or leave state out: ${TIP}` }];
  const noObjects = { types: scope.types, objects: new Set() };
  /** The path of each struct marked extensible. @type {Array<Array<string | number>>} */
  const marks = [];
  for (const [k, t] of Object.entries(state)) {
    const path = ["state", k];
    if (isPlainObject(t)) {
      out.push({ code: "D023", path, message: `state.${k} is a nested plain object; a nested object is a struct.`, tip: `write ${k}: struct({ … }) with the fields' types` });
      continue;
    }
    const own = out.length;
    walkTags(t, path, out, marks);
    if (out.length > own) continue;
    /** @type {Problem[]} */
    const found = [];
    checkType(t, noObjects, { openList: true, extensible: true }, path, `state member '${k}'`, found);
    out.push(...found.map((p) => ({ ...p, code: "D023" })));
  }
  if (!dialectOwn) for (const m of marks) out.push({ code: "D023", path: m, message: "a field a Program declares is not extensible: a state has one extensible struct, the Dialect's, and the Program's fields go in it.", tip: "remove { extensible: true } from the Program's field type" });
  else if (marks.length > 1) out.push({ code: "D023", path: marks[1], message: `state marks more than one extensible struct (${marks.map((m) => m.slice(1).join(".")).join(", ")}); a Dialect marks one extensible struct, where a Program's declarations add their fields.`, tip: "keep { extensible: true } on the one struct a Program's own data belongs in" });
  return out;
}

/**
 * Struct fields that are nested plain objects, an empty struct (unless extensible), object() types, which a state may
 * not hold, and an extensible struct inside a union. Each extensible struct's path goes in `marks`.
 * @param {unknown} t @param {Array<string | number>} path @param {Problem[]} out @param {Array<Array<string | number>>} marks
 * @param {boolean} [inUnion]
 */
function walkTags(t, path, out, marks, inUnion = false) {
  if (t === "void" || t === "null") {
    out.push({ code: "D023", path, message: `'${t}' is not a state type: a run's state holds values, and ${t} holds none.`, tip: t === "null" ? "write opt(type) for a value that may be absent" : "leave the member out, or give it a type such as \"f64\"" });
    return;
  }
  const h = tagged(t);
  if (!h) return;
  switch (h[TAG]) {
    case "list": case "opt": walkTags(h.of, path, out, marks, inUnion); return;
    case "union": for (const x of h.of) walkTags(x, path, out, marks, true); return;
    case "object": out.push({ code: "D023", path, message: "state holds data, not objects: object() is not a state type.", tip: "write struct({ … }) for a group of fields" }); return;
    case "struct": {
      if (!isPlainObject(h.fields)) return;
      const ext = isExtensible(h);
      if (ext && inUnion) out.push({ code: "D023", path, message: "an extensible struct may not sit inside a union: a Program's fields need one place to go.", tip: "move { extensible: true } to a struct outside the union" });
      if (ext) marks.push(path);
      if (Object.keys(h.fields).length === 0 && !ext) out.push({ code: "D023", path, message: "a struct in state declares no fields.", tip: `struct({ x: "f64" })` });
      for (const [f, v] of Object.entries(h.fields)) {
        if (isPlainObject(v)) out.push({ code: "D023", path: [...path, f], message: `state field '${f}' is a nested plain object; a nested object is a struct.`, tip: `write ${f}: struct({ … })` });
        else walkTags(v, [...path, f], out, marks, inUnion);
      }
    }
  }
}

/** Whether a struct() tag is marked `{ extensible: true }`. @param {any} h */
const isExtensible = (h) => isPlainObject(h.options) && h.options.extensible === true;

/**
 * The extensible struct of a state, as declared and as resolved (the same struct object `resolved` holds), or null.
 * Walks the declaration and its resolved Type together: struct members, list items and opt.
 * @param {Record<string, unknown>} decl  the Dialect's `state` @param {Type} resolved  its stateType
 * @returns {Type | null}
 */
export function extensibleOf(decl, resolved) {
  /** @param {unknown} d @param {Type} r @returns {Type | null} */
  const walk = (d, r) => {
    const h = tagged(d);
    if (!h || typeof r === "string") return null;
    if (h[TAG] === "struct" && "struct" in r) {
      if (isExtensible(h)) return r;
      for (const [k, v] of Object.entries(/** @type {Record<string, unknown>} */ (h.fields))) { const f = walk(v, r.struct[k]); if (f) return f; }
      return null;
    }
    if (h[TAG] === "list" && "list" in r) return walk(h.of, /** @type {Type} */ (r.list));
    if (h[TAG] === "opt" && "opt" in r) return walk(h.of, r.opt);
    return null;
  };
  for (const [k, v] of Object.entries(decl)) {
    const f = walk(v, /** @type {any} */ (resolved).struct[k]);
    if (f) return f;
  }
  return null;
}

/**
 * The state Type with `fields` added to its extensible struct (`target`, an object inside `type`), in a copy, and
 * the copy's extended struct.
 * @param {Type} type @param {Type} target @param {Record<string, Type>} fields
 * @returns {{ type: Type, extended: Type }}
 */
export function extendState(type, target, fields) {
  /** @type {Type} */
  let extended = target;
  /** @param {Type} t @returns {Type} */
  const walk = (t) => {
    if (t === target) {
      extended = { .../** @type {any} */ (t), struct: { .../** @type {any} */ (t).struct, ...fields } };
      return extended;
    }
    if (typeof t === "string") return t;
    if ("struct" in t) return { ...t, struct: Object.fromEntries(Object.entries(t.struct).map(([k, v]) => [k, walk(v)])) };
    if ("list" in t) return { ...t, list: walk(/** @type {Type} */ (t.list)) };
    if ("opt" in t) return { ...t, opt: walk(t.opt) };
    return t;
  };
  return { type: walk(type), extended };
}

/**
 * One mismatch. `outside` marks a field inside the extensible struct that the Program does not declare: memory kept
 * outside the Program's state (a run reports it as N003).
 * @typedef {{ path: string, message: string, outside?: true }} StateMismatch
 */
/**
 * The extensible struct, when a check knows of one: `strict` (the Program is known) reports a field it lacks as
 * outside; otherwise a field it lacks is let through, as a Program's own.
 * @typedef {{ struct: Type, strict: boolean }} OpenStruct
 */

/** The path a mismatch is reported at: `player.x`, `bodies[1].mass`; the root is "". @param {string} base @param {string | number} k */
const at = (base, k) => (typeof k === "number" ? `${base}[${k}]` : base === "" ? k : `${base}.${k}`);

/**
 * Every place `value` does not fit `type`, each as { path, message }.
 * @param {Type} type @param {unknown} value @param {string} [path] @param {StateMismatch[]} [out] @param {OpenStruct | null} [open]
 * @returns {StateMismatch[]}
 */
export function checkStateValue(type, value, path = "", out = [], open = null) {
  /** @param {string} want */
  const bad = (want) => { out.push({ path, message: `expected ${want}, got ${describeValue(value)}` }); return out; };
  if (typeof type === "string") {
    switch (type) {
      case "f32": case "f64": return typeof value === "number" && Number.isFinite(value) ? out : bad(`${type}, a finite number`);
      case "bool": return typeof value === "boolean" ? out : bad("bool");
      case "str": return typeof value === "string" ? out : bad("str");
      case "null": return value === null ? out : bad("null");
      default: return out;
    }
  }
  if ("opt" in type) return value === null || value === undefined ? out : checkStateValue(type.opt, value, path, out, open);
  if ("scalar" in type) return typeof value === "number" && Number.isFinite(value) ? out : bad(`${type.scalar}, a finite number`);
  if ("vec" in type) {
    const ok = Array.isArray(value) && value.length === type.vec && value.every((c) => typeof c === "number" && Number.isFinite(c));
    return ok ? out : bad(`${type.name ?? "a vector"}, an array of ${type.vec} numbers`);
  }
  if ("enum" in type) return typeof value === "string" && type.enum.includes(value) ? out : bad(`one of ${type.enum.map((v) => JSON.stringify(v)).join(", ")}`);
  if ("union" in type) return type.union.some((m) => checkStateValue(m, value, path, [], open).length === 0) ? out : bad("one of the union's types");
  if ("list" in type) {
    if (!Array.isArray(value)) return bad("a list");
    if (type.max !== undefined && value.length > type.max) out.push({ path, message: `a list of at most ${type.max} items, got ${value.length}` });
    value.forEach((v, i) => checkStateValue(/** @type {Type} */ (type.list), v, at(path, i), out, open));
    return out;
  }
  if ("struct" in type) {
    if (!isPlainObject(value)) return bad("an object");
    const optional = new Set(type.optional ?? []);
    for (const [f, ft] of Object.entries(type.struct)) {
      if (!Object.hasOwn(value, f)) { if (!optional.has(f) && !(typeof ft === "object" && "opt" in ft)) out.push({ path: at(path, f), message: "missing" }); continue; }
      checkStateValue(ft, value[f], at(path, f), out, open);
    }
    const isOpen = open !== null && open.struct === type;
    for (const f of Object.keys(value)) {
      if (Object.hasOwn(type.struct, f)) continue;
      if (!isOpen) out.push({ path: at(path, f), message: "not a declared member" });
      else if (open.strict) out.push({ path: at(path, f), message: "not a field the Program declares (its declarations add the extensible struct's fields; declare it, or keep it out of the state)", outside: true });
    }
    return out;
  }
  return out;
}

/** @param {unknown} v */
function describeValue(v) {
  if (v === null) return "null";
  if (Array.isArray(v)) return `an array of ${v.length}`;
  if (typeof v === "number") return Number.isNaN(v) ? "NaN" : String(v);
  if (typeof v === "string") return JSON.stringify(v.length > 20 ? `${v.slice(0, 20)}…` : v);
  return typeof v === "object" ? "an object" : typeof v;
}

/**
 * The error text a Dialect's text(state) throws on a value that does not fit: every mismatch, by path.
 * @param {string} dialect @param {StateMismatch[]} mismatches
 */
export function stateErrorMessage(dialect, mismatches) {
  return `the ${dialect} Dialect's state does not match its declared state:\n${mismatches.map((m) => `  ${m.path === "" ? "(state)" : m.path}: ${m.message}`).join("\n")}`;
}
