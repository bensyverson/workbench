import { defineGrammar, name, data } from "kit/define";
import { tallyDialect } from "./tally.dialect.js";

export const tally = defineGrammar(tallyDialect, {
  root: "tally",
  constructs: {
    tally: {
      opens: [name()],
      slots: {
        // .seconds(30): how long the round lasts
        seconds: { kind: "decl", args: [data("number", { min: 1, max: 3600 })], once: true, required: true },
        // .worth(10): the score one point adds (1 if left out)
        worth: { kind: "decl", args: [data("number", { min: 1, max: 1000000, whole: true })], once: true },
        // .goal(100): a target score, shown beside the score
        goal: { kind: "decl", args: [data("number", { min: 1, max: 1000000000, whole: true })], once: true },
        // .title("SPRINT"): the card's heading (the Program's name if left out)
        title: { kind: "decl", args: [data("string")], once: true },
      },
    },
  },
});
