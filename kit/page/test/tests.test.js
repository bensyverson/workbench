// @ts-nocheck: the fixture Grammar is built at run time, so its builder chains are untyped.
// runTests (leaf ceE4ib; kit/package/README.md, "Tests"): each manifest test is built alone from its example, run on
// kit/run with its inputs as `in` records, its expectations read, and its record replayed. H006 an expectation not met,
// H007 an error the test did not expect (or a replay that diverged), H008 a test that could not run; K020 and K021 are
// refused before anything runs. A package with no tests is clean.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRun } from "../../run/index.js";
import { list } from "../../define/index.js";
import { tiny } from "../../run/test/helpers.js";
import { runTests } from "../index.js";

/** A part that counts its `hit` records, sums their `points` (default 1), and pushes `seen`; it throws on `boom`. @param {number} [max] */
function counter(max = 8) {
  return tiny("count", {
    state: { n: "f64", sum: "f64", log: list("f64", 100) },
    ports: {
      in: { hit: { seam: "Event<{ points: f64 = 1 }>", note: "a hit" }, boom: { seam: "Event<{ x: f64 = 0 }>", note: "makes the step throw" }, pad: { seam: "Event<{ up: bool, down: bool, left: bool, right: bool }>", note: "the pad" }, slot: { seam: "f64", default: 0, note: "a value" } },
      out: { seen: { seam: "Event<{ n: f64 }>", note: "seen" }, total: { seam: "f64", from: "sum", note: "the total" } },
    },
  }, {
    clock: () => ({ tick: 1 / 4 }), init: () => ({ n: 0, sum: 0, log: [] }), events: { in: { hit: max, boom: 4, pad: 4 }, out: { seen: 4 } },
    step: (s, c) => {
      if (c.inputs.boom.length) throw new Error("boom");
      c.inputs.hit.forEach((r, i) => c.events.seen.push({ n: s.n + 1 + i }));
      return { n: s.n + c.inputs.hit.length, sum: s.sum + c.inputs.hit.reduce((a, r) => a + r.points, 0), log: [...s.log, ...c.inputs.pad.map(() => c.T)] };
    },
  });
}

/** The package as loadPackage gives it, with these tests; its one example builds the part. @param {any[]} tests @param {any} [W] */
function pkg(tests, W = counter()) {
  const examples = ["examples/01.js", "examples/bad.js"];
  const loaded = { name: "count", content: "c1", dialect: W.grammar.dialect, grammar: W.grammar, ui: null, runtime: W.runtime, examples, refusals: [], tests, foreign: [], data: {}, diagnostics: [] };
  const modules = { "examples/01.js": { default: () => W.grammar("hero") }, "examples/bad.js": { default: () => { throw new Error("no program"); } } };
  /** @type {string[]} */
  const imported = [];
  return { loaded, imported, options: { importModule: async (p) => { imported.push(p); return modules[p]; } } };
}
const T = (over = {}) => ({ name: "hits-score", example: "examples/01.js", inputs: [{ T: 1, in: "hit", value: {} }, { T: 2, in: "hit", value: { points: 4 } }], expect: [{ at: 1.5, state: { sum: 1 } }, { at: 3, state: { sum: 5, n: 2 } }], ...over });
const run = (tests, W) => { const p = pkg(tests, W); return runTests(p.loaded, p.options); };
const codes = (r) => r.diagnostics.map((d) => d.code);

test("a package whose tests pass is clean: one result per test, in order, with its log and the T it reached", async () => {
  const r = await run([T(), T({ name: "second", expect: [{ at: 3, output: "total", value: 5 }] })]);
  assert.deepEqual(r.diagnostics, []);
  assert.deepEqual(r.results.map((x) => [x.name, x.ok, x.diagnostics.length]), [["hits-score", true, 0], ["second", true, 0]]);
  assert.equal(r.results[0].T, 3);
  assert.deepEqual(r.results[0].log.inputs.map((i) => [i.kind, i.part, i.name, i.T]), [["in", "hero", "hit", "1"], ["in", "hero", "hit", "2"]]);
});

test("a package with no tests is clean, and nothing is imported", async () => {
  const p = pkg([]);
  assert.deepEqual(await runTests(p.loaded, p.options), { results: [], diagnostics: [] });
  assert.deepEqual(p.imported, []);
});

