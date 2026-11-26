import { defineRuntime } from "kit/define";
import { maze } from "./maze.grammar.js";

// The most cells walked in one step, whatever control asks for. It bounds the Events a step can push.
const MAX_STEPS = 4;
const BUTTONS = ["up", "down", "left", "right", "a", "b"];

const sign = (v) => (v > 0 ? 1 : v < 0 ? -1 : 0);
const open = (grid, x, y) => y >= 0 && y < grid.length && x >= 0 && x < grid[y].length && grid[y][x] !== "#";

export const mazeRuntime = defineRuntime(maze, {
  clock: (record) => ({ tick: record.tick ?? 1 / 8 }),
  init: (record) => ({
    t: 0,
    score: 0,
    coinsLeft: record.grid.join("").split("c").length - 1,
    player: { x: record.start.x, y: record.start.y },
    grid: [...record.grid],
    period: record.tick ?? 1 / 8,
    motion: { x: 0, y: 0 },
    pushing: { x: 0, y: 0 },
  }),
  step(state, { dt, kernels, controls, events }) {
    const held = controls.pad ?? {};
    const pad = {};
    for (const button of BUTTONS) pad[button] = held[button] === true;
    const pl = { x: state.player.x, y: state.player.y, dx: 0, dy: 0, steps: 0 };
    kernels.control(pl, pad);

    const dx = sign(pl.dx);
    const dy = sign(pl.dy);
    const steps = pl.steps > 0 ? Math.min(MAX_STEPS, Math.floor(pl.steps)) : 0;
    const grid = [...state.grid];
    let { x, y } = state.player;
    let { score, coinsLeft } = state;
    let pushing = { x: 0, y: 0 };

    for (let i = 0; i < steps && (dx !== 0 || dy !== 0); i++) {
      // One axis per cell: horizontal first, vertical when horizontal is not asked for or is walled.
      let by;
      if (dx !== 0 && open(grid, x + dx, y)) by = [dx, 0];
      else if (dy !== 0 && open(grid, x, y + dy)) by = [0, dy];
      else {
        const toward = dx !== 0 ? [dx, 0] : [0, dy];
        const stillThere = x === state.player.x && y === state.player.y;
        if (!(stillThere && state.pushing.x === toward[0] && state.pushing.y === toward[1])) {
          events.bumped.push({ at: [x, y], toward });
        }
        pushing = { x: toward[0], y: toward[1] };
        break;
      }
      x += by[0];
      y += by[1];
      events.entered.push({ at: [x, y], by });
      if (grid[y][x] === "c") {
        grid[y] = grid[y].slice(0, x) + "." + grid[y].slice(x + 1);
        score += 1;
        coinsLeft -= 1;
        events.pickup.push({ at: [x, y], score, left: coinsLeft });
        if (coinsLeft === 0) events.cleared.push({ at: [x, y], score });
      }
    }

    return {
      ...state,
      t: state.t + dt,
      score,
      coinsLeft,
      player: { x, y },
      grid,
      motion: { x: (x - state.player.x) / dt, y: (y - state.player.y) / dt },
      pushing,
    };
  },
  events: { out: { pickup: MAX_STEPS, entered: MAX_STEPS, bumped: 1, cleared: 1 } },
});
