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

/**
 * Plain data as source text the subset parses, or why the value is not plain data. Plain data is a finite
 * number, a string, a boolean, and arrays and plain objects (identifier keys only) of them; nothing else
 * (null, undefined, a function inside, a Map, a class instance, a cycle) is.
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
  // A builder answers every property, Symbol.toPrimitive among them, which no plain object has.
  if (!isArray && ((proto !== Object.prototype && proto !== null) || typeof (/** @type {any} */ (v))[Symbol.toPrimitive] === "function")) return { error: `${proto?.constructor?.name ? `a ${proto.constructor.name}` : "an object"}, not plain data` };
  seen.add(v);
  try {
    /** @type {string[]} */
    const parts = [];
    for (const [k, x] of Object.entries(v)) {
      if (!isArray && !IDENT.test(k)) return { error: `an object with the key ${JSON.stringify(k)}, which is not a name` };
      const r = bake(x, seen);
      if ("error" in r) return { error: `${isArray ? `a list holding ${r.error}` : `an object whose '${k}' is ${r.error}`}` };
      parts.push(isArray ? r.src : `${k}: ${r.src}`);
    }
    return { src: isArray ? `[${parts.join(", ")}]` : parts.length ? `{ ${parts.join(", ")} }` : "{}" };
  } finally { seen.delete(v); }
}

/**
 * One top-level binding as a Program unit: an arrow function as a helper (its source, whose own free names
 * resolve in turn), plain data as a constant. A refusal carries its code and fix.
 * @param {string} name @param {unknown} v
 * @returns {{ unit: { name: string, kind: "fn" | "const", src: string }, ast?: ArrowFunctionExpression } | { code: string, reason: string, tip: string }}
 */
export function unitOf(name, v) {
  if (typeof v === "function") {
    const r = lambdaSource(v);
    if ("error" in r) return { code: "B007", reason: r.error, tip: `write it as an arrow function: const ${name} = (…) => …` };
    return { unit: { name, kind: "fn", src: r.src }, ast: r.ast };
  }
  const b = bake(v);
  if ("error" in b) return { code: "B012", reason: `it holds ${b.error}`, tip: `make '${name}' plain data at the top level (a number, string, boolean, or an array or object of them), or declare it on the Program, .const("${name}", "…")` };
  const c = constSource(b.src);
  if ("error" in c) return { code: "B012", reason: c.error, tip: `declare it on the Program, .const("${name}", "…")` };
  return { unit: { name, kind: "const", src: b.src } };
}
