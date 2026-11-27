import { compose, page } from "kit/compose";
import { gemgrid } from "gemgrid";
import { scoretimer } from "scoretimer";
import { overlay } from "overlay";

export default () => {
  // 12 by 8 cells of 16 pixels. Two rows of wall on top sit under the score panel.
  const level = gemgrid("level").map([
    "############",
    "############",
    "#P..*....*.#",
    "#.##.##.##.#",
    "#.*......*.#",
    "#.##.##.##.#",
    "#.*..*...*.#",
    "############",
  ]);
  const round = scoretimer("round").label("GEM RUSH").lasts(30);
  const screen = overlay("screen").size({ width: 192, height: 128 });

  return compose("timed-gems")
    .part(level).part(round).part(screen)
    .frame(level.frame.px, screen.frame.canvas, { scale: 1, offset: 0 })
    .frame(round.frame.panel, screen.frame.canvas, { scale: 1, offset: [16, 4] })
    .wire(page.out.pad, level.in.pad)
    .wire(level.out.picked, round.in.scored, { set: { points: 1 } })
    .wire(level.out.view, screen.in.under)
    .wire(round.out.view, screen.in.over)
    .show(screen);
};
