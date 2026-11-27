# Report

## 1. Difficulty

**2.** The composition was a few lines. The difficulty is that the expected `anchor` refusal stops the checker before it checks anything else, so `./check.sh` verified nothing about the play or the picture.

## 2. What I built

`workbench.js`, composing `gemgrid` (part `level`) and `scoretimer` (part `round`):

- `page.out.pad` → `level.in.pad`.
- `level.out.picked` → `round.in.scored`, with `set: { points: 1 }`.
- `.show(level.out.view, round.out.view)`: the score panel layered over the game.
- `.frame(round.frame.panel, level.frame.px, { scale: 1, anchor: ["center", "min"] })`: the draft anchor, top middle, with no offset.
- A 12 by 9 level with 8 gems. Its two top rows are solid wall, so the panel hides nothing that matters.
- A 30 s round labelled "GEM DASH", one point per gem.

**Use:** open the folder on the workbench page and steer with the D-pad. Gems score while the 30 s round runs.

**State: `./check.sh` exits 1** on the anchor (S257, below), as the task expected. So R7's "exits 0" is not met, and the glue will not build on the current kit.

**Not verified by any run** (checked only by reading the docs and package source):

- The pad wire takes 16 records per step at most, and `gemgrid` accepts 16.
- The `picked` wire holds at most 3 × 17 = 51 records per `scored` step, and `scoretimer` accepts 64.
- Holding right from the start runs along row 2 over the gems in columns 4 and 8, so the pad script should score at least 2.
- The panel is 24 px tall and the two wall rows are 32 px.
- The layering, the image in the shown picture, the page wiring and the state difference are all unchecked.

I did not swap the anchor for `"fit"` or an offset to get further output, because the task says not to work around the refusal.

## 3. Where the docs misled me

- **`task.md`** says the checker will refuse `anchor` "as an unknown key". It does refuse it, but as **S257**, with this text:
  ```
  workbench.js:36: S257 .frame(round.frame.panel, level.frame.px, {"scale":1,"anchor":["center","min"]}): an edge takes only scale and offset, not 'anchor' (there is no rotation in v0)
    fix: .frame(round.frame.panel, level.frame.px, { scale: 32, offset: 16 }), or "fit"
  ```
  This is the checker's message rather than a document, but two parts of it would mislead:
  - "there is no rotation in v0" has nothing to do with `anchor`.
  - Both suggested fixes are wrong for a text panel. `scale: 32` is a canned example, and `"fit"` scales a frame whose glyphs do not scale.
- **`task.md`** says to "judge the rest of the checker's output". There was no rest: one violation and no `note:` lines.
- **`compose/README.md`, "Placing a picture"** says the offset "is computed from the two extents by hand", then points to the draft at the end. This is consistent once you read to the end, but a reader who stops there would hand-compute it.
- Otherwise nothing I could test, since nothing ran past the refusal.

## 4. What I guessed

About the anchor draft:

- **Which frame to anchor on.** I used `level.frame.px`, because `level.out.view` is `Draw@px` and a layer takes its bottom producer's frame. The draft says this, but you have to read the package's Dialect to learn the frame's name. `level.frame.cell` also looks plausible, and with `scale: 1` it would make one panel unit one cell. The draft does not say whether that mistake would be caught.
- **Argument order.** The first frame (the panel) is the one placed within the second's box. The draft's "where on that axis the first frame's box meets the second's" says so, though "meets" took a second reading.
- **`min` on y is the top.** The draft's table of decisions says so. I did not reach for compass words, but I did have to look it up.
- **Omitted `offset` is 0.** Stated in the table; I relied on it.
- **A panel larger than the level.** The draft gives no warning. On a level narrower than 160 px, `center` would silently push text off the canvas. I made the level 192 px wide.

About the composition:

- `set: { points: 1 }` rather than leaving `points` to its default, as S206's description advises. `collected` is a running total and must not be renamed into `points`.
- No `worth` or `target` on the round, since the task asks for one point per gem and no goal.
- The round starts with the game, and the game keeps running after the round ends.

## 5. APIs I fought

None forced a rewrite. `workbench.js` is as first written.

## 6. Gaps

- **`anchor` is not built** (S257). Needed: place the panel at the top middle of the level without computing from extents. Smallest change: build the draft's `anchor` key.
- **S257's message for an unknown edge key.** Smallest change: say which keys exist, drop the rotation remark for keys other than rotation, and do not offer `scale: 32` as a fix. For two Draw frames, offer an edge at `scale: 1`.
- **One refused edge hides every other check.** Needed: to know whether the wires, level and play are right while one `.frame` call is wrong. Smallest change: after an S257, keep checking the wires and print the layer notes, even if the play cannot run.
- **A panel that does not cover the game.** The draft aligns a box inside another (one anchor for both frames), so it cannot put the HUD above the level, and a layer clips to the bottom picture's box. I reserved two wall rows in the level for it, which ties the level's design to the panel's height. Smallest change: let a layer's box grow to hold its inputs, plus separate anchors for the two frames. The draft parks separate anchors until a case asks; this may be one.

## 7. Docs I could not reach

Links in `compose/README.md` and `draw/README.md` to files under `docs/project/` that are not there: the seams draft, the layer dogfood and rerun findings, the layer and package tests plan, the draw-list draft and the backlog. I did not need any of them.

I read nothing outside the folder. The folder also holds `stderr.txt` and `transcript.jsonl`, which R1 does not list; I did not open them.

## 8. Checker runs

**1 run.** It gave S257 (the expected `anchor` refusal), 1 violation, exit 1.
