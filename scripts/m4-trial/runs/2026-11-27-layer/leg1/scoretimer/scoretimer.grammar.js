import { defineGrammar, name, data } from "kit/define";
import { scoretimerDialect } from "./scoretimer.dialect.js";

export const scoretimer = defineGrammar(scoretimerDialect, {
  root: "scoretimer",
  constructs: {
    scoretimer: {
      opens: [name()],
      slots: {
        lasts: { kind: "decl", args: [data("number", { min: 1, max: 3600, whole: true })], once: true, required: true },
        worth: { kind: "decl", args: [data("number", { min: 1, max: 100, whole: true })], once: true },
        target: { kind: "decl", args: [data("number", { min: 1, max: 99999, whole: true })], once: true },
        label: {
          kind: "decl", args: [data("string")], once: true,
          check(call, ctx) {
            if (call.args[0].length > 19) ctx.error("T001", "a label is at most 19 characters, to fit the panel", { arg: 0, tip: "shorten the label" });
          },
        },
      },
    },
  },
});
