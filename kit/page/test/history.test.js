// The text's history (project/2026-11-27-controls-draft.md, requirement 8; build plan group 48): a release, an
// action's edits or an applied edit is one step; an undo gives the previous text, a redo the next, and a new edit after
// an undo drops the redo. An undo is an edit, not a rewind.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHistory } from "../index.js";

test("48. one step per release; undo and redo give the texts; a new edit after an undo drops the redo", () => {
  const h = createHistory("v0");
  assert.equal(h.text, "v0");
  assert.equal(h.canUndo, false);
  h.commit("v1");
  h.commit("v2");
  assert.equal(h.undo(), "v1");
  assert.equal(h.undo(), "v0");
  assert.equal(h.undo(), null, "nothing before the first text");
  assert.equal(h.redo(), "v1");
  assert.equal(h.canRedo, true);
  h.commit("v1b");
  assert.equal(h.canRedo, false, "a new edit after an undo drops the redo");
  assert.equal(h.redo(), null);
  assert.equal(h.undo(), "v1");
  h.commit("v1");
  assert.equal(h.text, "v1", "committing the same text is no step");
  assert.equal(h.undo(), "v0");
});
