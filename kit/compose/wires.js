// Two things about wires that span a composition: a rename of record fields (data only, checked against both
// sides), and the cycles of wires none of which is delayed. Neither depends on the order the glue wrote its lines.

import { didYouMean } from "../define/codes.js";

/** @import { Seam } from "../seam/seam.js" */

/** The record a seam carries (an Event's, or a record value's), or null. @param {Seam} s */
const recordOf = (s) => /** @type {(Seam & { kind: "record" }) | null} */ (s.kind === "event" ? s.of : s.kind === "record" ? s : null);

/**
 * A wire's `rename: { from: to }` applied to the producer's seam: each source must be a field of its record, each
 * target a field the consumer's record takes, no two sources share a target, and no target is a field the producer
 * already has under that name. Returns the renamed producer seam, or the problems (S205 messages).
 * @param {Seam} from @param {Seam} to @param {Record<string, string>} rename
 * @returns {{ seam: Seam, problems: Array<{ message: string, fix: string }> }}
 */
export function applyRename(from, to, rename) {
  const pairs = Object.entries(rename);
  if (!pairs.length) return { seam: from, problems: [] };
  const a = recordOf(from), b = recordOf(to);
  if (!a || !b) return { seam: from, problems: [{ message: `rename renames record fields, and this wire carries ${!a ? "no record from its output" : "no record into its input"}`, fix: "remove rename" }] };
  const have = Object.keys(a.fields), want = Object.keys(b.fields);
  /** @type {Array<{ message: string, fix: string }>} */
  const problems = [];
  /** @type {Map<string, string>} */
  const targets = new Map();
  for (const [src, dst] of pairs) {
    if (!have.includes(src)) problems.push({ message: `rename: the output's record has no field '${src}'.${didYouMean(src, have)} Its fields: ${have.join(", ") || "none"}`, fix: `rename one of the output's fields: ${have.map((f) => `${f}: "…"`).join(", ")}` });
    if (!want.includes(dst)) problems.push({ message: `rename: the input's record takes no field '${dst}'.${didYouMean(dst, want)} It takes: ${want.join(", ") || "nothing"}`, fix: `rename into one of the input's fields: ${want.map((f) => `"${f}"`).join(", ")}` });
    const first = targets.get(dst);
    if (first !== undefined) problems.push({ message: `rename maps both '${first}' and '${src}' to '${dst}'`, fix: "rename each field to its own name" });
    else targets.set(dst, src);
    if (have.includes(dst) && !Object.hasOwn(rename, dst)) problems.push({ message: `rename maps '${src}' to '${dst}', and the output's record already has a field '${dst}'`, fix: `rename '${dst}' too, or rename '${src}' to another field` });
  }
  if (problems.length) return { seam: from, problems };
  /** @type {Record<string, Seam>} */
  const fields = {};
  for (const [k, v] of Object.entries(a.fields)) fields[Object.hasOwn(rename, k) ? rename[k] : k] = v;
  /** @type {Seam} */
  const renamed = { kind: "record", fields };
  return { seam: from.kind === "event" ? { kind: "event", of: renamed } : renamed, problems: [] };
}

/**
 * The loops among parts that no delayed wire breaks: each as the parts in order, starting at the earliest part
 * (in the order parts were added) and following the earliest next part, so the same wiring gives the same loop
 * whatever order the glue wrote its .wire lines in.
 * @template W
 * @param {string[]} parts  the parts' names, in the order they were added
 * @param {Array<{ from: string, to: string, delay: boolean, wire: W }>} edges
 * @returns {Array<{ loop: string[], wires: W[] }>}
 */
export function undelayedLoops(parts, edges) {
  const order = new Map(parts.map((p, i) => [p, i]));
  const live = edges.filter((e) => !e.delay && e.from !== e.to);
  /** @param {string} p */
  const next = (p) => live.filter((e) => e.from === p).sort((x, y) => (order.get(x.to) ?? 0) - (order.get(y.to) ?? 0));
  // Tarjan's strongly connected components; each of two or more parts holds at least one loop
  let index = 0;
  /** @type {Map<string, { index: number, low: number, on: boolean }>} */
  const state = new Map();
  /** @type {string[]} */
  const stack = [];
  /** @type {string[][]} */
  const components = [];
  /** @param {string} v */
  const visit = (v) => {
    const s = { index, low: index, on: true };
    index++;
    state.set(v, s);
    stack.push(v);
    for (const e of next(v)) {
      const w = state.get(e.to);
      if (!w) { visit(e.to); s.low = Math.min(s.low, /** @type {any} */ (state.get(e.to)).low); }
      else if (w.on) s.low = Math.min(s.low, w.index);
    }
    if (s.low !== s.index) return;
    /** @type {string[]} */
    const comp = [];
    for (;;) { const w = /** @type {string} */ (stack.pop()); /** @type {any} */ (state.get(w)).on = false; comp.push(w); if (w === v) break; }
    if (comp.length > 1) components.push(comp);
  };
  for (const p of parts) if (!state.has(p)) visit(p);
  return components.map((comp) => {
    const inside = new Set(comp);
    const startAt = [...comp].sort((x, y) => (order.get(x) ?? 0) - (order.get(y) ?? 0))[0];
    // the shortest loop back to the start, by breadth, taking the earliest next part first
    /** @type {Map<string, { prev: string, wire: W } | null>} */
    const came = new Map([[startAt, null]]);
    const queue = [startAt];
    while (queue.length) {
      const at = /** @type {string} */ (queue.shift());
      for (const e of next(at)) {
        if (!inside.has(e.to)) continue;
        if (e.to === startAt) {
          /** @type {string[]} */
          const loop = [startAt];
          /** @type {W[]} */
          const wires = [e.wire];
          for (let p = at; p !== startAt; p = /** @type {any} */ (came.get(p)).prev) { loop.splice(1, 0, p); wires.unshift(/** @type {any} */ (came.get(p)).wire); }
          return { loop: [...loop, startAt], wires };
        }
        if (!came.has(e.to)) { came.set(e.to, { prev: at, wire: e.wire }); queue.push(e.to); }
      }
    }
    return { loop: [startAt, startAt], wires: [] };
  });
}
