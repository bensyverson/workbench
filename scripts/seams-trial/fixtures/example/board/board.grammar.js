import { defineGrammar, name, data, lambda } from "kit/define";
import { boardDialect } from "./board.dialect.js";

export const board = defineGrammar(boardDialect, {
  root: "board",
  constructs: {
    board: {
      opens: [name()],
      slots: {
        lamps: { kind: "decl", args: [data("number", { min: 1, max: 256, whole: true })], once: true, required: true },
        glow: { kind: "decl", args: [lambda("glow")], once: true, required: true },
      },
    },
  },
});
