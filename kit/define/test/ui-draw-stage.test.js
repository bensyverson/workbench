// defineUI's third stage form (the draw-list draft, "What changes elsewhere", ruled 2026-11-26, leaf hca0YM):
// `stage: { draw: "<output>" }` shows the Dialect's own Draw output of that name, beside the custom element and
// the text view (no stage). U014 refuses an output the Dialect lacks (with a did-you-mean), one that is not a Draw
// seam, and a stage that is both a Draw output and a custom element.

import { test } from "node:test";
import assert from "node:assert/strict";
import { defineUI } from "../index.js";
import { drawnMaze } from "../../draw/fixtures/draw-dialects.js";

/** @param {unknown} stage */
function codes(stage) {
  try { defineUI(drawnMaze(), /** @type {any} */ ({ stage })); return []; } catch (e) {
    return /** @type {Array<{ code: string, path: string, message: string, tip: string }>} */ (/** @type {any} */ (e).diagnostics.map((/** @type {any} */ d) => ({ code: d.code, path: d.path.join("."), message: d.message, tip: d.tip })));
  }
}

test("a stage that names the Dialect's Draw output is the third form, kept on the UI", () => {
  const ui = defineUI(drawnMaze(), /** @type {any} */ ({ stage: { draw: "view" } }));
  assert.deepEqual(ui.stage, { draw: "view" });
  assert.equal(Object.isFrozen(ui.stage), true);
  // the other two forms still stand: the text view (no stage) and a custom element
  assert.equal(defineUI(drawnMaze(), {}).stage, undefined);
  assert.deepEqual(defineUI(drawnMaze(), { stage: { element: "maze-board", module: "./maze-board.js" } }).stage, { element: "maze-board", module: "./maze-board.js" });
});

test("a Draw stage naming an output the Dialect lacks is U014, with a did-you-mean", () => {
  const ds = codes({ draw: "veiw" });
  assert.equal(ds.length, 1);
  assert.equal(ds[0].code, "U014");
  assert.equal(ds[0].path, "stage.draw");
  assert.match(ds[0].message, /the maze Dialect has no output 'veiw'/);
  assert.match(ds[0].message, /Did you mean 'view'\?/);
  assert.match(ds[0].tip, /draw: "view"/);
});

test("a Draw stage naming an output that is not a Draw seam is U014, naming its seam and the Draw outputs", () => {
  const ds = codes({ draw: "score" });
  assert.deepEqual(ds.map((d) => d.code), ["U014"]);
  assert.match(ds[0].message, /out\.score is f64, not a Draw seam/);
  assert.match(ds[0].tip, /draw: "view"/);
});

test("a Draw stage that is not a string, or is also a custom element, is refused", () => {
  assert.deepEqual(codes({ draw: 3 }).map((d) => d.code), ["U014"]);
  const both = codes({ draw: "view", element: "maze-board", module: "./maze-board.js" });
  assert.deepEqual(both.map((d) => d.code), ["U014"]);
  assert.match(both[0].message, /a stage is a custom element or a Draw output, not both/);
  // a key that neither form takes is still U001, its did-you-mean over both forms' keys
  assert.deepEqual(codes({ draw: "view", drw: 1 }).map((d) => d.code), ["U001"]);
});
