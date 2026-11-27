// @ts-nocheck: the fixture Grammar is built at run time, so its builder chains are untyped.
// runTests, review of 0639eb3 (leaf ow3c4e): an events window past the run's end, a state path the Program never
// declared, a rational stamp the run cannot take, and a replay that diverges.
import { test } from "node:test";
import assert from "node:assert/strict";
import { list, struct } from "../../define/index.js";
import { tiny } from "../../run/test/helpers.js";
import { runTests } from "../index.js";
import { endOf } from "../tests.js";

let initCalls = 0;
/** A counter with an extensible struct `own`; `flaky` makes init differ on each call, so a replay diverges. @param {boolean} [flaky] */
function counter(flaky = false) {
  return tiny("count", {
    state: { n: "f64", sum: "f64", own: struct({ a: "f64" }, { extensible: true }), log: list("f64", 100) },
    ports: { in: { hit: { seam: "Event<{ points: f64 = 1 }>", note: "a hit" } }, out: { seen: { seam: "Event<{ n: f64 }>", note: "seen" } } },
  }, {
    clock: () => ({ tick: 1 / 4 }), init: () => ({ n: flaky ? ++initCalls : 0, sum: 0, own: { a: 0 }, log: [] }), events: { in: { hit: 8 }, out: { seen: 4 } },
    // pushes one record on every step from 5 s on
    step: (s, c) => { if (c.T >= 5) c.events.seen.push({ n: s.n }); return { ...s, sum: s.sum + c.inputs.hit.length }; },
  });
}
function pkg(tests, W = counter()) {
  const loaded = { name: "count", content: "c1", dialect: W.grammar.dialect, grammar: W.grammar, ui: null, runtime: W.runtime, examples: ["e.js"], refusals: [], tests, foreign: [], data: {}, diagnostics: [] };
  return { loaded, options: { importModule: async () => ({ default: () => W.grammar("hero") }) } };
}
const run = (tests, W) => { const p = pkg(tests, W); return runTests(p.loaded, p.options); };
const codes = (r) => r.diagnostics.map((d) => d.code);
const base = { example: "e.js", inputs: [] };

test("an events window from 10 s runs the part to 10 s at least, and finds what it pushed", async () => {
  const t = { ...base, name: "quiet-late", inputs: [{ T: 2, in: "hit", value: {} }], expect: [{ events: "seen", from: 10, count: 0 }] };
  assert.ok(endOf(t) >= 10, `endOf is ${endOf(t)}`);
  assert.deepEqual(codes(await run([t])), ["H006"], "the part pushes from 5 s on");
});

test("an events window from 10 s that is truly quiet passes: the run reaches 10 s", async () => {
  const W = tiny("quiet", { state: { n: "f64" }, ports: { in: { hit: { seam: "Event<{ p: f64 = 1 }>" } }, out: { seen: { seam: "Event<{ n: f64 }>" } } } }, { clock: () => ({ tick: 1 / 4 }), init: () => ({ n: 0 }), events: { in: { hit: 8 }, out: { seen: 4 } }, step: (s) => s });
  const loaded = { name: "quiet", content: "c", dialect: W.grammar.dialect, runtime: W.runtime, tests: [{ ...base, name: "q", expect: [{ events: "seen", from: 10, count: 0 }] }], examples: ["e.js"], diagnostics: [] };
  const r = await runTests(loaded, { importModule: async () => ({ default: () => W.grammar("hero") }) });
  assert.deepEqual(r.diagnostics, []);
  assert.equal(r.results[0].T, 10);
});

test("an events window whose from is after its to is K002 (checked in kit/package), not a vacuous pass", async () => {
  const { testsShape } = await import("../../package/tests.js");
  const bad = testsShape([{ ...base, name: "backwards", expect: [{ events: "seen", from: 5, to: 2, count: 0 }] }], { entry: { runtime: "r.js" }, examples: ["e.js"] });
  assert.equal(bad.length, 1);
  assert.match(bad[0].message, /from.*to|to.*from/);
  const fine = testsShape([{ ...base, name: "forwards", expect: [{ events: "seen", from: 2, to: 5, count: 0 }, { events: "seen", from: 5, to: 5, count: 0 }] }], { entry: { runtime: "r.js" }, examples: ["e.js"] });
  assert.deepEqual(fine, []);
});

test("a state path the Program never declared in the extensible struct is H008, whatever is expected of it", async () => {
  for (const want of [null, 3]) {
    const r = await run([{ ...base, name: "typo", expect: [{ at: 1, state: { "own.tpyo": want } }] }]);
    assert.deepEqual(codes(r), ["H008"], `expected ${want}`);
    assert.match(r.diagnostics[0].message, /own\.tpyo/);
  }
});

test("a state path the Program did declare in the extensible struct still reads", async () => {
  const r = await run([{ ...base, name: "ok", expect: [{ at: 1, state: { "own.a": 0, sum: 0 } }] }]);
  assert.deepEqual(codes(r), []);
});

test("a rational stamp the run cannot take is not a test that runs and fails as H008: K002 refuses it", async () => {
  const { testsShape } = await import("../../package/tests.js");
  const m = { entry: { runtime: "r.js" }, examples: ["e.js"] };
  assert.equal(testsShape([{ ...base, name: "fine", expect: [{ at: "1/3000000", state: { n: 0 } }] }], m).length, 1);
  assert.deepEqual(testsShape([{ ...base, name: "fine", expect: [{ at: "1/3", state: { n: 0 } }, { at: "1/1000000", state: { n: 0 } }] }], m), []);
});

test("a replay that diverges from the run's own record is H007", async () => {
  initCalls = 0;
  const r = await run([{ ...base, name: "flaky", expect: [{ at: 1, state: { sum: 0 } }] }], counter(true));
  assert.deepEqual(codes(r), ["H007"], JSON.stringify(r.diagnostics));
  assert.match(r.diagnostics[0].message, /replay.*diverged/);
});
