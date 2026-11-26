import { defineUI } from "kit/define";
import { maze } from "./maze.grammar.js";

// The passing fixture for the maze package: inputs onto the Dialect's Pad, a text-view stage, two readouts.
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
      place: { splitBelow: "stage" },
      body: [
        { kind: "stat", label: "score", value: "score" },
        { kind: "stat", label: "coins left", value: "coinsLeft", badIf: (s) => s.coinsLeft > 0 && s.t > 60 },
        { kind: "check", label: "all coins", expect: (s) => s.coinsLeft === 0 },
      ],
    },
  },
});
