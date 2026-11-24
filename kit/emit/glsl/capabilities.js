// What the GLSL target declares it accepts, checked before any lowering: a pure kernel over a
// space the Dialect lists for the target, calling only helpers, reading only declared uniforms.
// Anything else is refused in the proposal's words (§6, "Capabilities"): the kernel, why, and
// what the target does accept.

import { showType } from "../../ir/types.js";
import { impurities } from "../../query/index.js";

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
 * Why the target cannot take `main` or a helper it reaches: one diagnostic per kernel, T001.
 * @param {Kernel} main  The entry kernel.
 * @param {Kernel[]} helpers  The helpers on offer.
 * @param {Accepts | "*"} accepts
 * @param {Set<string>} uniformObjects  The objects whose members are the program's uniforms.
 * @returns {LirDiagnostic[]}
 */
export function capabilityDiagnostics(main, helpers, accepts, uniformObjects) {
  const domains = accepts === "*" ? null : accepts.domains;
  /** @type {LirDiagnostic[]} */
  const out = [];
  const tail = `Shader targets accept pure kernels over ${domains ? domains.map((d) => `\`${d}\``).join(" and ") : "every space"}.`;
  // A uniform's load is a read-only place and records no effect (the LIR refuses one of an undeclared
  // object, R005); this admits a `read` effect on a declared uniform, should a Dialect record one.
  /** @param {Effect} e */
  const uniformRead = (e) => e.startsWith("read ") && uniformObjects.has(e.slice("read ".length).split(".")[0]);
  for (const [i, { kernel: k, effects }] of impurities(main, helpers, uniformRead).entries()) {
    const isMain = i === 0;
    /** @type {string[]} */
    const why = [];
    if (isMain && domains && !domains.includes(k.space)) why.push(`runs over \`${k.space}\``);
    for (const reason of effects.map(effectReason)) if (!why.includes(reason)) why.push(reason);
    if (isMain && why.length === 0 && (typeof k.returns !== "object" || !("vec" in k.returns) || k.returns.vec === 2)) why.push(`returns ${showType(k.returns)}, not a color (a vec3 or vec4)`);
    if (why.length) out.push({ code: "T001", kernel: k.name, span: k.span, message: `Target \`glsl\` cannot take \`${k.name}\`: it ${list(why)}. ${tail}` });
  }
  return out;
}

/**
 * Why an effect the target refuses keeps a kernel out, as "it ___".
 * @param {Effect} e
 * @returns {string}
 */
function effectReason(e) {
  const [verb, ...rest] = e.split(" ");
  return verb === "call" ? `calls \`${rest.join(" ")}\`, which is not a helper of this program` : VERBS[verb] ?? `has the effect \`${e}\``;
}

/** @param {string[]} items */
function list(items) {
  return items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}
