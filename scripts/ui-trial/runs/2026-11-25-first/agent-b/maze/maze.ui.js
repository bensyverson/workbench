import { defineUI, listOf } from "kit/define";
import { maze } from "./maze.grammar.js";

export const mazeUI = defineUI(maze, {
  // Matches the comment above text(state) in maze.dialect.js.
  state: {
    t: "number",
    score: "number",
    coinsLeft: "number",
    player: { x: "number", y: "number" },
    grid: listOf("string"),
  },
  // No stage: the text view is the stage.
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
    score: {
      title: "Score",
      place: { splitBelow: "stage", size: 0.35 },
      body: [
        { kind: "row", items: [
          { kind: "stat", label: "score", value: "score" },
          { kind: "stat", label: "coins left", value: "coinsLeft" },
        ] },
        { kind: "check", label: "all coins", expect: (s) => s.coinsLeft === 0 },
        { kind: "plot", label: "score", y: (s) => s.score, window: 30 },
      ],
    },
  },
});
