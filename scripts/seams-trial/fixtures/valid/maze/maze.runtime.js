import { defineRuntime } from "kit/define";
import { maze } from "./maze.grammar.js";

// The maze's runtime (added by leaf ZH4KWX to make the relay's maze runnable; the relay authors described the host
// in prose). One step: the Program's control lambda sets the player's intent from the pad, then the player walks
// that many cells, stopping at a wall, and picks up each coin it enters: an Event pushed to `picked`.

const STILL = { up: false, down: false, left: false, right: false, a: false, b: false };
const countCoins = (grid) => grid.reduce((n, row) => n + [...row].filter((c) => c === "c").length, 0);

export const mazeRuntime = defineRuntime(maze, {
  clock: (record) => ({ tick: record.tick ?? 1 / 8 }),
  init: (record) => ({ t: 0, score: 0, coinsLeft: countCoins(record.grid), player: { x: record.start.x, y: record.start.y }, grid: record.grid, picked: [] }),
  step(state, { dt, part, kernels, controls, events }) {
    const pl = { x: state.player.x, y: state.player.y, dx: 0, dy: 0, steps: 0 };
    kernels[`${part}.control`](pl, controls.pad ?? STILL);
    let { x, y } = state.player;
    let grid = state.grid, score = state.score, coinsLeft = state.coinsLeft;
    const picked = [];
    for (let i = 0; i < pl.steps; i++) {
      const nx = x + Math.sign(pl.dx), ny = y + Math.sign(pl.dy);
      if (grid[ny]?.[nx] === undefined || grid[ny][nx] === "#") break;
      [x, y] = [nx, ny];
      if (grid[y][x] === "c") {
        grid = grid.map((row, j) => (j === y ? row.slice(0, x) + "." + row.slice(x + 1) : row));
        score += 1;
        coinsLeft -= 1;
        picked.push({ at: [x, y] });
        events.picked.push({ at: [x, y] });
      }
    }
    return { t: state.t + dt, score, coinsLeft, player: { x, y }, grid, picked };
  },
  // a dash walks at most 4 cells (the dash param's max), so a step picks at most 4 coins; the state list holds 8
  events: { out: { picked: 8 } },
});
