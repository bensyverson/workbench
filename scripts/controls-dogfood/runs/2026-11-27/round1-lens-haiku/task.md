# Your task: the controls of a lens bench

You are writing, on paper, the controls of a small optics workbench for a kit whose controls API is described in `reference.md` (a draft: nothing in it runs). Use only what `reference.md` says.

**The bench.** Its Dialect (domain language) has a Program written as builder calls, one per lens:

```js
bench.lens({ radius: 40, glass: "BK7" });
bench.lens({ radius: 25, glass: "SF11" });
```

In the kit's Ref ids, a `lens` call's id is `bench.lens#<n>`, with `n` counting from 0 in call order, and its one argument is argument 0. The Draw output `bench` shows the lenses on an optical axis; the Draw output `chart` shows an Abbe diagram (refractive index against dispersion) of the catalog. The runtime's state has a list `lenses`, one item per lens: `{ cx, cy, r, radiusTarget, glassTarget }`, where `(cx, cy)` is the lens's center in the `bench` picture's frame, `r` its radius, and `radiusTarget` and `glassTarget` are the texts of the Argument addresses of its radius and its glass in the Program (the runtime has made them). The Dialect has one data file, a csv of glasses with the columns `name` (text), `nd` and `vd` (numbers).

**The person:**

- **Drags a lens's radius** by a handle on the stage: one handle per lens, on its right edge, dragged along the axis; letting go writes the new radius back into the lens's call in the source, and the radius stays between 5 and 80.
- **Types a caption** for the bench: a line of text the runtime keeps and draws.
- **Picks a glass** from the catalog for a lens (the first lens is enough), looking at the `nd` and `vd` columns, and with the choice written back into the source at once.
- **Has two tabs**: the bench, and the Abbe chart, placed as tabs of one group.

**Write:**

1. `dialect.js`: `export const ports = { in: { ... }, out: { bench: { seam: "Draw", note: "..." }, chart: { seam: "Draw", note: "..." } } }; export const files = { ... };`, the Event inputs the bench needs (you decide which), with `seam` and `note`.
2. `ui.js`: `export const ui = { stage: { draw: "bench" }, controls: { ... }, grips: { ... }, tiles: { ... } };`.

Then write `REPORT.md` as `rules.md` says. Where `reference.md` is unclear, wrong, or cannot say what you need, that is the most useful thing you can report.

**Reading the documents.** Read long documents with your file-reading tool, by offset and limit, not with `cat`.
