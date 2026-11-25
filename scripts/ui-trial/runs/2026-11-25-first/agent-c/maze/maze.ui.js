import { defineUI, listOf } from "kit/define";
import { maze } from "./maze.grammar.js";

export const mazeUI = defineUI(maze, {
  state: {
    t: "number",
    score: "number",
    coinsLeft: "number",
    player: { x: "number", y: "number" },
    grid: listOf("string"),
  },
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
    status: {
      title: "Status",
      place: { splitBelow: "stage", size: 0.3 },
      body: [
        { kind: "row", items: [
          { kind: "stat", label: "score", value: "score" },
          { kind: "stat", label: "coins left", value: "coinsLeft" },
        ] },
        { kind: "check", label: "all coins", expect: (s) => s.coinsLeft === 0 },
        { kind: "plot", label: "score", y: "score", window: 30 },
      ],
    },
  },
});
