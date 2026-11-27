import { defineRuntime } from "kit/define";
import { tally } from "./tally.grammar.js";

export const tallyRuntime = defineRuntime(tally, {
  clock: (record) => ({ tick: 0.1 }),
  init: (record, ctx) => ({
    score: 0,
    left: record.seconds,
    over: false,
    start: null,
    label: record.label ?? "SCORE",
    goal: record.goal ?? 0,
  }),
  step(state, { T, record, inputs }) {
    const start = state.start ?? T;
    const end = start + record.seconds;
    const worth = record.worth ?? 1;
    let score = state.score;
    // A record counts by when it was sent, not by which step takes it.
    for (const event of inputs.scored) {
      if (event.$T < end) score += event.points * worth;
    }
    const left = Math.max(0, Math.round((end - T) * 1e6) / 1e6);
    return { ...state, start, score, left, over: left === 0 };
  },
  events: { in: { scored: 256 } },
});
