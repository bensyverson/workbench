import { defineUI, listOf } from "kit/define";
import { maze } from "./maze.grammar.js";

// The state matches the comment above text(state) in maze.dialect.js.
export const mazeUI = defineUI(maze, {
  state: {
    t: "number",
    score: "number",
    coinsLeft: "number",
    player: { x: "number", y: "number" },
    grid: listOf("string"),
  },
  // 11. the text view is the fallback; the element draws the grid.
  stage: { element: "maze-grid", module: "./maze-grid.js" },
  // 10. the D-pad and A/B, read by control from Pad.
  inputs: {
    object: "Pad",
    buttons: {
      up: { role: "dpad.up" },
      down: { role: "dpad.down" },
      left: { role: "dpad.left" },
      right: { role: "dpad.right" },
      a: { role: "a", label: "Dash" },
      b: { role: "b", label: "Wait" },
    },
  },
  tiles: {
    // 12. readouts below the stage.
    score: {
      title: "Score",
      place: { splitBelow: "stage", size: 0.3 },
      body: [
        { kind: "row", items: [
          { kind: "stat", label: "score", value: "score" },
          { kind: "stat", label: "coins left", value: "coinsLeft" },
        ] },
        { kind: "check", label: "all coins", expect: (s) => s.coinsLeft === 0 },
        // 13. score over the last 30 s.
        { kind: "plot", label: "score", y: "score", window: 30 },
      ],
    },
  },
});
