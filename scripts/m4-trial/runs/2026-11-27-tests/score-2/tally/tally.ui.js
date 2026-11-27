import { defineUI } from "kit/define";
import { tally } from "./tally.grammar.js";

export const tallyUI = defineUI(tally, { stage: { draw: "view" } });
