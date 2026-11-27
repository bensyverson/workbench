import { defineRuntime } from "kit/define";
import { level } from "./gridgame.grammar.js";

const MOVES = {
  up: [0, -1],
  down: [0, 1],
  left: [-1, 0],
  right: [1, 0],
};
const ORDER = ["up", "down", "left", "right"];

// Walks the player one cell in a direction, unless the cell is a wall or off the level.
// Returns the next state; pushes a pickup record when a gem is taken.
function move(s, dir, events) {
  const [dx, dy] = MOVES[dir];
  const nx = s.player.x + dx;
  const ny = s.player.y + dy;
  const target = s.cells.find((c) => c.x === nx && c.y === ny);
  if (target === undefined || target.wall) return s;
  let next = { ...s, player: { x: nx, y: ny } };
  if (target.gem) {
    next = {
      ...next,
      picked: s.picked + 1,
      cells: s.cells.map((c) => (c.x === nx && c.y === ny ? { ...c, gem: false } : c)),
    };
    events.pickup.push({ at: [nx, ny] });
  }
  return next;
}

export const gridgame = defineRuntime(level, {
  clock: () => ({ tick: 1 / 10 }),

  init: (record) => {
    const cells = [];
    let player = { x: 0, y: 0 };
    record.row.forEach((line, y) => {
      for (let x = 0; x < line.length; x++) {
        const ch = line[x];
        cells.push({ x, y, wall: ch === "#", gem: ch === "*" });
        if (ch === "@") player = { x, y };
      }
    });
    return {
      cells,
      player,
      picked: 0,
      held: { up: false, down: false, left: false, right: false },
    };
  },

  step(state, { inputs, events }) {
    let s = state;
    for (const rec of inputs.steer) {
      // A direction moves the player only when it becomes held, so holding it
      // does not repeat the step; one record can start at most one move.
      const started = ORDER.find((d) => rec[d] && !s.held[d]);
      s = { ...s, held: { up: rec.up, down: rec.down, left: rec.left, right: rec.right } };
      if (started !== undefined) s = move(s, started, events);
    }
    return s;
  },

  events: { in: { steer: 48 }, out: { pickup: 1 } },
});
