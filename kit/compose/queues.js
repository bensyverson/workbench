// The queue bound of an Event wire, sized at composition as in synchronous dataflow (the clocks draft, ruled
// 2026-11-26). Queues live in workbench time, so how many records can wait for a consumer's step depends only on
// the clocks and the per-step maxes, never on the machine. A reliable wire whose bound passes the consumer's max is
// S116. kit/compose reports it at the wire's glue line; the scheduler (kit/run) refuses to run it.

import { clockOf } from "../define/runtime.js";
import { q, ceilDiv, fromNumber, qText, cmp, div, mul } from "../define/rational.js";

/** @import { Q } from "../define/rational.js" */
/** @import { Clock, Runtime } from "../define/runtime.js" */

/** The most workbench time a real-time driver advances per display frame, unless the run says otherwise. */
export const CATCH_UP = q(1, 15);
/** A headless run steps frame parts every 1/60 s. */
export const NOMINAL_FRAME = q(1, 60);
/** The real-time driver never steps frame parts closer than this in workbench time (a faster display skips). */
export const MIN_FRAME = q(1, 240);

/**
 * The most times a part can step in any window of `span` seconds of workbench time, half-open. A demand part steps
 * at most once per instant, and instants are the tick parts' (where two tick clocks meet, one instant) and the frames'.
 * @param {Clock} c @param {Q} span @param {Clock[]} all  every part's clock
 * @returns {number}
 */
export function stepsIn(c, span, all) {
  if (c.kind === "tick") return ceilDiv(span, c.period);
  if (c.kind === "frame") return ceilDiv(span, MIN_FRAME);
  const frames = all.some((x) => x.kind === "frame") ? ceilDiv(span, MIN_FRAME) : 0;
  return frames + tickInstants(all.flatMap((x) => (x.kind === "tick" ? [x.period] : [])), span);
}

/** The most grid points a union of tick grids above which an exact count is not attempted. */
const EXACT_LIMIT = 100000;

/** @param {number} a @param {number} b @returns {number} */
const gcd = (a, b) => (b === 0 ? Math.abs(a) : gcd(b, a % b));

/**
 * The most distinct instants the tick periods make in any half-open window of `span`: exact when the union's
 * repeating pattern is small enough to walk, else a sum over the periods no other period divides (an upper bound).
 * @param {Q[]} periods @param {Q} span @returns {number}
 */
function tickInstants(periods, span) {
  // a period that is a whole multiple of another (equal ones included) adds no instant of its own
  const kept = periods.filter((p, i) => !periods.some((o, j) => (j < i ? cmp(o, p) === 0 : cmp(o, p) !== 0) && div(p, o).d === 1));
  const bound = kept.reduce((n, p) => n + ceilDiv(span, p), 0);
  if (kept.length < 2) return bound;
  // every period in units of the finest common step g: integers k_i, repeating every M = lcm(k_i) units
  const D = kept.reduce((l, p) => (l / gcd(l, p.d)) * p.d, 1);
  const ns = kept.map((p) => (p.n * D) / p.d);
  const g = ns.reduce(gcd);
  const ks = ns.map((n) => n / g);
  let M = 1;
  for (const k of ks) { M = (M / gcd(M, k)) * k; if (M > EXACT_LIMIT) return bound; }
  const width = div(mul(span, q(D)), q(g)); // the window, in units
  const reach = Math.ceil(width.n / width.d);
  const on = (/** @type {number} */ m) => ks.some((k) => m % k === 0);
  /** prefix[m] = grid points in [0, m) */
  const prefix = [0];
  for (let m = 0; m < M + reach; m++) prefix.push(prefix[m] + (on(m) ? 1 : 0));
  let best = 0;
  for (let m = 0; m < M; m++) {
    if (!on(m)) continue;
    // points in [m, m + width): the integers below m + width
    const end = width.d === 1 ? m + width.n : m + reach;
    best = Math.max(best, prefix[end] - prefix[m]);
  }
  return Math.min(best, bound);
}

/**
 * A run's catch-up cap as a rational: a number of seconds (default CATCH_UP), at least a nominal frame.
 * @param {number | Q | undefined} v @returns {Q}
 */
