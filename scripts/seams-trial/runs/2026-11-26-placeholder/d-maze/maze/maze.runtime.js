import { defineRuntime } from "kit/define";
import { maze } from "./maze.grammar.js";

// The most cells one tick may walk. Guess: the docs give no way to bound a step's Events from the Program, so the
// walk is capped here, and the coin Event's max is this cap (each cell picks up at most one coin).
const MAX_WALK = 64;

const countCoins = (grid) => grid.reduce((n, row) => n + [...row].filter((ch) => ch === "c").length, 0);

export const mazeRuntime = defineRuntime(maze, {
  clock: (record) => ({ tick: record.tick ?? 1 / 30 }), // the Grammar leaves tick optional; 1/30 is the fallback
  init: (record) => ({
    t: 0,
    score: 0,
    coinsLeft: countCoins(record.grid),
    player: { x: record.start.x, y: record.start.y },
    grid: [...record.grid],
  }),
  step(state, { T, dt, kernels, controls, events }) {
    // The control lambda sets the player's intent from the D-pad: a direction and how many cells to walk.
    const pad = controls.pad ?? {};
    const player = { x: state.player.x, y: state.player.y, dx: 0, dy: 0, steps: 0 };
    kernels.control(player, {
      up: !!pad.up,
      down: !!pad.down,
      left: !!pad.left,
      right: !!pad.right,
      a: !!pad.a,
      b: !!pad.b,
    });

    const dx = Math.sign(player.dx) || 0;
    const dy = Math.sign(player.dy) || 0;
    const steps = Math.min(MAX_WALK, Math.max(0, Math.floor(player.steps) || 0));
    const grid = [...state.grid];
    let { x, y } = state.player;
    let coinsLeft = state.coinsLeft;
    let score = state.score;

    // Walk one cell at a time, stopping at a wall or the grid's edge; each coin entered is picked up.
    if (dx !== 0 || dy !== 0) {
      for (let i = 0; i < steps; i++) {
        const nx = x + dx;
        const ny = y + dy;
        if (ny < 0 || ny >= grid.length) break;
        const row = grid[ny];
        if (nx < 0 || nx >= row.length || row[nx] === "#") break;
        x = nx;
        y = ny;
        if (row[nx] === "c") {
          grid[ny] = row.slice(0, nx) + "." + row.slice(nx + 1);
          coinsLeft -= 1;
          score += 1;
          events.coin.push({ at: [x + 0.5, y + 0.5], when: T, score });
        }
      }
    }

    return { ...state, t: state.t + dt, score, coinsLeft, grid, player: { x, y } };
  },
  events: { out: { coin: MAX_WALK } },
});
