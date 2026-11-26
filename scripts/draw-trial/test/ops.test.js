import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDrawSeam, typeOp, resolveColor, convertOp, opBox, carryOp, checkPaint } from "../checker/ops.js";

const paint = { colors: { wall: "#204060", glow: "#ffcc0080" }, images: { coin: { size: [16, 8], cell: [8, 8] }, logo: { size: [32, 16] } } };

test("parseDrawSeam reads Draw<max>@frame and refuses anything else", () => {
  assert.deepEqual(parseDrawSeam("Draw<256>@cell"), { max: 256, frame: "cell" });
  assert.deepEqual(parseDrawSeam(" Draw< 12 >@px "), { max: 12, frame: "px" });
  assert.equal(parseDrawSeam("f64@px"), null);
  for (const bad of ["Draw<0>@px", "Draw<1.5>@px", "Draw<8>", "Draw@px", "Draw<8>@"]) assert.match(/** @type {any} */ (parseDrawSeam(bad)).error, /Draw<<max>>@<frame>/, bad);
});

test("typeOp accepts every op of the table written right", () => {
  const good = [
    { op: "rect", at: [0, 0], size: [1, 1], fill: "wall" },
    { op: "ellipse", at: [1, 2], r: [3, 3], stroke: "#ffffff" },
    { op: "line", points: [[0, 0], [1, 1]], width: 1, stroke: "glow", closed: true, fill: "wall" },
    { op: "image", at: [0, 0], image: "coin", cell: 1, size: [1, 1], flip: "x" },
    { op: "tiles", at: [0, 0], image: "coin", grid: [[0, -1], [1, 0]], wrap: [2, 2] },
    { op: "text", at: [0, 0], str: "SCORE 1", font: "mono", fill: "#000000ff" },
  ];
  for (const op of good) assert.deepEqual(typeOp(op, paint), [], JSON.stringify(op));
});

test("typeOp names each way an op misses the table", () => {
  const cases = [
    [{ op: "circle", at: [0, 0] }, /'circle' is not an op/],
    [{ at: [0, 0] }, /no op field/],
    [{ op: "rect", at: [0, 0] }, /needs size/],
    [{ op: "rect", at: [0], size: [1, 1] }, /at must be a point2/],
    [{ op: "rect", at: [0, 0], size: [1, 1], fill: "red" }, /"red" is not a color/],
    [{ op: "rect", at: [0, 0], size: [1, 1], color: "wall" }, /has no field 'color'/],
    [{ op: "line", points: [[0, 0]], width: 1, stroke: "wall" }, /two or more/],
    [{ op: "image", at: [0, 0], image: "hero" }, /"hero" is not a declared image/],
    [{ op: "image", at: [0, 0], image: "coin", cell: 2 }, /cell 2 .* 2 cells/],
    [{ op: "image", at: [0, 0], image: "coin", cell: 0.5 }, /whole number/],
    [{ op: "image", at: [0, 0], image: "coin", flip: "h" }, /flip/],
    [{ op: "tiles", at: [0, 0], image: "logo", grid: [[0]] }, /no cells/],
    [{ op: "tiles", at: [0, 0], image: "coin", grid: [0, 1] }, /list of rows/],
    [{ op: "text", at: [0, 0], str: 3, font: "mono", fill: "wall" }, /str must be a string/],
    [{ op: "text", at: [0, 0], str: "a", font: "serif", fill: "wall" }, /font 'serif'/],
    [null, /not a record/],
  ];
  for (const [op, re] of cases) assert.match(typeOp(op, paint).join("; "), /** @type {RegExp} */ (re), JSON.stringify(op));
});

test("checkPaint refuses a bad color or image declaration and accepts good ones", () => {
  assert.deepEqual(checkPaint(paint), []);
  assert.match(checkPaint({ colors: { a: "blue" }, images: {} }).join(";"), /colors.a/);
  assert.match(checkPaint({ colors: {}, images: { a: { size: [10, 8], cell: [4, 8] } } }).join(";"), /images.a/);
  assert.match(checkPaint({ colors: {}, images: { a: { size: [16, 8], cell: [8, 8], pixels: 1 } } }).join(";"), /pixels/);
});

