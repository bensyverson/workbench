# Findings: the M4 compose leg rerun on the built-in layer

*2026-11-27, leaf `KYpY7Q` (container `XlXLSp`): the layer stage's closing trial. The built-in layer (leaf `pQKgWN`, commit 13747db) replaces the `overlay` package the 2026-11-26 composer wrote. Tiers per Ben (2026-11-27): one Sonnet leg and one Haiku leg, no Opus.*

## Summary

**The criterion holds.** Two blind composers, Sonnet 5.5 and Haiku 5.5, each given the M4 trial's two packages and the kit's own docs, wrote the timed-gems glue with no package of their own. Both hand-ins passed the real checker at their first check and drive the page as the checker plays it (the pad script picks up gems, the score moves, the layer draws). **The massage was 0 lines.** Against the 2026-11-26 composer (16 turns, 77 s, $0.54, a 30-line glue plus a 70-line `overlay` package), the Sonnet leg took 16 turns, 49 s and $0.46, and its glue is 31 lines with no package. The Haiku leg took 29 turns, 106 s and $0.05, and its glue is 30 lines.

Neither leg typed a Draw ceiling or a canvas size. Both typed the panel's offset by hand, and both asked for an anchored frame edge. The three dogfood legs asked too, so every blind leg that wrote a glue has asked (the unverified first pair below did not report on it separately): **the evidence the backlog entry ("an anchored frame edge") names as its un-park condition is now here**. It is recorded here and not built.

## The runs

```sh
R=scripts/m4-trial/runs/2026-11-26
scripts/m4-trial/run.sh layer /private/tmp/KYpY7Q-3 sonnet $R/game-run1 $R/score
scripts/m4-trial/run.sh layer /private/tmp/KYpY7Q-4 haiku $R/game-run1 $R/score   # in parallel
node scripts/seams-trial/summary.js scripts/m4-trial/runs/2026-11-27-layer-rerun/sonnet scripts/m4-trial/runs/2026-11-27-layer-rerun/haiku --skip-last
```

Setup:

- **Packages:** the same two as the dogfood, `runs/2026-11-26/game-run1/gemgrid` and `runs/2026-11-26/score/scoretimer`.
- **Docs:** the kit's own, unedited, except that `layer-docs.js` strips the compose README's subsection "The M4 trial's glue, with a layer" from the leg's copy: it is this task's glue with real names and offsets. `START.md` and `API.md` are copied as they are (they now carry the layer lines).
- **Task:** `scripts/m4-trial/docs/task-layer.md`, revised: it no longer calls the layer a draft or `check.sh` a stand-in.
- **Checker:** `check.js --role layer` on the real kit.

| Leg | Model | Checks | Codes; first clean | Turns | Time | Cost | Glue | Difficulty | Massage |
|---|---|---|---|---|---|---|---|---|---|
| sonnet | Sonnet 5.5 | 1 | none; run 1 | 16 | 49 s | $0.46 | 31 lines | 1 | 0 lines |
| haiku | Haiku 5.5 | 2 | S206 warning at run 1 (not an error); run 1 | 29 | 106 s | $0.05 | 30 lines | 2 | 0 lines |

Turns, time and cost come from `node scripts/seams-trial/summary.js <leg dirs> --skip-last` (as in the command above), which reads the result line of each transcript; `--skip-last` drops my own recheck, the last line of each `log.jsonl`. Difficulty is each leg's REPORT.md. Glue sizes are `wc -l workbench.js`. The massage is from reading each hand-in against the docs.

| Run | Turns | Time | Cost | Glue | Extra package |
|---|---|---|---|---|---|
| 2026-11-26 compose (Sonnet 5.5, `run.sh compose`) | 16 | 77 s | $0.54 | 30 lines | `overlay/`, 70 lines |
| 2026-11-27 dogfood, 3 Sonnet legs (the layer draft, stand-in checker) | 11, 12, 14 | 48, 49, 69 s | $0.30, $0.26, $0.33 | 28 to 33 lines (dogfood findings) | none |
| 2026-11-27 rerun, Sonnet (built-in layer, real checker) | 16 | 49 s | $0.46 | 31 lines | none |
| 2026-11-27 rerun, Haiku | 29 | 106 s | $0.05 | 30 lines | none |

