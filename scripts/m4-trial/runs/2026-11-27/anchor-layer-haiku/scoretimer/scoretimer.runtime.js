import { defineRuntime } from "kit/define";
import { scoretimer } from "./scoretimer.grammar.js";

export const scoretimerRuntime = defineRuntime(scoretimer, {
  clock: () => ({ tick: 0.1 }),
  init: (record) => ({
    score: 0,
    left: record.lasts,
    over: false,
    start: null,
    duration: record.lasts,
    target: record.target ?? 0,
    worth: record.worth ?? 1,
    label: record.label ?? "",
  }),
  step(state, { T, inputs }) {
    if (state.over) return state;
    // init is handed no T, so the round starts at the first step.
    const start = state.start ?? T;
    const end = start + state.duration;
    let score = state.score;
    for (const rec of inputs.scored) {
      // The record's own instant decides: one sent before the end counts even if read at the end.
      if (rec.$T < end - 1e-9) score += Math.max(0, Math.floor(rec.points)) * state.worth;
    }
    const raw = end - T;
    const left = raw < 1e-9 ? 0 : Math.min(raw, state.duration);
    return { ...state, start, score, left, over: left === 0 };
  },
  events: { in: { scored: 64 } },
});
