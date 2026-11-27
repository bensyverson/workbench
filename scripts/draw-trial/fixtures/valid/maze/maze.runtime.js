import { defineRuntime } from "kit/define";
import { maze } from "./maze.grammar.js";

// One step: the Program's control lambda sets the player's intent from the D-pad, then the player walks that many
// cells (at most MAX_STEPS), stopping at a wall, and picks up each coin it enters, pushing one coin record each.

const MAX_STEPS = 4; // the dash param's max: a step walks at most this many cells, so picks at most this many coins
const RELEASED = { up: false, down: false, left: false, right: false, a: false, b: false };
const NO_PAD = { up: false, down: false, left: false, right: false };
const countCoins = (grid) => grid.reduce((n, row) => n + [...row].filter((c) => c === "c").length, 0);
const cellsOf = (grid, ch) => grid.flatMap((row, y) => [...row].flatMap((c, x) => (c === ch ? [{ x, y }] : [])));

export const mazeRuntime = defineRuntime(maze, {
  clock: (record) => ({ tick: record.tick ?? 1 / 8 }),
  init: (record) => ({ t: 0, pad: NO_PAD, score: 0, coinsLeft: countCoins(record.grid), player: { x: record.start.x, y: record.start.y }, grid: [...record.grid], walls: cellsOf(record.grid, "#"), coins: cellsOf(record.grid, "c") }),
  step(state, { dt, kernels, inputs, events }) {
    const pl = { x: state.player.x, y: state.player.y, dx: 0, dy: 0, steps: 0 };
    // the pad is held from the last record taken until the next one
    const pad = inputs.pad.length ? inputs.pad.at(-1) : state.pad;
    kernels.control(pl, { ...RELEASED, ...pad });
    const dx = Math.sign(pl.dx), dy = Math.sign(pl.dy);
    let { x, y } = state.player;
    let grid = state.grid, score = state.score, coinsLeft = state.coinsLeft;
    for (let i = 0; i < Math.min(MAX_STEPS, Math.max(0, Math.floor(pl.steps))); i++) {
      const row = grid[y + dy];
      if (row === undefined || row[x + dx] === undefined || row[x + dx] === "#") break;
      x += dx;
      y += dy;
      if (grid[y][x] === "c") {
        grid = grid.map((r, j) => (j === y ? r.slice(0, x) + "." + r.slice(x + 1) : r));
        score += 1;
        coinsLeft -= 1;
        events.coin.push({ cell: [x, y] });
      }
    }
    return { ...state, pad: { up: pad.up, down: pad.down, left: pad.left, right: pad.right }, t: state.t + dt, score, coinsLeft, player: { x, y }, grid, coins: grid === state.grid ? state.coins : cellsOf(grid, "c") };
  },
  events: { in: { pad: 128 }, out: { coin: MAX_STEPS } },
});
