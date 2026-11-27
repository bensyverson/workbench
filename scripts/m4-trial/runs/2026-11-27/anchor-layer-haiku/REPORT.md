# REPORT

## Difficulty

3. The glue itself was short, but `./check.sh` cannot exit 0 while the anchor is in place (by design of this test), and it stops at that error, so the layer plan and the 30-second play were never checked.

## What I built

`workbench.js`, one glue program, beside the two given packages (`gemgrid/`, `scoretimer/`, both unchanged). No package of my own.

- A level built with gemgrid's builder: `gemgrid("Grab").map([...])`, 12 by 8, the top two rows walls, one `P` start, two gems (`*`).
- A round built with scoretimer's builder: `scoretimer("Round").label("GEM GRAB").lasts(30)`, default worth 1.
- The page's `pad` wired to the level's `pad` input.
- Each `picked` record wired to the round's `scored` input with `{ set: { points: 1 } }`, so each gem is one point.
- The score panel placed on the level's pixel frame with `.frame(round.frame.panel, level.frame.px, { scale: 1, anchor: ["center", "min"] })`. No offset is written.
- `.show(level.out.view, round.out.view)`: the level drawn first, the panel over it, as one picture.

How a person uses it: the page's D-pad walks the player (`P`) on the level. Walking onto a gem picks it up and adds one point to the score. The panel at the top centre shows `GEM GRAB`, the score, and the seconds left (`T`) out of 30, with a bar. Walls are drawn under the panel.

Expected play under the checker's script (estimated by reading the gemgrid runtime, not run): right from `P` reaches the gem at column 6 in about 0.7 s; down column 10 reaches the gem at row 5 in about 0.5 s more. So two points by the end of the first pad sequence. This is not verified.

## Where the docs misled me

- `docs/kit/compose/README.md`, "Printing" section and the first code block: both show `.frame(level.frame.cell, fx.frame.px, "fit")` "or `{ scale: 32, offset: 16 }`". Read as the normal way to place a picture, that hand offset is what the anchor draft says goes stale. The page does not say which is preferred. I read the hand offset as a fallback only after reading the draft.
- `docs/kit/compose/README.md`, "Layers", the "Placing a picture" decision: says the anchored edge is "parked in the backlog", then "Changed 2026-11-27: it was un-parked". Both sentences are present. The link to the backlog is not reachable from my folder (see Docs I could not reach), so I could not tell which status was current without reading the draft section.
- `docs/kit/compose/README.md`, "Draft: an anchored edge": calls itself "Draft, not built". The checker agrees, so this is accurate. Stated for the record: the `anchor` key is in the table of the draft's form but not in the kit, as the task said.
- `docs/kit/compose/README.md`, S206 entry: says an intended default can be silenced by `set: { <filled>: <its default> }`. I used it. I could not confirm the silencing, because the checker stopped before it reached the wires.
- The checker's own `fix:` line for the `anchor` refusal (see APIs I fought) gives `{ scale: 32, offset: 16 }`, a hand offset copied from the README's example. It did not fit this glue (the extents are not 32 and 16).

## What I guessed

- **Anchor.** `["center", "min"]`: centred on the level on x (the panel is 160 wide, the level 192), top edge on the level's top on y. I chose top over bottom so the panel covers walls, which I laid out as the top two rows.
- **Scale 1** for the panel, since text never scales and the doc says a HUD is scale 1.
- **Level layout** and gem positions, chosen to fit the pad script (see the expected play above).
- **Round length and label.** `lasts(30)` as the task says; label `GEM GRAB` (19 characters or fewer, the grammar's limit). `worth` left at its default 1, so one gem is one point.
- **Scoring wire.** I chose `set: { points: 1 }` over leaving the default fill. The producer's `collected` is a running total (its note says so), and a plain wire would drop it and fill `points` with 1 under a warning (S206). The explicit set states the intent.
- **Layer order.** The level is the bottom layer and the panel the top, using the shorthand (which names the layer `layers`). I did not name the layer.
- **Part and composition names:** `Grab`, `Round`, `gem-grab`. Not checked against anything.
- **`($) =>`.** I kept the docs' signature even though the glue reads no `$`.

## APIs I fought

- **The `anchor` key.** `./check.sh` refuses it: `workbench.js:28: S257 .frame(Round.frame.panel, Grab.frame.px, {"scale":1,"anchor":["center","min"]}): an edge takes only scale and offset, not 'anchor' (there is no rotation in v0)`. This is the expected refusal. I left it in place, as the task said, and did not add an offset or any other workaround.
- **The checker's fix line.** It offers `{ scale: 32, offset: 16 }`, which is a hand offset computed from numbers the glue does not have, so I did not take it.
- **Lack of later output.** The checker reports only this one violation and stops, so no `note:` lines (layer seam, page box, input conversions), no pad play, and no state comparison were printed. I did not build a copy without the anchor to see them: that would be a workaround.

## Gaps

- **Anchored edge.** I needed `anchor` on a glue's `.frame` edge to place the score panel on the level's top edge, centred, without a computed offset. The compose README draft describes exactly this form (`{ scale, anchor }`, with `"min" | "center" | "max"` per axis). The smallest change: implement the draft's `anchor` key on glue `.frame` edges (S257 "not 'anchor'" removed for glue edges; S256 and S257 as the draft already states).
- **Checker output past the first error.** The checker stops at the glue's first error, so I could not see the layer plan, the page wire's box, or the 30-second play, or whether `set: { points: 1 }` silences S206. The smallest change: keep reporting the other diagnostics and the play when one error remains, or let a glue check run to the end of its wires.
- **A way to see the composed picture's extents.** To set the anchor I needed the two extents (the panel's 160 × 24, the level's 192 × 128) and had to work them out from the packages' `extent` functions by hand. A `plan` or `frames` output from the checker for a glue would have let me see them. The compose README mentions `.plan(options?)`, but the checker does not print it. (Not verified; the checker never got that far.)

## Docs I could not reach

- `docs/project/2026-11-25-seams-draft.md`: linked from `docs/kit/compose/README.md`, line 3 ("the seams draft"). Not in my folder; the `docs/project/` folder holds only `2026-11-25-package-format-draft.md`.
- `docs/project/backlog.md`: linked from the compose README's "Layers" decision ("parked in the backlog"). Not in my folder.
- `docs/project/2026-11-27-layer-and-package-tests-plan.md`, `2026-11-27-layer-dogfood-findings.md`, `2026-11-27-layer-rerun-findings.md`, `2026-11-27-workbench-sketches.md`, `2026-11-27-sketch-feasibility-findings.md`: linked from the compose README's layer and anchor sections. Not in my folder.
- `scripts/seams-trial/README.md`: linked for the S codes; outside `docs/`. Not read (R1).
- Source files linked from the compose README: `layer.js`, `param-wires.js`, `draw.js`, `page.js`, `queues.js`, `glue-load.js` (in `docs/kit/compose/`, only README.md is present), and `kit/run/wires.js`, `kit/run/draw.js`, `kit/run/delivery.js`. Not read: START.md says not to read the kit's source.
- The checker's own script (`check.sh` points outside my folder). Not read.
- Files in my folder that are not in R1's list: `transcript.jsonl` and `stderr.txt`. I did not open them.

## Checker runs

1. `./check.sh` → exit 1. One violation, `workbench.js:28: S257` (the `anchor` key, as above). Fix line `{ scale: 32, offset: 16 }`.

Total: 1 run. Not 0. The expected pass (exit 0) was not reached because of the anchor refusal this test requires.
