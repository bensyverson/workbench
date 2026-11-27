# Your task: two placements

A glue program composes parts. Two pairs of parts are described in `reference.md`: a chart with a legend, and a box with a label. Both pairs already have their parts, their frames and their `.part(...)` calls. Write **only the `.frame(...)` calls** the glue needs for these two placements, using the kit's placement API as `docs/kit/compose/README.md` describes it (read the section "Draft: an anchored edge", which describes a key the kit does not have yet; use it, and compute no offset yourself beyond what the draft says the glue gives):

1. Place the legend in the top-right corner of the chart, with a 10-unit inset from the corner, at the legend's own size.
2. Place the label centered under the box, touching the box's lower edge.

Write the two calls, with a one-line comment each, in `glue-lines.js` in your folder. No file in this folder is a program you can run; there is no checker. Then write `REPORT.md` with the sections `rules.md` lists. Where the document is unclear, wrong, or cannot say what you need, that is the most useful thing you can report. Don't invent keys, options or conventions: if the draft cannot say a placement, write the nearest thing it can say and report the gap.

**Reading the documents.** Read long documents with your file-reading tool, by offset and limit, not with `cat`.
