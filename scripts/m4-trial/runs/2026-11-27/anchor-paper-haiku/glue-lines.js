// Legend in the top-right corner of the chart, 10 units in from the corner, at its own size (scale 1).
.frame(legend.frame.key, chart.frame.plot, { scale: 1, anchor: ["max", "min"], offset: [-10, 10] })

// Label centered under the box, its lower edge on the box's lower edge: nearest the draft allows, it lands inside the box (see REPORT.md, Gaps).
.frame(label.frame.line, box.frame.area, { scale: 1, anchor: ["center", "max"] })
