import { defineRuntime } from "kit/define";
import { drums } from "./drums.grammar.js";

export const drumsRuntime = defineRuntime(drums, {
  clock: (record) => ({ tick: 1 / record.tempo }),             // one step of the pattern per tick
  init: (record) => ({ step: 0, tempo: record.tempo, playing: true }),
  step(state, { record, inputs, kernels, events }) {
    const playing = !inputs.mute;
    if (playing) {
      for (const lane of record.lane) {
        if (!lane.steps.includes(state.step)) continue;
        const loud = kernels.accent ? kernels.accent(state.step) : 1;
        events.hit.push({ lane: lane.name, when: state.step, loud });
      }
    }
    return { ...state, step: (state.step + 1) % record.length, playing };
  },
  events: { out: { hit: 4 } },                                  // one per lane, and a pattern has at most 4
});
