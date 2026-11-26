// The seam type grammar: every form the draft writes parses and prints back canonically; every malformed one is
// refused with a reason. Then the pairing of a seam type with a Dialect's local (IR) type, and the comparison of
// a producer's seam with a consumer's, field by field.

import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSeam, printSeam, pairLocal, compareSeams, framesOf } from "../index.js";

/** @param {string} s */
const ok = (s) => {
  const r = parseSeam(s);
  assert.ok(r.ok, `'${s}' should parse: ${"error" in r ? r.error : ""}`);
  return /** @type {any} */ (r).type;
};

test("every form in the draft's table parses and prints canonically", () => {
  for (const [src, printed] of [
    ["f64", "f64"], ["bool", "bool"], ["str", "str"],
    ["f64@px", "f64@px"], ["point2@cell", "point2@cell"], ["point3@world", "point3@world"],
    ["vec2@cell", "vec2@cell"], ["vec3", "vec3"], ["vec2", "vec2"],
    ["'rock' | 'open'", "'rock' | 'open'"], ["\"coin\"|'key'", "'coin' | 'key'"],
    ["{ at: point2@cell, kind: 'coin' | 'key' }", "{ at: point2@cell, kind: 'coin' | 'key' }"],
    ["{at:point2@cell,}", "{ at: point2@cell }"],
    ["list<f64@px, 8>", "list<f64@px, 8>"], ["list<{ at: vec2 }, 3>", "list<{ at: vec2 }, 3>"],
    ["Event<{ at: point2@cell }>", "Event<{ at: point2@cell }>"], ["Event<{}>", "Event<{}>"],
  ]) assert.equal(printSeam(ok(src)), printed, src);
});

test("the parsed forms carry their kind, dims and frame", () => {
  assert.deepEqual(ok("point2@cell"), { kind: "point", dims: 2, frame: "cell" });
  assert.deepEqual(ok("vec3"), { kind: "vector", dims: 3, frame: null });
  assert.deepEqual(ok("f64@s"), { kind: "quantity", frame: "s" });
  assert.deepEqual(ok("'a' | 'b'"), { kind: "enum", values: ["a", "b"] });
  assert.deepEqual(ok("list<bool, 4>"), { kind: "list", of: { kind: "scalar", of: "bool" }, max: 4 });
  assert.deepEqual(framesOf(ok("Event<{ at: point2@cell, r: f64@px, v: vec2 }>")), ["cell", "px"]);
});

test("malformed seams are refused with a reason", () => {
  for (const bad of ["", "f32", "point2", "point4@x", "bool@px", "str@px", "vec2@", "@px", "f64@1x", "'a' | f64", "'a' | 'a'",
    "{ at: f64, at: f64 }", "{ at f64 }", "{ 1: f64 }", "list<f64>", "list<f64, 0>", "list<f64, 2.5>", "list<f64, -1>",
    "Event<f64>", "{ e: Event<{}> }", "list<Event<{}>, 2>", "Event<{}> x", "Signal<f64>", "Event<{ at: f64 }"]) {
    const r = parseSeam(bad);
    assert.equal(r.ok, false, `'${bad}' should not parse`);
    assert.ok("error" in r && r.error.length > 0);
  }
});

const v2 = /** @type {const} */ ({ vec: 2, of: "f64", name: "cell2" });

test("pairing: the local type must have the seam type's structure", () => {
  assert.equal(pairLocal(ok("f64@px"), "f64"), null);
  assert.equal(pairLocal(ok("f64"), { scalar: "cells", of: "f64" }), null);
  assert.equal(pairLocal(ok("point2@cell"), v2), null);
  assert.equal(pairLocal(ok("vec2"), v2), null);
  assert.equal(pairLocal(ok("{ at: point2@cell }"), { struct: { at: v2 } }), null);
  assert.equal(pairLocal(ok("'a' | 'b'"), { enum: ["b", "a"], declared: true }), null);
  assert.equal(pairLocal(ok("list<f64, 8>"), { list: "f64", max: 4 }), null);
  assert.equal(pairLocal(ok("Event<{ at: point2@cell }>"), { list: { struct: { at: v2 } }, max: 8 }), null);
  assert.equal(pairLocal(ok("Event<{ at: point2@cell }>"), /** @type {any} */ ({ list: { struct: { at: v2 } } })), null, "an Event's list may leave its max out");
  for (const [seam, local] of /** @type {Array<[string, any]>} */ ([
    ["point2@cell", { struct: { x: "f64", y: "f64" } }], ["point3@cell", v2], ["f64", "bool"], ["bool", "f64"], ["str", "f64"],
    ["{ at: point2@cell }", { struct: { at: v2, kind: "str" } }], ["{ at: point2@cell, r: f64 }", { struct: { at: v2 } }],
    ["'a' | 'b'", { enum: ["a"] }], ["list<f64, 4>", { list: "f64", max: 8 }], ["list<f64, 4>", { list: "f64" }],
    ["Event<{ at: point2@cell }>", { struct: { at: v2 } }], ["vec2", { vec: 2, of: "f32" }],
  ])) assert.ok(typeof pairLocal(ok(seam), local) === "string", `${seam} should not pair with ${JSON.stringify(local)}`);
});

/** @param {string} a @param {string} b */
const cmp = (a, b) => compareSeams(ok(a), ok(b));
/** @param {string} a @param {string} b */
const codes = (a, b) => cmp(a, b).problems.map((p) => p.code);

test("comparison: identical untagged seams cross unchanged", () => {
  assert.deepEqual(cmp("f64", "f64"), { problems: [], tagged: [], dropped: [] });
  assert.deepEqual(cmp("{ n: vec2, k: 'a' }", "{ n: vec2, k: 'a' | 'b' }"), { problems: [], tagged: [], dropped: [] });
});

