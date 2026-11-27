import { defineUI } from "kit/define";
import { gemgrid } from "./gemgrid.grammar.js";

export const gemgridUI = defineUI(gemgrid, {
  controls: {
    move: {
      kind: "buttons", label: "D-pad", buttons: ["up", "down", "left", "right"],
      grid: [[null, "up", null], ["left", null, "right"], [null, "down", null]],
      keys: { up: ["ArrowUp", "KeyW"], down: ["ArrowDown", "KeyS"], left: ["ArrowLeft", "KeyA"], right: ["ArrowRight", "KeyD"] },
    },
  },
  stage: { draw: "view" },
  tiles: {
    score: {
      title: "Score",
      place: { splitLeft: "stage", size: 0.25 },
      body: [
        { kind: "stat", label: "Gems", value: (s) => s.picked },
        { kind: "stat", label: "In the level", value: (s) => s.total },
        { kind: "stat", label: "Moves", value: (s) => s.moves },
      ],
    },
  },
});
