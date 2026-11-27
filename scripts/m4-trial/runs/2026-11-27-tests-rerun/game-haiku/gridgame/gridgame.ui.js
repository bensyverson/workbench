import { defineUI } from "kit/define";
import { level } from "./gridgame.grammar.js";

export const gridgameUI = defineUI(level, {
  stage: { draw: "view" },
  controls: {
    steer: { kind: "buttons", label: "Steer the figure", buttons: ["up", "down", "left", "right"] },
  },
});
