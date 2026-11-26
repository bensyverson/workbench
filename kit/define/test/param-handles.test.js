// A part's param handles, `<part>.param.<name>`: the target of a wire into a param (the seams draft's rulings,
// 2026-11-26, leaf x3iG6D). Where the Grammar's param slot is itself named `param`, the slot method still declares a
// param when called, and answers the declared params' handles as properties.
import { test } from "node:test";
import assert from "node:assert/strict";
import { isHandle } from "../index.js";
import { paramSeam } from "../handles.js";
import { programOf } from "../grammar.js";
import { maze, particles, GRID } from "../fixtures/seams-dialects.js";

const steer = "(pl, pad) => { pl.dx = pad.left ? -1 : 0; }";

test("<part>.param.<name> is a handle of a declared param, with the seam its declaration's value gives", () => {
  const level = /** @type {any} */ (maze()("level").param("depth", { value: 0 }).grid(GRID).control(steer));
  const h = level.param.depth;
  assert.ok(isHandle(h));
  assert.deepEqual([h.part, h.side, h.name, h.known, h.seam], ["level", "param", "depth", true, "f64"]);
  assert.equal(h.program, programOf(level));
  assert.equal(level.param.dpeth.known, false, "a name the part does not declare is a handle compose reports (S111)");
  assert.equal(level.param.depth, h, "one handle per param");
});

test("a Grammar whose param slot is named param still declares params with it", () => {
  const level = /** @type {any} */ (maze()("level"));
  const chained = level.param("depth", { value: 2 }).grid(GRID).control(steer);
  assert.equal(chained.build().params.depth.value, 2);
  assert.equal(chained.param.depth.known, true);
});

test("an undeclared name on a param side that is the slot method is a known: false handle, never the function's own property", () => {
  const level = /** @type {any} */ (maze()("level").param("depth", { value: 0 }).grid(GRID).control(steer));
  for (const n of ["call", "bind", "apply", "length", "name", "toString"]) {
    const h = level.param[n];
    assert.ok(isHandle(h), `${n} is a handle`);
    assert.deepEqual([h.side, h.name, h.known], ["param", n, false]);
  }
  // the method still declares a param when called
  assert.equal(level.param("speed", { value: 1 }).param.speed.known, true);
});

test("a part whose Grammar declares no params has a param side that knows none", () => {
  const fx = /** @type {any} */ (particles()("fx").bounds({ width: 9, height: 9 }));
  assert.equal(fx.param.rate.known, false);
  assert.equal(fx.param.rate.side, "param");
});

test("paramSeam: a number is f64, a boolean bool, a string str, a string with options an enum; anything else none", () => {
  assert.equal(paramSeam({ value: 3, min: 0, max: 9 }), "f64");
  assert.equal(paramSeam({ value: true }), "bool");
  assert.equal(paramSeam({ value: "a" }), "str");
  assert.equal(paramSeam({ value: "a", options: ["a", "b"] }), "'a' | 'b'");
  assert.equal(paramSeam({ value: "2026-01-01", kind: "date" }), null);
  assert.equal(paramSeam(7), null);
});
