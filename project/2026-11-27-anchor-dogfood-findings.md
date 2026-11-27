# Findings: the anchored-edge draft, dogfooded

*2026-11-27, leaf `wCDTzk` (container `XlXLSp`). The draft is kit/compose/README.md, "Draft: an anchored edge" (leaf `JBkhsf`; not built, leaf `QqirvU` builds it). Tiers per Ben (2026-11-27): Sonnet plus at least one Haiku, never Opus, and one leg that is not a game (AGENTS.md, "Serve more than the founding examples").*

## Summary

**The draft's single anchor reads well, and its one hard no is real.** Four blind legs used it (two placing the M4 score panel, two placing a legend and a label on paper). `min` on y read as the top in every leg, nobody asked for compass words, the inset sign came out right at both a `max` side and a `min` side, and the kit's offset for the M4 panel by hand arithmetic equals the hand offset the earlier legs computed. But "a label centered under a box, touching its lower edge" cannot be said by one anchor for both frames, and the Haiku paper leg (both runs) said so: the nearest call lands the label inside the box, flush with its bottom, and only a hand-computed offset of the label's height gets it under. The Sonnet panel leg hit the same wall from the other side (a panel that does not cover the game). The draft had parked separate anchors "until a case asks"; two did, so the draft now has a pair form, `anchor: { from, to }`, with the single anchor as shorthand for the pair with the same point twice (the changes are marked in the draft). Nothing was built.

Cost: $0.47 in all for the four runs below (one of them, paper run 1, was contaminated and is kept as a record, not as evidence for placement 1).

## The legs

| Leg | Model | Turns | Time | Cost | Difficulty (its own) | Hand-in |
|---|---|---|---|---|---|---|
| panel, Sonnet | Sonnet 5.5 | 12 | 72 s | $0.412 | 2 | `workbench.js` (anchor: `["center", "min"]`, no offset) |
| panel, Haiku | Haiku 5.5 | 16 | 110 s | $0.030 | 3 | `workbench.js` (the same anchor) |
| paper, run 1 (contaminated) | Haiku 5.5 | 9 | 66 s | $0.019 | 4 | `glue-lines.js` |
| paper, run 2 | Haiku 5.5 | 7 | 50 s | $0.013 | 3 | `glue-lines.js` |

Records: `scripts/m4-trial/runs/2026-11-27/anchor-layer-{sonnet,haiku}/`, `anchor-paper-haiku-run1-leaked/`, `anchor-paper-haiku/` (hand-in, `task.md`, `reference.md`, `rules.md`, `REPORT.md`, `REPLY.md` saved by the integrator from the transcript's final message, gzipped transcript; the panel legs also `log.jsonl`, with the integrator's recheck as its last line, and `workbench.massaged.js`). Every leg read only files in its own folder (the `file_path` of every Read, Write and Edit in each transcript).

### The panel legs (the M4 layer role)

Setup: `run.sh layer`, as the layer rerun, with the task file swapped (`M4_TASK_FILE`, new in this leaf: `run.sh` copies that file as `task.md` instead of `docs/task-<role>.md`) for `scripts/m4-trial/docs/task-layer-anchor.md`, which is `task-layer.md` plus one paragraph: place the panel on the level with the anchor, compute no offset, and expect the checker to refuse the key (leave it, say what it said). The docs are `layer-docs.js`'s: the kit's own, minus the M4 glue subsection and the draft's HUD subsection.

