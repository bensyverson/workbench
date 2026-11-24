import { defineGrammar, name, ref, data, oneOf, rest } from "kit/define";
import { data as tint } from "./data.dialect.js";

const ParamShape = oneOf(
  { value: "number", "min?": "number", "max?": "number" },
  { value: "string", options: "string[]" },
);

export const program = defineGrammar(tint, {
  root: "tint",
  constructs: {
    tint: {
      opens: [name()],
      slots: {
        param: { kind: "decl", args: [name("param"), data(ParamShape)], as: "params" },
        tags: { kind: "decl", args: [rest(data("string"))] },
        fn: { kind: "unit", unit: "fn" },
        const: { kind: "unit", unit: "const" },
        pixel: { kind: "lambda", slot: "pixel", once: true, required: true },
      },
      rejected: {
        shader: { message: "raw shader text is not an input language", tip: "write the color as a .pixel lambda" },
      },
    },
    layer: {
      parent: "tint",
      opens: [name("layer"), ref("param")],
      slots: {
        blend: { kind: "lambda", slot: "pixel", once: true },
      },
      record: "calls",
    },
  },
});
