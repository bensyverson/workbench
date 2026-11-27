// @ts-nocheck: UI values are generated, which TypeScript cannot follow here.
// The host's layout, as a pure function (project/2026-11-27-controls-draft.md, requirement 9; build plan group 51):
// each generated view is a root, a tile placed with tabWith joins its target's tab group, a split puts the tile
// beside its target in a tree, and a view tile or the editor takes its place like any other. A lens bench's charts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { layoutOf } from "../layout.js";
import { defineUI } from "../../../define/index.js";
import { lens } from "../../../define/fixtures/controls-dialects.js";

const ui = defineUI(lens(), {
  stage: { draw: "view" },
  tiles: {
    chart: { title: "Chart", place: { tabWith: "stage" }, body: [{ kind: "view", draw: "chart" }] },
    table: { title: "Glasses", place: { splitRight: "stage", size: 0.3 }, body: [{ kind: "text", value: "x" }] },
    notes: { title: "Notes", place: { splitBelow: "table" }, body: [{ kind: "text", value: "y" }] },
    source: { title: "Source", place: { tabWith: "editor" }, body: [{ kind: "text", value: "z" }] },
  },
});

test("51. layoutOf: tabWith makes tab groups, splits make a tree, and view and editor tiles take their places", () => {
  const roots = layoutOf([{ part: "bench", ui }], ["stage", "controls", "editor"]);
  assert.deepEqual(Object.keys(roots), ["stage", "controls", "editor"]);
  assert.deepEqual(roots.controls, { view: "controls" });
  assert.deepEqual(roots.editor, { tabs: [{ view: "editor" }, { tile: "source", part: "bench" }] });
  assert.deepEqual(roots.stage, {
    split: "right", size: 0.3,
    main: { tabs: [{ view: "stage" }, { tile: "chart", part: "bench" }] },
    side: { split: "below", size: 0.5, main: { tile: "table", part: "bench" }, side: { tile: "notes", part: "bench" } },
  });
  assert.deepEqual(layoutOf([], ["stage"]), { stage: { view: "stage" } });
});
