// Draw lists at composition (the draw-list draft, as ruled 2026-11-26). A part's Draw outputs carry the max its
// built Program gives (ruling 1), so every wire is judged on what this Program can draw. The shown part's Draw
// output is the page's: its only one, or the one named `view` (S402). Given a renderer profile, the op kinds the
// shown list can hold are judged (S401, ruling 2), read from the builders and followed through each Draw input a
// builder spreads, even when another builder on the way is open; a kind the kit cannot see (a builder whose kinds are open) is left to draw time.

import { PROFILES, kindProblems } from "../draw/index.js";
import { printSeam } from "../seam/index.js";

/** @import { Seams } from "../define/define.js" */
/** @import { Side } from "./compose.js" */
/** @typedef {import("../draw/profiles.js").Profile} Profile */
/** @typedef {{ name: string, program: any, seams: Seams, dialectName: string, version?: string }} DrawPart */
/** @typedef {{ from: { program: any, name: string }, to: { program: any, name: string }, ok: boolean }} DrawWire */
/** @typedef {{ code: string, message: string, fix: string, sides: { from?: Side, to?: Side } }} DrawProblem */

/** The name a page shows when a part has several Draw outputs. */
export const VIEW = "view";

/**
 * A part's seams with each Draw output's seam at its built Program's max.
 * @param {Seams} seams @param {Record<string, { max: number }> | undefined} draws @returns {Seams}
 */
export function withDrawMaxes(seams, draws) {
  if (!draws || Object.keys(draws).length === 0) return seams;
  const out = { ...seams.out };
  for (const [n, { max }] of Object.entries(draws)) {
    const p = out[n];
    if (!p || p.seam.kind !== "draw") continue;
    const seam = { ...p.seam, max };
    out[n] = { ...p, seam, seamText: printSeam(seam) };
  }
  return { ...seams, out };
}

/** A part's Draw outputs, by name. @param {DrawPart} p */
const drawOutputs = (p) => Object.values(p.seams.out).filter((o) => o.seam.kind === "draw");

/**
 * The shown part's Draw output and the problems with it: which output the page shows, and, given a profile, the
 * op kinds the profile does not draw.
 * @param {DrawPart | null} shown @param {DrawWire[]} wires @param {Map<any, DrawPart>} parts
 * @param {{ profile?: Profile | string }} options
 * @returns {{ view: string | null, problems: DrawProblem[] }}
 */
export function shownDraw(shown, wires, parts, options) {
  /** @type {DrawProblem[]} */
  const problems = [];
  /** @type {Profile | null} */
  let profile = null;
  if (typeof options.profile === "string") {
    profile = Object.hasOwn(PROFILES, options.profile) ? /** @type {Record<string, Profile>} */ (PROFILES)[options.profile] : null;
    if (!profile) problems.push({ code: "S403", message: `the profile '${options.profile}' is not a renderer profile; the profiles are ${Object.keys(PROFILES).join(", ")}`, fix: `check({ profile: "${Object.keys(PROFILES)[0]}" })`, sides: {} });
  } else if (options.profile) profile = options.profile;
  if (!shown) return { view: null, problems };
  const outs = drawOutputs(shown);
  if (outs.length === 0) return { view: null, problems };
  const chosen = outs.length === 1 ? outs[0] : outs.find((o) => o.name === VIEW);
  const side = (/** @type {DrawPart} */ p, /** @type {string} */ port) => ({ part: p.name, dialect: p.dialectName, ...(p.version ? { version: p.version } : {}), port: `out.${port}`, seam: p.seams.out[port]?.seamText });
  if (!chosen) {
    const names = outs.map((o) => o.name);
    problems.push({ code: "S402", message: `the page shows ${shown.name}, and ${shown.name} has ${names.length === 2 ? "two" : names.length} Draw outputs, ${names.slice(0, -1).join(", ")} and ${names.at(-1)}, and none is named ${VIEW}`, fix: `name the one the page shows ${VIEW}`, sides: { to: side(shown, names[0]) } });
    return { view: null, problems };
  }
  if (!profile) return { view: chosen.name, problems };
  const found = kindsReaching(shown, chosen.name, wires, parts);
  const refused = kindProblems(profile, [...found.from.keys()]);
  if (refused.length) {
    const where = refused.map((k) => `${k}, from ${found.from.get(k)?.map((s) => `${s.part.name}.out.${s.port}`).join(" and ")}`).join("; ");
    const first = /** @type {Array<{ part: DrawPart, port: string }>} */ (found.from.get(refused[0]))[0];
    problems.push({
      code: "S401",
      message: `the ${profile.label} draws ${profile.kinds.join(", ")}; ${shown.name}.out.${chosen.name} can hold ${where}`,
      fix: `draw with ${profile.kinds.join(", ")} only in the builders named, or show the page on a renderer that draws ${refused.join(" and ")}`,
      sides: { from: side(first.part, first.port), to: side(shown, chosen.name) },
    });
  }
  return { view: chosen.name, problems };
}

/**
 * The op kinds a part's Draw output can hold, each with the outputs whose builders write it, followed through the
 * Draw inputs its builders spread to the outputs wired to them. `open` when any builder on the way hides a kind
 * too: the kinds it names are still true.
 * @param {DrawPart} part @param {string} port @param {DrawWire[]} wires @param {Map<any, DrawPart>} parts
 */
function kindsReaching(part, port, wires, parts) {
  /** @type {Map<string, Array<{ part: DrawPart, port: string }>>} */
  const from = new Map();
  let open = false;
  const seen = new Set();
  /** @param {DrawPart} p @param {string} out */
  const visit = (p, out) => {
    const key = `${p.name}.${out}`;
    if (seen.has(key)) return;
    seen.add(key);
    const draw = /** @type {any} */ (p.seams.out[out])?.draw;
    if (!draw) { open = true; return; }
    if (draw.kinds.open) open = true;
    for (const k of draw.kinds.ops) from.set(k, [...(from.get(k) ?? []), { part: p, port: out }]);
    for (const input of draw.kinds.inputs) {
      const w = wires.find((x) => x.ok && x.to.program === p.program && x.to.name === input);
      const producer = w ? parts.get(w.from.program) : undefined;
      if (w && producer) visit(producer, w.from.name);
    }
  };
  visit(part, port);
  return { from, open };
}
