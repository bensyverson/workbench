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
 * @param {unknown} state @param {TypeScope} scope @returns {Problem[]}
 */
export function validateState(state, scope) {
  /** @type {Problem[]} */
  const out = [];
  if (!isPlainObject(state)) return [{ code: "D023", path: ["state"], message: `state must be an object of the run's members, not ${describe(state)}.`, tip: TIP }];
  if (Object.keys(state).length === 0) return [{ code: "D023", path: ["state"], message: "state declares no members.", tip: `declare what a run holds, or leave state out: ${TIP}` }];
  const noObjects = { types: scope.types, objects: new Set() };
  for (const [k, t] of Object.entries(state)) {
    const path = ["state", k];
    if (isPlainObject(t)) {
      out.push({ code: "D023", path, message: `state.${k} is a nested plain object; a nested object is a struct.`, tip: `write ${k}: struct({ … }) with the fields' types` });
      continue;
    }
    const own = out.length;
    walkTags(t, path, out);
    if (out.length > own) continue;
    /** @type {Problem[]} */
    const found = [];
    checkType(t, noObjects, {}, path, `state member '${k}'`, found);
    out.push(...found.map((p) => ({ ...p, code: "D023" })));
  }
  return out;
}

/**
 * Struct fields that are nested plain objects, an empty struct, and object() types, which a state may not hold.
 * @param {unknown} t @param {Array<string | number>} path @param {Problem[]} out
 */
function walkTags(t, path, out) {
  if (t === "void" || t === "null") {
    out.push({ code: "D023", path, message: `'${t}' is not a state type: a run's state holds values, and ${t} holds none.`, tip: t === "null" ? "write opt(type) for a value that may be absent" : "leave the member out, or give it a type such as \"f64\"" });
    return;
  }
  const h = tagged(t);
  if (!h) return;
  switch (h[TAG]) {
    case "list": case "opt": walkTags(h.of, path, out); return;
    case "union": for (const x of h.of) walkTags(x, path, out); return;
    case "object": out.push({ code: "D023", path, message: "state holds data, not objects: object() is not a state type.", tip: "write struct({ … }) for a group of fields" }); return;
    case "struct":
      if (!isPlainObject(h.fields)) return;
      if (Object.keys(h.fields).length === 0) out.push({ code: "D023", path, message: "a struct in state declares no fields.", tip: `struct({ x: "f64" })` });
      for (const [f, v] of Object.entries(h.fields)) {
        if (isPlainObject(v)) out.push({ code: "D023", path: [...path, f], message: `state field '${f}' is a nested plain object; a nested object is a struct.`, tip: `write ${f}: struct({ … })` });
        else walkTags(v, [...path, f], out);
      }
  }
}

/** @typedef {{ path: string, message: string }} StateMismatch */

/** The path a mismatch is reported at: `player.x`, `bodies[1].mass`; the root is "". @param {string} base @param {string | number} k */
const at = (base, k) => (typeof k === "number" ? `${base}[${k}]` : base === "" ? k : `${base}.${k}`);

/**
 * Every place `value` does not fit `type`, each as { path, message }.
 * @param {Type} type @param {unknown} value @param {string} [path] @param {StateMismatch[]} [out] @returns {StateMismatch[]}
 */
export function checkStateValue(type, value, path = "", out = []) {
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
  if ("opt" in type) return value === null || value === undefined ? out : checkStateValue(type.opt, value, path, out);
  if ("scalar" in type) return typeof value === "number" && Number.isFinite(value) ? out : bad(`${type.scalar}, a finite number`);
  if ("vec" in type) {
    const ok = Array.isArray(value) && value.length === type.vec && value.every((c) => typeof c === "number" && Number.isFinite(c));
    return ok ? out : bad(`${type.name ?? "a vector"}, an array of ${type.vec} numbers`);
  }
  if ("enum" in type) return typeof value === "string" && type.enum.includes(value) ? out : bad(`one of ${type.enum.map((v) => JSON.stringify(v)).join(", ")}`);
  if ("union" in type) return type.union.some((m) => checkStateValue(m, value, path).length === 0) ? out : bad("one of the union's types");
  if ("list" in type) {
    if (!Array.isArray(value)) return bad("a list");
    if (type.max !== undefined && value.length > type.max) out.push({ path, message: `a list of at most ${type.max} items, got ${value.length}` });
    value.forEach((v, i) => checkStateValue(/** @type {Type} */ (type.list), v, at(path, i), out));
    return out;
  }
  if ("struct" in type) {
    if (!isPlainObject(value)) return bad("an object");
    const optional = new Set(type.optional ?? []);
    for (const [f, ft] of Object.entries(type.struct)) {
      if (!Object.hasOwn(value, f)) { if (!optional.has(f) && !(typeof ft === "object" && "opt" in ft)) out.push({ path: at(path, f), message: "missing" }); continue; }
      checkStateValue(ft, value[f], at(path, f), out);
    }
    for (const f of Object.keys(value)) if (!Object.hasOwn(type.struct, f)) out.push({ path: at(path, f), message: "not a declared member" });
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
