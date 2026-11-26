import { maze } from "../maze.grammar.js";

// A wider level, 12 columns by 7 rows, with coins in the corners and along the outer walk.
// Walk with the D-pad; hold A to step two cells at once.
export default ($) => maze("wide")
  .grid([
    "############",
    "#c........c#",
    "#.########.#",
    "#.#c....c#.#",
    "#.#.####.#.#",
    "#.#......#.#",
    "############",
  ])
  .start({ x: 2, y: 1 })
  .tick(1 / 4)
  .control((pl, pad) => {
    pl.dx = 0;
    pl.dy = 0;
    if (pad.left) pl.dx = -1;
    if (pad.right) pl.dx = 1;
    if (pad.up) pl.dy = -1;
    if (pad.down) pl.dy = 1;
    pl.steps = pad.a ? 2 : 1;
  });
