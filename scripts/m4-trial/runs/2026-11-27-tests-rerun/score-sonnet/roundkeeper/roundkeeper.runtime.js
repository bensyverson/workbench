import { defineRuntime } from "kit/define";
import { roundkeeper } from "./roundkeeper.grammar.js";

const EPSILON = 1e-9;

function view(record, start, elapsed, score) {
  const left = Math.max(0, record.seconds - elapsed);
  const over = left <= EPSILON;
  const goal = record.goal;
  const label = record.label === undefined ? "Score" : record.label;
  const shown = Math.ceil(left - EPSILON);
  return {
    start,
    score,
    left: over ? 0 : left,
    over,
    met: goal !== undefined && score >= goal,
    fraction: over ? 0 : left / record.seconds,
    scoreText: label + " " + score + (goal === undefined ? "" : "/" + goal),
    timeText: over ? "TIME UP" : "Time " + shown,
  };
}

export const roundkeeperRuntime = defineRuntime(roundkeeper, {
  clock: () => ({ frame: true }),
  init: (record) => view(record, null, 0, 0),
  step(state, { T, record, inputs }) {
    const start = state.start === null ? T : state.start;
    let score = state.score;
    if (!state.over) {
      const worth = record.worth === undefined ? 1 : record.worth;
      for (const event of inputs.scored) {
        if (event.$T - start < record.seconds - EPSILON) score += worth;
      }
    }
    return view(record, start, state.over ? record.seconds : T - start, score);
  },
  events: { in: { scored: 256 } },
});
