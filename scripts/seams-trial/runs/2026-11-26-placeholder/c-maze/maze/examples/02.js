import { maze } from "../maze.grammar.js";

// A long corridor of coins: hold A to dash, so one step enters several cells and picks up several coins,
// and run into the far wall.
export default ($) => maze("corridor")
  .param("dash", { value: 4, min: 1, max: 4 })
  .grid([
    "###########",
    "#.ccccccc.#",
    "#.#######.#",
    "#....c....#",
    "###########",
  ])
  .start({ x: 1, y: 1 })
  .tick(1 / 6)
  .control((pl, pad) => {
    pl.dx = pad.right ? 1 : pad.left ? -1 : 0;
    pl.dy = pad.down ? 1 : pad.up ? -1 : 0;
    pl.steps = pad.a ? $.dash : 1;
  });
