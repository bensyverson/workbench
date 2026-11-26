import { maze } from "../maze.grammar.js";

// Something for every output to report: coins in runs, a dash on A that crosses several cells in one tick and
// stops against a wall, and rows of unequal length (the cell frame's box takes the widest).
export default ($) => maze("runs")
  .grid([
    "#######",
    "#.ccc.#",
    "#c###c#",
    "#.ccc.###",
    "#########",
  ])
  .start({ x: 1, y: 1 })
  .tick(1 / 6)
  .control((pl, pad) => {
    pl.dx = pad.left ? -1 : pad.right ? 1 : 0;
    pl.dy = pad.up ? -1 : pad.down ? 1 : 0;
    pl.steps = pad.a ? 5 : 1;
  });
