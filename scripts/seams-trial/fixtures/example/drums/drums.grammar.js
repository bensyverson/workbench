import { defineGrammar, name, data, lambda } from "kit/define";
import { drumsDialect } from "./drums.dialect.js";

export const drums = defineGrammar(drumsDialect, {
  root: "drums",
  constructs: {
    drums: {
      opens: [name()],
      slots: {
        length: { kind: "decl", args: [data("number", { min: 1, max: 64, whole: true })], once: true, required: true },
        tempo: { kind: "decl", args: [data("number", { min: 1, max: 32 })], once: true, required: true },
        accent: { kind: "decl", args: [lambda("accent")], once: true },
      },
      check(record, ctx) {
        // the runtime declares at most 4 hits a step: one per lane
        if (record.lane.length > 4) ctx.error("M001", `a pattern has at most 4 lanes, not ${record.lane.length}`, { tip: "merge two lanes" });
      },
    },
    lane: {
      parent: "drums",
      opens: [name(), data("number[]", { as: "steps" })],
    },
  },
});
