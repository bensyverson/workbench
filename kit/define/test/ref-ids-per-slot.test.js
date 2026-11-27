// @ts-nocheck: builder chains are generated, which TypeScript cannot see.
// A Ref id's `#<n>` counts the calls of ONE slot (Ben, 2026-11-27, leaf IlUYzu): the k-th call of slot `op` is
// `<tag>.op#<k>` whatever other slots of the instance hold, in the lambda ids, in `run({ args })` and in `siteOf`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { run, siteOf } from "../index.js";
import { synth } from "../fixtures/controls-dialects.js";

const g = synth();

test("the first op after a param is s.op#0", () => {
  const fn = () => g("s").param("gain", { value: 1, min: 0, max: 2 }).op("a", { ratio: 2, level: 0.5 }).op("b", { ratio: 3, level: 1 });
  const record = run(fn).record;
  assert.equal(siteOf(record, "arg.s.op#0:1.ratio").value, 2);
  assert.equal(siteOf(record, "arg.s.op#1:1.ratio").value, 3);
  assert.equal(run(fn, { args: { "s.op#0:1.ratio": 5 } }).record.ops.a.ratio, 5);
  assert.throws(() => run(fn, { args: { "s.op#2:1.ratio": 5 } }), TypeError, "only two ops");
});

test("two slots interleaved each count their own calls", () => {
  const fn = () => g("s").op("a", { ratio: 2, level: 0.5 }).k(10).op("b", { ratio: 3, level: 1 }).k(20).k(30);
  const record = run(fn).record;
  assert.equal(siteOf(record, "arg.s.op#1:1.ratio").value, 3);
  assert.equal(siteOf(record, "arg.s.k#0:0").value, 10);
  assert.equal(siteOf(record, "arg.s.k#2:0").value, 30);
  assert.equal(siteOf(record, "arg.s.k#3:0"), null);
  assert.deepEqual(run(fn, { args: { "s.k#2:0": 31, "s.op#1:1.ratio": 4 } }).record.k, [10, 20, 31]);
});

test("an address built from a list index reaches the right call with an earlier slot holding calls", () => {
  const ratios = [2, 3, 4];
  const fn = () => {
    let s = g("s").param("gain", { value: 1, min: 0, max: 2 }).k(1).tag("t");
    for (const [i, r] of ratios.entries()) s = s.op(`o${i}`, { ratio: r, level: 0.5 });
    return s;
  };
  const record = run(fn).record;
  ratios.forEach((r, i) => assert.equal(siteOf(record, `arg.s.op#${i}:1.ratio`).value, r));
  const args = Object.fromEntries(ratios.map((_, i) => [`s.op#${i}:1.ratio`, 8 + i]));
  assert.deepEqual(Object.values(run(fn, { args }).record.ops).map((o) => o.ratio), [8, 9, 10]);
});
