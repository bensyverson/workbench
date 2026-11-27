# Reference: the four parts

Each part below is already added to the glue with `.part(...)`, and its frame is named as shown. A frame's extent is its box, `[min]..[max]` per axis, in the frame's own units. All four frames are two-dimensional Draw frames, as the page draws them.

| Part | Frame | Extent | What it is |
|---|---|---|---|
| `chart` | `plot` | `[0, 0]..[400, 300]` | a line chart's picture |
| `legend` | `key` | `[0, 0]..[90, 40]` | the legend's picture: a few swatches and their words |
| `box` | `area` | `[0, 0]..[200, 100]` | a labeled box's picture |
| `label` | `line` | `[0, 0]..[80, 14]` | a one-line text picture |

The glue's skeleton, which you need not copy:

```js
export default ($) => {
  // ... parts built from their packages: chart, legend, box, label ...
  return compose("report")
    .part(chart).part(legend).part(box).part(label)
    // your two .frame(...) calls go here
    .show(chart.out.picture, legend.out.picture);
};
```

A part's frame is `chart.frame.plot`, `legend.frame.key`, `box.frame.area` and `label.frame.line`.
