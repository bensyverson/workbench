// The run's param wires (the seams draft's rulings, 2026-11-26, leaf x3iG6D): after each instant, each wire into a
// param reads its producer's output, and when the value differs from what the param holds, logs a param input
// stamped with that instant, marked with the wire (`wire: "<part>.out.<port>"`). The scheduler applies a wire's
// input stamped T right after the instant T, ahead of every later instant (R2), so its stamp is a function of the
// instant that made it alone. The log is the record of what was applied, so a run from a log does not log a wire's
// input twice: one the log already holds from that wire at that stamp is the one this would make.

import { qText } from "../define/rational.js";
import { misfit } from "../define/params.js";
import { canonical } from "../build/index.js";
import { ends } from "./wires.js";
import { paramsOf } from "./part.js";

/** @import { Q } from "../define/rational.js" */
/** @import { Composed } from "../compose/compose.js" */
/** @import { Part } from "./part.js" */
/** @import { Entry } from "./log.js" */
/** @import { RunDiagnostic } from "./codes.js" */

/** Whether a composed wire sets a param: its `to` is `<part>.param.<name>`. @param {{ to: string }} w */
export const intoParam = (w) => ends(w.to).side === "param";

/**
 * The run's param wires, and which params the outside or the log has set (a rebuild keeps their values over the
 * declared values of its record; the rest take the record's). `given` is the run's `options.params`.
 * @param {Composed} composed @param {Map<string, Part>} byName
 * @param {(d: Omit<RunDiagnostic, "severity"> & { severity?: "error" | "warning" }) => void} report
 * @param {Record<string, Record<string, unknown>>} [given]
 */
export function createParamFeed(composed, byName, report, given = {}) {
  const wires = composed.wires.filter(intoParam).map((w) => ({ from: ends(w.from), to: ends(w.to), source: w.from, text: `${w.from} → ${w.to}` }));
  /** The last value each wire could not set (N008 is noted once per value), by wire. @type {Map<number, string>} */
  const refused = new Map();
  /** The params set by `given` or a param input applied so far, by part. @type {Map<string, Set<string>>} */
  const set = new Map(Object.entries(given).map(([part, v]) => [part, new Set(Object.keys(v))]));

  /**
   * After the instant `T`: the inputs each param wire adds, stamped `T`. `logged` is what the log holds at `T` not yet
   * applied (a run from a log: the wire's own input, or a host's input after it).
   * @param {Q} T @param {Entry[]} logged @param {(e: Entry) => void} insert
   */
  function feed(T, logged, insert) {
    wires.forEach((w, i) => {
      const p = byName.get(w.from.part), c = byName.get(w.to.part);
      if (!p || !c || p.state === null) return;
      const mine = logged.filter((e) => e.kind === "param" && e.part === c.name && e.name === w.to.port);
      if (mine.some((e) => e.wire === w.source)) return; // logged: a run from a log
      const value = p.compiled.outputs[w.from.port]?.(p.state, p.params, { draws: p.draws });
      if (value === undefined) return;
      // what the param holds right after `T`: the last of those inputs, else its value now
      const last = mine.at(-1);
      if (canonical(value) === canonical(last ? last.value : c.params[w.to.port])) return;
      const decl = c.record.params?.[w.to.port];
      const bad = decl && typeof decl === "object" ? misfit(value, decl) : null;
      if (bad) {
        if (refused.get(i) === canonical(value)) return;
        refused.set(i, canonical(value));
        report({ code: "N008", message: `${w.text}: ${c.name}.$.${w.to.port} ${bad}, so the wire does not set it; ${c.name} keeps its build`, part: c.name, T: qText(T), revision: c.revision });
        return;
      }
      refused.delete(i);
      insert({ kind: "param", T, part: c.name, name: w.to.port, value: structuredClone(value), wire: w.source });
    });
  }

  return {
    feed,
    /** Whether the composition has any param wire. */
    get any() { return wires.length > 0; },
    /** A param input set `part`'s param `name`. @param {string} part @param {string} name */
    noteSet(part, name) { const s = set.get(part) ?? new Set(); s.add(name); set.set(part, s); },
    /**
     * A part's params as `$` reads them after a rebuild to `record`: its declared values, then the values of the
     * params the outside or the log has set (the part's current ones). @param {Part} p @param {Record<string, any>} record
     */
    after(p, record) { return paramsOf(record, Object.fromEntries([...set.get(p.name) ?? []].map((n) => [n, p.params[n]]))); },
    save: () => ({ refused: [...refused], paramsSet: [...set].map(([k, v]) => [k, [...v]]) }),
    /** @param {{ refused: Array<[number, string]>, paramsSet: Array<[string, string[]]> }} cp */
    restore(cp) {
      refused.clear(); for (const [k, v] of cp.refused) refused.set(k, v);
      set.clear(); for (const [k, v] of cp.paramsSet) set.set(k, new Set(v));
    },
  };
}
