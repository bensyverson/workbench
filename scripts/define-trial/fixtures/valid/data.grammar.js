import { defineGrammar, name, ref, data, lambda, oneOf, rest } from "kit/define";
import { data as tint } from "./data.dialect.js";

const ParamShape = oneOf(
  { value: "number", "min?": "number", "max?": "number" },
  { value: "string", options: "string[]" },
);

export const program = defineGrammar(tint, {
  root: "tint",
  params: { slot: "param" },
  constructs: {
    tint: {
      opens: [name()],
      slots: {
        param: {
          kind: "decl", args: [name("param"), data(ParamShape)], as: "params",
          check({ args: [n, p] }, ctx) {
            if (typeof p.value === "number" && p.value > (p.max ?? Infinity)) ctx.error("T001", `param '${n}': its value ${p.value} lies above its max`, { arg: 1, tip: "lower the value or raise max" });
          },
        },
        tags: { kind: "decl", args: [rest(data("string"))] },
        fn: { kind: "unit", unit: "fn" },
        const: { kind: "unit", unit: "const" },
        pixel: { kind: "decl", args: [lambda("pixel")], once: true, required: true },
      },
      rejected: {
        shader: { message: "raw shader text is not an input language", tip: "write the color as a .pixel lambda" },
      },
    },
    layer: {
      parent: "tint",
      opens: [name(), data({ speed: ref("param"), "from?": ref("layer") }, { as: "with" })],
      record: "calls",
      state: {
        init(opened, { stateOf }) {
          return { channels: opened.with.from ? { ...stateOf(opened.with.from).channels } : { base: "f32" } };
        },
        step(state, call, inferred) {
          if (call.slot === "channel") return { channels: { ...state.channels, [call.args[0]]: inferred } };
          return state;
        },
        names: { channel: (state) => Object.keys(state.channels) },
      },
      slots: {
        channel: { kind: "decl", args: [data("string"), lambda("channel")] },
        mute: { kind: "decl", args: [ref("channel")] },
      },
    },
  },
});
