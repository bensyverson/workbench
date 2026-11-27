# M4 trial findings: two Dialects from separate sessions, composed on the page

*2026-11-26, leaf `IhJ35P` (job `SPPLaM`, M4: Composition). The harness is [scripts/m4-trial](../scripts/m4-trial/README.md); the records are in `scripts/m4-trial/runs/2026-11-26/`.*

**The headline.** The M4 pattern works end to end on the real kit, with no stand-ins and no massage. Two blind Sonnet sessions each wrote a Dialect package from scratch out of the kit's own documents: a grid game (`gemgrid`) and a score-and-timer (`scoretimer`). A third blind session, given only those two folders and the same documents, wrote a 30-line glue and a 70-line root package (`overlay`) that layers the two pictures. That hand-in passed the checker on its first run, and it loads and plays on the workbench page as handed in: the D-pad moves the player, pickups score, and the HUD draws over the game ([screenshot](../scripts/m4-trial/screenshot.png)). **The massage was 0 lines.** Each leg rated the work 2 of 5, once a checker defect of mine was fixed. What the legs did find are rough edges: one doc table that is wrong (`init`'s `ctx`), one runtime fact that is in the wrong document (`events.in`), and two composition gaps, both already known (layering needs a whole package, and a relaying Draw input must hard-code its ceiling). They also found that a package author cannot test an Event input alone.

## The trial

Three legs, each a fresh `claude -p --model sonnet` (Sonnet 5.5) in its own folder under `/private/tmp`, with no repository in sight. Each leg got the same documents: `kit/START.md`, `kit/API.md`, `kit/docs/*.md`, the READMEs of define, seam, draw, package, compose, run and page, `kit/define/codes.js` and the package format draft, laid out as in the repository. It also got a task, rules R1 to R7, and `check.sh` and `hash.sh`. The checker is the workbench page's own loader (`kit/page/host/load.js`) in Node, followed by `createPage` on a stub canvas. Every K, S, N, H and LOAD error fails a leg, as do the trial's own T codes (the README lists them).

