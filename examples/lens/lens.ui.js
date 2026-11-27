import { defineUI } from "kit/define";
import { lens } from "./lens.grammar.js";

// The bench on a Draw stage that takes the pointer; two Grips per lens: its rim drags the radius, its center the
// position. Each release is written back into the Program's text.
export const lensUI = defineUI(lens, {
  stage: { draw: "view", pointer: "pointer" },
  grips: {
    radius: { each: "lenses", kind: "length", at: (l) => [l.x + l.r, l.y], axis: () => [1, 0], to: (l) => l.radius, label: "radius" },
    move: { each: "lenses", kind: "translate", at: (l) => [l.x, l.y], to: (l) => l.at, label: "position" },
  },
  tiles: { bench: { title: "Bench", place: { splitBelow: "stage" }, body: [{ kind: "stat", label: "pointer events", value: "seen" }] } },
});
