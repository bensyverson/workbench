// A loop bound must be a place its Dialect declares a size: read-only alone proves nothing
// (`w.frame` grows for the whole run). Regression tests from the review of the M2 harness.
import { test } from "node:test";
import assert from "node:assert/strict";
import { lower, codes } from "./fixture.js";
import { lowerField, field } from "../../dialects/fields/index.js";
import { verify } from "../../ir/verify.js";

/** @param {string} body */
const grid = (body) => lower(`(w) => { for (let i = 0; i < ${body}; i++) w.sfx("pop"); }`, "timer", "World");

test("DMG: the grid's rows and cols are declared sizes and bound a loop", () => {
  for (const b of ["w.grid.rows", "w.grid.cols"]) {
    const r = grid(b);
    assert.deepEqual(codes(r), [], b);
    assert.deepEqual(verify(/** @type {import("../../ir/ir.js").Kernel} */ (r.kernel)), [], b);
  }
});

test("DMG: a read-only place that is not a size does not bound a loop", () => {
  assert.deepEqual(codes(grid("w.frame")), ["L007"]);
  for (const m of ["id", "index", "row", "col", "stay"]) {
    assert.deepEqual(codes(lower(`(self) => { for (let i = 0; i < self.${m}; i++) self.rise++; }`)), ["L007"], m);
  }
});

/** @param {string} src @param {Record<string, object>} params */
const loopOver = (src, params) => {
  let f = field("c");
  for (const [n, p] of Object.entries(params)) f = f.param(n, /** @type {any} */ (p));
  return lowerField(f.pixel(`(uv, u) => { let s = 0; for (let i = 0; i < ${src}; i++) { s += 1; } return color(s, s, s); }`).build());
};

test("fields: a param with a max below 2^24 bounds a loop; one without, or u.t, does not", () => {
  const n = (/** @type {any} */ p) => ({ n: p });
  assert.deepEqual(loopOver("u.n", n({ value: 4, min: 0, max: 100 })).diagnostics.map((d) => d.code), []);
  assert.deepEqual(loopOver("u.n", n({ value: 4 })).diagnostics.map((d) => d.code), ["L007"]);
  assert.deepEqual(loopOver("u.n", n({ value: 4, min: 0 })).diagnostics.map((d) => d.code), ["L007"]);
  assert.deepEqual(loopOver("u.n", n({ value: 4, min: 0, max: 20000000 })).diagnostics.map((d) => d.code), ["L007"]);
  assert.deepEqual(loopOver("u.t", n({ value: 4, min: 0, max: 100 })).diagnostics.map((d) => d.code), ["L007"]);
  assert.deepEqual(loopOver("u.aspect", n({ value: 4, min: 0, max: 100 })).diagnostics.map((d) => d.code), ["L007"]);
});

test("fields: a max between 2^24 - 1 and 2^24 is not a size, since an f32 counter sticks at 2^24", () => {
  const codesFor = (/** @type {string} */ test) => lowerField(field("c").param("n", { value: 1, min: 0, max: 16777215.5 }).pixel(`(uv, u) => { let s = 0; for (let i = 0; ${test}; i++) { s += 1; } return color(s, s, s); }`).build()).diagnostics.map((d) => d.code);
  assert.deepEqual(codesFor("i <= u.n"), ["L007"]);
  assert.deepEqual(loopOver("u.n", { n: { value: 1, min: 0, max: 16777215 } }).diagnostics.map((d) => d.code), []);
});

test("fields: a param's default must lie within its own min and max", () => {
  assert.throws(() => field("c").param("n", { value: 1e9, min: 0, max: 100 }), /'n'.*(default|value).*(max|100)/);
  assert.throws(() => field("c").param("n", { value: -1, min: 0, max: 100 }), /'n'/);
  field("c").param("n", { value: 100, min: 0, max: 100 });
});

test("the verifier does not take a place with a store rule as a size, even if flagged", () => {
  const r = loopOver("u.n", { n: { value: 4, min: 0, max: 100 } });
  const k = /** @type {any} */ (structuredClone(r.kernel));
  let hit = 0;
  (function walk(/** @type {any} */ n) {
    if (Array.isArray(n)) n.forEach(walk);
    else if (n && typeof n === "object") {
      if (n.k === "load" && n.place?.size) { n.place.store = { type: "f32" }; hit++; }
      Object.values(n).forEach(walk);
    }
  })(k);
  assert.ok(hit > 0);
  assert.ok(verify(k, { partial: true }).some((d) => d.code === "V009"));
});
