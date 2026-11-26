import { maze } from "../maze.grammar.js";

// Walk with the D-pad; hold A to dash, hold B to stand still.
export default ($) => maze("coins")
  .param("dash", { value: 2, min: 1, max: 4 })
  .grid([
    "#########",
    "#..c..c.#",
    "#.##.##.#",
    "#c.....c#",
    "#########",
  ])
  .start({ x: 1, y: 1 })
  .tick(1 / 8)
  .control((pl, pad) => {
    pl.dx = 0;
    pl.dy = 0;
    if (pad.left) pl.dx = -1;
    if (pad.right) pl.dx = 1;
    if (pad.up) pl.dy = -1;
    if (pad.down) pl.dy = 1;
    pl.steps = pad.b ? 0 : pad.a ? $.dash : 1;
  });
