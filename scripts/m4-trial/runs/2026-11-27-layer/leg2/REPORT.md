## 1. Difficulty

1. The glue passed on the first check; the two packages' ports fit each other, and the layer draft was enough to write from.

## 2. What I built

`workbench.js` composes `gemgrid` (part `maze`) and `scoretimer` (part `round`):

- The page's D-pad is wired to `maze.in.pad`.
- `maze.out.picked` is wired to `round.in.scored` with `set: { points: 1 }`, so each gem is one point.
- `.show(maze.out.view, round.out.view)` draws the score panel over the game, using the draft's shorthand. The panel is placed with `.frame(round.frame.panel, maze.frame.px, { scale: 1, offset: [16, 4] })`.
- The level is 12 by 8 cells with 7 gems. Its top two rows are solid wall, so the panel hides no play.
- The round is 30 s, labelled "GEM RUSH".

To play, open the folder on the workbench page and steer with the D-pad. The panel shows the score and the seconds left, then OVER. By the package's runtime, the round starts at its first step, not at the first press. The player can still move after it ends, but the score no longer changes.

I have not seen the layered picture. The layer is not built, and the checker plays only the bottom picture. The panel's position rests on the checker's printed conversion and my own arithmetic.

## 3. Where the docs misled me

Nothing led me to a wrong glue. These places are inconsistent or could mislead:

- `docs/kit/START.md` says "Layering is built in" and describes `.show(a, b)` and `layer(...)` in the present tense. `compose/README.md` says "Nothing below runs yet". The task warned me, but START.md alone does not.
- `compose/README.md`: the main API table still says `.show(part)` takes "one", and the S102 row lists `.show` of a non-part as an error. The Layers section extends both, and a reader of the table alone would not know.
- The S206 warning, seen when I removed `set` as an experiment:
  - It begins "maze.out.picked **cannot feed** round.in.scored", although it is a warning and the wire works.
  - It suggests `rename: { collected: "points" }`. Here that would be a bug: `collected` is a running total, so the score would add 1, 2, 3 and so on. The fix text does say to ignore it if the default is intended.
  - Its location was `/private/tmp/teBNYM-2/file:/Users/ben/git/workbench/.claude/worktrees/layer-dogfood-37/scripts/m4-trial/checker/layer-draft.js:117`. That is a checker file joined onto my folder's path, not the line in `workbench.js`. I did not open it.

## 4. What I guessed

- **Direction of `.frame(a, b, { scale, offset })`.** I read it as b = a × scale + offset. The README does not state this. The checker's note (`round.panel → maze.px ... offset: [16, 4]`) is consistent with it.
- **Scale in a layer.** I assumed the `draw` conversion at scale 1 leaves text and rects at their size, only moved.
- **`.part` with the shorthand.** I added both parts with `.part` and passed their outputs to `.show`. The draft's example does this.
- **`set` on a field that has a default.** `points` already defaults to 1, so the wire works without `set`. I used `set: { points: 1 }` to state the intent and to avoid the S206 warning. The docs say a set field "needs no default", but not that setting a defaulted field is the intended way to quiet S206.
- **Overlap.** I assumed that covering walls with the panel is acceptable, and made the level's top rows walls for it.

## 5. APIs I fought

None. I rewrote nothing.

## 6. Gaps

Nothing the task requires was missing. Two smaller needs:

- **Placing one layer relative to another.** I wanted "centered at the top of the bottom picture". `"fit"` would scale the panel and center it vertically over the play, so I computed `offset: [16, 4]` by hand from the level's width (12 × 16 = 192) and the panel's (160). If the level changes size, the offset silently goes stale, although the draft says no extent is typed twice. Smallest change: an alignment form of the edge, for example `{ scale: 1, align: "top" }`.
- **Seeing the layer.** With the layer not built, nothing shows whether the overlay is legible or placed well. Smallest change: have the checker write the concatenated draw list, or an image of it.

## 7. Docs I could not reach

None that I needed. `compose/README.md` links to the layer and package tests plan, the seams draft and `scripts/seams-trial`. I did not try to open them.

## 8. Checker runs

3 runs, all exit 0:

1. The first version of the glue: no violations, only `note:` lines (`Draw<72>@maze.px`, page box 192 by 128).
2. An experiment with `set` removed: S206 (warning), still no violations.
3. The glue restored to the first version: no violations.
