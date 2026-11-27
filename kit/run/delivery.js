// How records cross a run's Event wires: pushed (stamped with the producer's instant, $T), trimmed by a `keepLast`
// input, dropped when the consumer is stopped, and taken by a step, trimmed by the wire's overflow policy (Ben's
// ruling 7, 2026-11-26) or, on a page wire with none, folded into the latest held state. Each kind of drop is counted
// per wire and noted once as an N001 warning: a keepLast drop once per run, a stopped drop and an overflow (or fold)
// drop once per stop of the consumer (a restart clears the note).

import { qText } from "../define/rational.js";
import { carry } from "./carry.js";
import { running } from "./instants.js";
import { ready, stamped } from "./wires.js";

/** @import { Q } from "../define/rational.js" */
/** @import { Part } from "./part.js" */
/** @import { Wire } from "./wires.js" */
/** @import { RunDiagnostic } from "./codes.js" */

/** Whether a record is a pointer move. @param {unknown} r */
const isMove = (r) => r !== null && typeof r === "object" && /** @type {any} */ (r).phase === "move";

/** The notes a checkpoint keeps: which wires have had each kind of drop, and a carry-over, noted. @typedef {{ dropNoted: number[], stopNoted: number[], overflowNoted: number[], carryNoted: number[] }} Noted */

/**
 * @param {Wire[]} wires @param {Map<string, Part>} byName
 * @param {(d: Omit<RunDiagnostic, "severity"> & { severity?: "error" | "warning" }) => void} report
 */
