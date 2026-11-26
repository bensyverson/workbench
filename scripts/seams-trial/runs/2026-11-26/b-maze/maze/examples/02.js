import { maze } from "../maze.grammar.js";

// A longer corridor with coins down side passages: walk with the D-pad, hold A to dash through open runs.
export default ($) => maze("corridor")
  .param("dash", { value: 3, min: 1, max: 4 })
  .grid([
    "###########",
    "#c.......c#",
    "#.#######.#",
    "#.c.....c.#",
    "#.#.###.#.#",
    "#c#.#c#.#c#",
    "#...#.#...#",
    "###########",
  ])
  .start({ x: 1, y: 6 })
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
