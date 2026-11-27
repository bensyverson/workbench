# Report

## Difficulty
1. The glue is about a dozen calls, and `./check.sh` exited 0 on the first run.

## What I built
`workbench.js`, a timed gem hunt composed from `gemgrid` and `scoretimer`:
- The page's D-pad drives the grid game (`page.out.pad` → `level.in.pad`).
- Each `level.out.picked` record scores one point (`set: { points: 1 }`) in a 30-second round.
- The score panel is layered over the game with `.show(level.out.view, round.out.view)`, centered along the top of the level.

A person opens the page and steers with the arrows or WASD, collecting gems. The panel shows "GEM HUNT", the score, the seconds left and a time bar, then "OVER". The level is 12 by 8 cells. Its top two rows are solid wall, so the 24-pixel panel hides nothing playable.

The layer is not built, so I have **not seen the combined picture**. The checker validated the layer by the draft's rules and played the page showing only the game's picture.

## Where the docs misled me
Nothing turned out wrong in what I ran. The draft layer calls could only be checked by the stand-in, not by a real kit.

## What I guessed
- **Direction of `.frame(a, b, { scale, offset })`.** `compose/README.md` does not state the formula. I read it as `b = a × scale + offset`, with the top layer's frame as `a` and the bottom's as `b`, going by the plan example `maze.cell → particles.px`. The checker's note (`round.panel → level.px`) shows the path is used, but does not confirm where the panel lands on screen.
- **`set: { points: 1 }` instead of relying on the default.** The Event input's default already gives 1. By my reading of S206, leaving the wire bare would warn and suggest renaming `collected` to `points`, which would score 1, 2, 3 and so on. I did not run the bare wire to confirm this.
- **The shorthand `.show(output, output)` rather than `layer(...)`**, since nothing else needs a handle to the layer.
- **`.part(level)` and `.part(round)` before `.show`.** The draft's shorthand example does this. It does not say whether `.show(output, output)` would add the producers by itself; I took it that it would not (S102, "a handle of a part not added").
- **Placement and level design:** scale 1, because `text` ops do not scale (`draw/README.md`), so a scaled panel would have misaligned glyphs; offset `[16, 0]`; and the wall rows under the panel.
- **When the 30 seconds start:** at the run's first step, not at the first key press. This is the `scoretimer` package's behavior. The game still moves after the round ends, and later gems do not score.

## APIs I fought
None; nothing had to be rewritten.

## Gaps
Nothing blocked the task. One convenience is missing:
- **Placing one layer against another.** To center the panel along the top I computed `(192 − 160) / 2 = 16` by hand from both packages' extents. It goes stale if the map's width changes, although the layer draft aims to avoid typing extents twice. `"fit"` does not serve here: by its definition it would scale the panel by 1.2 and center it over the middle of the level, and text would not scale with it. The smallest change would be an anchor form of the edge, such as `{ scale: 1, anchor: "top" }`.

## Docs I could not reach
`compose/README.md` links to the seams draft and the "layer and package tests plan" under `project/`, which are not in `docs/`. I did not need either.

## Checker runs
1 run. Exit 0, no diagnostic codes. It printed these notes:
- `layer layers: Draw<72>@level.px, page box 192 by 128`
- `level.out.view → layers.in.0: unchanged`
- `round.out.view → layers.in.1: round.panel → level.px, draw, { scale: 1, offset: [16, 0] }`
- the play shows only the bottom producer, because the layer is not built
