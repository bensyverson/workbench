import { defineGrammar, name, data } from "kit/define";
import { arcadeDialect } from "./arcade.dialect.js";

export const arcade = defineGrammar(arcadeDialect, {
  root: "arcade",
  constructs: {
    arcade: {
      opens: [name()],
      slots: {
        screen: { kind: "decl", args: [data({ width: data("number", { min: 8, max: 4096, whole: true }), height: data("number", { min: 8, max: 4096, whole: true }) })], once: true, required: true },
        title: { kind: "decl", args: [data("string")], once: true, required: true },
      },
    },
  },
});
