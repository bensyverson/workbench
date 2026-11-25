import { defineUI } from "kit/define";
import { maze } from "./maze.grammar.js";

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
    readouts: {
      title: "Score",
      place: { splitBelow: "stage" },
      body: [
        { kind: "stat", label: "score", value: (s) => s.score },
        { kind: "stat", label: "coins left", value: (s) => s.coinsLeft },
        { kind: "check", label: "all coins", expect: (s) => s.coinsLeft === 0 },
        { kind: "plot", label: "score", y: (s) => s.score, window: 30 },
      ],
    },
  },
});