test("comparison: tagged leaves are listed with their field paths for the conversion", () => {
  const r = cmp("Event<{ at: point2@cell, r: f64@cell, v: vec2@cell }>", "Event<{ at: point2@px, r: f64@px, v: vec2@px }>");
  assert.deepEqual(r.problems, []);
  assert.deepEqual(r.tagged, [
    { field: "at", kind: "point", dims: 2, from: "cell", to: "px" },
    { field: "r", kind: "quantity", dims: null, from: "cell", to: "px" },
    { field: "v", kind: "vector", dims: 2, from: "cell", to: "px" },
  ]);
  assert.deepEqual(cmp("list<point2@a, 2>", "list<point2@b, 4>").tagged, [{ field: "[]", kind: "point", dims: 2, from: "a", to: "b" }]);
});

test("comparison: a producer's extra fields are dropped, and listed", () => {
  const r = cmp("Event<{ at: point2@a, kind: 'coin' | 'key', n: f64 }>", "Event<{ at: point2@b }>");
  assert.deepEqual(r.problems, []);
  assert.deepEqual(r.dropped, ["kind", "n"]);
  assert.deepEqual(cmp("{ p: { q: f64, r: bool } }", "{ p: { q: f64 } }").dropped, ["p.r"]);
});

test("comparison: each mismatch has its S code and names the field", () => {
  assert.deepEqual(codes("Event<{ at: point2@a }>", "point2@b"), ["S201"]);
  assert.deepEqual(codes("{ at: f64 }", "f64"), ["S201"]);
  assert.deepEqual(codes("f64", "bool"), ["S201"]);
  assert.deepEqual(codes("point2@a", "point3@b"), ["S201"]);
  assert.deepEqual(codes("point2@a", "f64@b"), ["S201"]);
  assert.deepEqual(codes("{ at: point2@a }", "{ pos: point2@b }"), ["S202"], "pos is missing; at is dropped");
  assert.deepEqual(codes("{ at: point2@a }", "{ at: point2@b, kind: str }"), ["S202"], "a field the input takes and the output lacks");
  assert.deepEqual(codes("{ at: f64 }", "{ at: bool }"), ["S202"]);
  assert.ok(cmp("{ at: point2@a }", "{ pos: point2@b }").problems[0].field.length > 0);
  assert.deepEqual(codes("'coin' | 'key'", "'coin'"), ["S203"]);
  assert.deepEqual(codes("str", "'coin'"), ["S203"]);
  assert.deepEqual(codes("'coin'", "str"), []);
  assert.deepEqual(codes("list<f64, 8>", "list<f64, 4>"), ["S204"]);
  assert.deepEqual(codes("f64", "f64@px"), ["S252"]);
  assert.deepEqual(codes("vec2@a", "vec2"), ["S252"]);
  assert.deepEqual(codes("point2@a", "vec2@b"), ["S255"]);
  assert.deepEqual(codes("vec2@a", "point2@b"), ["S255"]);
  assert.deepEqual(codes("vec2", "point2@b"), ["S255"]);
});

// Rates (ruled 2026-11-26): written only per second, over a frame, as a vector or a quantity. The kit's `s` is
// one unit every package shares, so a rate converts by its space's edge alone.
test("a rate per second parses, prints and carries rate: true", () => {
  assert.deepEqual(ok("vec2@px/s"), { kind: "vector", dims: 2, frame: "px", rate: true });
  assert.deepEqual(ok("f64@cell/s"), { kind: "quantity", frame: "cell", rate: true });
  assert.equal(printSeam(ok("vec3@m / s")), "vec3@m/s");
  assert.equal(printSeam(ok("Event<{ v: vec2@px/s }>")), "Event<{ v: vec2@px/s }>");
  assert.deepEqual(framesOf(ok("{ v: vec2@px/s, d: f64@s }")), ["px", "s"]);
});

test("a rate over anything but s, of a point, or untagged is refused with a reason", () => {
  for (const [bad, why] of /** @type {Array<[string, RegExp]>} */ ([["vec2@px/ms", /per second/], ["f64@cell/min", /per second/], ["point2@px/s", /point/], ["vec2/s", /frame/], ["f64/s", /frame/], ["vec2@px/", /per second/], ["bool/s", /./]])) {
    const r = parseSeam(bad);
    assert.equal(r.ok, false, `'${bad}' should not parse`);
    assert.match(/** @type {any} */ (r).error, why, bad);
  }
});

test("a rate pairs with what its kind pairs with; the kit's s is a frame like any other in a seam", () => {
  assert.equal(pairLocal(ok("vec2@px/s"), v2), null);
  assert.equal(pairLocal(ok("f64@cell/s"), "f64"), null);
  assert.deepEqual(ok("f64@s"), { kind: "quantity", frame: "s" });
});

test("comparison: a rate meets only a rate; its tagged leaf says so", () => {
  assert.deepEqual(cmp("vec2@a/s", "vec2@b/s").tagged, [{ field: "", kind: "vector", dims: 2, from: "a", to: "b", rate: true }]);
  assert.deepEqual(cmp("{ r: f64@a/s }", "{ r: f64@b/s }").tagged, [{ field: "r", kind: "quantity", dims: null, from: "a", to: "b", rate: true }]);
  assert.deepEqual(codes("vec2@a/s", "vec2@b"), ["S201"]);
  assert.deepEqual(codes("{ r: f64@a }", "{ r: f64@b/s }"), ["S202"]);
  assert.match(cmp("vec2@a", "vec2@b/s").problems[0].message, /per second/);
});
