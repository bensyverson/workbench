import { defineUI } from "kit/define";
import { maze } from "./maze.grammar.js";

// The passing fixture for the maze package: a text-view stage, two readouts (its retired `inputs` removed 2026-11-27).
export const mazeUI = defineUI(maze, {
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
