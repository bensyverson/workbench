import { defineRuntime } from "kit/define";
import { lens } from "./lens.grammar.js";

// Each lens is drawn where its record puts it; its Grips' targets are the addresses of its call's arguments (a Ref
// id's #n counts the calls of one slot). The pointer is only counted.
export const lensRuntime = defineRuntime(lens, {
  clock: () => ({ tick: 1 / 30 }),
  events: { in: { pointer: 16 } },
  init: (record) => ({
    seen: 0,
    lenses: (record.lens ?? []).map((l, i) => ({ x: l.at[0], y: l.at[1], r: l.radius, radius: `arg.${record.name}.lens#${i}:0.radius`, at: `arg.${record.name}.lens#${i}:0.at` })),
  }),
  step: (s, { inputs }) => ({ ...s, seen: s.seen + inputs.pointer.length }),
});
