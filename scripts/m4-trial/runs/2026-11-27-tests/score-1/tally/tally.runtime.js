import { defineRuntime } from "kit/define";
import { tally } from "./tally.grammar.js";

// Instants are exact in the run but reach a step as floating seconds.
const EPS = 1e-9;

export const tallyRuntime = defineRuntime(tally, {
  clock: () => ({ tick: 1 / 30 }),
  init: (record) => ({
    title: record.title ?? record.name,
    seconds: record.seconds,
    worth: record.worth ?? 1,
    goal: record.goal ?? 0,
    start: null,
    score: 0,
    left: record.seconds,
    shown: Math.ceil(record.seconds),
    over: false,
  }),
  step(state, { T, inputs }) {
    // The round starts at the part's first step.
    const start = state.start ?? T;
    const end = start + state.seconds;
    let score = state.score;
    if (!state.over) {
      for (const rec of inputs.scored) {
        // kept to thousandths, so fractional points still print short
        if (rec.$T < end - EPS && rec.points > 0) score = Math.round((score + rec.points * state.worth) * 1000) / 1000;
      }
    }
    const over = state.over || T >= end - EPS;
    const left = over ? 0 : end - T;
    return { ...state, start, score, left, shown: Math.ceil(left - EPS), over };
  },
  events: { in: { scored: 1024 } },
});
