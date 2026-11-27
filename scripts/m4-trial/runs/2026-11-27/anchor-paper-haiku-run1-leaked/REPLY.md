Both files are written in `/private/tmp/wCDTzk-paper`: `glue-lines.js` (two `.frame` calls) and `REPORT.md`. Nothing can be run, since the anchor key the calls use is an unbuilt draft.

**Difficulty: 4 of 5.** The legend placement is fully expressible. The label placement is not: the draft's one-anchor rule can't make the label touch the box's lower edge.

**The calls:**
- Legend, top-right, 10 units in, own size: `.frame(legend.frame.key, chart.frame.plot, { scale: 1, anchor: ["max", "min"], offset: [-10, 10] })`. This puts the legend at x 300..390, y 10..50 in chart units.
- Label, centered under the box: `.frame(label.frame.line, box.frame.area, { scale: 1, anchor: ["center", "max"] })`. This is the nearest form. It puts the label inside the box's bottom edge, not under it. The draft gives one anchor for both frames, so the label's top can't meet the box's bottom. Touching would take an offset of +14 (the label's height). I didn't write it because that's a hand-computed offset.

**Other issues, all in REPORT.md:**
- The reference skeleton shows only the chart and legend, so the box and label never appear on the page even with correct placement.
- The "y grows downward" claim, which my `min`/`max` reasoning depends on, comes from the draft. The Draw doc that would confirm it is not in my folder.
- The draft's linked docs and code files are not in the folder, so I could not read them. I also did not open `transcript.jsonl` or `stderr.txt`, since R1 doesn't list them.

**The hardest part** was the label. The task asked for it to touch the box's lower edge, and the draft's rule that both frames share one anchor rules that out. The gap I'd report is a separate anchor per frame, so the label's top can meet the box's bottom. The draft says it will un-park that "when one does" ask for it, and this is that case. I did not invent a key for it.
