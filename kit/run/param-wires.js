// The run's param wires (the seams draft's rulings, 2026-11-26, leaf x3iG6D): after each instant, each wire into a
// param reads its producer's output, and when the value differs from what the param will hold at the next instant,
// logs a param input stamped there, marked with the wire (`wire: "<part>.out.<port>"`). The log is the record of
// what was applied, so a run from a log does not log a wire's input twice: an input the log already holds from that
// wire at that stamp is the one this would make.

import { cmp, qText } from "../define/rational.js";
import { misfit } from "../define/params.js";
import { canonical } from "../build/index.js";
import { ends } from "./wires.js";

/** @import { Q } from "../define/rational.js" */
/** @import { Composed } from "../compose/compose.js" */
/** @import { Part } from "./part.js" */
/** @import { Entry } from "./log.js" */
/** @import { RunDiagnostic } from "./codes.js" */

/** Whether a composed wire sets a param: its `to` is `<part>.param.<name>`. @param {{ to: string }} w */
export const intoParam = (w) => ends(w.to).side === "param";

/**
 * @param {Composed} composed @param {Map<string, Part>} byName
 * @param {(d: Omit<RunDiagnostic, "severity"> & { severity?: "error" | "warning" }) => void} report
 */
export function createParamFeed(composed, byName, report) {
  const wires = composed.wires.filter(intoParam).map((w) => ({ from: ends(w.from), to: ends(w.to), source: w.from, text: `${w.from} → ${w.to}` }));
  /** The last value each wire could not set (N008 is noted once per value), by wire. @type {Map<number, string>} */
  const refused = new Map();

  /**
   * After the instant `T`: the inputs each param wire adds, stamped `stamp` (the next instant), given the log.
   * @param {Q} T @param {Q} stamp @param {Entry[]} inputs @param {(e: Entry) => void} insert
   */
  function feed(T, stamp, inputs, insert) {
    wires.forEach((w, i) => {
      const p = byName.get(w.from.part), c = byName.get(w.to.part);
      if (!p || !c || p.state === null) return;
      const value = p.compiled.outputs[w.from.port]?.(p.state, p.params);
      if (value === undefined) return;
      // what the param holds at `stamp`: the log's last param input for it by then, else its value now
      let last = null;
      for (let k = inputs.length - 1; k >= 0 && !last; k--) {
        const e = inputs[k];
        if (e.kind === "param" && e.part === c.name && e.name === w.to.port && cmp(e.T, stamp) <= 0) last = e;
      }
      if (last && last.wire === w.source && cmp(last.T, stamp) === 0) return; // logged: a run from a log
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
      insert({ kind: "param", T: stamp, part: c.name, name: w.to.port, value: structuredClone(value), wire: w.source });
    });
  }

  return {
    feed,
    /** Whether the composition has any param wire. */
    get any() { return wires.length > 0; },
    save: () => ({ refused: [...refused] }),
    /** @param {{ refused: Array<[number, string]> }} cp */
    restore(cp) { refused.clear(); for (const [k, v] of cp.refused) refused.set(k, v); },
  };
}
