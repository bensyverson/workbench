import { defineRuntime } from "kit/define";
import { arcade } from "./arcade.grammar.js";

// Each frame: the picture's builder reads the record and the wired inputs itself, so the state only keeps time.
export const arcadeRuntime = defineRuntime(arcade, {
  clock: () => ({ frame: true }),
  init: () => ({ t: 0 }),
  step(state, { dt }) {
    return { t: state.t + dt };
  },
  events: {},
});
