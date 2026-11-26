import { defineRuntime } from "kit/define";
import { maze } from "./maze.grammar.js";

// The D-pad when nothing is held (controls.pad is absent until the first press).
const NO_PAD = { up: false, down: false, left: false, right: false, a: false, b: false };

// The most cells one step may walk: the dash param's max (maze.grammar.js and examples declare 4).
const MAX_STEPS = 4;

export const mazeRuntime = defineRuntime(maze, {
  clock: (record) => ({ tick: record.tick ?? 1 / 8 }),
  init: (record) => ({
    t: 0,
    score: 0,
    coinsLeft: record.grid.join("").split("c").length - 1,
    player: { x: record.start.x, y: record.start.y },
    grid: [...record.grid],
  }),
  step(state, { T, dt, controls, kernels, events }) {
    // control sets the player's intent (direction and cells to walk) from the D-pad.
    const pad = { ...NO_PAD, ...controls.pad };
    const pl = { x: state.player.x, y: state.player.y, dx: 0, dy: 0, steps: 0 };
    kernels.control(pl, pad);

    // Walk one cell at a time, stopping at walls and the grid's edge; each coin entered is taken.
    const grid = [...state.grid];
    const dx = Math.sign(pl.dx);
    const dy = Math.sign(pl.dy);
    const steps = Math.min(MAX_STEPS, Math.max(0, Math.floor(pl.steps)));
    let { x, y } = pl;
    let coinsLeft = state.coinsLeft;
    let score = state.score;
    for (let i = 0; i < steps && (dx || dy); i++) {
      const nx = x + dx;
      const ny = y + dy;
      const row = grid[ny];
      if (row === undefined || row[nx] === undefined || row[nx] === "#") break;
      x = nx;
      y = ny;
      if (row[nx] === "c") {
        grid[ny] = row.slice(0, nx) + "." + row.slice(nx + 1);
        coinsLeft -= 1;
        score += 1;
        events.pickup.push({ at: [x, y], left: coinsLeft, when: T });
      }
    }

    return { ...state, t: state.t + dt, score, coinsLeft, player: { x, y }, grid };
  },
  events: { out: { pickup: MAX_STEPS } },
});
