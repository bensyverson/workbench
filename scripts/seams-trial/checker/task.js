// The relay's task checks (G…): what each leg must hand in beyond a package or glue that checks clean. The maze
// author offers an Event of pickups or goals with its position in a frame; the particles author accepts an Event
// that emitters trigger on through ref("in"), and a value input lambdas read; the composer wires the one to the
// other through a frame path of the glue, and shows the burst.

import { leavesOf } from "./seam.js";
import { kindOf } from "../../../kit/define/tags.js";

/** @import { Seams } from "./ports.js" */
/** @import { Analysis } from "./compose.js" */

/** @typedef {{ code: string, file: string, line: number, message: string, fix: string }} TaskProblem */

/** Words that say an output is a pickup or a goal (G002). */
export const PICKUP = /pick|coin|collect|goal|exit|reach|finish|win|arriv/i;

/** Whether a seam's Event record carries a tagged point. @param {import("./seam.js").Seam} s */
const hasPoint = (s) => leavesOf(s).some((l) => l.seam.kind === "point");

/** @param {RegExp} other @param {Record<string, string>} files */
function mentions(other, files) {
  for (const [path, text] of Object.entries(files)) {
    const lines = text.split("\n");
    const i = lines.findIndex((l) => other.test(l));
    if (i >= 0) return { file: path, line: i + 1 };
  }
  return null;
}

/**
 * The maze author's leg.
 * @param {Seams} seams @param {Record<string, string>} files  the package's files, by path @param {string} dialectFile
 * @returns {TaskProblem[]}
 */
export function mazeTask(seams, files, dialectFile) {
  /** @type {TaskProblem[]} */
  const out = [];
  const events = Object.values(seams.out).filter((p) => p.seam.kind === "event");
  if (!events.length) out.push({ code: "G101", file: dialectFile, line: 1, message: "the maze Dialect offers no Event output; the task asks for one each time the player picks up a coin (or reaches a goal)", fix: 'ports: { out: { picked: { seam: "Event<{ at: point2@cell }>", from: "picked", note: "…" } } }' });
  else if (!events.some((p) => hasPoint(p.seam))) out.push({ code: "G102", file: dialectFile, line: 1, message: `no Event output's record has a point in one of maze's frames (${events.map((p) => `${p.name}: ${p.seamText}`).join("; ")}); a stranger needs where it happened`, fix: "add a field such as at: point2@cell to the Event's record" });
  const hit = mentions(/particle/i, files);
  if (hit) out.push({ code: "G103", ...hit, message: "a maze package file names particles; the maze author knows nothing of the other package", fix: "describe maze's own outputs only; the composer relates them to anything else" });
  return out;
}

/**
 * The particles author's leg.
 * @param {Seams} seams @param {Record<string, any>} grammarDef @param {Record<string, string>} files @param {string[]} examples
 * @param {string} dialectFile @param {string} grammarFile
 * @returns {TaskProblem[]}
 */
export function particlesTask(seams, grammarDef, files, examples, dialectFile, grammarFile) {
  /** @type {TaskProblem[]} */
  const out = [];
  if (!Object.values(seams.in).some((p) => p.seam.kind === "event")) out.push({ code: "G111", file: dialectFile, line: 1, message: "the particles Dialect accepts no Event input; the task asks for one that fires emitters", fix: 'ports: { in: { burst: { seam: "Event<{ at: point2@px }>", note: "…" } } }' });
  if (!refsIn(grammarDef.constructs)) out.push({ code: "G112", file: grammarFile, line: 1, message: 'no Grammar option names an input with ref("in"), so an emitter cannot say which input triggers it', fix: 'add an option such as "trigger?": ref("in") to the emitter\'s opening data' });
  const values = Object.values(seams.in).filter((p) => p.seam.kind !== "event");
  const name = seams.inputs?.name;
  if (!values.length || !name) out.push({ code: "G113", file: dialectFile, line: 1, message: "the particles Dialect has no value input read through inputs: { object, name }; the task asks for one", fix: 'ports: { in: { radius: { seam: "f64@px", default: 40, note: "…" } } }, inputs: { object: "In", name: "inp" }' });
  else {
    const reads = values.some((p) => examples.some((e) => new RegExp(`(?<![\\w$])${name.replace(/\$/g, "\\$")}\\s*\\.\\s*${p.name}(?![\\w$])`).test(files[e] ?? "")));
    if (!reads) out.push({ code: "G113", file: examples[0] ?? dialectFile, line: 1, message: `no example's lambda reads a value input (${values.map((p) => `${name}.${p.name}`).join(", ")})`, fix: `read one in an example, e.g. p.size = ${name}.${values[0].name} / 10` });
  }
  const hit = mentions(/maze/i, files);
  if (hit) out.push({ code: "G103", ...hit, message: "a particles package file names maze; the particles author knows nothing of the other package", fix: "describe particles' own inputs only" });
  return out;
}

