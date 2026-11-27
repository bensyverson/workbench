# Findings: the layer draft, dogfooded by three blind composers

*2026-11-27, leaf `teBNYM` (container `XlXLSp`). The local dogfood ruling (AGENTS.md): fresh agents use a design before it is frozen, and their difficulty is feedback on the design. The design is the layer draft in [kit/compose/README.md](../kit/compose/README.md), "Layers (draft)" (leaf `LiOmY9`), under Ben's ruling of the same day ([the plan](2026-11-27-layer-and-package-tests-plan.md), "Rulings" 1).*

## Summary

The draft held. Three blind Sonnet 5.5 composers, each given the M4 trial's two packages and the kit docs with the draft, wrote the M4 timed-gems glue against it. All three were clean at their first check, rated the task 1 of 5, used the `.show(<output>, <output>)` shorthand, and wrote no package of their own. **The massage was 0 lines.** That is down from a 30-line glue plus a 70-line `overlay` package on 2026-11-26. Their glues are 28 to 33 lines (`wc -l`), and none copies a Draw ceiling or a canvas size.

What they could not get from the draft was **placement**. Each worked out the score panel's offset by hand from the two extents ((192 − 160) / 2 = 16), and two of them said this contradicts the draft's "no extent is typed twice". Each also guessed which way a `.frame` edge maps. The draft now says the edge's direction, and says that the layer derives ceilings and the box but not where a picture sits. An anchored edge is parked in the backlog as a `.frame` question.

The dogfood also found that **the draft's own worked example was wrong**. It gave the M4 layer as `Draw<310>` (302 + 8). Those are the Dialects' declared ceilings; the built maxes for that level and round are 67 and 5, so the layer is `Draw<72>`. The checker computed 72, and the draft is corrected in place.

None of the three judgment calls the drafter flagged was tested. No leg named a layer, made one with a single input or a doubled input, or showed one output alone, so there is no evidence for or against the fixed name `layers` or for the two S102 refusals. Nothing here bears on Ben's ruling.

## The runs

The setup has three parts:

- **Packages.** Each leg got the 2026-11-26 trial's hand-ins as that composer got them: `runs/2026-11-26/game-run1/gemgrid` and `runs/2026-11-26/score/scoretimer`. `diff -r` against the copies in `runs/2026-11-26/compose/` is empty. No leg got the `overlay` package.
- **Docs.** Each leg got the kit docs the trial copies. `scripts/m4-trial/layer-docs.js` then edited the copies:
  - It left the draft section in `compose/README.md`, minus its own rewrite of the M4 glue (see Deviations).
  - It added the drafter's two integration lines to `START.md` and `API.md`, marked draft.
  - It dropped "a composed page that layers parts" from API.md's Not built.
- **Task.** The task was `scripts/m4-trial/docs/task-layer.md`: the compose task, saying that layering is built in per the draft, that a package of the composer's own is not allowed, and that long docs are read with the Read tool by offset.

The checker is a stand-in, because the layer is not built (below).

```sh
R=scripts/m4-trial/runs/2026-11-26
scripts/m4-trial/run.sh layer /private/tmp/teBNYM-1 sonnet $R/game-run1 $R/score   # likewise teBNYM-2 and teBNYM-3, run in parallel
node scripts/seams-trial/summary.js scripts/m4-trial/runs/2026-11-27-layer/leg1 scripts/m4-trial/runs/2026-11-27-layer/leg2 scripts/m4-trial/runs/2026-11-27-layer/leg3 --skip-last
```

| Leg | Checks | Codes; first clean | Turns | Time | Cost | Difficulty | Massage |
|---|---|---|---|---|---|---|---|
| 1 | 1 | none; run 1 | 11 | 48 s | $0.30 | 1 | 0 lines |
| 2 | 3 | none (an S206 warning on an experiment); run 1 | 12 | 49 s | $0.26 | 1 | 0 lines |
| 3 | 3 | none (an S206 warning on an experiment); run 1 | 14 | 69 s | $0.33 | 1 | 0 lines |

Turns, time and cost come from `summary.js` as above, which reads each transcript's result line. Difficulty is each leg's own REPORT.md. The massage comes from reading each hand-in by hand against the draft.

For comparison, the 2026-11-26 composer (Sonnet 5.5, `run.sh compose`) took 16 turns, 77 s and $0.54. The task was the same, but that composer had to write the layering package.

