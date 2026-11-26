import { defineGrammar, name, data } from "kit/define";
import { arcadeDialect } from "./arcade.dialect.js";

export const arcade = defineGrammar(arcadeDialect, {
  root: "arcade",
  constructs: {
    arcade: {
      opens: [name()],
      slots: { screen: { kind: "decl", args: [data({ width: data("number", { min: 1 }), height: data("number", { min: 1 }) })], once: true, required: true } },
    },
  },
});
