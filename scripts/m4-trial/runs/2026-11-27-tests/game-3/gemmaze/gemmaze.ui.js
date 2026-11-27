import { defineUI } from "kit/define";
import { gemmaze } from "./gemmaze.grammar.js";

export const gemmazeUI = defineUI(gemmaze, {
  controls: {
    pad: {
      kind: "buttons", label: "D-pad", buttons: ["up", "down", "left", "right"],
      grid: [[null, "up", null], ["left", null, "right"], [null, "down", null]],
      keys: { up: ["ArrowUp", "KeyW"], down: ["ArrowDown", "KeyS"], left: ["ArrowLeft", "KeyA"], right: ["ArrowRight", "KeyD"] },
    },
  },
  stage: { draw: "view" },
  tiles: {
    score: {
      title: "Gems",
      place: { splitLeft: "stage", size: 0.25 },
      body: [
        { kind: "stat", label: "picked up", value: "collected" },
        { kind: "stat", label: "left", value: (s) => s.gems.length },
      ],
    },
  },
});