- **game** (`task-game.md`): a grid game of the author's own design. It needed walls, gems and a player moved by the page's D-pad (an Event input with exactly the pad's seam), each pickup offered as an Event output and the count as a value output, a Draw output using the supplied `sprites.png` as a package data file, a defineUI `stage: { draw }`, and at least one example. The checker plays each example with `page.out.pad` wired in and holds right, then down.
- **score** (`task-score.md`): a score-and-timer of the author's own design, made without seeing the game. It needed a round of declared length, an Event input whose records each score, the end of the round freezing the score, value outputs, and a small Draw output. The checker runs each example for 65 s.
- **compose** (`task-compose.md`): "use both to make a timed game on the page". Each pickup scores one point, the HUD is drawn over the game, and the round lasts 30 s. The checker loads the folder as the page does, then plays 30 s of a fixed pad script, given in the task. It requires the pad wired to the game, a game-to-score wire, both pictures in the shown part, an image drawn, a score state that differs from a run with no input, and the two given packages unchanged.

## The legs

Turns, time and cost come from each transcript's result line (`node scripts/seams-trial/summary.js <leg-dir>`). The checker-run columns come from reading each `log.jsonl` line by line. summary.js counts a `codes` field that this checker began logging only after these runs, so its "first clean" column is wrong for them. That is fixed for later runs.

| Leg | Turns | Time | Cost | Checker runs | Codes along the way | Result | Difficulty |
|---|---|---|---|---|---|---|---|
| game, run 1 | 27 | 188 s | $0.83 | 22 (some on scratch copies) | K011 ×4 (D008, D033, D024 from its own experiments), T006 ×18, T010 ×17, K014 ×1 | never clean: **a checker defect** (below) | 5, from the defect |
| score | 22 | 102 s | $0.56 | 9 | T010, T011, N002 at run 1 (`init` had no `ctx.T`), K012 once (a refusal tried as an example on purpose) | clean from run 2 | 2 |
| compose (on game run 1 and score) | 16 | 77 s | $0.54 | 1 | none | clean at run 1 | 2 |
| game, run 2 (the allowed rerun) | 22 | 105 s | $0.62 | 4 | K014 once (an experiment) | clean at run 1 | 2 |

The total was $2.55. Compose ran on game run 1's hand-in, which checks clean unchanged on the fixed checker. Game run 2 ran in parallel, only to get a difficulty score free of the defect. Both game runs chose the name `gemgrid` independently, with different designs (a run-1 level is a string map with `P` and `*`; run 2 uses a different pace model and an 8-record pad queue).

**The checker defect.** T006 compared the page pad's seam, which `page.out.pad.seam` holds as **text**, with the input's **parsed** seam, so no input could ever match. Game run 1 tried 13 variants (field order, spacing, delivery, defaults, renaming, deliberately wrong seams) and stopped without working around it. That was the right call, and its report pinned the cause exactly: "the checker's comparison … differs from the documentation". The fix lets kit/seam's own `compareSeams` decide, as kit/compose does for the wire. Run 1's hand-in is the regression test. The lesson for the harness is that the draw trial's habit holds: test each check's positive case on a reference before any leg runs. I had tested only the negative case of T006, on the draw trial's maze, which has no pad input at all.

## What the legs found about the design

**Dialect packages: they held.** Every package loaded with no K diagnostic that the leg had not caused on purpose. Each author named its package by its Dialect and hashed it with `hash.sh`. Both authors listed a `refusals` module unprompted (G004 for two starts; T001 for a long label), and checkExamples enforced it: the score author saw K012 and K014 when it moved a refusal around on purpose. One friction point came up: `hash.sh` rewrites the whole manifest's layout, so a hand edit made after the first hash no longer applied as a text patch (score). The score author also could not tell whether `check.sh` ran its refusals. It does, through `checkExamples`, but the task did not say so.

**Data files: they held.** Both game runs copied `sprites.png` into the package, declared it under `images` with `size`, `cell` and `file`, and drew it with `image` ops by cell, with no K017 to K019 at any point. Neither run asked for anything the data-file section lacks. The picture is right on the page: the figure and the gems come from the PNG.

**The Draw stage form: it held.** Both game runs wrote `stage: { draw: "view" }` the first time. The score author wrote a UI that is only that stage, and added nothing. Game run 1 added two `stat` tiles, which show on the page. Draw builders gave the expected small trouble: both game runs moved the map's size into the state because "a string has no `length`" (API.md's advice, followed as written).

**The page: it held.** The composed hand-in loads in the real page (WebKit, headless) with no diagnostics. A scripted 1.2 s hold of right picks up two gems: the score panel reads `SCORE 2` and the tiles read 2 picked up, 5 left. The pad reached the game through `page.out.pad` exactly as kit/compose's README says. No leg needed a UI input (the `inputs.object` naming gap that leaf `dXp5WO` is fixing), so this trial says nothing about it.

**Composition: two known gaps, met as predicted.** The composer's only real work was layering:

- **Layering needs a whole package.** `.show` takes one part, so drawing the HUD over the game took a root package (Dialect, Grammar, runtime, UI, an example; 70 lines) whose builder is `[...layer.under, ...layer.over]`. This is the draw trial's arcade again, and API.md's "Not built" lists a composed page that layers parts. The composer's proposed fix is `.show(level.out.view, round.out.view)`, drawn in order, or a built-in layer part like `page`.
- **A relaying Draw input must fix its ceiling.** `overlay` declares `Draw<302>` and `Draw<8>`, copied from these two producers, so a bigger picture from another package would be S204. The proposed fix is a Draw input whose max comes from the wired producer and carries to the output's max.
- **An extent typed twice.** `overlay`'s `size` (192 by 128) repeats the level's pixel extent by hand. The proposed fix is to let a slot or a frame extent come from another part's frame in the glue.

