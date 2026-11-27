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

/** The notes a checkpoint keeps: which wires have had each kind of drop noted. @typedef {{ dropNoted: number[], stopNoted: number[], overflowNoted: number[] }} Noted */

/**
 * @param {Wire[]} wires @param {Map<string, Part>} byName
 * @param {(d: Omit<RunDiagnostic, "severity"> & { severity?: "error" | "warning" }) => void} report
 */
export function createDelivery(wires, byName, report) {
  const dropNoted = new Set(), stopNoted = new Set(), overflowNoted = new Set();
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
    for (const rec of recs) w.queue.push({ T, record: stamped(carry(rec, w), T) });
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
    const all = w.queue.splice(0, ready(w, T)).map((x) => x.record);
    if ((!w.overflow && !w.fromPage) || max === undefined || all.length <= max) return all;
    const n = all.length - max;
    w.overflowDrops += n;
    if (!overflowNoted.has(w.index)) {
      overflowNoted.add(w.index);
      const how = w.overflow
        ? `the wire's { overflow: "${w.overflow}" } kept the ${w.overflow === "keepLast" ? "newest" : "first"} ${max} and dropped ${n}`
        : `the page wire ${max === 1 ? "kept only the latest" : `kept the first ${max - 1} in order and folded the rest into the latest`} (the control's held state) and dropped ${n}`;
      report({ code: "N001", severity: "warning", message: `${w.text}: ${all.length} records were ready and ${w.to.part}.in.${w.to.port} takes at most ${max} per step, so ${how}; stats().overflow counts every drop`, part: w.to.part, T: qText(T) });
    }
    if (w.overflow === "keepLast") return all.slice(n);
    if (w.overflow === "keepFirst") return all.slice(0, max);
    return [...all.slice(0, max - 1), all[all.length - 1]];
  }

  return {
    dropStopped, deliver, take,
    /** A part a rebuild restarted: a drop after a later stop, or a later overflow, is noted again (ruling R3). @param {string} part */
    restarted(part) { for (const w of wires) if (w.to.part === part) { stopNoted.delete(w.index); overflowNoted.delete(w.index); } },
    /** @returns {Noted} */
    save: () => ({ dropNoted: [...dropNoted], stopNoted: [...stopNoted], overflowNoted: [...overflowNoted] }),
    /** @param {Noted} cp */
    restore(cp) {
      for (const [set, from] of /** @type {const} */ ([[dropNoted, cp.dropNoted], [stopNoted, cp.stopNoted], [overflowNoted, cp.overflowNoted]])) { set.clear(); for (const n of from) set.add(n); }
    },
    /** Drops per wire, by kind, as stats() reports them. */
    counts() {
      /** @type {Record<string, number>} */
      const dropped = {};
      /** @type {Record<string, number>} */
      const stopped = {};
      /** @type {Record<string, number>} */
      const overflow = {};
      for (const w of wires) { if (w.drops) dropped[w.text] = w.drops; if (w.stopDrops) stopped[w.text] = w.stopDrops; if (w.overflowDrops) overflow[w.text] = w.overflowDrops; }
      return { dropped, stopped, overflow };
    },
  };
}