**Blindness held.** No transcript reads a file outside its leg folder, and none opens a saved tool result. Each read the long docs with the Read tool, as the task asked. Every leg read `compose/README.md`; leg 1 also read `draw/README.md` and `page/README.md`, and leg 3 `draw/README.md`. Checked with `grep -o '"file_path":"[^"]*"'` and `grep -c tool-results` over each `transcript.jsonl`. The legs did `cat` their own package files and `START.md`, which are short.

### The hand-ins, read by hand

All three glues have the same shape:

```js
.part(<game>).part(<round>)
.frame(<round>.frame.panel, <game>.frame.px, { scale: 1, offset: [16, <0 or 4>] })
.wire(page.out.pad, <game>.in.pad)
.wire(<game>.out.picked, <round>.in.scored, { set: { points: 1 } })
.show(<game>.out.view, <round>.out.view)
```

Against the draft, each glue:

- **Painter's order:** the game first, at the bottom. Each said so in a comment or its report.
- **Root package:** none.
- **Draw ceiling:** none in the text. The checker's T031 scan for a producer's declared or built max, a layer's sum, or the bottom extent found nothing.
- **Frames:** relates the top producer's frame to the bottom one's directly, with no third canvas.
- **Wires and imports:** otherwise valid. On the real kit the composition (minus the layer, with the bottom producer shown) checks and builds, and plays the pad script to a score.

Each made the level's top two rows wall, so the 24-pixel panel hides no play. Leg 3 made the level 9 rows tall. The layer the draft would make, as the checker prints it:

- **Legs 1 and 2:** `Draw<72>@<game>.px`, page box 192 by 128.
- **Leg 3:** `Draw<82>@level.px`, page box 192 by 144.

The 2026-11-26 composer's map also had two wall rows under the panel, at the same offset `[16, 4]` that leg 2 chose. That composer's glue was not in any leg's folder, and the transcripts show no leg reading outside its folder, so this is two runs reaching the same layout from the same packages, not a leak.

### What misled them, and what they guessed

| Finding | Legs | What the draft said | Change |
|---|---|---|---|
| Which way `.frame(a, b, { scale, offset })` maps | 1, 2, 3 | nothing; the main API table doesn't say either. All guessed `b = a × scale + offset`, which is right | the draft says it ("Placing a picture") |
| Placing a smaller picture needs an offset computed from both extents, against "no extent is typed twice" | 1, 2, 3 (2 and 3 named the contradiction) | that no extent is typed twice | the draft says the layer derives the ceilings and the canvas box, not the placement; an anchored edge is parked in `project/backlog.md` |
| A conversion never scales `text`, so a HUD wants scale 1, and `"fit"` would scale it | 1, 3 (leg 3: "text is the main thing a score overlay draws") | nothing | said in "Placing a picture" |
| Whether `.show(<output>, <output>)` adds the outputs' parts | 1, 2, 3 (each added both with `.part` to be safe) | the layer joins at first mention; "a handle of a part not added" is S102, in the codes paragraph only | a row in the API table: producers are added with `.part`, and naming an output adds nothing |
| Whether an upper picture's ops outside the bottom box are clipped | 3 | nothing | the canvas is sized to the box, so ops outside it fall off, as for any shown list |
| What the page shows of each part's UI (tiles) when a layer is shown | 3 | nothing | each part's tiles, inputs and params as today; the host's fallback stage never applies to a layer. **Build seam:** kit/page/host's `textStage` looks a package up by the shown name |
| The main tables (`.show` takes "one"; S102 for `.show` of a non-part) disagree with the draft | 2 | nothing | the draft's head says it wins over those rows until the build changes them |
| `START.md`'s draft line reads as present tense ("the glue layers them") | 2 | the copy carried "(draft)" only at the end | none: at layer-build the line goes in unmarked, so the tense will be right |

Two findings are not about the layer:

- **S206 suggests a harmful rename.** Legs 2 and 3 tried the pickup wire without `set` and got S206: "cannot feed … rename `collected` to `points`". `collected` is a running total, so that rename would score 1, 2, 3 and so on. The warning also opens with "cannot feed" though the wire works. Not changed here (kit/compose, out of scope). The 2026-11-26 composer chose `set` for the same reason.
- **Checker defect, fixed.** The stand-in's S206 was placed at `layer-draft.js:117`, the stand-in's own line, joined onto the leg's folder. kit/compose places a diagnostic at the innermost stack frame outside its own modules, and for a forwarded call that is the stand-in. The checker now places a real diagnostic at the glue call whose handles name its sides. Regression test: `scripts/m4-trial/test/layer.test.js`, "a real kit diagnostic about a forwarded call…". Both legs reported the path without opening it.

