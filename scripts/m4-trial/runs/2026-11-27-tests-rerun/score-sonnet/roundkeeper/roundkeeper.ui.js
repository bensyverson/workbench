import { defineUI } from "kit/define";
import { roundkeeper } from "./roundkeeper.grammar.js";

export const roundkeeperUI = defineUI(roundkeeper, {
  stage: { draw: "view" },
});
