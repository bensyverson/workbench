import { defineRuntime } from "kit/define";
import { arcade } from "./arcade.grammar.js";

// Each frame: copy the wired numbers into the state, where the picture's builder can read them.
export const arcadeRuntime = defineRuntime(arcade, {
  clock: () => ({ frame: true }),
  init: (record) => ({ title: record.title, width: record.screen.width, height: record.screen.height, score: 0, coinsLeft: 0 }),
  step(state, { inputs }) {
    return { ...state, score: inputs.score, coinsLeft: inputs.coinsLeft };
  },
  events: {},
});
