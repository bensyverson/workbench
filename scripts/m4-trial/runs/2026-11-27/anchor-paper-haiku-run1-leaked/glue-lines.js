// Legend in the chart's top-right corner, 10 units in from the corner, at its own size (scale 1).
.frame(legend.frame.key, chart.frame.plot, { scale: 1, anchor: ["max", "min"], offset: [-10, 10] })
// Label centered under the box: nearest the draft can say; its bottom meets the box's bottom, so it sits inside the box (see REPORT Gaps).
.frame(label.frame.line, box.frame.area, { scale: 1, anchor: ["center", "max"] })
