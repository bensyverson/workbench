# REPORT

## 1. Difficulty

2 (easy to finish). The glue passed `./check.sh` on the first run; the work that took care was the layer placement arithmetic and deciding what to do with one warning.

## 2. What I built

`workbench.js` alone (no package of my own; `gemgrid/` and `scoretimer/` are untouched). It is a composition named `coin-round`:

- **Level:** a 12 by 8 grid built with `gemgrid("Coins").map(LEVEL)`. The top and bottom wall rows and the two bottom rows are walls. The player starts at P in row 1 and has five gems in reach (the first is at column 5 of row 1).
- **Round:** `scoretimer("Round").label("GEM ROUND").lasts(30)`. No `worth` is declared, so each gem scores the Dialect default of 1 point.
- **Wires:** `page.out.pad` → `game.in.pad` (the D-pad); `game.out.picked` → `round.in.scored` (each gem is one scoring event, with `points` taking its default of 1).
- **Picture:** `.show(game.out.view, round.out.view)` shows the game's picture under the score panel. The panel is placed by `.frame(round.frame.panel, game.frame.px, { scale: 1, offset: [16, 104] })`, which centres its 160 by 24 pixels across the 192 by 128 box and sits it over the bottom two wall rows.

How a person uses it: open the workbench page, use the arrow keys (or WASD) to walk the grid. Each gem picked up adds 1 to the score shown in the panel at the bottom. The panel shows the label, the score and "T n" (seconds left) for 30 seconds, then "OVER".

Checker output for the composition: `workbench.js:28` has one S206 warning (the default-filled `points`, see below). The layer note reads `Coins.out.view → layers.in.0: unchanged` and `Round.out.view → layers.in.1: … ×1 +[16, 104]`, and the page box is 192 by 128.

## 3. Where the docs misled me

Nothing I followed turned out to be wrong. The places that cost me time:

- **`docs/kit/compose/README.md`, the S206 entry and the printed fix.** The fix text offers a `rename: { collected: "points" }` that would score a running total, and the doc says to ignore it when the default is intended. It is correct to ignore, but the warning fires on every intended Event default, so a clean composition still prints a warning. I did not silence it (see Gaps).
- **Worth default (`scoretimer/scoretimer.dialect.js`, `scoretimer.grammar.js`).** The Dialect note says a scoring event adds `points × the Program's worth`, and the Grammar's `worth` slot has no default. The "one point per gem" result depends on the runtime's `record.worth ?? 1` in `scoretimer/scoretimer.runtime.js`. That default is not stated in any document I read. I read the runtime (it is inside the package folder) to confirm it.
- **Links I could not follow** (listed in section 7). These did not block me, but several docs cite them as the reason for a rule.

## 4. What I guessed

- **Level layout and the score panel's position.** I put the panel over the bottom two wall rows so that no gem or the player sits under it. The position [16, 104] is my own arithmetic from the box and the panel size.
- **Panel placement across the level.** I chose the bottom over the top so the panel does not hide the top row of play.
- **The score panel's label**, "GEM ROUND", is my choice. It is 9 characters, under the 19-character limit.
- **Default `points` (1) over a `set`.** The Dialect's own note says a producer with no `points` field counts as 1, and the runtime's default is 1. I used the default rather than `set: { points: 1 }`, which would have silenced the S206 warning. Both give one point per gem.
- **Part names** `Coins` and `Round` are mine.
- **Round start** is whatever the scoretimer's runtime does at its first step (the round starts at the first step, per its comment). The task asks for 30 seconds, so `.lasts(30)`.

## 5. APIs I fought

- **Layer placement (`.frame` with a numeric offset).** To centre a 160-pixel panel in a 192-pixel box and sit it at the bottom, I had to work out the offset by hand: x = (192 − 160) / 2 = 16, y = 128 − 24 = 104. The kit has no anchored placement; the compose doc says one is parked in a backlog I could not read. It worked, but the arithmetic is the composer's, and the frame edge does not know what the panel is.
- **S206 on an intended Event default.** The Event input `scored` declares `points: f64 = 1` so that a producer without `points` counts once per record, which is what I wanted. The checker still warns, and the fix text offers a rename that would be wrong. The warning is correct but noisy, and it fires for the case the default exists for.
- **The page's pad control.** The seam `Event<{ up, down, left, right: bool }>` matched the game's `pad` input exactly, so the wire took no options and did not hit S116 or any fold warning.

## 6. Gaps

Per R5, what I needed, and the smallest change that would let me say it:

1. **Acknowledge an intended default on a wire.** I needed to say "`points` is filled from its default on purpose" so the S206 warning does not appear. Smallest change: a wire option such as `{ fill: true }` (or an S206 acknowledgement) that suppresses that one warning and keeps the default. I did not invent it; I left the warning in place.
2. **Anchored placement of an upper picture.** I needed "centre this picture horizontally and place it at the bottom of the lower one". Smallest change: an anchor option on `.frame` for a `{ scale, offset }` edge, such as `anchor: "bottom-center"`, computed from the two extents. I did this by hand instead.
3. **A package's documented default for a state field.** The composer needs `worth`'s default to know what a gem scores. Smallest change: a `default` on the Grammar slot (or a stated default in the Dialect note) that a composer can read without the runtime. This is a package-side gap, not a kit one.

## 7. Docs I could not reach

These are cited by the docs I read, and are not in `docs/` in my folder. Only `docs/project/2026-11-25-package-format-draft.md` is there among `docs/project/`:

- `docs/project/2026-11-25-seams-draft.md` (cited as "the seams draft" by `docs/kit/compose/README.md` and `docs/kit/START.md`). Missing.
- `docs/project/2026-11-27-layer-and-package-tests-plan.md`, `docs/project/2026-11-27-layer-dogfood-findings.md` and `docs/project/backlog.md` (cited by `docs/kit/compose/README.md`, "Layers"). Missing. The backlog entry on anchored edges is the one I wanted for gap 2.
- `docs/kit/compose/README.md` cites `../../scripts/seams-trial/README.md`, which resolves outside `docs/`. Not reached (R1).
- `docs/kit/compose/README.md` and `docs/kit/API.md` link source files (`glue-load.js`, `param-wires.js`, `layer.js`, `draw.js`, `queues.js`, `preset.js`, `define/codes.js`, `kit/page/host`). I did not open them, since the docs say not to read the kit's source.
- `check.sh` runs a checker at `/Users/ben/git/workbench/.claude/worktrees/layer-rerun-41/scripts/m4-trial/check.js` outside my folder. I did not open it.
- I did not open `transcript.jsonl` or `stderr.txt`, which are in the folder but not in R1's list. I did not need them.

Docs I read in full: `task.md`, `rules.md`, `docs/kit/START.md`, `docs/kit/API.md`, `docs/kit/compose/README.md`, `docs/kit/page/README.md`, `docs/kit/seam/README.md`, `docs/kit/run/README.md`. I did not read `docs/kit/define/README.md`, `docs/kit/draw/README.md`, `docs/kit/package/README.md` or the `docs/kit/docs/` pages, because the composition did not need them.

## 8. Checker runs

- Run 1 (before this file was written): exit code **0**, "no violations". It printed one S206 warning at `workbench.js:28` (intended default, see sections 4 and 6) and the layer notes.
- A further run after this file was written is logged in `log.jsonl`. Its exit code is given in the reply that accompanies this report.
