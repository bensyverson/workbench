# REPORT

## Difficulty

4 of 5. The legend placement is fully expressible in the draft. The label placement is not: the draft's one-anchor rule cannot make the label touch the box's lower edge, so I wrote the nearest thing it can say and it does not match the request. The whole anchor key is also unbuilt, so nothing here can be run or checked.

## What I built

`glue-lines.js` has two `.frame(...)` calls, both in the draft's anchored-edge form.

1. **Legend in the chart's top-right corner, 10 units in, at its own size.**
   `.frame(legend.frame.key, chart.frame.plot, { scale: 1, anchor: ["max", "min"], offset: [-10, 10] })`
   - `scale: 1`: the legend keeps its own size (extent 90 × 40).
   - `anchor: ["max", "min"]`: on x the legend's high end meets the chart's high end (right); on y the legend's low end meets the chart's low end. In a Draw frame y grows downward, so `min` on y is the top. The draft's own "beyond the HUD" example uses this same anchor.
   - `offset: [-10, 10]`: the inset. x is on a `max` side, so the sign is negative (toward `min`). y is on a `min` side, so the sign is positive (toward `max`, away from the top edge). The draft states this sign rule.
   - Numbers (chart units, chart extent 400 × 300): the legend's high x is 400, so the alignment offset is 400 − 90 = 310, then −10 gives x 300..390. The legend's low y is 0, so the alignment offset is 0, then +10 gives y 10..50. The legend sits at [300..390] × [10..50], 10 units from the top and right edges.

2. **Label centered under the box, touching its lower edge.** Written as the nearest form the draft allows:
   `.frame(label.frame.line, box.frame.area, { scale: 1, anchor: ["center", "max"] })`
   - `scale: 1`: text never scales (the draft says so for `text` ops).
   - `anchor: ["center", "max"]`: x centers the label on the box (the label is 80 wide, the box 200, so the label's origin is 60). y aligns the label's high end with the box's high end (100). The label's y range is therefore 86..100.
   - **This does not touch the lower edge.** The label sits inside the bottom of the box, flush with the box's bottom line, not under it. The draft gives one anchor for both frames (`min` meets `min`, and so on), so the label's top cannot be placed on the box's bottom. See Gaps.
   - The offset that would make it touch is +14 (the label's height, so its range would be 100..114). I did not write it: that is a hand-computed offset, which the task said not to compute, and which the draft itself warns goes stale when a size changes.

## Where the docs misled me

- **Draft section: "Draft: an anchored edge"** opens by saying nothing below is in the code yet, but the README's "API" table, the example at the top, and the `.frame` line in the Layers section all describe `.frame` with only `{ scale, offset }`. A reader has to reach the end of the file to learn that `anchor` is unbuilt.
- **"One anchor for both frames"** is stated as a design decision, and it rules out exactly the placement the task asks for (a label touching a box's bottom edge). The draft's two examples do not cover that case. The draft says separate anchors wait for a case ("no case asks for it yet. Un-park when one does"), and this is one, so the draft's own rule would un-park it.
- **"In a Draw frame, as the page draws it, y grows downward"** is stated in the draft and the reference says the frames are "two-dimensional Draw frames, as the page draws them", but nothing I may read says which way y grows. The claim rests on `kit/draw`'s docs, which I could not open. My `min`/`max` reasoning depends on it.
- **reference.md skeleton** shows `.show(chart.out.picture, legend.out.picture)`. That shows only the chart and the legend. The box and the label are added with `.part` but are never shown or wired, so the label would not appear on the page even with a correct placement. I did not change the skeleton, since the task asked only for the frame calls.

## What I guessed

- **Y direction.** I took the draft's "y grows downward" as true, so `min` on y is the top and `max` is the bottom. I could not verify this (see Docs I could not reach).
- **Units.** I assumed the chart frame and the legend frame use the same unit for the 10-unit inset, and that scale 1 keeps the legend at its own size in chart units. The reference does not say the frames share a unit, and the draft does not say `scale: 1` is the same as "own size" across frames. The inset and the placement numbers above are correct only if they do.
- **Chain form.** Each call is written with a leading `.` so it can be pasted into the glue's chain after `.part(...)`. The file is two chain fragments, not a runnable module.
- **Anchor key.** I used the draft's `anchor` key as the task told me to, though the kit does not have it (the task said to use it). I did not invent any other key.
- **Label's alignment.** I chose `"center"` for x (the task says centered) and `"max"` for y (the label's bottom on the box's bottom) as the nearest one-anchor form, not `"min"`, which would put the label at the top of the box.
- **Files not read.** The folder also holds `transcript.jsonl` and `stderr.txt`. Rules R1 lists only `task.md`, `rules.md`, `reference.md` and `docs/`, so I did not open them.

## Gaps

- **Label touching the box's lower edge.** I needed the label's *top* (its `min` on y) on the box's *bottom* (`max` on y), with x centered. The draft's one-anchor rule makes both frames' high ends meet, so it cannot say this. The smallest change that would let me say it: an anchor given for each frame, so the first frame's anchor and the second frame's anchor can differ (the draft's rejected "separate anchors" option, which it says to un-park "when one does" ask for it; this is that case). I did not write a key for this, since the draft has none.
- **Anchored edges are not built.** The kit has no `anchor` key, so `glue-lines.js` cannot be run or checked. The legend numbers above are what the draft implies, not what a check would print.

## Docs I could not reach

- **Linked docs under `docs/` that are not in my folder:** `docs/kit/run/README.md`, `docs/kit/define/README.md`, `docs/kit/draw/README.md` (for `convertOp` and the Draw op table, including the y direction), and `docs/kit/seam/README.md` (for the Box fields `min` and `max`). These are relative links from `docs/kit/compose/README.md`, and only that one file is present.
- **Links outside `docs/`** (not read, by R1): the project drafts and findings (`../../project/2026-11-25-seams-draft.md`, `2026-11-27-layer-and-package-tests-plan.md`, `2026-11-27-layer-dogfood-findings.md`, `2026-11-27-layer-rerun-findings.md`, `2026-11-27-workbench-sketches.md`, `2026-11-27-sketch-feasibility-findings.md`, `backlog.md`) and `../../scripts/seams-trial/README.md`.
- **Code files the README names** (not in the folder): `glue-load.js`, `param-wires.js`, `page.js`, `draw.js`, `layer.js`, `queues.js`. The README points to these in the same folder, so I could not read them.
- **Not opened:** `transcript.jsonl` and `stderr.txt` (see Guessed).
