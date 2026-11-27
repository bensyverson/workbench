import { defineUI } from "kit/define";
import { overlay } from "./overlay.grammar.js";

export const overlayUI = defineUI(overlay, { stage: { draw: "view" } });
