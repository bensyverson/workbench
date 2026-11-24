import { test } from "node:test";
import assert from "node:assert/strict";
import { topLevelUnits, asArrow } from "../units.js";

const SRC = `// header comment
exports.meta = {
  title: 'x',
  params: { a: { value: 1 } },
};

const f32 = Math.fround;
function lerp(a, b, t) {
  return a + (b - a) * t;
}
const sq = (x) => x * x;
const big = (x, y) => {
  let v = 0;
  return v + x + y;
};
// a comment between units
exports.frag = (px, py, { w, h }) => [px / w, py / h, 0];
`;

test("topLevelUnits splits a sketch at column-0 statements and names each", () => {
  const us = topLevelUnits(SRC);
  assert.deepEqual(us.map((u) => [u.kind, u.name]), [
    ["other", "exports.meta"],
    ["other", "f32"],
    ["function", "lerp"],
    ["function", "sq"],
    ["function", "big"],
    ["function", "exports.frag"],
  ]);
});

test("a unit's text excludes the comment lines that follow it", () => {
  const big = topLevelUnits(SRC).find((u) => u.name === "big");
  assert.ok(big);
  assert.ok(big.text.endsWith("};"));
  assert.equal(big.line, 12);
});

test("asArrow turns a function declaration into one arrow function", () => {
  const lerp = topLevelUnits(SRC).find((u) => u.name === "lerp");
  assert.ok(lerp);
  assert.equal(asArrow(lerp), "(a, b, t) => {\n  return a + (b - a) * t;\n}");
});

test("asArrow keeps an arrow initializer and drops its binding and semicolon", () => {
  const sq = topLevelUnits(SRC).find((u) => u.name === "sq");
  assert.ok(sq);
  assert.equal(asArrow(sq), "(x) => x * x");
  const frag = topLevelUnits(SRC).find((u) => u.name === "exports.frag");
  assert.ok(frag);
  assert.equal(asArrow(frag), "(px, py, { w, h }) => [px / w, py / h, 0]");
});

test("a const with several declarators becomes one unit per declarator", () => {
  const src = "const fract = (x) => x - Math.floor(x), m = (x, y) => [x, y].length, K = 'a,b';\nconst n = 1;\n";
  const us = topLevelUnits(src);
  assert.deepEqual(us.map((u) => [u.kind, u.name]), [["function", "fract"], ["function", "m"], ["other", "K"], ["other", "n"]]);
  assert.equal(asArrow(us[1]), "(x, y) => [x, y].length");
});

test("a trailing line comment after the semicolon is not part of the arrow", () => {
  const u = topLevelUnits("const fade = (t) => t * t * (3 - 2 * t);   // smoothstep\n")[0];
  assert.equal(asArrow(u), "(t) => t * t * (3 - 2 * t)");
});

test("asArrow gives null for a unit that is not a function", () => {
  const f32 = topLevelUnits(SRC).find((u) => u.name === "f32");
  assert.ok(f32);
  assert.equal(asArrow(f32), null);
});
