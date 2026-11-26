// The closed op table: typing one op against a Dialect's paint (named colors, declared images), the paint
// declaration itself, and an op converted across a frame edge (ruling 3: tiles and an unsized image scale their
// cells by the edge; a negative scale keeps its sign on sizes and mirrors, radii stay positive).

import { test } from "node:test";
import assert from "node:assert/strict";
import { typeOp, checkPaint, convertOp, resolveColor, OP_KINDS, opBox } from "../index.js";

const paint = {
  colors: { wall: "#4a6fa5", glow: "#ffd23f80" },
  images: { hero: { size: [16, 16] }, sheet: { size: [32, 16], cell: [8, 8] } },
};

test("the op kinds are the draft's six, in the table's order", () => {
  assert.deepEqual(OP_KINDS, ["rect", "ellipse", "line", "image", "tiles", "text"]);
});

test("an op that fits the table has no problems", () => {
  for (const op of [
    { op: "rect", at: [0, 0], size: [4, 4], fill: "wall" },
    { op: "rect", at: [0, 0], size: [-4, 4], stroke: "#000000" },
    { op: "ellipse", at: [1, 1], r: [2, 3], fill: "glow" },
    { op: "line", points: [[0, 0], [1, 1]], width: 1, stroke: "wall", closed: true },
    { op: "image", at: [0, 0], image: "hero", flip: "x" },
    { op: "image", at: [0, 0], image: "sheet", cell: 7, size: [8, 8] },
    { op: "tiles", at: [0, 0], image: "sheet", grid: [[0, 1, -1], [7]], wrap: [32, 32] },
    { op: "tiles", at: [0, 0], image: "sheet", grid: ["#.c", "##"], key: { "#": 0, ".": -1, c: 3 } },
    { op: "tiles", at: [0, 0], image: "sheet", grid: [[0]], size: [4, 4] },
    { op: "text", at: [0, 0], str: "SCORE 12", font: "mono", fill: "#ffffffff" },
  ]) assert.deepEqual(typeOp(op, paint), [], JSON.stringify(op));
});

test("an op that does not fit says what is wrong", () => {
  /** @param {unknown} op @param {RegExp} re */
  const one = (op, re) => { const p = typeOp(op, paint); assert.equal(p.length, 1, `${JSON.stringify(op)}: ${p.join("; ")}`); assert.match(p[0], re); };
  one(7, /not a record/);
  one({ at: [0, 0] }, /no op field/);
  one({ op: "circle" }, /'circle' is not an op/);
  one({ op: "rect", at: [0, 0], size: [1, 1], colour: "wall" }, /no field 'colour'/);
  one({ op: "rect", at: [0, 0] }, /needs size/);
  one({ op: "rect", at: [0, "1"], size: [1, 1] }, /at must be a point2/);
  one({ op: "rect", at: [0, 0], size: [1, 1], fill: "floor" }, /not a color.*wall, glow/);
  one({ op: "text", at: [0, 0], str: "x", font: "serif", fill: "wall" }, /the only font is "mono"/);
  one({ op: "text", at: [0, 0], str: 12, font: "mono", fill: "wall" }, /str must be a string/);
  one({ op: "image", at: [0, 0], image: "villain" }, /not a declared image/);
  one({ op: "image", at: [0, 0], image: "hero", cell: 0 }, /has no cells/);
  one({ op: "image", at: [0, 0], image: "sheet", cell: 8 }, /past the end: image 'sheet' has 8 cells/);
  one({ op: "tiles", at: [0, 0], image: "sheet", grid: [[0, 9]] }, /grid holds 9/);
  one({ op: "tiles", at: [0, 0], image: "sheet", grid: ["#x"], key: { "#": 0 } }, /character 'x'.*key/);
  one({ op: "tiles", at: [0, 0], image: "sheet", grid: ["#"] }, /string rows need a key/);
  one({ op: "line", points: [[0, 0]], width: 1, stroke: "wall" }, /two or more/);
});

