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
  assert.deepEqual(localType(ok("(self, w) => { const a = [1, 2, 3]; w.score = a.length; }")), { list: "f64", max: 3, len: 3 });
});

test("the item type is the strict join of the items", () => {
  assert.deepEqual(localType(ok("(self) => { const a = [\"up\", \"down\"]; }")), { list: { enum: ["down", "up"] }, max: 2, len: 2 });
  assert.deepEqual(localType(ok("(self) => { const a = [\"up\", \"x\" + 1]; }")), { list: "str", max: 2, len: 2 });
  assert.deepEqual(localType(ok("(self, w) => { const a = [w.board[0], null]; }")), { list: { opt: { ref: "Mole" } }, max: 2, len: 2 });
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

test("array literals nest, and the items of a checked item are known, since each nested literal has a length", () => {
  const k = ok("(self, w) => { const pts = [[3, 2], [12, 2], [3, 11]]; const p = pts[w.next]; if (p == null) return; const [x, y] = p; if (x !== 0 && y !== 0) w.score = x + y; }");
  assert.deepEqual(localType(k, "pts"), { list: { list: "f64", max: 2, len: 2 }, max: 3, len: 3 });
  assert.equal(localType(k, "x"), "f64");
  assert.deepEqual(localType(k, "p"), { opt: { list: "f64", max: 2, len: 2 } });
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
  const k = ok("(self, w) => { const a = [5, 0, 7]; const v = a[w.next]; w.score = v != null && v > 0 ? v : 99; }");
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
  assert.deepEqual(r.sigs.helpers?.DIRS.kind === "const" && r.sigs.helpers.DIRS.value?.t, { list: { enum: ["down", "left", "right", "up"] }, max: 4, len: 4 });
  const emitted = emitKernel(/** @type {Kernel} */ (r.results[0].kernel));
  const js = emitted.source;
  assert.match(js, /\["up", "down", "left", "right"\]/);
  const w = { score: 0, next: 0 };
  instantiate(emitted)({}, w);
  assert.equal(w.score, 4);
});

test("a constant of numbers can be a loop's bound by its length", () => {
  const src = "(self, w) => { for (let i = 0; i < OFFS.length; i++) w.score += OFFS[i] != null ? 1 : 0; }";
  const r = lowerProgram(environment, [{ src, slot: { id: "Hammer.onFrame#0", kind: "onFrame", on: "Hammer" } }], [{ name: "OFFS", kind: "const", src: "[1, 2, 3]" }]);
  assert.deepEqual(r.results[0].diagnostics.map((d) => `${d.code} ${d.message}`), []);
});

// A literal knows its exact length, so a constant position below it is never empty.
const itemType = (/** @type {string} */ body) => localType(ok(`(self, w) => { const a = [5, 6]; ${body} }`), "x");

test("a constant index below the literal's length is not empty", () => {
  assert.equal(itemType("const x = a[0];"), "f64");
  assert.equal(itemType("const x = a[1];"), "f64");
});

test("a constant index at or past the length is possibly empty", () => {
  assert.deepEqual(itemType("const x = a[2];"), { opt: "f64" });
  assert.deepEqual(itemType("const x = a[7];"), { opt: "f64" });
});

test("a non-constant, negative or fractional index is possibly empty", () => {
  assert.deepEqual(itemType("const x = a[w.next];"), { opt: "f64" });
  assert.deepEqual(itemType("const x = a[-1];"), { opt: "f64" });
  assert.deepEqual(itemType("const x = a[0.5];"), { opt: "f64" });
});

test("destructuring positions below the length are not empty, beyond it they are", () => {
  const k = ok("(self, w) => { const [x, y, z] = [3, 2]; }");
  assert.equal(localType(k, "x"), "f64");
  assert.equal(localType(k, "y"), "f64");
  assert.deepEqual(localType(k, "z"), { opt: "f64" });
});

test("destructuring a literal's item is not empty, as in the Bird case", () => {
  const k = ok("(self, w) => { const [ox, oy] = [3, 2]; w.score = ox + oy; }");
  assert.equal(localType(k, "ox"), "f64");
});

test("lists with no known length stay possibly empty", () => {
  const board = localType(ok("(self, w) => { const x = w.board[0]; }"), "x");
  assert.deepEqual(board, { opt: { ref: "Mole" } });
  const filtered = localType(ok("(self, w) => { const f = w.board.filter((m) => m.up); const x = f[0]; }"), "x");
  assert.deepEqual(filtered, { opt: { ref: "Mole" } });
  const r = lower("(self, w) => { const [m] = w.board; if (m != null) w.score = 1; }", "onFrame", "Hammer");
  assert.deepEqual(codes(r), []);
  const k = ok("(self, w) => { const [m] = w.board; }");
  assert.deepEqual(localType(k, "m"), { opt: { ref: "Mole" } });
});

test("a nested literal's constant index gives a list that is itself not empty", () => {
  const k = ok("(self, w) => { const pts = [[3, 2], [12, 2]]; const p = pts[1]; const x = p[0]; }");
  assert.deepEqual(localType(k, "p"), { list: "f64", max: 2, len: 2 });
  assert.equal(localType(k, "x"), "f64");
});

test("a not-empty item is usable without a check, and the emitted code still reads it", () => {
  const k = ok("(self, w) => { const [ox, oy] = [3, 2]; w.score = ox * 10 + oy; }");
  assert.ok(k.body.length > 0);
});

test("an array literal with a hole is a diagnostic, not a crash", () => {
  /** @type {ReturnType<typeof lower> | undefined} */
  let r;
  assert.doesNotThrow(() => { r = lower("(self, w) => { const l = [1, , 2]; self.ttl = l.length; }"); });
  assert.deepEqual(codes(/** @type {ReturnType<typeof lower>} */ (r)), ["L012"]);
  assert.match(/** @type {ReturnType<typeof lower>} */ (r).diagnostics[0].message, /hole/i);
});