/** Whether a Grammar declaration holds a ref("in"). @param {unknown} v @param {Set<unknown>} [seen] @returns {boolean} */
function refsIn(v, seen = new Set()) {
  if (v === null || typeof v !== "object" || seen.has(v)) return false;
  seen.add(v);
  if (kindOf(v) === "ref" && /** @type {any} */ (v).ns === "in") return true;
  return Object.values(v).some((x) => refsIn(x, seen));
}

/**
 * The input names a Program's builder calls name through ref("in"), from the kit's Program (its instances' calls).
 * @param {any} program @returns {Set<string>}
 */
function triggered(program) {
  /** @type {Set<string>} */
  const out = new Set();
  for (const inst of program.instances?.() ?? []) {
    for (const call of [inst.openCall, ...inst.calls]) for (const r of call?.found?.refs ?? []) if (r.ns === "in") out.add(r.value);
  }
  return out;
}

/**
 * The composer's leg, on a composition that checks clean.
 * @param {Analysis} a @param {{ file: string, line: number }} at  the glue's export
 * @returns {TaskProblem[]}
 */
export function composeTask(a, at) {
  /** @type {TaskProblem[]} */
  const out = [];
  const mazes = a.parts.filter((p) => p.dialectName === "maze"), fxs = a.parts.filter((p) => p.dialectName === "particles");
  if (mazes.length !== 1 || fxs.length !== 1) {
    out.push({ code: "G006", ...at, message: `the composition has ${mazes.length} maze part${mazes.length === 1 ? "" : "s"} and ${fxs.length} particles part${fxs.length === 1 ? "" : "s"}; the task is one of each`, fix: ".part(level).part(fx)" });
    return out;
  }
  const fx = fxs[0];
  const triggers = triggered(fx.program);
  const candidates = a.wires.filter((w) => {
    const from = a.parts.find((p) => p.program === w.from.program), to = a.parts.find((p) => p.program === w.to.program);
    return from === mazes[0] && to === fx && from.seams.out[w.from.name]?.seam.kind === "event" && to.seams.in[w.to.name]?.seam.kind === "event";
  });
  const burst = candidates.find((w) => triggers.has(w.to.name));
  if (!burst) {
    out.push({ code: "G001", ...at, message: candidates.length ? `the maze Event is wired to ${candidates.map((w) => `${fx.name}.in.${w.to.name}`).join(", ")}, which no emitter of ${fx.name} triggers on (it triggers on ${triggers.size ? [...triggers].join(", ") : "nothing"})` : `no wire runs from a maze Event output into a particles Event input`, fix: `.wire(${mazes[0].name}.out.<event>, ${fx.name}.in.<event>), and an emitter of ${fx.name} whose trigger names that input` });
    return out;
  }
  const port = mazes[0].seams.out[burst.from.name];
  if (!PICKUP.test(`${port.name} ${port.note ?? ""}`)) out.push({ code: "G002", file: burst.file, line: burst.line, message: `the wired output ${mazes[0].name}.out.${port.name} (${port.note ? `"${port.note}"` : "no note"}) does not say it is a pickup or a goal`, fix: "wire the output that fires when the player picks up a coin or reaches a goal" });
  if (!burst.convert.some((c) => c.kind === "point" && c.glue)) out.push({ code: "G003", file: burst.file, line: burst.line, message: `the burst's position does not cross through a frame the glue relates (${burst.convert.length ? burst.convert.map((c) => c.text).join("; ") : "nothing is converted: no tagged point on both sides"})`, fix: `relate the frames in the glue: .frame(${mazes[0].name}.frame.<frame>, ${fx.name}.frame.<frame>, "fit" or { scale, offset })` });
  if (a.show !== fx) out.push({ code: "G004", ...at, message: a.show ? `the composition shows ${a.show.name}, so the burst is not on the stage` : "the composition shows no part; the burst must be on the stage", fix: `.show(${fx.name})` });
  return out;
}
