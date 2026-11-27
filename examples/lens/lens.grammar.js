import { defineGrammar, name, data, listOf } from "kit/define";
import { lensDialect } from "./lens.dialect.js";

// A bench is named; it declares params and lenses, each lens a radius (1 to 40) and a position on the bench.
export const lens = defineGrammar(lensDialect, {
  root: "lens",
  params: { slot: "param" },
  constructs: {
    lens: {
      opens: [name()],
      slots: {
        param: { kind: "decl", args: [name("param"), data({ value: "number", min: "number", max: "number" })], as: "params" },
        lens: { kind: "decl", args: [data({ radius: data("number", { min: 1, max: 40 }), at: data(listOf(data("number", { min: 0, max: 100 }))) })] },
      },
    },
  },
});
