import { defineUI } from "kit/define";
import { maze } from "./maze.grammar.js";

// The passing fixture for the maze package: its D-pad as a declared Control on in.pad, a text-view stage, two readouts.
export const mazeUI = defineUI(maze, {
  controls: {
    pad: {
      kind: "buttons", label: "D-pad", buttons: ["up", "down", "left", "right"],
      grid: [[null, "up", null], ["left", null, "right"], [null, "down", null]],
      keys: { up: ["ArrowUp", "KeyW"], down: ["ArrowDown", "KeyS"], left: ["ArrowLeft", "KeyA"], right: ["ArrowRight", "KeyD"] },
      gamepad: { up: 12, down: 13, left: 14, right: 15 },
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
