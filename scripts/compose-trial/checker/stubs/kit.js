// The stand-in for `kit`: program(), params(), int(), num().

import { session, callSite } from "../session.js";
import { Params, Program } from "../handles.js";

const SPEC = Symbol("param");

/**
 * @param {"int" | "num"} kind @param {unknown[]} a
 * @returns {{ [SPEC]: true, kind: string, default: number, ok: boolean }}
 */
function spec(kind, a) {
  const [d, min, max, label] = a;
  const nums = [d, min, max].every((x) => typeof x === "number" && Number.isFinite(x));
  const ok = nums && /** @type {number} */ (min) <= /** @type {number} */ (d) && /** @type {number} */ (d) <= /** @type {number} */ (max) && (label === undefined || typeof label === "string") && (kind === "num" || [d, min, max].every(Number.isInteger));
  if (!ok) session.add("C004", callSite(), `${kind}(default, min, max, label) needs ${kind === "int" ? "integers" : "numbers"} with min ≤ default ≤ max and a string label; got ${kind}(${a.map((x) => JSON.stringify(x)).join(", ")}).`, `for example ${kind}(${kind === "int" ? "5, 0, 99" : "0.5, 0, 1"}, "Label")`);
  return { [SPEC]: true, kind, default: nums ? /** @type {number} */ (d) : 0, ok };
}

/** An integer parameter. @param {unknown[]} a */
export const int = (...a) => spec("int", a);
/** A number parameter. @param {unknown[]} a */
export const num = (...a) => spec("num", a);

/** The program's parameters. @param {unknown} specs */
export function params(specs) {
  const site = callSite();
  /** @type {Record<string, { default: number }>} */
  const ok = {};
  if (typeof specs !== "object" || specs === null) session.add("C004", site, "params() takes an object of parameters, { name: int(…) | num(…) }.", "params({ seed: int(5, 0, 99, \"Seed\") })");
  else for (const [k, v] of Object.entries(specs)) {
    if (v && typeof v === "object" && /** @type {any} */ (v)[SPEC]) ok[k] = /** @type {any} */ (v);
    else session.add("C004", site, `parameter '${k}' is not an int(…) or num(…).`, `${k}: int(5, 0, 99, "Label")`);
  }
  if (session.params) session.add("C004", site, "params() is called twice.", "declare every parameter in one params({ … })");
  const p = new Params(ok, site);
  session.params ??= p;
  return p.proxy();
}

/** The whole program. @param {unknown} title */
export function program(title) {
  return new Program(title, callSite()).proxy();
}
