import { defineGrammar, name, data } from "kit/define";
import { tallyDialect } from "./tally.dialect.js";

export const tally = defineGrammar(tallyDialect, {
  root: "tally",
  constructs: {
    tally: {
      opens: [name()],
      slots: {
        seconds: { kind: "decl", args: [data("number", { min: 1, max: 3600, whole: true })], once: true, required: true },
        worth: { kind: "decl", args: [data("number", { min: 1, whole: true })], once: true },
        goal: { kind: "decl", args: [data("number", { min: 1, whole: true })], once: true },
        label: {
          kind: "decl", args: [data("string")], once: true,
          check(call, ctx) {
            if (call.args[0].length > 8) ctx.error("Q001", "a label is at most 8 characters, so it fits the panel", { arg: 0, tip: "shorten the label" });
          },
        },
      },
    },
  },
});
