// Module scope: the top-level bindings a host passes to `.check({ scope })` / `.build({ scope })`, turned into
// the Program's units as DMG lowering takes a program's top-level consts (kit/lower/README.md, "Top-level
// helpers"): an arrow function is a helper, plain data a baked constant. The ruling is
// project/2026-11-24-architecture-synthesis.md §3.2.

import { lambdaSource, constSource } from "./shapes.js";
import { describe } from "./tags.js";

/** @import { ArrowFunctionExpression } from "../parse/ast.js" */

const IDENT = /^[A-Za-z_$][\w$]*$/;

/** What a lambda may read from the top level, for a refusal's message. */
export const PLAIN = "a top-level arrow function (a helper) or plain data (a number, string or boolean, or an array or object of them)";

/** "a" or "an" before a word. @param {string} w */
const article = (w) => (/^[aeiou]/i.test(w) ? `an ${w}` : `a ${w}`);

/**
 * Plain data as source text the subset parses, or why the value is not plain data. Plain data is a finite
 * number, a string, a boolean, and arrays and plain objects (identifier keys only) of them; nothing else
 * (null, undefined, a function inside, a Map, a class instance, a cycle) is. Only own, enumerable data
 * properties are read, through their descriptors, so no getter runs: an accessor, a hidden or Symbol key, an
 * array's hole or extra key, and an Array subclass are refused. A Proxy cannot be told from its target.
 * @param {unknown} v
 * @param {Set<object>} [seen]  the arrays and objects being baked, for a cycle
 * @returns {{ src: string } | { error: string }}
 */
export function bake(v, seen = new Set()) {
  if (typeof v === "number") return Number.isFinite(v) ? { src: Object.is(v, -0) ? "-0" : String(v) } : { error: `${v}, which is not finite` };
  if (typeof v === "string") return { src: JSON.stringify(v) };
  if (typeof v === "boolean") return { src: String(v) };
  if (v === null || typeof v !== "object") return { error: describe(v) };
  if (seen.has(v)) return { error: "a value that holds itself" };
  const proto = Object.getPrototypeOf(v);
  const isArray = Array.isArray(v);
  if (isArray ? proto !== Array.prototype : proto !== Object.prototype && proto !== null) return { error: `${proto?.constructor?.name ? article(proto.constructor.name) : "an object"}, not plain data` };
  const props = Object.getOwnPropertyDescriptors(v);
  if (Object.getOwnPropertySymbols(props).length) return { error: `${isArray ? "a list" : "an object"} with a Symbol key, which is not a name` };
  // A builder (a Proxy) answers every property, Symbol.toPrimitive among them, which no plain object has.
  if (typeof (/** @type {any} */ (v))[Symbol.toPrimitive] === "function") return { error: "a builder chain, not plain data" };
  /** @param {string} k @returns {{ src: string } | { error: string }} */
  const item = (k) => {
    const p = props[k];
    const what = isArray ? `a list whose item ${k}` : `an object whose '${k}'`;
    if (!p) return { error: `a list with a hole at ${k}` };
    if (!("value" in p)) return { error: `${what} is a getter` };
    if (!p.enumerable) return { error: `${what} is hidden (not enumerable)` };
    const r = bake(p.value, seen);
    return "error" in r ? { error: isArray ? `a list holding ${r.error}` : `${what} is ${r.error}` } : r;
  };
  seen.add(v);
  try {
    /** @type {string[]} */
    const parts = [];
    if (isArray) {
      const n = /** @type {unknown[]} */ (v).length;
      for (const k of Object.keys(props)) if (k !== "length" && !(String(Number(k)) === k && Number(k) < n)) return { error: `a list with the extra key ${JSON.stringify(k)}` };
      for (let i = 0; i < n; i++) {
        const r = item(String(i));
        if ("error" in r) return r;
        parts.push(r.src);
      }
      return { src: `[${parts.join(", ")}]` };
    }
    for (const k of Object.keys(props)) {
      if (!IDENT.test(k) || k === "__proto__") return { error: `an object with the key ${JSON.stringify(k)}, which is not a name` };
      const r = item(k);
      if ("error" in r) return r;
      parts.push(`${k}: ${r.src}`);
    }
    return { src: parts.length ? `{ ${parts.join(", ")} }` : "{}" };
  } finally { seen.delete(v); }
}

/**
 * One top-level binding as a Program unit: an arrow function as a helper (its source, whose own free names
 * resolve in turn), plain data as a constant. A refusal carries its code and fix.
 *
 * A helper's free names resolve against the module scope, which is right only when the arrow is the one its
 * top-level declaration writes: one made by another function (`const triple = mk(3)`) closes over that
 * function's locals, which `String(fn)` loses. So an arrow is a helper only when its text is `source`, the
 * initializer text of the name's top-level declaration.
 * @param {string} name @param {unknown} v
 * @param {string} [source]  the initializer text of the name's top-level declaration, when the host found one
 * @returns {{ unit: { name: string, kind: "fn" | "const", src: string }, ast?: ArrowFunctionExpression } | { code: string, reason: string, tip: string }}
 */
export function unitOf(name, v, source) {
  if (typeof v === "function") {
    const r = lambdaSource(v);
    if ("error" in r) return { code: "B007", reason: r.error, tip: `write it as an arrow function: const ${name} = (…) => …` };
    if (String(v) !== source) {
      const why = source === undefined ? "no top-level declaration of it writes this arrow function" : `its top-level declaration is \`const ${name} = ${source.length > 40 ? `${source.slice(0, 40)}…` : source}\`, not this arrow function`;
      return { code: "B012", reason: `it is a function made by other code (${why}), so the names it closes over are lost`, tip: `declare it at the top level as the arrow itself, const ${name} = (…) => …, with every value it needs a parameter, a top-level constant or written into its text` };
    }
    return { unit: { name, kind: "fn", src: r.src }, ast: r.ast };
  }
  const b = bake(v);
  if ("error" in b) return { code: "B012", reason: `it holds ${b.error}`, tip: `make '${name}' plain data at the top level (a number, string, boolean, or an array or object of them), or declare it on the Program, .const("${name}", "…")` };
  const c = constSource(b.src);
  if ("error" in c) return { code: "B012", reason: c.error, tip: `declare it on the Program, .const("${name}", "…")` };
  return { unit: { name, kind: "const", src: b.src } };
}
