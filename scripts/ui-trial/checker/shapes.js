// The declared state: its shape (the Grammar's shapes: "number" "string" "boolean", an object of shapes,
// listOf(shape)) and the paths and member chains that read it.

import { TAG } from "../../../kit/define/tags.js";
import { didYouMean } from "../../../kit/define/index.js";

/** @typedef {{ kind: "number" | "string" | "boolean" } | { kind: "list", of: Shape } | { kind: "object", keys: Record<string, Shape> }} Shape */

export const LEAVES = ["number", "string", "boolean"];

/** A problem found in a state declaration: where (a path of keys under `state`) and what. */
/** @typedef {{ at: Array<string | number>, message: string, fix: string }} ShapeProblem */

/**
 * Reads a declared shape; problems go to `out`. Returns null where the declaration is not a shape.
 * @param {unknown} v @param {Array<string | number>} at @param {ShapeProblem[]} out @returns {Shape | null}
 */
export function readShape(v, at, out) {
  if (typeof v === "string") {
    if (LEAVES.includes(v)) return { kind: /** @type {"number" | "string" | "boolean"} */ (v) };
    const mean = didYouMean(v, LEAVES);
    out.push({ at, message: `'${v}' is not a state shape.${mean}`, fix: `write "number", "string" or "boolean"${v === "f64" || v === "f32" ? ' (a state number is "number")' : ""}` });
    return null;
  }
  if (Array.isArray(v)) {
    out.push({ at, message: "an array literal is not a state shape", fix: `write listOf(${typeof v[0] === "string" ? JSON.stringify(v[0]) : "{ … }"}) for a list` });
    return null;
  }
  if (v && typeof v === "object") {
    const tagged = /** @type {Record<symbol, unknown>} */ (v)[TAG];
    if (tagged === "listOf") {
      const of = readShape(/** @type {{ of: unknown }} */ (v).of, at, out);
      return of && { kind: "list", of };
    }
    if (tagged !== undefined) {
      out.push({ at, message: `${String(tagged)}(…) is not a state shape`, fix: 'use "number", "string", "boolean", an object of shapes or listOf(shape)' });
      return null;
    }
    /** @type {Record<string, Shape>} */
    const keys = {};
    let ok = true;
    for (const [k, s] of Object.entries(v)) {
      const r = readShape(s, [...at, k], out);
      if (r) keys[k] = r; else ok = false;
    }
    return ok ? { kind: "object", keys } : null;
  }
  out.push({ at, message: `${JSON.stringify(v) ?? String(v)} is not a state shape`, fix: 'use "number", "string", "boolean", an object of shapes or listOf(shape)' });
  return null;
}

/** A shape's kind as a reader says it. @param {Shape} s */
export const describe = (s) => (s.kind === "list" ? "a list" : s.kind === "object" ? "an object" : `a ${s.kind}`);

/**
 * Resolves a path string ("bounds.width") in `root`. A path stops at a list.
 * @param {Shape} root @param {string} path
 * @returns {{ shape: Shape } | { error: string, fix: string }}
 */
export function resolvePath(root, path) {
  const segs = path.split(".");
  /** @type {Shape} */
  let s = root;
  /** @type {string[]} */
  const done = [];
  for (const seg of segs) {
    if (s.kind === "list") return { error: `'${path}' reads into the list '${done.join(".")}'; a path stops at a list`, fix: `show '${done.join(".")}' in a table, with '${seg}' as a column` };
    if (s.kind !== "object") return { error: `'${path}': '${done.join(".")}' is ${describe(s)}, which has no '${seg}'`, fix: `use the path '${done.join(".")}'` };
    const next = s.keys[seg];
    if (!next) {
      const names = Object.keys(s.keys);
      return { error: `'${path}' names nothing in the state: ${done.length ? `'${done.join(".")}'` : "the state"} has no '${seg}'.${didYouMean(seg, names)}`, fix: `use one of: ${names.map((n) => [...done, n].join(".")).join(", ")}` };
    }
    done.push(seg);
    s = next;
  }
  return { shape: s };
}

/**
 * Resolves a member chain read in a lambda (`s.particles.length`, `row.live`): object keys; on a list, `length`
 * (a number) or an index ("[]") into its row; on a string, `length`.
 * @param {Shape} root @param {string} rootName @param {string[]} segs  "[]" for a computed member
 * @returns {string | null}  the problem, or null
 */
export function resolveChain(root, rootName, segs) {
  /** @type {Shape} */
  let s = root;
  let text = rootName;
  for (const seg of segs) {
    if (s.kind === "object") {
      if (seg === "[]") return `${text} is an object; read its members by name`;
      const next = s.keys[seg];
      if (!next) return `${text} has no member '${seg}'.${didYouMean(seg, Object.keys(s.keys))}`;
      s = next;
    } else if (s.kind === "list") {
      if (seg === "length") s = { kind: "number" };
      else if (seg === "[]") s = s.of;
      else return `${text} is a list; it has 'length' and items by index, not '${seg}'`;
    } else if (s.kind === "string" && seg === "length") {
      s = { kind: "number" };
    } else {
      return `${text} is ${describe(s)}, which has no member '${seg}'`;
    }
    text += seg === "[]" ? "[…]" : `.${seg}`;
  }
  return null;
}
