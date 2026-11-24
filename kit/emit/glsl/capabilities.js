// What the GLSL target declares it accepts, checked before any lowering: a pure kernel over a
// space the Dialect lists for the target, calling only helpers, reading only declared uniforms.
// Anything else is refused in the proposal's words (§6, "Capabilities"): the kernel, why, and
// what the target does accept.

import { showType } from "../../ir/types.js";

/** @import { Kernel, Effect } from "../../ir/ir.js" */
/** @import { LirDiagnostic } from "../../lir/lir.js" */

/** What an effect verb says about a kernel that cannot be taken, as "it ___". */
const VERBS = /** @type {Record<string, string>} */ ({
  write: "writes entity state", read: "reads entity state", emit: "emits an event", rng: "draws random numbers", sfx: "plays a sound",
  toast: "shows a toast", spawn: "spawns entities", destroy: "destroys entities", hud: "draws to the HUD", input: "reads input",
  log: "writes to a log", end: "ends the game",
});

/**
 * @typedef {object} Accepts
 * @property {string[]} domains  The spaces whose kernels the target takes: `pixel`.
 */

/**
 * The helper kernels `main` reaches, by name.
 * @param {Kernel} main
 * @param {Kernel[]} helpers
 * @returns {Kernel[]}
 */
export function reachableHelpers(main, helpers) {
  const byName = new Map(helpers.map((h) => [h.name, h]));
  /** @type {Set<Kernel>} */
  const seen = new Set();
  /** @param {unknown} x */
  const walk = (x) => {
    if (Array.isArray(x)) x.forEach(walk);
    else if (typeof x === "object" && x !== null) {
      const o = /** @type {Record<string, unknown>} */ (x);
      if (o.k === "helper" && typeof o.name === "string") {
        const h = byName.get(o.name);
        if (h && !seen.has(h)) { seen.add(h); walk(h.body); }
      }
      for (const [key, v] of Object.entries(o)) if (key !== "t" && key !== "span") walk(v);
    }
  };
  walk(main.body);
  return [...seen];
}

/**
 * Why the target cannot take `main` or a helper it reaches: one diagnostic per kernel, T001.
 * @param {Kernel} main  The entry kernel.
 * @param {Kernel[]} helpers  The helpers on offer.
 * @param {Accepts | "*"} accepts
 * @param {Set<string>} uniformObjects  The objects whose members are the program's uniforms.
 * @returns {LirDiagnostic[]}
 */
export function capabilityDiagnostics(main, helpers, accepts, uniformObjects) {
  const domains = accepts === "*" ? null : accepts.domains;
  const names = new Set(helpers.map((h) => h.name));
  /** @type {LirDiagnostic[]} */
  const out = [];
  const tail = `Shader targets accept pure kernels over ${domains ? domains.map((d) => `\`${d}\``).join(" and ") : "every space"}.`;
  for (const [k, isMain] of /** @type {Array<[Kernel, boolean]>} */ ([[main, true], ...reachableHelpers(main, helpers).map((h) => [h, false])])) {
    /** @type {string[]} */
    const why = [];
    if (isMain && domains && !domains.includes(k.space)) why.push(`runs over \`${k.space}\``);
    for (const reason of effectReasons(k.effects, names, uniformObjects)) if (!why.includes(reason)) why.push(reason);
    if (isMain && why.length === 0 && (typeof k.returns !== "object" || !("vec" in k.returns) || k.returns.vec === 2)) why.push(`returns ${showType(k.returns)}, not a color (a vec3 or vec4)`);
    if (why.length) out.push({ code: "T001", kernel: k.name, span: k.span, message: `Target \`glsl\` cannot take \`${k.name}\`: it ${list(why)}. ${tail}` });
  }
  return out;
}

/**
 * @param {Effect[]} effects
 * @param {Set<string>} helpers
 * @param {Set<string>} uniformObjects
 * @returns {string[]}
 */
function effectReasons(effects, helpers, uniformObjects) {
  /** @type {string[]} */
  const out = [];
  for (const e of effects) {
    const [verb, ...rest] = e.split(" ");
    const what = rest.join(" ");
    if (verb === "call" && helpers.has(what)) continue;
    if (verb === "read" && uniformObjects.has(what.split(".")[0])) continue;
    out.push(verb === "call" ? `calls \`${what}\`, which is not a helper of this program` : VERBS[verb] ?? `has the effect \`${e}\``);
  }
  return out;
}

/** @param {string[]} items */
function list(items) {
  return items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}
