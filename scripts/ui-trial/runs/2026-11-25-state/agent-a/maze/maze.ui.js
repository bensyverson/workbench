import { defineUI } from "kit/define";
import { maze } from "./maze.grammar.js";

// The state is maze.dialect.js's: t, score, coinsLeft, player, grid.
// 11. No stage key: the stage is the text view, text(state).
export const mazeUI = defineUI(maze, {
  // 10. the D-pad and A/B, read by control as the Pad object.
  inputs: {
    object: "Pad",
    buttons: {
      up: { role: "dpad.up" }, down: { role: "dpad.down" },
      left: { role: "dpad.left" }, right: { role: "dpad.right" },
      a: { role: "a", label: "Dash" },
      b: { role: "b", label: "Wait" },
    },
  },
  tiles: {
    // 12. score and coins left below the stage, with the "all coins" check.
    score: {
      title: "Score",
      place: { splitBelow: "stage", size: 0.3 },
      body: [
        { kind: "row", items: [
          { kind: "stat", label: "score", value: "score" },
          { kind: "stat", label: "coins left", value: "coinsLeft" },
          { kind: "check", label: "all coins", expect: (s) => s.coinsLeft === 0 },
        ] },
        // 13. the score over the last 30 seconds.
        { kind: "plot", label: "score", y: "score", window: 30 },
      ],
    },
  },
});