test("resolveColor gives #rrggbbaa for a name or a literal", () => {
  assert.equal(resolveColor("wall", paint.colors), "#204060ff");
  assert.equal(resolveColor("#ABCDEF", {}), "#abcdefff");
  assert.equal(resolveColor("#00000080", {}), "#00000080");
  assert.equal(resolveColor("teal", {}), null);
});

test("convertOp moves positions by scale and offset, sizes by scale, and tiles and text by at only", () => {
  const e = { scale: [10, 10], offset: [5, 0] };
  assert.deepEqual(convertOp({ op: "rect", at: [1, 2], size: [1, 1] }, e), { op: "rect", at: [15, 20], size: [10, 10] });
  assert.deepEqual(convertOp({ op: "ellipse", at: [0, 0], r: [0.5, 0.5] }, e), { op: "ellipse", at: [5, 0], r: [5, 5] });
  assert.deepEqual(convertOp({ op: "line", points: [[0, 0], [1, 0]], width: 0.1, stroke: "a" }, e), { op: "line", points: [[5, 0], [15, 0]], width: 1, stroke: "a" });
  assert.deepEqual(convertOp({ op: "image", at: [1, 1], image: "a", size: [1, 1] }, e), { op: "image", at: [15, 10], image: "a", size: [10, 10] });
  assert.deepEqual(convertOp({ op: "image", at: [1, 1], image: "a" }, e), { op: "image", at: [15, 10], image: "a" });
  assert.deepEqual(convertOp({ op: "tiles", at: [1, 1], image: "a", grid: [[0]] }, e), { op: "tiles", at: [15, 10], image: "a", grid: [[0]] });
  assert.deepEqual(convertOp({ op: "text", at: [0, 1], str: "x", font: "mono", fill: "a" }, e), { op: "text", at: [5, 10], str: "x", font: "mono", fill: "a" });
});

test("opBox spans what an op covers, images at their declared or given size", () => {
  assert.deepEqual(opBox({ op: "rect", at: [1, 1], size: [2, 3] }, paint.images), { min: [1, 1], max: [3, 4] });
  assert.deepEqual(opBox({ op: "ellipse", at: [5, 5], r: [1, 2] }, paint.images), { min: [4, 3], max: [6, 7] });
  assert.deepEqual(opBox({ op: "image", at: [0, 0], image: "coin", cell: 1 }, paint.images), { min: [0, 0], max: [8, 8] });
  assert.deepEqual(opBox({ op: "image", at: [0, 0], image: "coin", size: [1, 1] }, paint.images), { min: [0, 0], max: [1, 1] });
  assert.deepEqual(opBox({ op: "tiles", at: [0, 0], image: "coin", grid: [[0, 0, 0], [0]] }, paint.images), { min: [0, 0], max: [24, 16] });
  assert.deepEqual(opBox({ op: "text", at: [0, 0], str: "abc", font: "mono", fill: "a" }, paint.images), { min: [0, 0], max: [24, 8] });
  assert.deepEqual(opBox({ op: "line", points: [[0, 0], [4, 2]], width: 1, stroke: "a" }, paint.images), { min: [0, 0], max: [4, 2] });
});

test("carryOp resolves color names and qualifies image names with the part", () => {
  const out = carryOp({ op: "image", at: [0, 0], image: "coin", size: [1, 1] }, paint, "lv");
  assert.deepEqual(out, { op: "image", at: [0, 0], image: "lv.coin", size: [1, 1] });
  assert.deepEqual(carryOp({ op: "rect", at: [0, 0], size: [1, 1], fill: "wall", stroke: "#fff000" }, paint, "lv"), { op: "rect", at: [0, 0], size: [1, 1], fill: "#204060ff", stroke: "#fff000ff" });
});