The composer did one subtle thing right with no help: it wrote `set: { points: 1 }` on the pickup wire rather than lean on the input's default. It did so because `picked` also carries a running total `collected`, which S206's suggestion would have renamed into `points` and scored 1, 2, 3 and so on. The composer also laid the level out with two wall rows under the HUD panel, read off the frames' extents. Frames (`{ scale: 1, offset: [16, 4] }`) and the seam conversions needed no rework.

**Runtimes: where the docs misled.**

- **`init`'s `ctx` has no `T`.** kit/run's README, "What a step is handed", says `init(record, ctx)` and `step(state, ctx)` get the table's keys. Only `inputs` and `events` are marked "step only", but `T` and `dt` are missing in `init` too (`runInit` in `kit/run/part.js` builds `{ part, revision, record, kernels, rng, params, controls, globals }`). The score author read `ctx.T` in `init`, got N002, and moved the round's start into the first step, guessing that step is at the part's start instant. **The doc is wrong.** Either mark `T` and `dt` as step only, or give `init` its start instant. The author asked for the second, since a timer needs it.
- **`events.in` is not in API.md.** All three authors (score, both game runs) found that an Event input needs `events: { in: { <input>: <max> } }` in `defineRuntime` only in kit/define's README. API.md's runtime snippet shows only `events.out`. Game run 2 also found `step`'s `record` only in kit/run's README.
- **Sizing an Event queue from the page's rule is arithmetic every author redid.** "2 per 1/240 s frame in the period" gave 8 records a step at a 1/60 s tick (run 2) and 16 at 1/30 s (run 1). It works, but it is the hardest paragraph each game author hit.

**Testing a package alone: the biggest real gap.** Every author said, unprompted, that it could not test its own Event input. The game could not check that a pad record moves the player, and the score could not check that an event scores or that the end of the round freezes the score. Both game runs and the score author wrote a stub `defineRuntime` and drove `step` by hand in plain Node, outside the kit's scheduler. kit/run can script inputs, but a package may not import it, and no document offers an author a one-part harness. The proposed fix, from all three legs: let a package list run tests in its manifest (an example, scripted inputs on a named port, expected state or Events), which the checker (or the page's Presets) runs.

**Code letters.** The score author gave its own check the code T001, and the trial's checker also prints T codes. The kit does not reserve T, so the two collide in one output. That is a defect of the trial's checker, not the kit's. The next trial's checker should use a letter kit/define reserves for tools, or the kit should reserve one for checkers.

## What it means

- **M4's question is answered yes.** Two Dialects written blind, in separate sessions, composed by a third session that never saw their authors, play together on the page. The composer read only the packages' Dialects (ports with notes, frames with extents) and the kit docs. Its report says the docs misled it nowhere.
- **The next design work is layering, not packages.** The composer's one non-trivial file existed only to stack two pictures, and it had to copy two ceilings and an extent from its neighbors. A layering `show` (or a built-in layer part) together with producer-derived Draw input ceilings would remove `overlay` entirely and make this glue about 20 lines.
- **Give authors a package test harness.** Every author tested its runtime outside the kit. A manifest `tests` entry with scripted inputs would close the gap and is the natural place for refusals' run-time cousins.
- **Fix two doc lines:** kit/run's `ctx` table (`T`, `dt`: step only, or give `init` the start), and API.md's runtime snippet (`events.in`, `record` on step's context).

## Blind-leg harness notes

- **Every leg read files outside its folder, through the harness.** `kit/API.md` (36 KB) exceeds the Bash tool's output limit, so `claude -p` saved the output under `~/.claude/projects/…/tool-results/` and the agent read it there (4 to 11 transcript mentions per leg). Each leg disclosed this against R1 itself. Only the agent's own output went there, so blindness held. A future brief should say to read the docs with the Read tool, by offset, rather than `cat`. Recorded in [gotchas](gotchas.md).
- **The worktree harness refused commands whose text names `git` in a compound form,** as gotchas already records. Probes were run as small Node scripts under `local/`.
