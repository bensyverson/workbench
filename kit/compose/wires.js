// Three things about wires that span a composition: a rename of record fields and a wire constant (data only,
// checked against both sides), and the cycles of wires none of which is delayed. None depends on the order the glue
// wrote its lines.

import { didYouMean } from "../define/codes.js";
import { fits } from "../define/ports.js";
import { printSeam, printValue } from "../seam/index.js";

/** @import { Seam } from "../seam/seam.js" */

/** The record a seam carries (an Event's, a list's items', or a record value's), or null. @param {Seam} s @returns {(Seam & { kind: "record" }) | null} */
const recordOf = (s) => (s.kind === "event" || s.kind === "list" ? recordOf(s.of) : s.kind === "record" ? s : null);

/** The same seam with its record replaced by `record`. @param {Seam} s @param {Seam} record @returns {Seam} */
const withRecord = (s, record) => (s.kind === "event" ? { kind: "event", of: record } : s.kind === "list" ? { ...s, of: withRecord(s.of, record) } : record);

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
  return { seam: withRecord(from, { kind: "record", fields }), problems: [] };
}

/** The record at a seam's top that a wire constant may set: an Event's or a record value's, not a list's items. @param {Seam} s @returns {(Seam & { kind: "record" }) | null} */
const topRecord = (s) => (s.kind === "event" ? topRecord(s.of) : s.kind === "record" ? s : null);

/**
 * A wire's `set: { field: value }` (a wire constant, ruled 2026-11-26) against both sides: each field one the
 * consumer's record takes and the producer's (after any rename) does not send (S208 otherwise: a set never
 * overrides), each value a literal that fits the field's seam (S207). Returns the consumer's seam without the set
 * fields, for comparing the rest, or the problems.
 * @param {Seam} from  the producer's seam, renamed @param {Seam} to @param {Record<string, unknown>} set
 * @returns {{ seam: Seam, problems: Array<{ code: "S207" | "S208", message: string, fix: string }> }}
 */
export function applySet(from, to, set) {
  const pairs = Object.entries(set);
  if (!pairs.length) return { seam: to, problems: [] };
  const b = topRecord(to);
  if (!b) {
    const why = recordOf(to) ? "a list's items, and set sets only the fields of an Event's record or of a record value" : "no record into its input";
    return { seam: to, problems: [{ code: "S207", message: `set sets record fields, and this wire carries ${why}`, fix: "remove set" }] };
  }
  const a = topRecord(from);
  const want = Object.keys(b.fields);
  /** @type {Array<{ code: "S207" | "S208", message: string, fix: string }>} */
  const problems = [];
  for (const [k, v] of pairs) {
    if (a && Object.hasOwn(a.fields, k)) problems.push({ code: "S208", message: `set: the output's record sends ${k}, and a wire constant never overrides a field the producer sends`, fix: `remove ${k} from set; to replace the producer's ${k}, rename it to another field` });
    else if (!Object.hasOwn(b.fields, k)) problems.push({ code: "S207", message: `set: the input's record takes no field '${k}'.${didYouMean(k, want)} It takes: ${want.join(", ") || "nothing"}`, fix: `set one of the input's fields: ${want.map((f) => `"${f}"`).join(", ")}` });
    else {
      const bad = fits(b.fields[k], v);
      if (bad) problems.push({ code: "S207", message: `set: ${k} = ${printValue(/** @type {any} */ (v))} does not fit ${printSeam(b.fields[k])}: ${bad}`, fix: `set ${k} to a value of ${printSeam(b.fields[k])}` });
    }
  }
  if (problems.length) return { seam: to, problems };
  /** @type {Record<string, Seam>} */
  const fields = {};
  for (const [k, f] of Object.entries(b.fields)) if (!Object.hasOwn(set, k)) fields[k] = f;
  const defaults = b.defaults ? Object.fromEntries(Object.entries(b.defaults).filter(([k]) => !Object.hasOwn(set, k))) : undefined;
  return { seam: withRecord(to, { kind: "record", fields, ...(defaults && Object.keys(defaults).length ? { defaults } : {}) }), problems: [] };
}

/**
 * The loops among parts that no delayed wire breaks: each as the parts in order, starting at the earliest part
 * (in the order parts were added) and following the earliest next part, so the same wiring gives the same loop
 * whatever order the glue wrote its .wire lines in. Each hop of a loop (two neighbors in it) carries every undelayed
 * wire between those two parts, in the order of their `key`s: delaying one of several parallel wires leaves the loop.
 * @template W
 * @param {string[]} parts  the parts' names, in the order they were added
 * @param {Array<{ from: string, to: string, delay: boolean, wire: W, key: string }>} edges  `key` orders parallel wires, a stable name
 * @returns {Array<{ loop: string[], hops: W[][] }>}
 */
export function undelayedLoops(parts, edges) {
  const order = new Map(parts.map((p, i) => [p, i]));
  const live = edges.filter((e) => !e.delay && e.from !== e.to);
  /** @param {string} p */
  const next = (p) => live.filter((e) => e.from === p).sort((x, y) => (order.get(x.to) ?? 0) - (order.get(y.to) ?? 0) || (x.key < y.key ? -1 : x.key > y.key ? 1 : 0));
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
    /** @type {Map<string, { prev: string } | null>} */
    const came = new Map([[startAt, null]]);
    const queue = [startAt];
    while (queue.length) {
      const at = /** @type {string} */ (queue.shift());
      for (const e of next(at)) {
        if (!inside.has(e.to)) continue;
        if (e.to === startAt) {
          /** @type {string[]} */
          const path = [at];
          for (let p = at; p !== startAt; p = /** @type {any} */ (came.get(p)).prev) path.unshift(/** @type {any} */ (came.get(p)).prev);
          const loop = [...path, startAt];
          const hops = loop.slice(1).map((to, i) => next(loop[i]).filter((x) => x.to === to).map((x) => x.wire));
          return { loop, hops };
        }
        if (!came.has(e.to)) { came.set(e.to, { prev: at }); queue.push(e.to); }
      }
    }
    return { loop: [startAt, startAt], hops: [] };
  });
}
