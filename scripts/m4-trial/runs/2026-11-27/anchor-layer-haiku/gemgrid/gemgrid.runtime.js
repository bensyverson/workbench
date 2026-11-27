import { defineRuntime } from "kit/define";
import { gemgrid } from "./gemgrid.grammar.js";

const TICK = 1 / 30;
const DELAY = 8; // ticks a direction is held before it repeats
const REPEAT = 4; // ticks between repeated steps
const STEPS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const DIRS = Object.keys(STEPS);
const PAD_MAX = 16; // the page's worst case for a 1/30 s tick

function cells(rows, char) {
  const found = [];
  rows.forEach((row, y) => row.split("").forEach((c, x) => {
    if (c === char) found.push({ at: [x, y] });
  }));
  return found;
}

export const gemgridRuntime = defineRuntime(gemgrid, {
  clock: () => ({ tick: TICK }),
  init: (record) => ({
    width: record.map[0].length,
    height: record.map.length,
    rows: [...record.map],
    walls: cells(record.map, "#"),
    gems: cells(record.map, "*"),
    player: cells(record.map, "P")[0].at,
    collected: 0,
    held: { up: false, down: false, left: false, right: false },
    moving: "none",
    wait: 0,
  }),
  step(state, { inputs, events }) {
    let { player, gems, collected, held, moving, wait } = state;
    let pressed = false;

    const move = (dir) => {
      const x = player[0] + STEPS[dir][0];
      const y = player[1] + STEPS[dir][1];
      const row = state.rows[y];
      if (row === undefined || x < 0 || x >= row.length || row[x] === "#") return;
      player = [x, y];
      const left = gems.filter((g) => g.at[0] !== x || g.at[1] !== y);
      if (left.length === gems.length) return;
      gems = left;
      collected += 1;
      events.picked.push({ at: [x + 0.5, y + 0.5], collected });
    };

    for (const pad of inputs.pad) {
      const fresh = DIRS.find((d) => pad[d] && !held[d]);
      held = { up: pad.up, down: pad.down, left: pad.left, right: pad.right };
      if (fresh !== undefined) {
        moving = fresh;
        wait = DELAY;
        pressed = true;
        move(fresh);
      } else if (moving === "none" || !held[moving]) {
        moving = DIRS.find((d) => held[d]) ?? "none";
        wait = DELAY;
      }
    }

    if (!pressed && moving !== "none") {
      wait -= 1;
      if (wait <= 0) {
        move(moving);
        wait = REPEAT;
      }
    }

    return { ...state, player, gems, collected, held, moving, wait };
  },
  events: { in: { pad: PAD_MAX }, out: { picked: PAD_MAX + 1 } },
});
