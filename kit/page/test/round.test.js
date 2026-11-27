// @ts-nocheck
// roundNumber removes float noise and nothing else (leaf GLwTk5): a value a person typed survives, noise goes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { roundNumber } from "../round.js";
import { printNumber } from "../writeback.js";

test("float noise is removed", () => {
  assert.equal(roundNumber(29.400000000000006), 29.4);
  assert.equal(roundNumber(0.1 + 0.2), 0.3);
  assert.equal(roundNumber(1 / 3), 0.333333333333333);
  assert.equal(roundNumber(-0), 0);
  assert.ok(Object.is(roundNumber(-0), 0));
});

test("an exact value a person could type survives", () => {
  for (const v of [1234567890123456, 2 ** 53, 0.1, 29.4, 1e-300, 5e-324, 1e21, -1234567890123456]) assert.equal(roundNumber(v), v);
  assert.equal(printNumber(1234567890123456), "1234567890123456");
  assert.equal(printNumber(2 ** 53), "9007199254740992");
});

test("a finite number never becomes non-finite", () => {
  assert.equal(roundNumber(Number.MAX_VALUE), Number.MAX_VALUE);
  assert.equal(roundNumber(-Number.MAX_VALUE), -Number.MAX_VALUE);
  assert.ok(Number.isFinite(roundNumber(1.7976931348623155e308)));
  assert.notEqual(printNumber(Number.MAX_VALUE), "Infinity");
  assert.ok(Number.isNaN(roundNumber(NaN)));
  assert.equal(roundNumber(Infinity), Infinity);
});

test("a stepped value snaps from its minimum and stays inside its bounds (reviewer-80, snap.probe.js)", () => {
  assert.equal(roundNumber(2, 0.7, { min: 0, max: 2 }), 2, "the max of a range that is no multiple of the step");
  assert.equal(roundNumber(1, 0.4, { max: 1 }), 1, "a snap past the max is clamped");
  assert.equal(roundNumber(0.25, 0.5, { min: 0.1, max: 2 }), 0.1, "a grid that starts at the minimum");
  assert.equal(roundNumber(0.8, 0.5, { min: 0.1, max: 2 }), 0.6, "a grid that starts at the minimum");
  assert.equal(roundNumber(-3, 1, { min: -2 }), -2, "a snap below the min is clamped");
  assert.equal(roundNumber(1.3, 0.25), 1.25, "with no bounds, multiples of the step");
});

test("a stepped value never becomes non-finite", () => {
  assert.equal(roundNumber(1.7e308, 0.5), 1.7e308);
  assert.equal(roundNumber(5, Infinity), 5);
});
