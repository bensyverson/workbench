import { test } from "node:test";
import assert from "node:assert/strict";
import { compare, rgbOf } from "../compare.js";

const shape = { width: 3, height: 2, labels: ["a", "b"] };
const zeros = () => [new Float32Array(18), new Float32Array(18)];

test("identical buffers are exact, with a zero worst difference", () => {
  const r = compare(zeros(), zeros(), shape, 0);
  assert.equal(r.exact, true);
  assert.equal(r.worst.diff, 0);
  assert.equal(r.over, 0);
});

test("the worst difference names its set, pixel, channel and both values", () => {
  const a = zeros(), b = zeros();
  b[1][(1 * 3 + 2) * 3 + 1] = 0.25; // set b, column 2, row 1, green
  b[0][0] = 0.01;
  const r = compare(a, b, shape, 0);
  assert.equal(r.exact, false);
  assert.deepEqual({ set: r.worst.set, pixel: r.worst.pixel, channel: r.worst.channel, ref: r.worst.ref, got: r.worst.got, diff: r.worst.diff }, { set: 1, pixel: [2, 1], channel: 1, ref: 0, got: 0.25, diff: 0.25 });
  assert.equal(r.over, 2);
  assert.equal(r.sets[0].worst, Math.fround(0.01));
  assert.equal(r.sets[1].worst, 0.25);
});

test("a tolerance separates a small difference from a large one, and counts components over it", () => {
  const a = zeros(), b = zeros();
  b[0][3] = 1e-6;
  b[0][4] = 0.5;
  const r = compare(a, b, shape, 1e-5);
  assert.equal(r.over, 1);
  assert.equal(r.worst.diff, 0.5);
  assert.equal(compare(a, b, shape, 1).over, 0);
});

test("exact comparison tells -0 from 0, and a NaN is an infinite difference", () => {
  const a = zeros(), b = zeros();
  b[0][0] = -0;
  assert.equal(compare(a, b, shape, 0).exact, false);
  const c = zeros();
  c[0][5] = NaN;
  const r = compare(a, c, shape, 1e9);
  assert.equal(r.worst.diff, Infinity);
  assert.equal(r.over, 1);
});

test("rgbOf drops the alpha channel of a readback and checks it is 1", () => {
  const rgba = new Float32Array([1, 2, 3, 1, 4, 5, 6, 1]);
  assert.deepEqual([...rgbOf(rgba)], [1, 2, 3, 4, 5, 6]);
  assert.throws(() => rgbOf(new Float32Array([1, 2, 3, 0.5])), /alpha/);
});

test("buffers of the wrong size are refused", () => {
  assert.throws(() => compare([new Float32Array(3)], zeros(), shape, 0), /sets|size/);
});