export function createDelivery(wires, byName, report) {
  const dropNoted = new Set(), stopNoted = new Set(), overflowNoted = new Set(), carryNoted = new Set();
  /** @param {Q | null} T */
  const at = (T) => (T ? qText(T) : null);
  /** @param {number} n */
  const records = (n) => (n === 1 ? "1 record was" : `${n} records were`);

  /** Counts records a stopped consumer did not take, noting the first on each wire per stop. @param {Wire} w @param {number} n @param {Q | null} T */
  function dropStopped(w, n, T) {
    w.stopDrops += n;
    if (stopNoted.has(w.index)) return;
    stopNoted.add(w.index);
    report({ code: "N001", severity: "warning", message: `${w.text}: ${w.to.part} is stopped, so it takes no Events: ${records(n)} dropped here; stats().stopped counts every one, and a rebuild that restarts ${w.to.part} starts it with empty queues`, part: w.to.part, T: at(T) });
  }

  /**
   * Sends a producer's records (raw: converted here) across a wire at T: dropped when the consumer is stopped, else
   * queued, stamped, and trimmed to a keepLast input's n. A page input is delivered the same way: every press and
   * release is queued (Ben, 2026-11-26).
   * @param {Wire} w @param {unknown[]} recs @param {Q} T
   */
  function deliver(w, recs, T) {
    if (!running(/** @type {Part} */ (byName.get(w.to.part)))) { if (recs.length) dropStopped(w, recs.length, T); return; }
    for (const rec of recs) {
      const made = { T, record: stamped(carry(rec, w), T) };
      // a run of pointer moves with nothing between them is one move per pointer: each pointer's last (requirement
      // 5). An earlier move of the same pointer in the run leaves it, and the new one goes last, so the queue stays in
      // stamp order and two fingers moving in turn each keep their last move
      if (w.pointer && isMove(made.record)) {
        const id = /** @type {any} */ (made.record).pointer;
        for (let i = w.queue.length - 1; i >= 0 && isMove(w.queue[i].record); i--) {
          if (/** @type {any} */ (w.queue[i].record).pointer === id) { w.queue.splice(i, 1); break; }
        }
      }
      w.queue.push(made);
    }
    if (w.keepLast === null || w.queue.length <= w.keepLast) return;
    const n = w.queue.length - w.keepLast;
    w.queue.splice(0, n);
    w.drops += n;
    if (dropNoted.has(w.index)) return;
    dropNoted.add(w.index);
    report({ code: "N001", severity: "warning", message: `${w.text}: ${w.to.part}.in.${w.to.port} keeps the last ${w.keepLast} records (its delivery), and ${n} were dropped here; stats().dropped counts every drop`, part: w.to.part, T: qText(T) });
  }

  /**
   * Takes a wire's ready records for a step at T, in stamp then push order; with an overflow policy, at most `max`,
   * the newest (keepLast) or the first (keepFirst), dropping and counting the rest. A page wire with no policy folds
   * (Ben, 2026-11-26): the first max-1 in order, then the latest, which is the control's held state, so a release is
   * never lost and no button sticks down; the folded records are counted as overflow.
   * @param {Wire} w @param {Q} T @param {number | undefined} max
   */
  function take(w, T, max) {
    const n = ready(w, T);
    // a delta record (a trigger, a pointer event) is never folded or dropped: past the max it waits for the next step
    if (w.records === "delta" && !w.overflow && max !== undefined && n > max) {
      // each record that waits counts once, however many steps it waits (marked on a copy, so a checkpoint's is not)
      for (let i = max; i < n; i++) if (!w.queue[i].carried) { w.queue[i] = { ...w.queue[i], carried: true }; w.carried += 1; }
      if (!carryNoted.has(w.index)) {
        carryNoted.add(w.index);
        report({ code: "N001", severity: "warning", message: `${w.text}: ${n} records were ready and ${w.to.part}.in.${w.to.port} takes at most ${max} per step, so the step took the first ${max} and the rest carry over to the next steps, in order, each with its own $T; stats().carried counts every one`, part: w.to.part, T: qText(T) });
      }
      return w.queue.splice(0, max).map((x) => x.record);
    }
    // a keyed state Control's waiting records fold to each key's latest; keys past the max wait for the next step
    if (w.keyed && !w.overflow && max !== undefined && n > max) {
      const items = w.queue.splice(0, n);
      /** @type {Map<unknown, number>} */
      const lastOf = new Map();
      items.forEach((x, i) => lastOf.set(/** @type {any} */ (x.record)?.key, i));
      const kept = [...lastOf.values()].sort((a, b) => a - b).map((i) => items[i]);
      const folded = n - kept.length;
      if (folded) {
        w.overflowDrops += folded;
        if (!overflowNoted.has(w.index)) {
          overflowNoted.add(w.index);
          report({ code: "N001", severity: "warning", message: `${w.text}: ${n} records were ready and ${w.to.part}.in.${w.to.port} takes at most ${max} per step, so the keyed Control's records folded to each key's latest, dropping ${folded}; stats().overflow counts every drop`, part: w.to.part, T: qText(T) });
        }
      }
      if (kept.length > max) { const wait = kept.slice(max).map((x) => (x.carried ? x : (w.carried += 1, { ...x, carried: /** @type {const} */ (true) }))); w.queue.unshift(...wait); }
      return kept.slice(0, max).map((x) => x.record);
    }
    const all = w.queue.splice(0, n).map((x) => x.record);
    if ((!w.overflow && !w.fromPage) || max === undefined || all.length <= max) return all;
    const over = all.length - max;
    w.overflowDrops += over;
    if (!overflowNoted.has(w.index)) {
      overflowNoted.add(w.index);
      const how = w.overflow
        ? `the wire's { overflow: "${w.overflow}" } kept the ${w.overflow === "keepLast" ? "newest" : "first"} ${max} and dropped ${over}`
        : `the page wire ${max === 1 ? "kept only the latest" : `kept the first ${max - 1} in order and folded the rest into the latest`} (the control's held state) and dropped ${over}`;
      report({ code: "N001", severity: "warning", message: `${w.text}: ${all.length} records were ready and ${w.to.part}.in.${w.to.port} takes at most ${max} per step, so ${how}; stats().overflow counts every drop`, part: w.to.part, T: qText(T) });
    }
    if (w.overflow === "keepLast") return all.slice(over);
    if (w.overflow === "keepFirst") return all.slice(0, max);
    return [...all.slice(0, max - 1), all[all.length - 1]];
  }

  return {
    dropStopped, deliver, take,
    /** A part a rebuild restarted: a drop after a later stop, or a later overflow, is noted again (ruling R3). @param {string} part */
    restarted(part) { for (const w of wires) if (w.to.part === part) { stopNoted.delete(w.index); overflowNoted.delete(w.index); } },
    /** @returns {Noted} */
    save: () => ({ dropNoted: [...dropNoted], stopNoted: [...stopNoted], overflowNoted: [...overflowNoted], carryNoted: [...carryNoted] }),
    /** @param {Noted} cp */
    restore(cp) {
      for (const [set, from] of /** @type {const} */ ([[dropNoted, cp.dropNoted], [stopNoted, cp.stopNoted], [overflowNoted, cp.overflowNoted], [carryNoted, cp.carryNoted]])) { set.clear(); for (const n of from) set.add(n); }
    },
    /** Drops per wire, by kind, as stats() reports them. */
    counts() {
      /** @type {Record<string, number>} */
      const dropped = {};
      /** @type {Record<string, number>} */
      const stopped = {};
      /** @type {Record<string, number>} */
      const overflow = {};
      /** @type {Record<string, number>} */
      const carried = {};
      for (const w of wires) { if (w.drops) dropped[w.text] = w.drops; if (w.stopDrops) stopped[w.text] = w.stopDrops; if (w.overflowDrops) overflow[w.text] = w.overflowDrops; if (w.carried) carried[w.text] = w.carried; }
      return { dropped, stopped, overflow, carried };
    },
  };
}
