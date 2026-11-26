import { test } from "node:test";
import assert from "node:assert/strict";
import { carry } from "../carry.js";

test("a dropped field is matched by its name after the rename, never by the producer's name", () => {
  // rename { a: "x", x: "b" }: the producer's x arrives as b (taken); its a arrives as x, which the consumer drops
  const out = carry({ a: 1, x: 2 }, { rename: { a: "x", x: "b" }, dropped: ["x"], convert: [] });
  assert.deepEqual(out, { b: 2 });
});

/** @param {Partial<{ rename: Record<string, string>, dropped: string[], convert: any[] }>} w */
const wire = (w) => ({ rename: {}, dropped: [], convert: [], ...w });

test("a nested dropped field goes by its path: inner.x, pts[].x, and a list's items' [].k", () => {
  assert.deepEqual(carry({ inner: { a: 1, x: 2 }, keep: 3 }, wire({ dropped: ["keep", "inner.x"] })), { inner: { a: 1 } });
  assert.deepEqual(carry({ pts: [{ x: 1, y: 2 }, { x: 3, y: 4 }], n: 2 }, wire({ dropped: ["pts[].x"] })), { pts: [{ y: 2 }, { y: 4 }], n: 2 });
  assert.deepEqual(carry([{ a: 1, k: 2 }, { a: 3, k: 4 }], wire({ dropped: ["[].k"] })), [{ a: 1 }, { a: 3 }]);
  // what is not dropped arrives whole, and a path that meets no record leaves the value be
  assert.deepEqual(carry({ inner: null, keep: 3 }, wire({ dropped: ["inner.x"] })), { inner: null, keep: 3 });
});

test("a list of records renames each item's fields, then drops and converts by path ([].at)", () => {
  const w = wire({ rename: { pos: "at" }, dropped: ["[].z"], convert: [{ field: "[].at", kind: "point", scale: [2, 2], offset: [1, 1] }] });
  assert.deepEqual(carry([{ pos: [1, 2], z: 0 }, { pos: [0, 0], z: 1 }], w), [{ at: [3, 5] }, { at: [1, 1] }]);
});

test("a point1 is a plain number: it converts by scale and offset (100 C is 212 F)", () => {
  assert.equal(carry(100, wire({ convert: [{ field: "", kind: "point", scale: [1.8], offset: [32] }] })), 212);
  assert.deepEqual(carry({ t: 0 }, wire({ convert: [{ field: "t", kind: "point", scale: [1.8], offset: [32] }] })), { t: 32 });
});

test("a wire's fill gives a record each defaulted field it lacks, after the conversions, and never overrides one it has", () => {
  const w = { ...wire({ convert: [{ field: "at", kind: "point", scale: [2, 2], offset: [0, 0] }] }), fill: { speed: 40, push: [0, 1] } };
  assert.deepEqual(carry({ at: [1, 1] }, w), { at: [2, 2], speed: 40, push: [0, 1] }, "the default is the consumer's, so it is not converted");
  assert.deepEqual(carry({ at: [1, 1] }, wire({})), { at: [1, 1] }, "a wire with no fill adds nothing");
});

test("a planned fill always wins: an undeclared field a runtime pushes under that name is replaced, never passed through", () => {
  const w = { ...wire({}), fill: { speed: 40 } };
  assert.deepEqual(carry({ n: 1, speed: "not-a-number" }, w), { n: 1, speed: 40 });
});

test("each carried record gets its own copy of a filled list or record, so freezing one never freezes the shared default", () => {
  const shared = [1, 2], rec = { x: { y: 1 } };
  const w = { ...wire({}), fill: { l: shared, r: rec } };
  const a = /** @type {any} */ (carry({ n: 1 }, w)), b = /** @type {any} */ (carry({ n: 2 }, w));
  assert.notEqual(a.l, shared);
  assert.notEqual(a.l, b.l);
  assert.notEqual(a.r.x, rec.x);
  assert.deepEqual(a, { n: 1, l: [1, 2], r: { x: { y: 1 } } });
  Object.freeze(a.l);
  assert.equal(Object.isFrozen(shared), false);
  assert.equal(Object.isFrozen(b.l), false);
});
