import { defineGrammar, name, data, lambda } from "kit/define";
import { mazeDialect } from "./maze.dialect.js";

export const maze = defineGrammar(mazeDialect, {
  root: "maze",
  params: { slot: "param" },
  constructs: {
    maze: {
      opens: [name()],
      slots: {
        param: { kind: "decl", args: [name("param"), data({ value: "number", min: "number", max: "number" })], as: "params" },
        grid: { kind: "decl", args: [data("string[]")], once: true, required: true },
        start: { kind: "decl", args: [data({ x: data("number", { min: 0, whole: true }), y: data("number", { min: 0, whole: true }) })], once: true, required: true },
        tick: { kind: "decl", args: [data("number", { min: 0.01, max: 1 })], once: true },
        control: { kind: "decl", args: [lambda("control")], once: true, required: true },
      },
    },
  },
});
