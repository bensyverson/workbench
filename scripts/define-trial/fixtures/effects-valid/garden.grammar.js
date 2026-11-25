import { defineGrammar, name, data, lambda } from "kit/define";
import { garden as gardenDialect } from "./garden.dialect.js";

export const garden = defineGrammar(gardenDialect, {
  root: "garden",
  params: { slot: "param" },
  constructs: {
    garden: {
      opens: [name()],
      slots: {
        param: { kind: "decl", args: [name("param"), data({ value: "number", min: "number", max: "number" })] },
        total: { kind: "decl", args: [name("total")] },
        rain: { kind: "decl", args: [lambda("rain")], once: true, required: true },
        grow: { kind: "decl", args: [lambda("grow")], once: true },
        sow: { kind: "decl", args: [lambda("sow")], once: true },
      },
    },
  },
});
