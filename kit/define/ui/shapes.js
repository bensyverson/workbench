// What a UI reads of the run's state: the Dialect's declared state Type (kit/define/state.js), as paths ("bounds.width")
// and as the member chains a lambda writes (`s.bodies.length`, `row.speed`). A path stops at a list; a chain may use a
// list's `length` and items, a struct's fields and a vector's components by name.

import { didYouMean } from "../codes.js";

/** @import { Type } from "../../ir/ir.js" */

/**
 * What a Type is, as a UI reader says it: "number" (f32, f64, a nominal scalar), "string" (str, an enum), "boolean",
 * "list", "object" (a struct), "vector", or "other". An optional is what it wraps.
 * @param {Type | null | undefined} t
 * @returns {"number" | "string" | "boolean" | "list" | "object" | "vector" | "other"}
 */
export function kindOf(t) {
  if (t === null || t === undefined) return "other";
  if (t === "f32" || t === "f64") return "number";
  if (t === "str") return "string";
  if (t === "bool") return "boolean";
  if (typeof t !== "object") return "other";
  if ("opt" in t) return kindOf(t.opt);
  if ("scalar" in t) return "number";
  if ("enum" in t) return "string";
  if ("list" in t) return "list";
  if ("struct" in t) return "object";
  if ("vec" in t) return "vector";
  return "other";
}

/** The kinds a lambda's parameter may be used whole: a leaf (a table over a list of strings hands the row itself). */
export const LEAVES = ["number", "string", "boolean"];

/** @param {Type} t @returns {Type} */
const unwrap = (t) => (typeof t === "object" && "opt" in t ? unwrap(t.opt) : t);

/** A reader's word for a kind. @param {string} k */
export const describe = (k) => (k === "list" ? "a list" : k === "object" ? "an object" : k === "vector" ? "a vector" : k === "other" ? "a value of no simple type" : `a ${k}`);

/** The component names of a vector Type (x, y, z, w), plus its declared aliases. @param {any} v @param {Record<string, Record<string, string>>} aliases */
function components(v, aliases) {
  return [..."xyzw".slice(0, v.vec), ...Object.keys(aliases[v.name] ?? {})];
}

/**
 * Resolves a path string ("bounds.width") in `root`. A path stops at a list.
 * @param {Type} root @param {string} path @param {Record<string, Record<string, string>>} aliases  the Dialect's vector component aliases
 * @returns {{ type: Type } | { error: string, fix: string }}
 */
export function resolvePath(root, path, aliases) {
  /** @type {Type} */
  let s = root;
  /** @type {string[]} */
  const done = [];
  for (const seg of path.split(".")) {
    s = unwrap(s);
    const k = kindOf(s);
    if (k === "list") return { error: `'${path}' reads into the list '${done.join(".")}'; a path stops at a list`, fix: `show '${done.join(".")}' in a table, with '${seg}' as a column` };
    const names = k === "object" ? Object.keys(/** @type {any} */ (s).struct) : k === "vector" ? components(s, aliases) : null;
    if (!names) return { error: `'${path}': '${done.join(".")}' is ${describe(k)}, which has no '${seg}'`, fix: `use the path '${done.join(".")}'` };
    if (!names.includes(seg) || (k === "object" && !Object.hasOwn(/** @type {any} */ (s).struct, seg))) {
      return { error: `'${path}' names nothing in the state: ${done.length ? `'${done.join(".")}'` : "the state"} has no '${seg}'.${didYouMean(seg, names)}`, fix: `use one of: ${names.map((n) => [...done, n].join(".")).join(", ")}` };
    }
    done.push(seg);
    s = k === "object" ? /** @type {any} */ (s).struct[seg] : "f64";
  }
  return { type: s };
}

/**
 * Resolves a member chain read in a lambda (`s.particles.length`, `row.live`): struct fields; on a list, `length`
 * (a number) or an index ("[]") into its item; on a vector, a component by name. A string has no members and a vector no
 * index, as in kit/lower (a type's members here are what lowering accepts, so a chain that passes here is never L002 there).
 * @param {Type} root @param {string} rootName @param {string[]} segs  "[]" for a computed member
 * @param {Record<string, Record<string, string>>} aliases
 * @returns {string | null}  the problem, or null
 */
export function resolveChain(root, rootName, segs, aliases) {
  /** @type {Type} */
  let s = root;
  let text = rootName;
  for (const seg of segs) {
    s = unwrap(s);
    const k = kindOf(s);
    if (k === "object") {
      const fields = /** @type {any} */ (s).struct;
      if (seg === "[]") return `${text} is an object; read its members by name`;
      if (!Object.hasOwn(fields, seg)) return `${text} has no member '${seg}'.${didYouMean(seg, Object.keys(fields))}`;
      s = fields[seg];
    } else if (k === "list") {
      if (seg === "length") s = "f64";
      else if (seg === "[]") s = /** @type {any} */ (s).list;
      else return `${text} is a list; it has 'length' and items by index, not '${seg}'`;
    } else if (k === "vector" && components(s, aliases).includes(seg)) {
      s = "f64";
    } else {
      return `${text} is ${describe(k)}, which has no member '${seg}'`;
    }
    text += seg === "[]" ? "[…]" : `.${seg}`;
  }
  return null;
}

/**
 * Whether the member chain `segs` under `root` ends at a list the Dialect declared with no max (`list(type)` in state).
 * A chain that does not resolve is not one: resolveChain says why.
 * @param {Type} root @param {string[]} segs @param {Record<string, Record<string, string>>} aliases
 * @returns {boolean}
 */
export function openListAt(root, segs, aliases) {
  /** @type {Type} */
  let s = root;
  for (const [i, seg] of segs.entries()) {
    if (resolveChain(s, "", [seg], aliases) !== null) return false;
    s = unwrap(s);
    const k = kindOf(s);
    s = k === "object" ? /** @type {any} */ (s).struct[seg] : k === "list" ? (seg === "[]" ? /** @type {any} */ (s).list : "f64") : "f64";
    if (i === segs.length - 1) break;
  }
  const end = unwrap(s);
  return kindOf(end) === "list" && /** @type {any} */ (end).max === undefined;
}
