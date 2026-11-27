import { defineRuntime } from "kit/define";
import { gemmaze } from "./gemmaze.grammar.js";

const TICK = 1 / 30;
const REPEAT_TICKS = 6; // a held direction steps again every 0.2 s
const STEPS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const DIRS = ["up", "down", "left", "right"];

const cellsOf = (rows, mark) => {
  const out = [];
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) if (row[x] === mark) out.push({ at: [x, y] });
  });
  return out;
};
const same = (a, b) => a[0] === b[0] && a[1] === b[1];

export const gemmazeRuntime = defineRuntime(gemmaze, {
  clock: () => ({ tick: TICK }),
  init: (record) => ({
    cols: record.map[0].length,
    rows: record.map.length,
    player: cellsOf(record.map, "@")[0].at,
    walls: cellsOf(record.map, "#"),
    gems: cellsOf(record.map, "*"),
    collected: 0,
    held: { up: false, down: false, left: false, right: false },
    dir: "none",
    wait: 0,
  }),
  step(state, { inputs, events }) {
    let { player, gems, collected, held, dir, wait } = state;

    const move = (d) => {
      const to = [player[0] + STEPS[d][0], player[1] + STEPS[d][1]];
      if (to[0] < 0 || to[1] < 0 || to[0] >= state.cols || to[1] >= state.rows) return;
      if (state.walls.some((w) => same(w.at, to))) return;
      player = to;
      if (gems.some((g) => same(g.at, to))) {
        gems = gems.filter((g) => !same(g.at, to));
        collected += 1;
        events.picked.push({ at: [to[0] + 0.5, to[1] + 0.5], collected });
      }
    };

    let pressed = false;
    for (const rec of inputs.pad) {
      const fresh = DIRS.find((d) => rec[d] && !held[d]);
      held = { up: rec.up, down: rec.down, left: rec.left, right: rec.right };
      if (fresh !== undefined) {
        dir = fresh;
        wait = REPEAT_TICKS;
        pressed = true;
        move(dir);
      } else if (dir === "none" || !held[dir]) {
        // the repeating direction was let go: another one still held takes over after a full interval
        dir = DIRS.find((d) => held[d]) ?? "none";
        wait = REPEAT_TICKS;
      }
    }

    if (!pressed && dir !== "none") {
      wait -= 1;
      if (wait <= 0) {
        move(dir);
        wait = REPEAT_TICKS;
      }
    }

    return { ...state, player, gems, collected, held, dir, wait };
  },
  // pad: a tick of 1/30 s holds 8 display frames of 1/240 s, 2 records each; picked: one per record, or one repeat
  events: { in: { pad: 16 }, out: { picked: 16 } },
});
