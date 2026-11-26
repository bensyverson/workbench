import { defineRuntime } from "kit/define";
import { arcade } from "./arcade.grammar.js";

// Each display frame, the HUD's score is copied from the score input into the state, where the view reads it.
export const arcadeRuntime = defineRuntime(arcade, {
  clock: () => ({ frame: true }),
  init: () => ({ score: 0 }),
  step: (state, { inputs }) => ({ score: inputs.score ?? 0 }),
});
