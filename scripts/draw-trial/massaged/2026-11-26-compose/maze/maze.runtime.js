import { defineRuntime } from "kit/define";
import { maze } from "./maze.grammar.js";

// One step: the Program's control lambda sets the player's intent from the D-pad, then the player walks that many
// cells (at most MAX_STEPS), stopping at a wall, and picks up each coin it enters, pushing one coin record each.

const MAX_STEPS = 4; // the dash param's max: a step walks at most this many cells, so picks at most this many coins
const RELEASED = { up: false, down: false, left: false, right: false, a: false, b: false };
const countCoins = (grid) => grid.reduce((n, row) => n + [...row].filter((c) => c === "c").length, 0);
// The walls and coins of the grid, row by row, then the player, so the player is drawn on top.
const thingsOf = (grid, player) => [
  ...grid.flatMap((row, y) => [...row].flatMap((c, x) => (c === "#" ? [{ kind: "wall", x, y }] : c === "c" ? [{ kind: "coin", x, y }] : []))),
  { kind: "player", x: player.x, y: player.y },
];

export const mazeRuntime = defineRuntime(maze, {
  clock: (record) => ({ tick: record.tick ?? 1 / 8 }),
  init: (record) => {
    const player = { x: record.start.x, y: record.start.y };
    return { t: 0, score: 0, coinsLeft: countCoins(record.grid), player, grid: [...record.grid], things: thingsOf(record.grid, player) };
  },
  step(state, { dt, kernels, controls, events }) {
    const pl = { x: state.player.x, y: state.player.y, dx: 0, dy: 0, steps: 0 };
    kernels.control(pl, controls.pad ?? RELEASED);
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
    return { ...state, t: state.t + dt, score, coinsLeft, player: { x, y }, grid, things: thingsOf(grid, { x, y }) };
  },
  events: { out: { coin: MAX_STEPS } },
});
