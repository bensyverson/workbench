// A wire into a param (the seams draft's rulings, 2026-11-26, leaf x3iG6D): `.wire(<part>.out.<port>,
// <part>.param.<name>)` sets a param of another part from a value output. kit/run applies it between instants,
// only when the value changes, as a logged param input, so the part rebuilds when build-time code reads it. Here:
// the seam against the param's declaration, the loops a rebuild alone would drive, and the rate warning.

import { compareSeams, parseSeam } from "../seam/index.js";
import { clockOf } from "../define/runtime.js";
import { qText } from "../define/rational.js";
import { undelayedLoops } from "./wires.js";

/** @import { Seam } from "../seam/seam.js" */
/** @import { Handle } from "../define/handles.js" */
/** @import { Runtime } from "../define/runtime.js" */

/** @typedef {{ code: string, message: string, fix: string }} Problem */

const FIX = "wire a value output whose seam is the param's: f64 for a number, bool, str, or an enum of the param's options";

/**
 * Why a value output cannot set this param: an Event output (S201), a param a wire cannot set, or a seam that does not
 * pair with the param's (S201, S203, S252, by compareSeams). Empty when it can.
 * @param {{ seam: Seam }} out  the producer's port @param {Handle} param  a known param handle @param {string} outText
 * @returns {Problem[]}
 */
export function paramWireProblems(out, param, outText) {
  if (out.seam.kind === "event") return [{ code: "S201", message: `a param wire takes a value output, and ${outText} is an Event: a param holds one value, set between instants`, fix: "wire a value output (a state path or a value lambda), or wire the Event to an input" }];
  if (param.seam === undefined) return [{ code: "S201", message: `the param ${param.part}.$.${param.name} is not a number, a bool or a string, so no wire can set it`, fix: "set it from the host with a param input" }];
  const parsed = parseSeam(param.seam);
  if (!parsed.ok) return [{ code: "S201", message: `the param's seam ${param.seam} does not parse: ${parsed.error}`, fix: FIX }];
  return compareSeams(out.seam, parsed.type).problems.map((p) => ({ code: p.code, message: p.message, fix: p.code === "S203" ? "wire an output whose strings are among the param's options" : FIX }));
}

/**
 * The loops of param wires alone: a param wire from a part's own output, or a ring of them through other parts. A
 * rebuild runs init, which can change the part's outputs with no step between, so each rebuild would drive the next.
 * A loop through an ordinary wire passes through a consumer's step and is no such loop.
 * @template W
 * @param {string[]} parts @param {Array<{ from: string, to: string, wire: W, key: string }>} wires  param wires, as producer and param part
 * @returns {Array<{ loop: string[], wires: W[] }>}
 */
export function paramLoops(parts, wires) {
  const self = wires.filter((w) => w.from === w.to).map((w) => ({ loop: [w.from, w.from], wires: [w.wire] }));
  const rings = undelayedLoops(parts, wires.map((w) => ({ ...w, delay: false }))).map(({ loop, hops }) => ({ loop, wires: hops.flat() }));
  return [...self, ...rings];
}

/**
 * The S118 text for a param wire whose producer steps at a rate, or null: a tick or frame clock may change the
 * output at every step, and each change rebuilds the param's part when build-time code reads the param.
 * @param {Runtime | undefined} runtime @param {Record<string, any> | null} record @param {string} part
 * @returns {string | null}
 */
export function rateOf(runtime, record, part) {
  if (!runtime || !record) return null;
  const c = clockOf(runtime, record);
  if (!c.ok || c.clock.kind === "demand") return null;
  return c.clock.kind === "tick" ? `${part} ticks every ${qText(c.clock.period)} s` : `${part} steps every display frame`;
}
