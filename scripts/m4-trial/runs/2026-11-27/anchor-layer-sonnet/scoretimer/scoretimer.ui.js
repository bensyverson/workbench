import { defineUI } from "kit/define";
import { scoretimer } from "./scoretimer.grammar.js";

export const scoretimerUI = defineUI(scoretimer, { stage: { draw: "view" } });