The Sonnet rerun used more turns and money than the dogfood legs for the same shape of glue. I have no explanation beyond run-to-run variation (one leg each); its transcript shows it reading seven docs, including `draw/README.md` and `page/README.md`, as dogfood legs 1 and 3 did. It is still cheaper than the 2026-11-26 run, and it wrote no second package.

### The hand-ins, read by hand

Sonnet (`runs/2026-11-27-layer-rerun/sonnet/workbench.js`):

```js
.part(level).part(round)
.frame(round.frame.panel, level.frame.px, { scale: 1, offset: [16, 0] })
.wire(page.out.pad, level.in.pad)
.wire(level.out.picked, round.in.scored, { set: { points: 1 } })
.show(level.out.view, round.out.view)
```

Its layer, as the checker prints it: `Draw<72>@level.px, page box 192 by 128`. It is the dogfood legs' shape: the top two rows are wall, the panel at the top. A comment says `(192 - 160) / 2 = 16`.

Haiku (`runs/2026-11-27-layer-rerun/haiku/workbench.js`): the same calls, with the panel at the bottom (`offset: [16, 104]`, over two bottom wall rows), no `set` on the pickup wire, and `layers` of `Draw<74>@Coins.px`, page box 192 by 128. It also imports `layer` and takes `$`, neither used: harmless noise, not a violation. Its level is mostly a layout of its own.

Painter's order is right in both (game first). Both add the parts with `.part` as the docs say. Neither writes a package, a ceiling or a `.size`. The kit's built-in layer needed no help from either: neither named a layer, and the one `layer` import (Haiku) went unused, so the explicit `layer(...)` form is still untested by any blind leg.

### Does it play on the page?

