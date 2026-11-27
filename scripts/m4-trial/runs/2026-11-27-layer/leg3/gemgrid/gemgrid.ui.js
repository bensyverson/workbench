import { defineUI } from "kit/define";
import { gemgrid } from "./gemgrid.grammar.js";

export const gemgridUI = defineUI(gemgrid, {
  stage: { draw: "view" },
  tiles: {
    score: {
      title: "Gems",
      place: { splitLeft: "stage", size: 0.25 },
      body: [
        { kind: "stat", label: "picked up", value: (s) => s.collected },
        { kind: "stat", label: "left", value: (s) => s.gems.length },
      ],
    },
  },
});
