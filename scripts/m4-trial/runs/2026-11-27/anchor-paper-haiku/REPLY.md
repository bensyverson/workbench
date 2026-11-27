Both files are written in `/private/tmp/wCDTzk-paper2`: `glue-lines.js` has the two `.frame` calls, and `REPORT.md` has the six sections in the order `rules.md` gives.

**Difficulty: 3 of 5.**

The hardest part was the label. The legend placement is fully expressible: `.frame(legend.frame.key, chart.frame.plot, { scale: 1, anchor: ["max", "min"], offset: [-10, 10] })` puts it at x 300..390 and y 10..50, with a 10-unit inset from the top-right corner. The label is not. The draft allows one `anchor` for both frames, so it cannot say "the label's top on the box's bottom edge." The nearest call I could write, `.frame(label.frame.line, box.frame.area, { scale: 1, anchor: ["center", "max"] })`, centers the label under the box but bottom-aligns it, so it sits inside the box, 14 units short of touching the lower edge. I did not add the 14 as an offset, since the task said not to compute offsets myself. The draft's "Separate anchors" decision rejects per-frame anchors only for layers, and its own caption-on-figure example is the same case as this label, so I reported it as the gap to un-park.

Nothing has been run. The anchored edge is marked "Draft, not built", and the folder has no checker. I read only `docs/kit/compose/README.md` as R1 requires. I did not follow its links into `docs/project/` or the other kit docs. The report lists them under "Docs I could not reach."
