// Array literals lower as bounded lists: `[a, b]` is a list of at most 2 items whose
// type is the strict join of the items'. There is no tuple type.
import { test } from "node:test";
import assert from "node:assert/strict";
import { lower, codes, environment } from "./fixture.js";
import { lowerProgram } from "../index.js";
import { emitKernel, instantiate } from "../../emit/js/index.js";
import { printKernel } from "../../ir/print.js";

/** @import { Kernel } from "../../ir/ir.js" */

/**
 * Lowers and asserts success.
 * @param {string} src
 * @returns {Kernel}
 */
function ok(src) {
  const r = lower(src, "onFrame", "Hammer");
  assert.deepEqual(r.diagnostics.filter((d) => d.severity === "error").map((d) => `${d.code} ${d.message}`), []);
  assert.ok(r.kernel);
  return r.kernel;
}

/** @param {Kernel} k */
const localType = (k, name = "a") => k.locals.find((l) => l.name === name)?.t;

test("an array literal is a list with the literal's length as its bound", () => {
  assert.deepEqual(localType(ok("(self, w) => { const a = [1, 2, 3]; w.score = a.length; }")), { list: "f64", max: 3 });
});

test("the item type is the strict join of the items", () => {
  assert.deepEqual(localType(ok("(self) => { const a = [\"up\", \"down\"]; }")), { list: { enum: ["down", "up"] }, max: 2 });
  assert.deepEqual(localType(ok("(self) => { const a = [\"up\", \"x\" + 1]; }")), { list: "str", max: 2 });
  assert.deepEqual(localType(ok("(self, w) => { const a = [w.board[0], null]; }")), { list: { opt: { ref: "Mole" } }, max: 2 });
});

test("items of different types are one L003 at the first that does not join", () => {
  const r = lower("(self) => { const a = [1, 2, \"x\", 4]; }", "onFrame", "Hammer");
  assert.deepEqual(codes(r), ["L003"]);
  assert.match(r.diagnostics[0].message, /An array.s items share one type/);
  assert.match(r.diagnostics[0].message, /f64/);
  assert.equal(r.diagnostics[0].range[0], "(self) => { const a = [1, 2, ".length);
});

test("an empty array literal is still not lowered: it has no item type", () => {
  const r = lower("(self) => { const a = []; }", "onFrame", "Hammer");
  assert.deepEqual(codes(r), ["L012"]);
  assert.match(r.diagnostics[0].tip, /declared list|item type/);
});

test("array literals nest, and tuple destructuring of an item reads possibly-empty numbers", () => {
  const k = ok("(self, w) => { const pts = [[3, 2], [12, 2], [3, 11]]; const p = pts[w.next]; if (!p) return; const [x, y] = p; if (x && y) w.score = x + y; }");
  assert.deepEqual(localType(k, "pts"), { list: { list: "f64", max: 2 }, max: 3 });
  assert.deepEqual(localType(k, "x"), { opt: "f64" });
});

test("nested literals of different lengths do not join", () => {
  assert.deepEqual(codes(lower("(self) => { const a = [[1], [1, 2]]; }", "onFrame", "Hammer")), ["L003"]);
});

test("items are read by index as possibly empty, and must be checked", () => {
  assert.deepEqual(codes(lower("(self, w) => { w.score = [1, 2][w.next]; }", "onFrame", "Hammer")), ["L003"]);
});

test("an array literal's items are evaluated in order, and their effects count", () => {
  const k = ok("(self, w) => { const a = [w.rng.int(3), w.score]; w.next = a.length; }");
  assert.ok(k.effects.includes("rng"));
  assert.ok(k.effects.includes("read World.score"));
});

test("an array literal prints and emits as an array literal, and runs like the source", () => {
  const k = ok("(self, w) => { const a = [5, 0, 7]; const v = a[w.next]; w.score = v ? v : 99; }");
  assert.match(printKernel(k), /\[5, 0, 7\]/);
  const emitted = emitKernel(k);
  const js = emitted.source;
  assert.match(js, /\[5, 0, 7\]/);
  const fn = instantiate(emitted);
  for (const [next, want] of [[0, 5], [1, 99], [2, 7], [9, 99]]) {
    const w = { score: 0, next };
    fn({}, w);
    assert.equal(w.score, want, `next = ${next}`);
  }
});

test("an array literal in a constant is baked into each use", () => {
  const src = "(self, w) => { const d = DIRS[w.next]; if (d === \"up\") w.score = DIRS.length; }";
  const r = lowerProgram(environment, [{ src, slot: { id: "Hammer.onFrame#0", kind: "onFrame", on: "Hammer" } }], [{ name: "DIRS", kind: "const", src: "[\"up\", \"down\", \"left\", \"right\"]" }]);
  assert.deepEqual(r.results[0].diagnostics.map((d) => `${d.code} ${d.message}`), []);
  assert.deepEqual(r.sigs.helpers?.DIRS.kind === "const" && r.sigs.helpers.DIRS.value?.t, { list: { enum: ["down", "left", "right", "up"] }, max: 4 });
  const emitted = emitKernel(/** @type {Kernel} */ (r.results[0].kernel));
  const js = emitted.source;
  assert.match(js, /\["up", "down", "left", "right"\]/);
  const w = { score: 0, next: 0 };
  instantiate(emitted)({}, w);
  assert.equal(w.score, 4);
});

test("a constant of numbers can be a loop's bound by its length", () => {
  const src = "(self, w) => { for (let i = 0; i < OFFS.length; i++) w.score += OFFS[i] ? 1 : 0; }";
  const r = lowerProgram(environment, [{ src, slot: { id: "Hammer.onFrame#0", kind: "onFrame", on: "Hammer" } }], [{ name: "OFFS", kind: "const", src: "[1, 2, 3]" }]);
  assert.deepEqual(r.results[0].diagnostics.map((d) => `${d.code} ${d.message}`), []);
});
