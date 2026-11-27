import { defineUI } from "kit/define";
import { cavern } from "./cavern.grammar.js";

export const cavernUI = defineUI(cavern, {
  stage: { draw: "view" },
  controls: {
    move: {
      kind: "buttons",
      label: "Move (arrows or WASD)",
      buttons: ["up", "down", "left", "right"],
      keys: { up: ["ArrowUp", "KeyW"], down: ["ArrowDown", "KeyS"], left: ["ArrowLeft", "KeyA"], right: ["ArrowRight", "KeyD"] },
    },
  },
});
