import { defineGrammar, data, name } from "kit/define";
import { roundkeeperDialect } from "./roundkeeper.dialect.js";

export const roundkeeper = defineGrammar(roundkeeperDialect, {
  root: "roundkeeper",
  constructs: {
    roundkeeper: {
      opens: [name()],
      slots: {
        seconds: { kind: "decl", args: [data("number", { min: 1, max: 3600, whole: true })], once: true, required: true },
        worth: { kind: "decl", args: [data("number", { min: 1, max: 1000, whole: true })], once: true },
        goal: { kind: "decl", args: [data("number", { min: 1, max: 99999, whole: true })], once: true },
        label: {
          kind: "decl", args: [data("string")], once: true,
          check(call, ctx) {
            if (call.args[0].length > 8) ctx.error("Q001", "a label has at most 8 characters, so the scoreboard stays small", { arg: 0, tip: "Shorten the label." });
          },
        },
      },
    },
  },
});