- **Checker.** Each leg ran `./check.sh` once and got S257 at the `.frame` line: `an edge takes only scale and offset, not 'anchor' (there is no rotation in v0)`, fix `{ scale: 32, offset: 16 }`, or `"fit"`. The checker stopped there: no layer notes, no play. Both legs said the message misleads (the rotation remark has nothing to do with the key; the canned `scale: 32, offset: 16` fits no panel; Haiku also noted it is the README's hand-offset example). Both asked that one refused edge not hide every other check. That is the unknown-key message, which the build replaces; the draft now says so (Codes).
- **Check by hand.** The panel (`scoretimer.panel`, 160 by 24) on the level (`gemgrid.px`, 192 wide, 128 or 144 tall by the leg's map): x by `center`: `96 - 80 = 16`; y by `min`: `0 - 0 = 0`. So the kit's edge is `{ scale: 1, offset: [16, 0] }`. The legs wrote no `offset`, so the panel sits flush with the top, not 4 pixels down as the M4 trial's hand value `[16, 4]` has: the extra 4 is the nudge, which the task did not ask for, and the draft's `offset: [0, 4]` gives it. To confirm the arithmetic on the real kit, the integrator replaced each anchor line by `{ scale: 1, offset: [16, 0] }` (one line per leg, saved as `workbench.massaged.js`; the original is `workbench.js`): both then check clean (exit 0, no violations), with the kit's plan line `round.out.view → layers.in.1: (value): scoretimer.panel → gemgrid.px, draw, ×1 +[16, 0]`, so the computed offset equals the hand offset. That confirms the arithmetic, not the anchor code, which does not exist.
- **min on y as the top.** Both got it. Sonnet: "`min` on y is the top. The draft's table of decisions says so. I did not reach for compass words, but I did have to look it up." Haiku chose `min` to cover the wall rows.
- **The inset sign.** Not tested: neither leg wrote an offset. (The paper legs did.)
- **What they guessed:** which frame to anchor on (`level.frame.px`, from the layer's own rule and the package's Dialect; Sonnet noted `level.frame.cell` at `scale: 1` would also look plausible and nothing says it is wrong), the argument order (the first frame is the one placed; "meets" took a second reading), that an omitted `offset` is 0, and what happens when the panel is wider than the level (Sonnet: nothing warns; the draft now says what happens).
- **Where it fell short.** Sonnet's gap: the anchor aligns a box inside another, so it cannot put the HUD above the level, and a layer clips to the bottom picture's box; it reserved two wall rows in the level for the panel, tying the level's design to the panel's height. This is the same wall as the label under a box, and the layer's page box is the open question below.
- **What misled.** The compose README's "Placing a picture" bullet said the anchored edge was parked in the backlog and, in the same paragraph, that it was un-parked; Haiku could not tell which was current (the backlog link was outside its folder). Fixed in the draft.
- **Massage:** 1 line per leg, only to see the rest of the checker (above). The hand-ins as handed in are otherwise complete: no package, no ceiling, no hand offset.

### The paper leg (not a game)

The task is `scripts/m4-trial/anchor-dogfood/task-paper.md` and its reference `reference.md`: four placeholder parts, each with a frame and an extent (`chart.plot` 400 by 300, `legend.key` 90 by 40, `box.area` 200 by 100, `label.line` 80 by 14), not naming any part of the M4 trial; write the glue's two `.frame` lines, no checker. The leg's folder holds the task, `rules.md` (R1–R5 of the paper leg, a short version of the M4 rules), the reference and the draft's README with the M4 subsections dropped.

- **Run 1 was contaminated.** Its copy of the README still held "Beyond the HUD", whose first example is the answer to placement 1 with placeholders (`anchor: ["max", "min"], offset: [-<inset>, <inset>]`), and "For a dogfood before it is built", which names what to watch. Its placement 1 is the template filled in, so it says nothing about whether the form is discoverable from the table; placement 2 and its report still count, since the section has no answer for it. Kept as `anchor-paper-haiku-run1-leaked/`. (The panel legs saw both sections too: the first is not their answer, since it is not the panel's, but "For a dogfood" named what to watch, and no leg's report mentions it. Next time `layer-docs.js` should drop both from a leg's copy; noted, not done: it has its own tests.)
- **Run 2** had the README with `Beyond the HUD` and `For a dogfood before it is built` removed too (a one-off strip script in the leg's setup; see Reproducing).
- **Placement 1** (legend in the top-right corner, 10-unit inset): `.frame(legend.frame.key, chart.frame.plot, { scale: 1, anchor: ["max", "min"], offset: [-10, 10] })` in both runs. By hand: x `400 - 90 = 310`, then `-10`: the legend spans `300..390`; y `0 - 0 = 0`, then `+10`: `10..50`. Ten units from the top and the right edges: correct, and the leg showed the arithmetic. The sign at a `max` side (negative) and at a `min` side (positive) are both right; run 2 noted the table states the sign only for `max`, and derived the other from "positive moves toward `max`". The draft's offset row now states both signs (Draft changes, 7).
- **Placement 2** (label centered under the box, touching its lower edge): `.frame(label.frame.line, box.frame.area, { scale: 1, anchor: ["center", "max"] })` in both runs, with a comment that it lands inside the box. By hand: x `100 - 40 = 60`, so the label spans `60..140`; y `100 - 14 = 86`: `86..100`, inside the box, not under it. The leg knew; the offset that would make it touch is `+14` (the label's height), which it declined to write because the task said to compute no offset and the draft says a hand offset goes stale. Both runs asked for separate anchors, the first one by name ("an anchor given for each frame"), and quoted the draft's own rule back ("un-park when one does").
- **What misled:** "One anchor for both frames" gave its reason as a layer's ops falling off the page, which a leg read as irrelevant to two parts on a glue (and the draft's own example, "a caption's top on a figure's bottom", is this case); the README's API row for `.frame` still says `{ scale, offset }` (a draft is not in the row, by design; the draft's banner says so); run 1 asserted the draft's "beyond the HUD" example was the same anchor (it was; contamination). Run 1 also said the skeleton's `.show(chart.out.picture, legend.out.picture)` leaves the box and label unshown: true of the reference, which was written for the placement, not for a run; the reference now says nothing is run (task paragraph) and is otherwise unchanged.
- **Guessed:** the inset is in the second frame's units (right), `scale: 1` is "own size" (right), `y` grows downward in a Draw frame (the draft says so).

## Draft changes (kit/compose/README.md, each marked "Changed 2026-11-27" there)

1. **A pair form, `anchor: { from, to }`.** The single anchor is its shorthand. The offset arithmetic names `from` and `to`. S257 covers a pair missing a key or with another. Why: the two paper runs and the Sonnet panel leg.
2. **The Decision "One anchor for both frames" rewritten** to say what the dogfood found, and to name the one thing a pair keeps open: a layer's page box is the bottom producer's extent, so a label placed under the bottom picture is off the page. **Open question for Ben:** grow the layer's page box to hold its inputs, or leave it (the glue shows a bigger part underneath). The built anchor works either way; the example in "Beyond the HUD" (label under a box) is correct only with a box that has room.
3. **Scale: units and overhang stated** (an anchor does not check that `scale` makes units agree, and a picture larger than the other overhangs at `center` with no warning). Why: two legs guessed.
4. **Codes: S257's message for an unknown key** is named as the stand-in the build replaces: it names the edge's keys, drops the rotation remark, offers no canned numbers. Why: both panel legs.
5. **The stale "parked in the backlog" sentence** in "Placing a picture" replaced by a pointer to the draft. Why: Haiku could not reconcile it.
6. **A label-under-a-box example** added to "Beyond the HUD"; "For a dogfood" now records this result.
7. **The offset row states the sign for both sides** (negative toward `max`'s inside, positive from `min`'s edge), since run 2 had to derive the `min` side.

Not changed: `min`, `center`, `max` and the translation for y (nobody asked for compass words, in four legs), `offset` as the nudge with the sign rule (right in both paper runs; the `min`-side case is derivable and now follows from the table's "positive moves toward `max`"), the offset arithmetic, and everything about re-planning and the composed record (no leg exercised it; it is still the part of the draft with the least testing).

For the build (leaf `QqirvU`): S257's message above; and both panel legs asked that one refused `.frame` edge not stop the checker from printing the rest (layer notes, play): a checker question, not the kit's.

## Reproducing

From the repository root, sandbox off (`claude` reads `~/.claude`), with `R=scripts/m4-trial/runs/2026-11-26`:

```sh
# the panel legs
M4_TASK_FILE=$PWD/scripts/m4-trial/docs/task-layer-anchor.md scripts/m4-trial/run.sh layer /private/tmp/wCDTzk-sonnet sonnet $PWD/$R/game-run1 $PWD/$R/score
M4_TASK_FILE=$PWD/scripts/m4-trial/docs/task-layer-anchor.md scripts/m4-trial/run.sh layer /private/tmp/wCDTzk-haiku haiku $PWD/$R/game-run1 $PWD/$R/score
node scripts/draw-trial/record.js /private/tmp/wCDTzk-haiku scripts/m4-trial/runs/2026-11-27/anchor-layer-haiku   # and the Sonnet leg
# the massage, per leg: replace the anchor line by `{ scale: 1, offset: [16, 0] }`, then /private/tmp/wCDTzk-<leg>/check.sh
```

The paper leg has no launcher: make a fresh folder under `/private/tmp` named with the leaf id, copy in `scripts/m4-trial/anchor-dogfood/task-paper.md` as `task.md`, `reference.md`, a `rules.md` (R1–R5, REPORT sections in the paper leg's records), and `kit/compose/README.md` as `docs/kit/compose/README.md` with these `###` subsections of the README dropped, each up to the next heading: "The M4 trial's glue, with a layer", "The M4 trial's HUD, anchored", "Beyond the HUD", "For a dogfood before it is built". Run, from that folder, `claude -p "<the M4 brief's text, `scripts/m4-trial/brief.md` after its `---`, with the checker and hand-in sentences cut, and `docs/kit/compose/README.md` as the one document>" --model haiku --output-format stream-json --verbose --permission-mode acceptEdits --allowedTools "Bash Read Write Edit Glob Grep" --disallowedTools "WebSearch WebFetch Agent" --strict-mcp-config --no-session-persistence`. The prompt is `scripts/m4-trial/anchor-dogfood/brief-paper.md`; the leg's `rules.md` is `anchor-dogfood/rules.md` (also in each record).
