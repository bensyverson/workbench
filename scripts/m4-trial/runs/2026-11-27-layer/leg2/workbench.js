import { compose, page } from "kit/compose";
import { gemgrid } from "gemgrid";
import { scoretimer } from "scoretimer";

export default () => {
  // The top two rows are solid wall, so the score panel (24 px tall) hides no play.
  const maze = gemgrid("maze").map([
    "############",
    "############",
    "#P..*...*..#",
    "#.##.####..#",
    "#*.......#.#",
    "#.##.###...#",
    "#*...*...#*#",
    "############",
  ]);
  const round = scoretimer("round").label("GEM RUSH").lasts(30);

  return compose("gem-rush")
    .part(maze)
    .part(round)
    // The panel (160 x 24) sits at the top of the level (192 x 128 px), centered.
    .frame(round.frame.panel, maze.frame.px, { scale: 1, offset: [16, 4] })
    .wire(page.out.pad, maze.in.pad)
    // One gem, one point: the set says so as data, whatever else a picked record holds.
    .wire(maze.out.picked, round.in.scored, { set: { points: 1 } })
    .show(maze.out.view, round.out.view);
};
