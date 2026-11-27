import { defineRuntime } from "kit/define";
import { cavern } from "./cavern.grammar.js";

const DIRECTIONS = [["up", 0, -1], ["down", 0, 1], ["left", -1, 0], ["right", 1, 0]];

function cellsOf(rows, mark) {
  const cells = [];
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) if (row[x] === mark) cells.push([x, y]);
  });
  return cells;
}

export const cavernRuntime = defineRuntime(cavern, {
  clock: () => ({ tick: 1 / 60 }),
  init: (record) => ({
    w: record.rows[0].length,
    h: record.rows.length,
    walls: cellsOf(record.rows, "#"),
    gems: cellsOf(record.rows, "*"),
    player: cellsOf(record.rows, "@")[0],
    collected: 0,
    held: { up: false, down: false, left: false, right: false },
  }),
  step(state, { inputs, events }) {
    let { player, gems, collected, held } = state;
    for (const r of inputs.move) {
      const pressed = DIRECTIONS.find(([d]) => r[d] && !held[d]);
      held = { up: r.up, down: r.down, left: r.left, right: r.right };
      if (!pressed) continue;
      const x = player[0] + pressed[1];
      const y = player[1] + pressed[2];
      // The level's edge stops the player as a wall does.
      if (x < 0 || y < 0 || x >= state.w || y >= state.h) continue;
      if (state.walls.some((p) => p[0] === x && p[1] === y)) continue;
      player = [x, y];
      if (gems.some((p) => p[0] === x && p[1] === y)) {
        gems = gems.filter((p) => p[0] !== x || p[1] !== y);
        collected += 1;
        events.picked.push({ at: [x + 0.5, y + 0.5] });
      }
    }
    return { ...state, player, gems, collected, held };
  },
  events: { in: { move: 16 }, out: { picked: 16 } },
});
