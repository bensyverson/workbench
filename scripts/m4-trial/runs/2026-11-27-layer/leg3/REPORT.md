# Report

## Difficulty
**1.** The glue passed the checker on its first run. The only real thought went into placing the score panel.

## What I built
`workbench.js`, the composition `gem-rush`:

- `level`: a 12 by 9 gemgrid level (192 by 144 px).
- `round`: a 30 second scoretimer round labelled `GEM RUSH`.
- `page.out.pad` wired to `level.in.pad`.
- `level.out.picked` wired to `round.in.scored` with `set: { points: 1 }`.
- `.show(level.out.view, round.out.view)`: the score panel over the game, at one pixel per unit, centred along the top (`offset: [16, 0]`).

The top two rows of the level are wall, so the 24 px panel hides nothing playable.

**To use it:** load the folder on the workbench page and steer with the D-pad. Each gem scores one point until the 30 seconds run out. After that the player can still move, but the score no longer changes.

**Not verified:** the layered picture itself. The layer is not built, so nothing has drawn the panel over the game. The checker reports `Draw<82>@level.px, page box 192 by 144` with the panel converted by `{ scale: 1, offset: [16, 0] }`, and it plays only the bottom picture.

## Where the docs misled me
Nothing turned out wrong in a way that cost a rewrite. These could mislead:

- `compose/README.md`, "Layers (draft)": it says "no extent is typed twice". For an overlay that is placed rather than stretched, I had to type both widths into the offset by hand: 16 = (192 - 160) / 2.
- `compose/README.md`, "Layers (draft)": it says each input "converts to the bottom input's frame" and does not mention that `text` converts only its `at`, never its size (`draw/README.md`, op table). An overlay at any scale other than 1 gets moved or stretched boxes around 8-unit text. Text is the main thing a score overlay draws.
- `task.md` says the check fails on any diagnostic. In practice, an S206 warning printed and the check still exited 0 with `no violations`.
- Checker (not a document): that S206 was located at `/private/tmp/teBNYM-3/file:/Users/ben/git/workbench/.claude/worktrees/layer-dogfood-37/scripts/m4-trial/checker/layer-draft.js:117`, not at the `.wire` line of `workbench.js`. The stand-in appears to attribute glue diagnostics to its own file. I did not open it.

## What I guessed
- **Direction of `.frame(a, b, { scale, offset })`:** I read it as `b = a * scale + offset`. The `compose/README.md` API table does not say; the plan example (`maze.cell → particles.px, ×32 +[16, 48]`) suggests it. The checker's note echoes the edge as `round.panel → level.px`, but with no drawn picture I could not see it.
- **Parts before a shorthand `.show`:** I called `.part(level)` and `.part(round)` first. The draft's shorthand example does this. It does not say whether `.show(<output>, ...)` alone would add them, as naming a layer adds the layer.
- **Ops outside the box:** the draft gives the box as the bottom producer's extent, but not whether upper ops outside it are clipped. I kept the panel inside it.
- **Tiles and text views under a shown layer:** `.show(part)` shows "that part's stage". The draft does not say what happens to either part's other UI (gemgrid's "Gems" tile, say) when a layer is shown. I assumed nothing I needed depends on it.
- **`set: { points: 1 }` rather than the declared default:** without it the build warns S206 and suggests `rename: { collected: "points" }`. That would be wrong here, since `collected` is a running total (1 + 2 + 3 points). `set` states the intent and silences the warning. The documented alternative is to ignore the warning.
- **Package imports:** the glue imports `{ gemgrid }` and `{ scoretimer }`. I took the export names from each grammar file.

## APIs I fought
None made me rewrite anything. The nearest was S206 (above): its type-compatibility rule proposes a rename that would silently inflate the score, and its only quiet answers are to restate the default with `set` or to live with the warning.

## Gaps
- **Placing one picture on another by anchor.** I needed "the panel at the top, centred, at its own size". `"fit"` would scale it to 192 wide and centre it vertically, over the middle of the game. The only other choice is a hand-computed offset, which goes stale if the level's width changes. Smallest change: an edge such as `{ scale: 1, anchor: "top" }` on `.frame`, computed from the two extents.
- **Text that scales with its frame.** A larger panel (for a 20-wide level, say) cannot have larger text. Smallest change: an optional size or scale on the `text` op that `convertOp` converts. At minimum, the layers section should warn about it.
- **Seeing the layer.** There is no way yet to confirm the overlay's look or the painter's order. This is expected while the layer is unbuilt.

## Docs I could not reach
`compose/README.md` links to `docs/project/2026-11-27-layer-and-package-tests-plan.md` (the layer ruling) and `docs/project/2026-11-25-seams-draft.md`. Neither is in `docs/`. I did not need either.

## Checker runs
3.

1. The final glue: no diagnostics, `no violations`.
2. A temporary variant without `set`, to confirm the warning: S206 (warning), exit 0.
3. The final glue restored: no diagnostics, `no violations`, exit 0.
