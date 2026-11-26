import { maze } from "../maze.grammar.js";

// A small loop that can be cleared quickly, for trying the outputs: every cell walked is a move, pushing into
// a wall is a bump, each coin a pickup and the last one a finish. Hold A to dash several cells in one tick.
export default ($) => maze("loop")
  .param("dash", { value: 3, min: 1, max: 4 })
  .grid([
    "#######",
    "#.ccc.#",
    "#c###c#",
    "#.ccc.#",
    "#######",
  ])
  .start({ x: 1, y: 1 })
  .tick(1 / 10)
  .control((pl, pad) => {
    pl.dx = 0;
    pl.dy = 0;
    if (pad.left) pl.dx = -1;
    if (pad.right) pl.dx = 1;
    if (pad.up) pl.dy = -1;
    if (pad.down) pl.dy = 1;
    pl.steps = pad.b ? 0 : pad.a ? $.dash : 1;
  });
