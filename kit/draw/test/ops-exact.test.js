// The op table's edges: a fill that needs a closed line, and a wrapped tiles ring's origin crossing a wire.

import { test } from "node:test";
import assert from "node:assert/strict";
import { typeOp, convertOp } from "../index.js";

const paint = { colors: {}, images: { sheet: { size: [16, 8], cell: [8, 8] } } };
const line = { op: "line", points: [[0, 0], [10, 0], [10, 10]], width: 1, stroke: "#000000" };

test("a line's fill needs closed: true (an open line has no inside)", () => {
  assert.deepEqual(typeOp({ ...line, fill: "#ff0000" }, paint).length, 1);
  assert.match(typeOp({ ...line, fill: "#ff0000" }, paint)[0], /a line: fill needs closed: true/);
  assert.match(typeOp({ ...line, closed: false, fill: "#ff0000" }, paint)[0], /closed: true/);
  assert.deepEqual(typeOp({ ...line, closed: true, fill: "#ff0000" }, paint), []);
  assert.deepEqual(typeOp(line, paint), []);
});

test("a wrapped tiles op's ring origin is a point the wire moves, and a ring-less op has none", () => {
  const src = { op: "tiles", at: [0, 0], image: "sheet", grid: [[0, 1]], wrap: [2, 1] };
  assert.deepEqual(typeOp({ ...src, wrapAt: [100, 0] }, paint), []);
  const c = convertOp(src, { scale: [2, 1], offset: [10, 5] }, paint.images);
  assert.deepEqual(c.wrapAt, [10, 5]);
  assert.deepEqual(convertOp(c, { scale: [1, 1], offset: [1, 1] }, paint.images).wrapAt, [11, 6]);
  assert.equal(convertOp(src, { scale: [2, 1], offset: [0, 0] }, paint.images).wrapAt, undefined, "an unmoved origin stays implicit");
});
