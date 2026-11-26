import { defineUI } from "kit/define";
import { bounce } from "./bounce.grammar.js";

// A text-view stage, a readout of the rebounds, and a check that the balls stay in the box.
export const bounceUI = defineUI(bounce, {
  tiles: {
    count: {
      title: "Rebounds",
      place: { splitBelow: "stage" },
      body: [
        { kind: "stat", label: "rebounds", value: "rebounds" },
        { kind: "stat", label: "time", value: "t", unit: "s" },
        { kind: "check", label: "balls in the box", expect: (s) => s.balls.length > 0 },
      ],
    },
  },
});
