# Report

## Difficulty
1. The documented `.wire`, `.frame` and `.show` calls covered the whole task, and the first checker run passed.

## What I built
`workbench.js` composes `gemgrid` (part `level`) and `scoretimer` (part `round`):

- `page.out.pad` is wired to `level.in.pad`.
- `level.out.picked` is wired to `round.in.scored` with `set: { points: 1 }`, so each gem scores one point.
- `.show(level.out.view, round.out.view)` draws the score panel over the level. A `.frame` edge (scale 1, offset `[16, 0]`) centers the 160 px panel on the 192 px level.
- The level is 12 by 8 cells with 7 gems. Its top two rows are solid wall, so the panel covers no playable cell. The round lasts 30 s, labelled `GEM HUNT`.

A person steers with the page's D-pad (the arrow keys or WASD, per `docs/kit/page/README.md`) and collects gems. The panel shows the score and seconds left, then `OVER`. The player can still move after that, but nothing more scores.

I did not look at the rendered picture. The placement comes from the declared frame sizes and the checker's layer notes (page box 192 by 128, panel at +[16, 0]).

## Where the docs misled me
Nowhere that I found.

## What I guessed
- **`set: { points: 1 }` rather than relying on the default.** `points` already defaults to 1, so a bare wire should score the same. From the S206 description I expected a bare wire to warn, since `collected` is dropped while `points` takes its default. I did not try the bare wire. `set` states the intent in the glue.
- **No `.worth` or `.target`.** The task asks for one point per gem and names no target. The default worth is 1.
- **Panel position.** The task says "over the game" without a position. I chose top center, over wall rows.
- **Round start.** `scoretimer` starts its round at its first step, so the clock runs from page start, not from the first key press. I took this as acceptable.
- **Level layout.** My own, arranged so the checker's pad script reaches gems.

## APIs I fought
None. Nothing had to be rewritten.

## Gaps
Nothing the task needed was missing.

One minor inconvenience, which the compose README already notes as parked: I computed the panel's centering offset by hand from the two frame widths. An anchored edge (for example "top center") would let the glue say it directly and keep it correct if the level's width changed.

## Docs I could not reach
Some links in the kit docs point to files that are not under `docs/` here, such as the seams draft and the layer and package tests plan in `docs/project/`. I did not need them.

## Checker runs
1 run of `./check.sh`: exit 0, "no violations", with no error or warning codes. It printed only the three `note:` lines describing the layer.
