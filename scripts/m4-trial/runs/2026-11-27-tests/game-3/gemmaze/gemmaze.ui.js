import { defineUI } from "kit/define";
import { gemmaze } from "./gemmaze.grammar.js";

export const gemmazeUI = defineUI(gemmaze, {
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
