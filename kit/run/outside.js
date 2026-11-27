// What a run takes from outside onto a part's Event input that no wire feeds (the `in` input), and what it keeps of the
// Events a part pushes (taps). An unwired Event input gets a queue of its own, shaped as a wire's so delivery, intake,
// stopping, checkpoints and stats treat it as one; its records are already in the input's seam, so nothing converts.

import { fillDefaults, valueProblem } from "../seam/index.js";
import { RunError } from "./codes.js";

/** @import { Part } from "./part.js" */
/** @import { Wire } from "./wires.js" */
/** @import { Entry } from "./log.js" */

/** The producer part of an outside queue: no part has this name. */
export const OUTSIDE = "$in";

/**
 * One queue per Event input of a stepping part that no wire feeds.
 * A pointer input's queue carries its records over rather than drop any, and coalesces a run of moves to its last.
 * @param {Part[]} parts @param {Wire[]} wires  the composition's, whose indexes the new ones continue
 * @param {Set<string>} [pointers]  the pointer inputs, "<part>.<input>"
 * @returns {Wire[]}
 */
export function outsideWires(parts, wires, pointers = new Set()) {
  /** @type {Wire[]} */
  const out = [];
  for (const p of parts) {
    for (const i of Object.values(/** @type {Record<string, any>} */ (p.runtime.dialect.seams.in))) {
      if (i.seam.kind !== "event" || wires.some((w) => w.to.part === p.name && w.to.port === i.name)) continue;
      const keepLast = i.delivery && typeof i.delivery === "object" ? i.delivery.keepLast ?? null : null;
      out.push({ index: wires.length + out.length, from: { part: OUTSIDE, port: i.name }, to: { part: p.name, port: i.name }, event: true, delay: false, fromPage: false, records: pointers.has(`${p.name}.${i.name}`) ? "delta" : null, keyed: false, pointer: pointers.has(`${p.name}.${i.name}`), keepLast, overflow: null, convert: [], rename: {}, dropped: [], queue: [], drops: 0, stopDrops: 0, overflowDrops: 0, carried: 0, text: `in → ${p.name}.in.${i.name}` });
    }
  }
  return out;
}

/**
 * Checks an `in` input before it is logged: the input is an Event input of the part that no wire feeds (N011), and the
 * value fits its seam (N012). Returns the entry with its own copy of the value, as given (the defaults are filled when
 * it is delivered). Throws a RunError, the run unchanged.
 * @param {Entry} e @param {Part} p @param {Set<string>} fed  the inputs a wire feeds, "<part>.<input>"
 * @param {(t: any) => string} at
 * @returns {Entry}
 */
export function checkedIn(e, p, fed, at) {
  const name = /** @type {string} */ (e.name);
  const ins = /** @type {Record<string, any>} */ (p.runtime.dialect.seams.in);
  const events = Object.values(ins).filter((i) => i.seam.kind === "event").map((i) => i.name);
  const refuse = (/** @type {string} */ code, /** @type {string} */ why) => new RunError([{ code, part: p.name, message: `an in input at ${at(e.T)} to ${p.name}.in.${name}: ${why}, so it is not logged and the run is unchanged` }]);
  if (!Object.hasOwn(ins, name)) throw refuse("N011", `the part has no Event input '${name}' (its Event inputs: ${events.join(", ") || "none"})`);
  if (ins[name].seam.kind !== "event") throw refuse("N011", `'${name}' is a ${ins[name].seam.kind === "draw" ? "Draw" : "value"} input, and an in input addresses an Event input (${events.join(", ") || "the part has none"})`);
  if (fed.has(`${p.name}.${name}`)) throw refuse("N011", "a wire feeds that input: two senders on one queue would interleave records that the wire's size was planned for one");
  const value = structuredClone(e.value);
  const bad = valueProblem(ins[name].seam.of, value);
  if (bad) throw refuse("N012", `the value does not fit the input's seam: ${bad}`);
  return { ...e, value };
}

/** The record to deliver for a logged `in` input: its own copy, the defaults filled. @param {Part} p @param {string} name @param {unknown} value */
export const delivered = (p, name, value) => fillDefaults(/** @type {any} */ (p.runtime.dialect.seams.in)[name].seam.of, value);

/**
 * The Event outputs a run keeps, by handle `<part>.out.<output>`: every record pushed, in order, with its instant.
 * @param {string[]} handles @param {Part[]} parts
 */
export function createTaps(handles, parts) {
  const events = parts.flatMap((p) => Object.values(/** @type {Record<string, any>} */ (p.runtime.dialect.seams.out)).filter((o) => o.seam.kind === "event").map((o) => `${p.name}.out.${o.name}`));
  for (const h of handles) if (!events.includes(h)) throw new Error(`tap '${h}' is not an Event output of a part: the Event outputs are ${events.join(", ") || "none"}`);
  /** @type {Map<string, Array<{ T: number, record: unknown }>>} */
  const log = new Map(handles.map((h) => [h, []]));
  return {
    /** @param {string} part @param {string} port @param {number} T @param {unknown[]} records @param {(v: unknown) => unknown} freeze */
    push(part, port, T, records, freeze) { const l = log.get(`${part}.out.${port}`); if (l) for (const r of records) l.push({ T, record: freeze(structuredClone(r)) }); },
    /** @param {string} handle */
    read(handle) {
      const l = log.get(handle);
      if (!l) throw new Error(`run.tapped: '${handle}' is not tapped (pass it in createRun's taps): the tapped outputs are ${[...log.keys()].join(", ") || "none"}`);
      return [...l];
    },
    save: () => new Map([...log].map(([h, l]) => [h, l.length])),
    /** @param {Map<string, number>} lens */
    restore(lens) { for (const [h, l] of log) l.length = lens.get(h) ?? 0; },
  };
}