test("paint: colors are #rrggbb or #rrggbbaa, images a size and an optional dividing cell", () => {
  assert.deepEqual(checkPaint(paint), []);
  assert.deepEqual(checkPaint({}), []);
  const p = checkPaint({ colors: { a: "red", b: "#12345" }, images: { x: { size: [8, 8], cell: [3, 8] }, y: { size: [0, 8] }, z: { size: [8, 8], pixels: [] } } });
  assert.equal(p.length, 5, p.join("\n"));
  assert.match(p.join("\n"), /colors\.a.*colors\.b.*images\.x\.cell.*images\.y\.size.*images\.z has no key 'pixels'/s);
});

test("a color resolves to #rrggbbaa from its name or a literal", () => {
  assert.equal(resolveColor("wall", paint.colors), "#4a6fa5ff");
  assert.equal(resolveColor("#ABCDEF", paint.colors), "#abcdefff");
  assert.equal(resolveColor("floor", paint.colors), null);
});

test("an op converts by the edge: positions by scale and offset, sizes by the scale", () => {
  const e = { scale: [2, 3], offset: [10, 20] };
  const images = { "m.sheet": { size: [32, 16], cell: [8, 8] }, "m.hero": { size: [16, 16] } };
  assert.deepEqual(convertOp({ op: "rect", at: [1, 1], size: [4, 4] }, e, images), { op: "rect", at: [12, 23], size: [8, 12] });
  assert.deepEqual(convertOp({ op: "ellipse", at: [0, 0], r: [1, 1] }, { scale: [-2, 2], offset: [0, 0] }, images), { op: "ellipse", at: [0, 0], r: [2, 2] });
  assert.deepEqual(convertOp({ op: "line", points: [[0, 0], [1, 1]], width: 2, stroke: "#000000ff" }, e, images).points, [[10, 20], [12, 23]]);
  assert.equal(convertOp({ op: "line", points: [[0, 0], [1, 1]], width: 2, stroke: "#000000ff" }, e, images).width, 5);
  assert.deepEqual(convertOp({ op: "text", at: [1, 1], str: "a", font: "mono", fill: "#000000ff" }, e, images).at, [12, 23]);
  // an unsized image and a tiles layer take their size from the image, scaled; a unit scale leaves them unsized
  assert.deepEqual(convertOp({ op: "image", at: [0, 0], image: "m.hero" }, e, images).size, [32, 48]);
  assert.deepEqual(convertOp({ op: "image", at: [0, 0], image: "m.sheet", cell: 1 }, e, images).size, [16, 24]);
  assert.deepEqual(convertOp({ op: "tiles", at: [0, 0], image: "m.sheet", grid: [[0]] }, e, images).size, [16, 24]);
  assert.deepEqual(convertOp({ op: "tiles", at: [0, 0], image: "m.sheet", grid: [[0]], size: [4, 4] }, e, images).size, [8, 12]);
  assert.equal(convertOp({ op: "tiles", at: [0, 0], image: "m.sheet", grid: [[0]] }, { scale: [1, 1], offset: [5, 5] }, images).size, undefined);
  assert.equal(convertOp({ op: "image", at: [0, 0], image: "m.hero" }, { scale: [1, 1], offset: [5, 5] }, images).size, undefined);
});

test("an op's box: negative sizes span backwards, text at 8 units a character, tiles by their cells", () => {
  const images = { sheet: { size: [32, 16], cell: [8, 8] } };
  assert.deepEqual(opBox({ op: "rect", at: [4, 4], size: [-4, 2] }, images), { min: [0, 4], max: [4, 6] });
  assert.deepEqual(opBox({ op: "text", at: [0, 0], str: "abc" }, images), { min: [0, 0], max: [24, 8] });
  assert.deepEqual(opBox({ op: "tiles", at: [0, 0], image: "sheet", grid: ["###", "#"] }, images), { min: [0, 0], max: [24, 16] });
  assert.deepEqual(opBox({ op: "tiles", at: [0, 0], image: "sheet", grid: [[0, 0]], size: [2, 2] }, images), { min: [0, 0], max: [4, 2] });
});
