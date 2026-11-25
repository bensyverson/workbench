import { defineUI } from "kit/define";
import { maze } from "./maze.grammar.js";

// No stage: the text view's grid is the stage.
export const mazeUI = defineUI(maze, {
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
          { kind: "check", label: "all coins", expect: (s) => s.coinsLeft === 0 },
        ] },
        { kind: "plot", label: "score", y: "score", window: 30 },
      ],
    },
  },
});
