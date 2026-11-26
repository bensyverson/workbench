// The run's wires: each composed wire with its Event queue, the order parts step in within an instant, and what a
// consumer reads and takes across them.

import { cmp, qText, toNumber } from "../define/rational.js";
import { carry } from "./carry.js";
import { defaults, deepFreeze } from "./part.js";
import { imagesOf } from "./draw.js";

/** @import { Q } from "../define/rational.js" */
/** @import { Composed } from "../compose/compose.js" */
/** @import { Part } from "./part.js" */

/** @typedef {{ index: number, from: { part: string, port: string }, to: { part: string, port: string }, event: boolean, delay: boolean, keepLast: number | null, overflow: "keepLast" | "keepFirst" | null, convert: any[], rename: Record<string, string>, dropped: string[], fill?: Record<string, unknown>, set?: Record<string, unknown>, queue: Array<{ T: Q, record: unknown }>, drops: number, stopDrops: number, overflowDrops: number, text: string }} Wire */
/** What a consumer reads of a producer: its state and revision now, or as the instant began (the page's: no state, revision 1). @typedef {{ state: any, revision: number, part: Part | null }} View */

/** @param {string} h  "level.out.picked", "cave.param.depth" */
export const ends = (h) => { const [part, side, port] = h.split("."); return { part, side, port }; };

/**
 * The composed wires into inputs, each with an empty queue; a wire into a param is param-wires.js's.
 * @param {Composed} composed @param {Map<string, Part>} byName @returns {Wire[]}
 */
export function makeWires(composed, byName) {
  // an op keeps the name of the part whose image it draws however far it came, so a wire sizes it from every part's
  /** @type {Record<string, any>} */
  const images = {};
  for (const p of byName.values()) Object.assign(images, imagesOf(p.name, p.runtime));
  return composed.wires.filter((w) => ends(w.to).side !== "param").map((w, index) => {
    const from = ends(w.from), to = ends(w.to);
    const consumer = /** @type {Part} */ (byName.get(to.part));
    const event = consumer.runtime.dialect.seams.in[to.port].seam.kind === "event";
    const keepLast = w.delivery && typeof w.delivery === "object" ? w.delivery.keepLast : null;
    return { index, from, to, event, delay: w.delay, keepLast, overflow: w.overflow ?? null, convert: w.convert.map((c) => (c.kind === "draw" ? { ...c, images } : c)), rename: w.rename, dropped: w.dropped, fill: w.fill, set: w.set, queue: [], drops: 0, stopDrops: 0, overflowDrops: 0, text: `${w.from} → ${w.to}` };
  });
}

/**
 * The order parts step in within an instant: each producer before its consumers along undelayed wires (a delayed
 * wire reads the previous instant, so it orders nothing, and the page never steps); ties go by the order the glue
 * added the parts.
 * @param {Part[]} parts @param {Wire[]} wires @returns {Part[]}
 */
export function wireOrder(parts, wires) {
  const stepping = new Set(parts.map((p) => p.name));
  const live = wires.filter((w) => !w.delay && w.from.part !== w.to.part && stepping.has(w.from.part));
  const indeg = new Map(parts.map((p) => [p.name, 0]));
  for (const w of live) indeg.set(w.to.part, (indeg.get(w.to.part) ?? 0) + 1);
  /** @type {Part[]} */
  const out = [];
  const left = [...parts];
  while (left.length) {
    const i = left.findIndex((p) => indeg.get(p.name) === 0);
    // kit/compose refuses an undelayed cycle (S115); if one reached here, keep glue order for the rest
    const p = left.splice(i < 0 ? 0 : i, 1)[0];
    out.push(p);
    for (const w of live) if (w.from.part === p.name) indeg.set(w.to.part, (indeg.get(w.to.part) ?? 0) - 1);
  }
  return out;
}

/**
 * A record as it crosses a wire, stamped with its producer's instant (ruling 3, 2026-11-26): `$T`, in seconds as ctx.T
 * is, read-only and not enumerable, so a record's keys stay its fields; frozen, so a step cannot change it. The
 * record is copied first: the producer's or host's object may be frozen, kept in state, or pushed again, and is
 * never changed.
 * @param {unknown} record @param {Q} T
 */
export function stamped(record, T) {
  if (record === null || typeof record !== "object") return record;
  const copy = structuredClone(record);
  Object.defineProperty(copy, "$T", { value: toNumber(T), enumerable: false, writable: false });
  return deepFreeze(copy);
}

/** The records a consumer stepping at T may take: stamped at or before T (before T on a delayed wire). @param {Wire} w @param {Q} T */
export const ready = (w, T) => w.queue.filter((x) => (w.delay ? cmp(x.T, T) < 0 : cmp(x.T, T) <= 0)).length;

/**
 * A part's inputs at T, without taking any Event.
 * @param {Part} p @param {Q} T @param {Map<string, Wire>} wireTo @param {(w: Wire) => View} viewOf
 */
export function readInputs(p, T, wireTo, viewOf) {
  /** @type {Record<string, unknown>} */
  const values = defaults(p.runtime);
  /** @type {Record<string, number | null>} */
  const rev = {};
  let pending = 0;
  for (const i of Object.values(/** @type {Record<string, any>} */ (p.runtime.dialect.seams.in))) {
    const w = wireTo.get(`${p.name}.${i.name}`);
    if (!w) { rev[i.name] = null; continue; }
    const v = viewOf(w);
    rev[i.name] = v.revision;
    if (w.event) { pending += ready(w, T); continue; }
    const read = v.state === null || !v.part ? undefined : v.part.compiled.outputs[w.from.port]?.(v.state, v.part.params);
    if (read !== undefined) values[i.name] = deepFreeze(carry(read, w));
  }
  return { values, rev, pending };
}

/**
 * Why a part's step at T would take more records from an Event input than its runtime declares, or null. S116
 * sized each reliable queue for a window this run honors; a step past it is refused rather than handed the excess
 * (a log whose frames are farther apart than the cap, say). A wire with an overflow policy trims instead.
 * @param {Part} p @param {Q} T @param {Map<string, Wire>} wireTo @param {Q} catchUp @returns {string | null}
 */
export function intake(p, T, wireTo, catchUp) {
  for (const i of Object.values(/** @type {Record<string, any>} */ (p.runtime.dialect.seams.in))) {
    if (i.seam.kind !== "event") continue;
    const w = wireTo.get(`${p.name}.${i.name}`);
    const n = w ? ready(w, T) : 0, max = p.runtime.events.in[i.name];
    if (w && !w.overflow && max !== undefined && n > max) return `part '${p.name}': in.${i.name}: ${n} records are ready, and the runtime declares at most ${max} per step (events: { in: { ${i.name}: … } }); ${w.text} was sized for steps at most ${qText(catchUp)} s apart (the catch-up cap) or its clocks' own spacing, and this step comes later than that; none were taken`;
  }
  return null;
}
