import { defineRuntime } from "kit/define";
import { board } from "./board.grammar.js";

export const boardRuntime = defineRuntime(board, {
  clock: () => ({ frame: true }),                              // steps with the display
  init: (record) => ({ lamps: record.lamps, lit: 0, shift: 0, levels: new Array(record.lamps).fill(0) }),
  step(state, { dt, inputs, kernels, globals }) {
    const levels = state.levels.map((v) => Math.max(0, v - dt / inputs.fade));
    for (const hit of inputs.flash) {                          // this step's records, in order, in lamps
      const i = Math.round(hit.pos);
      if (i < 0 || i >= levels.length) continue;
      const lamp = { index: i, level: levels[i] };
      globals.hit = hit;                                       // what glow reads as `hit`
      kernels.glow(lamp);                                      // changes lamp in place
      levels[i] = Math.min(1, Math.max(0, lamp.level));
    }
    const lit = levels.filter((v) => v > 0.5).length;
    return { ...state, levels, lit, shift: state.shift + inputs.drift * dt };
  },
  events: { in: { flash: 8 } },                                // the most records one step may take
});