export function catchUpOf(v) {
  if (v === undefined) return CATCH_UP;
  const r = typeof v === "number" ? fromNumber(v) : v;
  if (!r || r.n <= 0 || r.n * NOMINAL_FRAME.d < NOMINAL_FRAME.n * r.d) throw new Error(`catchUp is the most workbench time one display frame may cover, at least 1/60 s, not ${typeof v === "number" ? v : qText(v)}`);
  return r;
}

/**
 * One wire's queue problem: which wire (its index in `wires`), the bound, the consumer's max, and the sentence and
 * fixes kit/compose prints.
 * @typedef {{ wire: number, bound: number, max: number, message: string, fix: string }} QueueProblem
 */

/**
 * Every reliable Event wire whose queue can hold more records at a consumer's step than the consumer takes. Parts
 * with no runtime, or whose clock does not read, are not sized (the scheduler reports a bad clock itself).
 * @param {Array<{ name: string, dialect: string, record: Record<string, any> }>} parts  each part's name, Dialect name and built record
 * @param {Array<{ from: { part: string, name: string }, to: { part: string, name: string }, delivery?: unknown }>} wires
 * @param {Runtime[]} runtimes  matched to parts by Dialect name
 * @param {{ catchUp?: number | Q }} [o]
 * @returns {QueueProblem[]}
 */
export function queueProblems(parts, wires, runtimes, o = {}) {
  const catchUp = catchUpOf(o.catchUp);
  /** @type {Map<string, { runtime: Runtime, clock: Clock }>} */
  const by = new Map();
  for (const p of parts) {
    const runtime = runtimes.find((r) => r.dialect.name === p.dialect);
    if (!runtime) continue;
    const c = clockOf(runtime, p.record);
    if (c.ok) by.set(p.name, { runtime, clock: c.clock });
  }
  const all = [...by.values()].map((x) => x.clock);
  /** @type {QueueProblem[]} */
  const out = [];
  wires.forEach((w, i) => {
    const a = by.get(w.from.part), b = by.get(w.to.part);
    if (!a || !b || w.delivery !== "reliable") return;
    const per = a.runtime.events.out[w.from.name], max = b.runtime.events.in[w.to.name];
    if (per === undefined || max === undefined) return;
    const pc = a.clock, cc = b.clock;
    // a demand consumer is woken by the Event, and a frame consumer of a frame producer steps on the same frames: either
    // takes one producer step's records. A frame consumer's window (its last frame, this frame] holds one frame, so a
    // demand producer steps there at most once for it and once per tick instant in the cap.
    const steps = cc.kind === "demand" || (cc.kind === "frame" && pc.kind === "frame") ? 1
      : cc.kind === "frame" && pc.kind === "demand" ? 1 + tickInstants(all.flatMap((x) => (x.kind === "tick" ? [x.period] : [])), catchUp)
      : stepsIn(pc, cc.kind === "tick" ? cc.period : catchUp, all);
    const bound = steps * per;
    if (bound <= max) return;
    const rate = (/** @type {Clock} */ c, /** @type {string} */ n) => (c.kind === "tick" ? `${n} ticks every ${qText(c.period)} s` : c.kind === "frame" ? `${n} steps once per display frame, at most every ${qText(MIN_FRAME)} s` : `${n} steps on demand, at most once per instant`);
    const window = cc.kind === "tick" ? `between two ${w.to.part} steps` : `in one display frame, which may cover ${qText(catchUp)} s of workbench time (the catch-up cap)`;
    out.push({
      wire: i, bound, max,
      message: `${w.from.part}.out.${w.from.name} → ${w.to.part}.in.${w.to.name} can hold ${bound} records when ${w.to.part} steps (${steps} ${w.from.part} step${steps === 1 ? "" : "s"} of at most ${per} each ${window}: ${rate(pc, w.from.part)}, ${rate(cc, w.to.part)}); ${w.to.part}.in.${w.to.name} takes at most ${max} per step, and its delivery is reliable, so records could not all be delivered`,
      fix: `raise the max: events: { in: { ${w.to.name}: ${bound} } } in the ${b.runtime.dialect.name} runtime (or push fewer per step from ${w.from.part}); or take only the newest: delivery: { keepLast: ${max} } on the ${b.runtime.dialect.name} Dialect's input ${w.to.name}`,
    });
  });
  return out;
}