test("a failed state expectation is H006 naming the test, the instant, the path, and expected against actual", async () => {
  const r = await run([T({ expect: [{ at: 1.5, state: { sum: 2, n: 1 } }] })]);
  assert.deepEqual(codes(r), ["H006"]);
  const d = r.diagnostics[0];
  assert.equal(d.test, "hits-score");
  assert.match(d.message, /hits-score/);
  assert.match(d.message, /state/);
  assert.match(d.message, /1\.5/);
  assert.match(d.message, /sum.*expected 2.*got 1/);
  assert.equal(d.at, 1.5);
  assert.equal(r.results[0].ok, false);
  assert.deepEqual(r.results[0].diagnostics, r.diagnostics);
});

test("`within` lets a number differ; without it the comparison is exact", async () => {
  assert.deepEqual(codes(await run([T({ expect: [{ at: 1.5, state: { sum: 1.05 }, within: 0.1 }] })])), []);
  assert.deepEqual(codes(await run([T({ expect: [{ at: 1.5, state: { sum: 1.05 } }] })])), ["H006"]);
});

test("an output expectation reads the value a wire would read, and fails with expected and actual", async () => {
  assert.deepEqual(codes(await run([T({ expect: [{ at: 3, output: "total", value: 5 }] })])), []);
  const r = await run([T({ expect: [{ at: 1.5, output: "total", value: 9 }] })]);
  assert.deepEqual(codes(r), ["H006"]);
  assert.match(r.diagnostics[0].message, /output.*total.*expected 9.*got 1/);
});

test("an events expectation compares the records pushed in its window, in order, and counts them", async () => {
  const ok = [{ events: "seen", records: [{ n: 1 }, { n: 2 }] }, { events: "seen", from: 1, to: 1, records: [{ n: 1 }] }, { events: "seen", from: 2, count: 1 }, { events: "seen", from: 0, to: 0.5, count: 0 }];
  assert.deepEqual(codes(await run([T({ expect: ok })])), []);
  const wrong = await run([T({ expect: [{ events: "seen", records: [{ n: 1 }, { n: 7 }] }] })]);
  assert.deepEqual(codes(wrong), ["H006"]);
  assert.match(wrong.diagnostics[0].message, /seen/);
  assert.match(wrong.diagnostics[0].message, /record 1.*"n":2.*expected.*"n":7/);
  const count = await run([T({ expect: [{ events: "seen", count: 5 }] })]);
  assert.match(count.diagnostics[0].message, /2 records.*expected 5/);
  const short = await run([T({ expect: [{ events: "seen", records: [{ n: 1 }] }] })]);
  assert.match(short.diagnostics[0].message, /2 records.*expected 1/);
});

test("a diagnostic expectation passes when the run reported the code (at its instant), and is H006 naming what it did report", async () => {
  const boom = { name: "boom-stops", example: "examples/01.js", inputs: [{ T: 1, in: "boom", value: {} }], expect: [{ diagnostic: "N004" }] };
  assert.deepEqual(codes(await run([boom])), []);
  assert.deepEqual(codes(await run([{ ...boom, expect: [{ diagnostic: "N004", at: 1 }] }])), []);
  const late = await run([{ ...boom, expect: [{ diagnostic: "N004", at: 3 }] }]);
  assert.deepEqual(codes(late), ["H006"]);
  assert.match(late.diagnostics[0].message, /N004/);
  const none = await run([T({ expect: [{ diagnostic: "N002" }] })]);
  assert.match(none.diagnostics[0].message, /expected N002.*reported nothing/);
});

test("an error diagnostic the test did not expect is H007, with its part, T and message; an expected one is not", async () => {
  const r = await run([{ name: "boom-unexpected", example: "examples/01.js", inputs: [{ T: 1, in: "boom", value: {} }], expect: [{ at: 0.5, state: { n: 0 } }] }]);
  assert.deepEqual(codes(r), ["H007"]);
  assert.match(r.diagnostics[0].message, /N004.*hero.*boom/);
  assert.equal(r.diagnostics[0].test, "boom-unexpected");
});

test("a warning (N001) never fails a test, and is listed with the result", async () => {
  const r = await run([{ name: "dropped", example: "examples/01.js", inputs: [{ T: 1, in: "boom", value: {} }, { T: 1.5, in: "hit", value: {} }], expect: [{ diagnostic: "N004" }] }]);
  assert.deepEqual(r.diagnostics, []);
  assert.deepEqual(r.results[0].warnings.map((w) => w.code), ["N001"]);
});

test("a step past the input's max is the part's N002, an H007 unless the test expects it", async () => {
  const many = { name: "flood", example: "examples/01.js", inputs: [1, 2, 3].map(() => ({ T: 1, in: "hit", value: {} })), expect: [{ at: 2, state: { n: 0 } }] };
  assert.deepEqual(codes(await run([many], counter(2))).slice(0, 1), ["H007"]);
  assert.deepEqual(codes(await run([{ ...many, expect: [{ at: 2, state: { n: 0 } }, { diagnostic: "N002" }] }], counter(2))), []);
});

