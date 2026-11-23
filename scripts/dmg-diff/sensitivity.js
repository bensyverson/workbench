// How sensitive the differential cases are: textual mutants of emitted lambdas (from
// the IR review's probe p13), each swapped in alone and run through every case of its
// preset. A mutant no case catches is either equivalent under the host, or a gap.

import { swapLambda } from "../dmg-oracle/lambdas.js";
import { runTrace, firstDifference } from "../dmg-oracle/trace.js";
import { inputTrace } from "../dmg-oracle/inputs.js";
import { lowerPreset, emitEntry } from "../dmg-lower/pipeline.js";
import { instantiate } from "../../kit/emit/js/index.js";
import { CASES, builder } from "./differential.js";

/** @import { loadDmg } from "../dmg-oracle/load.js" */

/**
 * @typedef {object} Mutant
 * @property {string} preset
 * @property {string} slot
 * @property {string} from  Text in the emitted source.
 * @property {string} to
 * @property {string} label
 * @property {string} [equivalent]  Why no run can tell it apart, when that is the case.
 */

/** @type {Mutant[]} */
export const MUTANTS = [
  { preset: "04", slot: "timer(spawn)", from: "t1 = w.board.at(w.next);", to: "t1 = w.board.at(0);", label: "the sweep arm picks mole 0" },
  { preset: "04", slot: "timer(spawn)", from: "    return;", to: "    w.sfx(\"pop\"); return;", label: "the early return when no mole is free plays a sound" },
  { preset: "04", slot: "Mole.onFrame#0", from: "if (t0 === 0)", to: "if (self.ttl === 0)", label: "compare the stored ttl, not the unwrapped value",
    equivalent: "ttl is a whole number in [0, 65535], so the unwrapped value and the stored one differ only at -1 / 65535, where neither is 0" },
  { preset: "06", slot: "Countdown.onFrame#0", from: "if (w.secs > 0)", to: "if (true)", label: "drop the secs > 0 guard",
    equivalent: "secs reaching 0 ends the game in the same tick (done), and onFrames do not run while it is over; a restart resets secs" },
  { preset: "06", slot: "done", from: "w.secs === 0", to: "w.secs === 1", label: "the done condition" },
  { preset: "06", slot: "Whackable.method(whack)", from: "return false;", to: "return null;", label: "whack returns null, not false",
    equivalent: "its only caller tests the result for truthiness" },
  { preset: "07", slot: "pools.on(burst)#0", from: "break;", to: "continue;", label: "a full pool continues instead of breaking",
    equivalent: "w.spawn on a full pool returns null with no effect, and the rest of the body is skipped either way" },
  { preset: "07", slot: "Spark.onFrame#0", from: "(t0 === 0) || (self.y > 144)", to: "(t0 === 0) || (self.y >= 144)", label: "boundary y > 144 becomes >=" },
  { preset: "07", slot: "Spark.draw", from: "(self.life > 12)", to: "(self.life >= 12)", label: "boundary life > 12 becomes >=" },
];

/**
 * Runs one mutant through every case of its preset; returns, per case, the seeds on which the trace differed.
 * @param {ReturnType<typeof loadDmg>} dmg
 * @param {Mutant} m
 * @param {{ seeds: number[], frames: number }} run
 * @returns {Array<{ label: string, caught: number[] }>}
 */
export function probe(dmg, m, { seeds, frames }) {
  return CASES.filter((c) => c.preset === m.preset).map((c) => {
    const make = builder(dmg, c);
    const e = lowerPreset({ build: make }, c.preset).entries.find((x) => x.slot.id === m.slot);
    if (!e) throw new Error(`${c.label}: no slot ${m.slot}`);
    const { emitted } = emitEntry(e);
    if (!emitted.source.includes(m.from)) throw new Error(`${c.label} ${m.slot}: the emitted source has no '${m.from}'`);
    const fn = instantiate({ ...emitted, source: emitted.source.replace(m.from, m.to) });
    const caught = seeds.filter((seed) => {
      const opts = { seed, frames, input: inputTrace(seed, frames), ...(c.params ? { params: c.params } : {}) };
      const original = runTrace(make(), opts);
      const b = make();
      swapLambda(b.spec, m.slot, fn);
      return firstDifference(original, runTrace(b, opts)) !== null;
    });
    return { label: c.label, caught };
  });
}
