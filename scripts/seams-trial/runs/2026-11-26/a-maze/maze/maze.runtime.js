import { defineRuntime } from "kit/define";
import { maze } from "./maze.grammar.js";

// The most cells one tick walks, whatever control asks for: it bounds the records a tick can push.
const MAX_CELLS = 4;
// The tick's length when the Program writes no .tick().
const DEFAULT_TICK = 1 / 8;

const direction = (v) => (v > 0 ? 1 : v < 0 ? -1 : 0);

const isOpen = (grid, x, y) => y >= 0 && y < grid.length && x >= 0 && x < grid[y].length && grid[y][x] !== "#";

const countCoins = (grid) => grid.reduce((n, row) => n + [...row].filter((ch) => ch === "c").length, 0);

export const mazeRuntime = defineRuntime(maze, {
  clock: (record) => ({ tick: record.tick ?? DEFAULT_TICK }),
  init: (record) => ({
    t: 0,
    score: 0,
    coinsLeft: countCoins(record.grid),
    player: { x: record.start.x, y: record.start.y },
    grid: [...record.grid],
    velocity: { x: 0, y: 0 },
  }),
  step(state, { T, dt, controls, kernels, events }) {
    const held = controls.pad ?? {};
    const pad = {
      up: held.up === true,
      down: held.down === true,
      left: held.left === true,
      right: held.right === true,
      a: held.a === true,
      b: held.b === true,
    };
    const intent = { x: state.player.x, y: state.player.y, dx: 0, dy: 0, steps: 0 };
    kernels.control(intent, pad);

    const dx = direction(intent.dx);
    const dy = direction(intent.dy);
    const cells = intent.steps >= 1 ? Math.min(MAX_CELLS, Math.floor(intent.steps)) : 0;
    const grid = [...state.grid];
    let { x, y } = state.player;
    let { score, coinsLeft } = state;
    const entered = [];

    for (let i = 0; i < cells && (dx !== 0 || dy !== 0); i++) {
      // One axis at a time, so a diagonal never cuts a corner: along x if it is open, else along y.
      let nx = x;
      let ny = y;
      if (dx !== 0 && isOpen(grid, x + dx, y)) nx = x + dx;
      else if (dy !== 0 && isOpen(grid, x, y + dy)) ny = y + dy;
      else {
        events.bump.push({ pos: [x, y], wall: dx !== 0 ? [x + dx, y] : [x, y + dy] });
        break;
      }
      const move = { pos: [nx, ny], from: [x, y], coin: undefined };
      x = nx;
      y = ny;
      if (grid[y][x] === "c") {
        grid[y] = grid[y].slice(0, x) + "." + grid[y].slice(x + 1);
        score += 1;
        coinsLeft -= 1;
        move.coin = { score, left: coinsLeft };
      }
      entered.push(move);
    }

    // The records are pushed after the walk, since each carries the velocity of the whole tick.
    const velocity = { x: (x - state.player.x) / dt, y: (y - state.player.y) / dt };
    const vel = [velocity.x, velocity.y];
    for (const { pos, from, coin } of entered) {
      events.move.push({ pos, from, vel });
      if (!coin) continue;
      events.pickup.push({ pos, vel, score: coin.score, left: coin.left });
      if (coin.left === 0) events.finish.push({ pos, score: coin.score });
    }

    return { t: T, score, coinsLeft, player: { x, y }, grid, velocity };
  },
  events: { out: { pickup: MAX_CELLS, move: MAX_CELLS, bump: 1, finish: 1 } },
});
