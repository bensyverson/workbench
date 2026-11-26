import { maze } from "../maze.grammar.js";

// A corridor with a coin at each end and walls to bump into: walking it fills the picked, bumped and cleared
// outputs. Walk right to the first coin, then left to the last; the tick that picks it up also clears the maze.
export default ($) => maze("corridor")
  .grid([
    "#######",
    "#c...c#",
    "#######",
  ])
  .start({ x: 3, y: 1 })
  .tick(1 / 4)
  .control((pl, pad) => {
    pl.dx = 0;
    pl.dy = 0;
    if (pad.left) pl.dx = -1;
    if (pad.right) pl.dx = 1;
    if (pad.up) pl.dy = -1;
    if (pad.down) pl.dy = 1;
    pl.steps = pad.b ? 0 : 1;
  });