Leg 3 also said the task's "fails on any diagnostic" was wrong, since an S206 warning passed. `task-layer.md` now says "any error".

## The checker: what a program could check

> **Superseded 2026-11-27, layer-build (leaf `pQKgWN`).** The stand-in below (`checker/layer-draft.js`) is gone: `--role layer` now loads, builds, draws and plays a leg on the real kit. On it, the three legs build and play clean, and their layers are `Draw<72>`, `Draw<72>` and `Draw<82>` with the page boxes given here (`scripts/m4-trial/test/layer.test.js`). The S206 regression test is now "a kit diagnostic names the glue's line".

`node scripts/m4-trial/check.js <leg> --role layer --given <game package> --given <score package>`, documented in [scripts/m4-trial/README.md](../scripts/m4-trial/README.md).

How it loads a glue:

- It loads the glue as the page host does, except that `kit/compose` resolves to `checker/layer-draft.js`. That module re-exports kit/compose and adds the draft's `layer`. Its `compose` forwards every call to a real composition, except the draft's own calls, which it records.
- It judges the records with the draft's codes, printed `(draft)`: S101, S102, S111, S201, S204, S251 and S404.
- S251's frame graph is built from each part's own lowered edges and the glue's `.frame` calls, as kit/compose builds its own.
- It prints each layer as the draft would make it: its summed max from the built Programs (kit/define's lowered `seams.draws`), its frame, its page box, and each input's conversion.
- It then builds the real composition with the shown layer's bottom producer shown, and plays the compose leg's pad script on it.

The leg's own codes:

- T030: a package beside the given two.
- T031: a warning for review, a copied ceiling or extent.
- T032: the shown thing is not a layer of both pictures.
- T033: the score is under the game.

What it cannot check:

- It cannot draw the layer or read its picture, so T025 (an image drawn) and T011 (a picture drawn) check the bottom picture only.
- It does not follow S401 through a layer, or a wire from a layer into a part that is then played.
- A frame-path disagreement (S253) between a layer's inputs is left to the real `.frame` checks.

So every hand-in was also read by hand, as above. The draft's own rewrite of the M4 glue checks clean under it, which is where `Draw<72>` came from.

## Draft changes

All of these are in `kit/compose/README.md`, "Layers (draft)", still marked draft:

1. **The head** says the dogfood revised the section. It also says the section wins over the `.show` row and the S102 row of the tables above, until the build changes them.
2. **The opening paragraph** says "no ceiling and no canvas size is typed", in place of "no extent is typed twice", and points to placement.
3. **A new API row, "the producers":** each output's part is added with `.part`, and naming an output adds nothing (S102).
4. **"What the page draws, and its box"** now covers:
   - ops outside the box fall off the canvas;
   - each part's tiles, inputs and params show as today;
   - the build seam in kit/page/host's `textStage`.
5. **A new decision, "Placing a picture":**
   - the edge's direction;
   - scale 1 for a picture of text, with the reason;
   - `"fit"` is for a background;
   - the offset is the composer's, and the anchored edge is parked.
6. **The M4 rewrite's summed max** is corrected in place: `Draw<72>`, 67 + 5, not `Draw<310>`.

Not changed, for want of evidence:

- the shorthand's fixed name `layers`;
- the S102 refusals of a one-input layer, a doubled input and `.show(<one output>)`;
- named ports against argument order. Every leg found the argument order plain.

## Questions for Ben

None that would change the ruling. Two smaller calls are the drafter's or the builder's, and are written down here:

- **The anchored edge.** Should the layer stage take on an anchored `.frame` edge? All three legs asked for one. This report parks it as a `.frame` question for every wire, not the layer's.
- **S206's suggested rename** can be harmful when the dropped field is a running total, as here. That is a kit/compose follow-up, not filed here.

## Deviations

- **The legs' compose README had no worked example.** The draft's subsection "The M4 trial's glue, rewritten against this draft" was dropped from their copy. It is this task's answer, with the real part names, map and offsets, and a leg given it would be tested on copying. ("Placeholders, not examples": examples get copied.) The integration lines and the rest of the draft were given whole.
- **The given packages came from the author legs' folders.** They are `runs/2026-11-26/game-run1` and `runs/2026-11-26/score`, not `runs/2026-11-26/compose/`. `run.sh` takes a leg folder with exactly one package, and the compose record holds three. The two copies are byte-identical (`diff -r`, and T027).
