// point1 (a position on one axis) and the names a seam type refuses.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSeam, printSeam, pairLocal, compareSeams, framesOf, leavesOf } from "../index.js";

/** @param {string} s */
const ok = (s) => {
  const r = parseSeam(s);
  assert.ok(r.ok, `'${s}' should parse: ${"error" in r ? r.error : ""}`);
  return /** @type {any} */ (r).type;
};

test("point1@frame parses and prints; it is a point of one dim", () => {
  assert.deepEqual(ok("point1@c"), { kind: "point", dims: 1, frame: "c" });
  assert.equal(printSeam(ok("point1@s")), "point1@s");
  assert.equal(printSeam(ok("{ at: point1@c, w: f64@c }")), "{ at: point1@c, w: f64@c }");
  assert.deepEqual(framesOf(ok("point1@c")), ["c"]);
  assert.equal(leavesOf(ok("point1@c"))[0].seam.kind, "point");
});

test("point1 needs a frame, has no rate, and there is no vec1", () => {
  for (const bad of ["point1", "point1@c/s", "vec1@c", "vec1"]) assert.equal(parseSeam(bad).ok, false, bad);
});

test("point1 pairs with an f64 local type, not a vector", () => {
  assert.equal(pairLocal(ok("point1@c"), "f64"), null);
  assert.equal(pairLocal(ok("point1@c"), { scalar: "degrees", of: "f64" }), null);
  assert.match(String(pairLocal(ok("point1@c"), { vec: 2, of: "f64" })), /point1@c pairs with "f64"/);
  assert.match(String(pairLocal(ok("point2@c"), "f64")), /pairs with a vector\(2, "f64"\)/);
});

test("point1 into point1 is a tagged leaf of 1 dim; into a quantity, a vector or a 2-D point, a mismatch", () => {
  assert.deepEqual(compareSeams(ok("point1@c"), ok("point1@f")).tagged, [{ field: "", kind: "point", dims: 1, from: "c", to: "f" }]);
  assert.deepEqual(compareSeams(ok("point1@c"), ok("f64@f")).problems.map((p) => p.code), ["S201"]);
  assert.deepEqual(compareSeams(ok("point1@c"), ok("point2@f")).problems.map((p) => p.code), ["S201"]);
  assert.deepEqual(compareSeams(ok("point1@c"), ok("f64")).problems.map((p) => p.code), ["S252"]);
});

test("a record field or a frame named __proto__ does not parse", () => {
  assert.equal(parseSeam("{ __proto__: f64 }").ok, false);
  assert.equal(parseSeam("point2@__proto__").ok, false);
  assert.equal(parseSeam("{ then: f64 }").ok, true, "then is only refused as a port or a frame name");
});