`check.js --role layer` loads each hand-in as `kit/page/host`'s loader does, builds it on the real kit, and plays 30 s on `kit/page`, with the pad script, from the start, at 60 frames a second. It then requires: the pad wired to the game, a game output wired to the score, the shown thing a layer of both pictures (game under score: T032, T033), the layer's picture drawing an image (T025, now on the layer's own list), and the score parts' state differing from a no-input run (T026). Both exit 0 on my recheck. `scripts/m4-trial/test/layer.test.js` replays both recorded legs (`Draw<72>` and `Draw<74>`, box 192 by 128). I did not take a screenshot.

## What misled them, what they guessed

Both rated the task 1 and 2. Neither said the layer docs misled them.

| Finding | Leg | Detail |
|---|---|---|
| The panel's offset is typed by hand | both | Sonnet: "computed the panel's centering offset by hand ... an anchored edge would keep it correct if the level's width changed". Haiku: x = (192 - 160) / 2 = 16 and y = 128 - 24 = 104, "the frame edge does not know what the panel is"; it asked for `anchor: "bottom-center"`. **An anchored frame edge: asked for again, by both.** |
| `set: { points: 1 }` or the default | Sonnet set it, Haiku did not | Sonnet used `set` because S206 describes the bare wire's warning, and expected the bare wire to warn. Haiku left the warning in and says why: the `scored` input declares `points = 1` on purpose. |
| S206 fires on an intended default | Haiku | "the warning fires on every intended Event default, so a clean composition still prints a warning", and its suggested rename "would score a running total". The same finding as dogfood legs 2 and 3, not fixed since (kit/compose, out of scope). Haiku asked for a wire option to acknowledge a default. |
| `worth`'s default is not in any doc | Haiku | It read `scoretimer.runtime.js` (`record.worth ?? 1`) to learn what a gem scores. A package-side gap, not the kit's. |
| Links the docs cite that the leg does not have | both | `docs/project/*` (the seams draft, the layer plan, the dogfood findings, `backlog.md`) are linked from the compose README's Layers section and not copied into a leg. Haiku wanted the backlog entry on anchored edges and could not read it. Not a blind-leg breach; the rule that a leg reads nothing outside its folder held. |
| Level and panel placement | both | Its own choice in both: where the panel goes, and which rows are wall. |
| The round starts at the first step | Sonnet | The clock runs from page start, not the first key press. Accepted. |

Whether the main tables disagreeing with the layer section (the dogfood's finding) still misleads is not testable here: neither leg mentions it, and the kit's README no longer marks the section a draft.

## Blindness and process

- **Blindness held.** Each transcript reads only files under its leg folder (`grep -o '"file_path":"[^"]*"'` over `transcript.jsonl`) and none opens a saved tool result (`grep -c tool-results` is 0). The legs list a number of references they did not follow.
- **A path leaked.** `check.sh` carries the absolute path of my worktree (it runs the checker there), and Haiku's report names it. It opened nothing there.
- **Haiku's first-pass quality was fine.** It read the two packages' source files (a package's own folder is in scope for a composer), and read less of the kit docs than Sonnet (no `draw/` or `define/`). It wrote an accurate, specific report: its three gaps are real, and one (the intended default) is a kit finding.

### The first attempt: a run.sh bug, not a design finding

The first pair of legs (`/private/tmp/KYpY7Q-1`, Sonnet, and `-2`, Haiku) ran with leg folders given relative to the repository. `run.sh` put those relative paths in the leg's `check.sh` as `--given`, and the leg `cd`s into its own folder, so `check.sh` exited 4 ("does not exist") on every run. Sonnet reported difficulty 5 and could not verify; Haiku wrote its glue without a clean check. **A run.sh bug, fixed**: `onepkg` now returns an absolute path, with a regression test in `scripts/m4-trial/test/check.test.js` (red before the fix). I reran both legs on fresh folders (`-3` Sonnet, `-4` Haiku). Those are the records; the first pair is not.

For interest, I ran the real checker on the first pair's hand-ins afterward: both exit 0 (Sonnet: `Draw<72>`, panel at `[16, 0]`, `set`; Haiku: `Draw<55>`, a 7-row level of 192 by 112 pixels, panel at `[16, 88]`, one S206 warning). They were written without any checker feedback, and they have the same shape. That is seven clean hand-ins of the built-in layer's design in all (3 dogfood, 2 recorded here, 2 unrecorded); the first pair's transcripts are not recorded. Their stats: `summary.js` gives 17 turns, 56 s, $0.44 (Sonnet) and 25 turns, 98 s, $0.06 (Haiku).

## Kit bugs found

None new. Carried over, still open: **S206 suggests renaming a running total** (dogfood findings; Haiku found it again), a kit/compose follow-up that is not filed here.

## Setup changes (this leaf)

- `scripts/m4-trial/layer-docs.js` no longer patches draft-era docs: it only strips the compose README's "The M4 trial's glue, with a layer" subsection from the leg's copy and exits 1 when it is missing. Tests: `scripts/m4-trial/test/layer.test.js` (the copy is the kit's own, minus the subsection; the exit when the heading is gone).
- `scripts/m4-trial/docs/task-layer.md`: no "draft" or "stand-in" wording.
- `scripts/m4-trial/run.sh`: absolute package paths (above).
- `scripts/m4-trial/README.md`: the layer rows, and the rerun's paragraph.

## For Ben

- **The anchored frame edge**: asked for by all three dogfood legs and now by both recorded rerun legs. The backlog entry says to un-park when a leg asks again. Not built here; it is a decision for the `.frame` design, not a layer one.
- **The `layer(...)` explicit form** is still tested only by the checker's own tests, not by a blind leg.

## Deviations

- The legs' compose README lacks the worked example for the same reason as the dogfood's ("Placeholders, not examples").
- Two of the four legs run were wasted on the run.sh bug (above); only the second pair is recorded.
