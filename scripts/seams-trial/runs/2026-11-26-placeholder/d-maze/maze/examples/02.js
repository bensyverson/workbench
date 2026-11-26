import { maze } from "../maze.grammar.js";

// A one-row corridor of coins, with no tick written: the runtime's fallback clock applies. Left and right walk;
// hold A to walk two cells a tick.
export default ($) => maze("corridor")
  .grid([
    "#.c.c.c.#",
  ])
  .start({ x: 1, y: 0 })
  .control((pl, pad) => {
    pl.dx = pad.right ? 1 : pad.left ? -1 : 0;
    pl.dy = 0;
    pl.steps = pad.a ? 2 : 1;
  });
