# M4 trial: two Dialects from separate sessions, composed

M4's closing dogfood trial (leaf `IhJ35P`), the M4 pattern as Ben put it on 2026-11-24: "I have a DSL at bensyverson/mydsl and one on disk; use both to do XYZ". A relay of three blind `claude -p` sessions on the real kit, with no stand-ins: a **game author** writes, from scratch, a grid game Dialect package of their own design (a Draw output, a defineUI Draw stage, a PNG data file, the page's pad as an Event input); a **score author**, in a separate session and without seeing the game, writes a score-and-timer Dialect package; a **composer**, given both hand-ins as their authors left them, writes the glue (and a root package to layer the two pictures) for one stated task, a timed game on the workbench page. The findings are in [project/2026-11-26-m4-trial-findings.md](../../project/2026-11-26-m4-trial-findings.md).

Modeled on the draw-list trial ([scripts/draw-trial](../draw-trial/README.md)): the same run.sh guards, brief shape, exit codes and record layout. Unlike it, the documents an agent gets are the kit's own (`kit/START.md`, `kit/API.md` and the pages they point an author to), not a trial packet, and the checker is the workbench page's own loader on the real kit.

## What is here

| Path | What |
|---|---|
| `brief.md`, `run.sh` | the brief and launcher: `run.sh game\|score <dir> <model>`, `run.sh compose <dir> <model> <game-leg> <score-leg>`. `<dir>` must be fresh, absolute, outside the repository and `~/.claude` (use `/private/tmp/IhJ35P-<leg>`). It copies `rules.md`, the role's task as `task.md`, and the kit's documentation into `docs/`, laid out as in the repository so relative links between the copied pages hold (`kit/START.md`, `kit/API.md`, `kit/docs/*.md`, the READMEs of define, seam, draw, package, compose, run and page, `kit/define/codes.js`, and `project/2026-11-25-package-format-draft.md`); writes `check.sh` and `hash.sh` (`scripts/pkg/hash.js`); the game leg also gets `sprites.png`; a compose leg gets the one package folder of each author leg, as that leg left it. `run.sh layer <dir> <model> <game-leg> <score-leg>` is the layer dogfood's leg (below): a compose leg with `task-layer.md` as its task, its doc copies edited by `layer-docs.js`, and `check.sh` running `--role layer` |
| `docs/` | `rules.md` (R1–R7: what to read, the hand-ins, imports, no invented API, REPORT.md's sections), `task-game.md`, `task-score.md`, `task-compose.md`, and `task-layer.md` (the layer dogfood's compose task: layering is built in per the draft, no package of the composer's own, read long docs by offset) |
| `make-png.js` | `node scripts/m4-trial/make-png.js <out.png>`: the game leg's sprite sheet, 32 by 16, two 16-by-16 cells (a figure, a gem), the same bytes every time; `fixtures/sprites.png` is its output |
| `layer-docs.js` | `node scripts/m4-trial/layer-docs.js <leg>/docs/kit`: edits a layer leg's doc copies, never the repository's: drops the draft's own rewrite of the M4 glue from `compose/README.md` (it is the leg's answer with real names), adds the drafter's two integration lines to `START.md` and `API.md` marked draft, and drops "a composed page that layers parts" from API.md's Not built. Exits 1 when an anchor is missing |
| `check.js`, `checker/` | `node scripts/m4-trial/check.js <package dir> --role game\|score`, `node scripts/m4-trial/check.js <leg dir> --role compose --given <game package> --given <score package>`, with `M4_TRIAL_LOG` appending one JSON line per run. Exit 0 clean, 1 violations, 2 bad invocation, 3 the checker failed (the stack goes only to the log, so a blind leg sees no repository paths), 4 a folder is missing. `checker/env.js` is the page in Node: kit/page/host's loader env (modules from `data:` URLs), a Canvas 2D stub that counts calls, and a `createPage` driven frame by frame at 60 frames a second. `--role layer` (same `--given`) is the layer dogfood's stand-in: `checker/layer-draft.js` replaces the glue's `kit/compose` with kit/compose plus the draft's `layer` and several-output `.show`, recorded rather than run, and `checker/layer-leg.js` judges them by the draft (below), prints each layer as the draft would make it (`note:` lines: its seam, page box and each input's conversion), builds the rest on the real kit with the shown layer's bottom producer shown, and plays the compose leg's pad script on it |
| `test/layer.test.js` | the layer checker on the recorded game and score hand-ins: the draft's own rewrite of the M4 glue checks clean, and each draft refusal below |
| `test/check.test.js` | the CLI's exit codes and log, each leg's codes on the draw trial's massaged hand-ins (which load and play, but are not this trial's game, score or composition), run.sh's guards, and the recorded hand-ins (below) checking clean |
| `runs/<date>/{game,score,compose}/` | the recorded legs: hand-in, `REPORT.md` (the leg's own), `REPLY.md` (its closing reply, saved by the integrator), `log.jsonl`, gzipped transcript (`node scripts/draw-trial/record.js <leg-dir> <record-dir>` copies them) |
| `screenshot.png` | the compose leg's hand-in on the workbench page (WebKit, headless, `sleepy shot` with a key-hold script injected) |

`runs/` imports `kit/define` and `kit/compose` by their bare names, so it is excluded from `tsconfig.json` and kept out of `test/` ([project/gotchas.md](../../project/gotchas.md)).

## The checks

Every leg is loaded the way the workbench page loads it ([kit/page/host](../../kit/page/host/README.md)'s `load.js`): kit/package's `loadPackage` (K codes), kit/compose's check and build (S codes), kit/run and kit/page (N and H codes). Every K, S, N, H and LOAD diagnostic of error severity fails a leg. The trial's own codes:

| Code | Leg | When |
|---|---|---|
| T002 | author | the manifest lists no example |
| T003 | author | the Dialect has no Draw output |
| T004 | game | the UI has no `stage: { draw }` |
| T005 | game | no image with a PNG data file |
| T006 | game | no Event input with exactly the page pad's seam |
| T007 | author | no value output |
| T008 | author | no runtime |
| T009 | author | game: no Event output (a pickup); score: no Event input (a scoring event) |
| T010 | author | game: holding right 1 s, then down 1 s, did not change the picture; score: the picture did not change between the first and third second |
| T011 | all | the shown list was empty at a sample |
| T012 | game | no `drawImage` call on the stub canvas |
| T020 | compose | no `workbench.js`, or the composition did not build |
| T021 | compose | no part of the game's, or of the score's, Dialect |
| T022 | compose | `page.out.pad` is not wired to a game part |
| T023 | compose | no wire from a game part to a score part |
| T024 | compose | the shown part does not take both pictures (a Draw output of each wired into it, or is one of them) |
| T025 | compose | the shown picture drew no image |
| T026 | compose | after 30 s of the pad script (right, down, left, up, 3 s each, repeated), the score parts' state equals a run's with no input |
| T027 | compose | a given package is missing or changed (file for file against the author leg's folder) |

An author leg plays each example as a one-part composition (the game's with `page.out.pad` wired to its pad input) and shows the part; the score leg runs 65 s (`M4_TRIAL_SCORE_SECONDS` shortens it, for the tests). An author leg's structural codes do not stop the play, so a leg sees every problem at once; a K012 from `checkExamples` does.

**The layer leg's checks** (leaf `teBNYM`; the draft is kit/compose/README.md's "Layers (draft)"). Codes printed `(draft)` carry the draft's meaning: S101 (a layer named like a part, the shorthand's `layers` included), S102 (a layer given fewer than two outputs, an output twice, a non-handle, a handle of a part not added, a bad name; `.show` of one output alone, of a mix, or twice), S111 (a layer's `in`, `frame` or `param`, or an output other than `view`), S201 and S204 (a layer wired into a part's input that is not Draw, or smaller), S251 (an input with no frame path to the bottom input's frame, from each part's own edges and the glue's `.frame` calls), S404 (a layer argument that is not a Draw output). The leg's own: T030 a package folder beside the two given ones (layering is built in); T031, a warning for review, a glue literal equal to a producer's declared or built Draw max, a layer's sum or the bottom frame's extent, or a string holding `Draw<`; T032 the shown thing is not a layer of both pictures; T033 the score's picture is under the game's. T020–T023, T025–T027 and T011 are the compose leg's, on the bottom producer's picture. It cannot draw a layer, so every hand-in is also read by hand against the draft.

## Running the trial

The author legs run in parallel, then the compose leg on their hand-ins (sandbox off: `claude` reads `~/.claude`):

```sh
scripts/m4-trial/run.sh game /private/tmp/IhJ35P-game sonnet
scripts/m4-trial/run.sh score /private/tmp/IhJ35P-score sonnet
scripts/m4-trial/run.sh compose /private/tmp/IhJ35P-compose sonnet /private/tmp/IhJ35P-game /private/tmp/IhJ35P-score
```

**Run 2026-11-26** (Sonnet 5.5 at every leg; $2.55 in all). The game leg (run 1: 27 turns, 188 s, $0.83) never got clean: T006 compared the page pad's seam text with the input's parsed seam, a checker defect, now fixed (kit/seam's `compareSeams` decides) with run 1's hand-in as its regression test; that hand-in checks clean unchanged. The score leg (22 turns, 102 s, $0.56) was clean from its second check. The compose leg, on game run 1 and score as they were left (16 turns, 77 s, $0.54), was clean at its first check: a 30-line `workbench.js` and a 70-line root package, `overlay/`, that layers the two pictures. Game run 2, the allowed rerun on the fixed checker (22 turns, 105 s, $0.62), was clean at its first check. **The massage was 0 lines**: the compose hand-in loads and plays on the workbench page as handed in (`screenshot.png`: a scripted 1.2 s hold of right picks up two gems, and the HUD reads `SCORE 2`). `diff -r` of the composer's `gemgrid/` and `scoretimer/` against the authors' hand-ins is empty (T027 checks it too). Records: `runs/2026-11-26/{game-run1,game-run2,score,compose}/`.

To see it on the page, serve the repository root and open `http://127.0.0.1:8765/kit/page/host/index.html?workbench=/scripts/m4-trial/runs/2026-11-26/compose/workbench.js`.

**The layer dogfood, 2026-11-27** (leaf `teBNYM`; three blind Sonnet 5.5 legs on the layer draft, given the 2026-11-26 game run 1 and score hand-ins as the composer got them; $0.89 in all):

```sh
R=scripts/m4-trial/runs/2026-11-26
scripts/m4-trial/run.sh layer /private/tmp/teBNYM-1 sonnet $R/game-run1 $R/score   # and teBNYM-2, teBNYM-3, in parallel
node scripts/seams-trial/summary.js scripts/m4-trial/runs/2026-11-27-layer/leg1 scripts/m4-trial/runs/2026-11-27-layer/leg2 scripts/m4-trial/runs/2026-11-27-layer/leg3 --skip-last
```

Each leg was clean at its first check (11, 12 and 14 turns; 48, 49 and 69 s; $0.30, $0.26 and $0.33), rated the task 1 of 5, used the `.show(<output>, <output>)` shorthand and wrote no package: **the massage was 0 lines**. What they guessed and what the draft changed are in [project/2026-11-27-layer-dogfood-findings.md](../../project/2026-11-27-layer-dogfood-findings.md). Records: `runs/2026-11-27-layer/leg{1,2,3}/`, each log ending with the integrator's recheck on the fixed checker (hence `--skip-last`).
