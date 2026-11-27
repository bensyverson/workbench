// Gem dash: walk the level with the D-pad and pick up as many gems as you can
// in 30 seconds. Each gem is one point.
import { compose, page } from "kit/compose";
import { gemgrid } from "gemgrid";
import { scoretimer } from "scoretimer";

export default () => {
  // The two top rows are solid wall, so the score panel (24 px tall) hides
  // nothing a player needs to see.
  const level = gemgrid("level")
    .map([
      "############",
      "############",
      "#P..*...*..#",
      "#.##.##.##.#",
      "#*...##...*#",
      "#.##....##.#",
      "#..*.##.*..#",
      "#*........*#",
      "############",
    ]);

  const round = scoretimer("round")
    .label("GEM DASH")
    .lasts(30);

  return compose("gem-dash")
    .part(level)
    .part(round)
    .wire(page.out.pad, level.in.pad)
    // One point per pickup. `collected` is a running total, so it is not
    // renamed into `points`; the set states the intended 1.
    .wire(level.out.picked, round.in.scored, { set: { points: 1 } })
    // Panel at the top middle of the level, at its own size (text never scales).
    // `anchor` is the draft key of compose/README.md; the kit does not have it yet.
    .frame(round.frame.panel, level.frame.px, { scale: 1, offset: [16, 0] })
    .show(level.out.view, round.out.view);
};
