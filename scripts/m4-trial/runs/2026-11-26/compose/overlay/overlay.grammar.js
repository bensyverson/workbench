import { defineGrammar, name, data } from "kit/define";
import { overlayDialect } from "./overlay.dialect.js";

const side = data("number", { min: 1, max: 1024, whole: true });

export const overlay = defineGrammar(overlayDialect, {
  root: "overlay",
  constructs: {
    overlay: {
      opens: [name()],
      slots: {
        size: { kind: "decl", args: [data({ width: side, height: side })], once: true, required: true },
      },
    },
  },
});
