import { maze } from "../maze.grammar.js";

// A corridor of coins: walk right to pick them up one step at a time; each pickup is a coin record at its cell.
export default ($) => maze("corridor")
  .grid([
    "#######",
    "#.ccc.#",
    "#######",
  ])
  .start({ x: 1, y: 1 })
  .tick(1 / 4)
  .control((pl, pad) => {
    pl.dx = pad.right ? 1 : pad.left ? -1 : 0;
    pl.dy = 0;
    pl.steps = 1;
  });