test("a test naming a missing input, output, state path or example is refused before anything runs: K020, never skipped", async () => {
  const p = pkg([T({ inputs: [{ T: 1, in: "nothing", value: {} }] }), T({ name: "fine" })]);
  const r = await runTests(p.loaded, p.options);
  assert.deepEqual(codes(r), ["K020"]);
  assert.deepEqual(r.results, [], "no test ran, not even the good one");
  assert.deepEqual(p.imported, []);
  assert.deepEqual(codes(await run([T({ expect: [{ at: 1, state: { nope: 1 } }] })])), ["K020"]);
  assert.deepEqual(codes(await run([T({ inputs: [{ T: 1, in: "hit", value: { points: "x" } }] })])), ["K021"]);
});

test("a test that could not run is H008: its example does not build alone, or does not import", async () => {
  const bad = await run([T({ example: "examples/bad.js" })]);
  assert.deepEqual(codes(bad), ["H008"]);
  assert.match(bad.diagnostics[0].message, /hits-score.*examples\/bad\.js/);
  const p = pkg([T()]);
  const r = await runTests(p.loaded, { importModule: async () => { throw new Error("cannot import"); } });
  assert.deepEqual(codes(r), ["H008"]);
  assert.match(r.diagnostics[0].message, /cannot import/);
});

test("the example runs alone: an input a page control would take is not wired, so a test's `in` reaches it", async () => {
  const r = await run([{ name: "pad-held", example: "examples/01.js", inputs: [{ T: 0.5, in: "pad", value: { up: false, down: false, left: false, right: true } }], expect: [{ at: 1, state: { "log.length": 1 } }] }]);
  assert.deepEqual(r.diagnostics, []);
});

test("a test's run is deterministic: the same log gives the same result, and its record replays", async () => {
  const a = await run([T()]), b = await run([T()]);
  assert.deepEqual(a.results[0].log, b.results[0].log);
  assert.equal(a.results[0].T, b.results[0].T);
});

test("a test's `seed` and `until` are the run's: it runs to the largest of until, every input and every expectation", async () => {
  const r = await run([T({ until: 10, expect: [{ at: 1.5, state: { sum: 1 } }] })]);
  assert.equal(r.results[0].T, 10);
  const q = await run([T({ expect: [{ at: 7, state: { sum: 5 } }] })]);
  assert.equal(q.results[0].T, 7);
  assert.equal((await run([T({ seed: 9 })])).results[0].log.header.seed, 9);
});

test("a state path past a list's end reads null", async () => {
  assert.deepEqual(codes(await run([T({ expect: [{ at: 3, state: { "log[3]": 5 } }] })])), ["H006"]);
});

test("the run is sliced: it yields between slices and reports progress, and an aborted signal returns the results so far", async () => {
  const p = pkg([T({ name: "one", until: 6 }), T({ name: "two", until: 6 })]);
  let yields = 0;
  const progress = [];
  const r = await runTests(p.loaded, { ...p.options, budgetMs: -1, yieldFn: async () => { yields++; }, onProgress: (f) => progress.push(f) });
  assert.deepEqual(r.diagnostics, []);
  assert.ok(yields > 10, `${yields}`);
  assert.equal(progress.at(-1), 1);
  assert.ok(progress.every((f, i) => i === 0 || f >= progress[i - 1]));
  const ac = new AbortController();
  const q = await runTests(p.loaded, { ...p.options, budgetMs: -1, yieldFn: async () => { ac.abort(); }, signal: ac.signal });
  assert.equal(q.cancelled, true);
  assert.ok(q.results.length < 2);
  const pre = new AbortController(); pre.abort();
  assert.deepEqual(await runTests(p.loaded, { ...p.options, signal: pre.signal }), { results: [], diagnostics: [], cancelled: true });
});

test("a run in slices gives the straight run's result: slicing changes nothing", async () => {
  const p = pkg([T({ until: 5 })]);
  const sliced = await runTests(p.loaded, { ...p.options, budgetMs: -1, yieldFn: async () => {} });
  const whole = await runTests(p.loaded, p.options);
  assert.deepEqual(sliced.results[0].log, whole.results[0].log);
  assert.deepEqual(sliced.diagnostics, whole.diagnostics);
});

test("buildOptions(path, module) is the example's module scope, as checkExamples takes it", async () => {
  const p = pkg([T()]);
  const asked = [];
  await runTests(p.loaded, { ...p.options, buildOptions: (path, mod) => { asked.push([path, typeof mod.default]); return {}; } });
  assert.deepEqual(asked, [["examples/01.js", "function"]]);
});
