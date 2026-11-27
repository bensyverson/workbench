# REPORT

## 1. Difficulty

3 of 5. Placement 1 is fully expressible in the draft. Placement 2 is not: the draft cannot say "label under the box, touching its lower edge" with one anchor per edge, so I wrote the nearest call, which is wrong by the label's height.

## 2. What I built

Both calls are in `glue-lines.js`. Neither has been run: the anchored edge is "Draft, not built", and there is no checker in this folder.

**Placement 1, legend in the top-right corner of the chart.** `.frame(legend.frame.key, chart.frame.plot, { scale: 1, anchor: ["max", "min"], offset: [-10, 10] })`
- Scale 1: the legend keeps its own size.
- x: `max` on `max`. Scaled legend box `[0, 90]`, chart `[0, 400]`. Alignment offset = 400 − 90 = 310. The 10-unit inset from the right side is −10, so x offset = 300 and the legend spans x 300..390 (right edge 390 = 400 − 10).
- y: `min` on `min`. Y grows downward in Draw frames, so `min` is the top. Alignment offset = 0 − 0 = 0. The inset from the top is +10 (positive moves toward `max`, i.e. down), so the legend spans y 10..50.

**Placement 2, label centered under the box, touching its lower edge.** `.frame(label.frame.line, box.frame.area, { scale: 1, anchor: ["center", "max"] })`
- x: `center` on `center`. Box centre 100, label centre 40, alignment offset 60, so the label spans x 60..140.
- y: `max` on `max`. The box's lower edge is y = 100. The label's bottom is aligned to it, so the label spans y 86..100. **This is inside the box, not under it.** Touching from below would put the label at y 100..114, which needs an extra +14 in y: the label's height. I did not add that, because the task says to compute no offset myself, and the draft's `anchor` has no way to say "this frame's min on that frame's max".

## 3. Where the docs misled me

- **"One anchor for both frames"** (draft, Decisions). The draft says an anchor applies the same edge to both frames, and that separate anchors "would place a picture outside the other's box, where a layer's ops fall off the page … Un-park when one does." The reason given is about layers. For a glue `.frame` between two parts, a label placed beneath a box is the intent, not a fault. The draft's own example (a caption's top on a figure's bottom) is this same case, so by its own rule it should be un-parked now.
- **The main README's `.frame` API row** says the edge is `{ scale, offset }`, with `offset` not optional. The draft makes `offset` default to 0 and adds `anchor`. I read the draft as the newer rule, since the README marks the section as a draft, but the API table was not updated.
- **Sign of an inset on a `min` side.** The draft states the sign rule only for `max` ("an inset from a `max` side is negative"). The `min`-side inset (+10 on y in placement 1) follows from "positive moves toward `max`", but the document does not state it for `min`. I derived it rather than read it.

## 4. What I guessed

- Scale `1` for both calls. The task says "at the legend's own size", and text never scales. The draft requires `scale`, so I gave it a value.
- The 10-unit inset is in the chart's units. `offset` is in the second frame's units, and the chart is the second frame.
- "Top-right" in a y-down frame means y `min`, and "under" means y `max` on the box.
- For the label, the nearest call I could make with one anchor per edge: `["center", "max"]`. It is the closest of the options I could express. The alternative `["center", "min"]` puts the label at the box's top, further off.
- I did not follow any link in the README into `docs/project/` or elsewhere.

## 5. Gaps

- **Needed for placement 2:** the label's top edge on the box's lower edge. The draft has one `anchor` for both frames, so it cannot say min on one and max on the other. **Smallest change:** a second anchor for the second frame, separate from the first, for example `anchor: ["center", "min"]` for the label and `anchor: ["center", "max"]` for the box, or a pair per frame. The draft's "Separate anchors" decision says to un-park this when a case asks for it, and this is one.
- **Needed for both:** the key `anchor` is not built, so these calls would not run on the current kit. I could not check whether the current kit refuses an unknown key on a glue `.frame`; the draft says only that a Dialect's `edges(record)` refuses other keys.
- **Needed to finish placement 2 without a hand offset:** nothing in the draft says that an offset may be a value taken from a frame's extent. The draft computes `offset` from the two extents; it does not say how a glue writes "the label's height". Not needed if the separate-anchor change above is made.

## 6. Docs I could not reach

- Per R1, I read only `docs/kit/compose/README.md`. The links into `docs/project/` (the seams draft, the backlog, the layer dogfood and rerun findings) and the links to `docs/kit/run`, `docs/kit/define`, `docs/kit/draw`, `docs/kit/seam` and `scripts/seams-trial` were not opened. I did not check whether they settle the separate-anchor question or the unknown-key question.
