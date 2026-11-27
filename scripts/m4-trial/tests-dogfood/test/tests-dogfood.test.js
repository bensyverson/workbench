// The tests dogfood's tools (leaf mxxKTa): the draft tests entry's static checks (shape as K002, names as K020, records
// as K021) and the simulated runner (H006–H008), on the M4 trial's recorded packages and the draft's own tests for them
// (kit/package/README.md, "The M4 authors' tests, in this form").

import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { checkTests } from "../tests-check.js";
import { runPackageTests } from "../sim.js";

const RUNS = fileURLToPath(new URL("../../runs/2026-11-26/", import.meta.url));
const SCORE = `${RUNS}score/scoretimer`;
const GAME = `${RUNS}game-run1/gemgrid`;

const scoreTests = [
  { name: "event-scores", example: "examples/sprint.js", inputs: [{ T: 1, in: "scored", value: {} }, { T: 2, in: "scored", value: { points: 2 } }], expect: [{ at: 1.5, state: { score: 10 } }, { at: 2.5, state: { score: 30, over: false } }] },
  { name: "end-freezes-score", example: "examples/sprint.js", inputs: [{ T: 29.5, in: "scored", value: {} }, { T: 30, in: "scored", value: {} }, { T: 31, in: "scored", value: { points: 5 } }], expect: [{ at: 30, state: { score: 10, over: true, left: 0 } }, { at: 32, state: { score: 10, over: true } }] },
];
const R = { up: false, down: false, left: false, right: true }, N = { up: false, down: false, left: false, right: false };
const padTest = { name: "pad-moves-player", example: "examples/garden.js", inputs: [{ T: 0.5, in: "pad", value: R }, { T: 0.6, in: "pad", value: N }], expect: [{ at: 0.4, state: { player: [1, 1] } }, { at: 1, state: { player: [2, 1], collected: 0, "held.right": false } }, { events: "picked", count: 0 }] };

/** @param {any[]} ds */
const codes = (ds) => ds.map((d) => d.code).sort();

test("the draft's own M4 tests are well formed against the recorded packages", async () => {
  assert.deepEqual(codes(await checkTests(SCORE, scoreTests)), []);
  assert.deepEqual(codes(await checkTests(GAME, [padTest])), []);
});

test("shape problems are K002: no name, a duplicate, stamps out of order, an expectation with no kind, no expectation", async () => {
  const bad = [
    { example: "examples/sprint.js", inputs: [], expect: [{ at: 1, state: { score: 0 } }] },
    { ...scoreTests[0], name: "event-scores" },
    { ...scoreTests[0], name: "late", inputs: [{ T: 2, in: "scored", value: {} }, { T: 1, in: "scored", value: {} }] },
    { ...scoreTests[0], name: "kindless", expect: [{ at: 1 }] },
    { ...scoreTests[0], name: "empty", expect: [] },
    { ...scoreTests[0], name: "elsewhere", example: "examples/none.js" },
  ];
  assert.deepEqual(codes(await checkTests(SCORE, [scoreTests[0], ...bad])), ["K002", "K002", "K002", "K002", "K002", "K002"]);
  assert.deepEqual(codes(await checkTests(SCORE, scoreTests)), []);
});

test("names the Dialect lacks are K020, records that do not fit their input's seam K021", async () => {
  const t = (/** @type {any} */ o) => ({ ...scoreTests[0], ...o });
  const ds = await checkTests(SCORE, [
    t({ name: "no-input", inputs: [{ T: 1, in: "goal", value: {} }] }),
    t({ name: "no-output", expect: [{ events: "view", count: 0 }] }),
    t({ name: "no-path", expect: [{ at: 1, state: { points: 1 } }] }),
    t({ name: "bad-field", inputs: [{ T: 1, in: "scored", value: { points: "two" } }] }),
    t({ name: "extra-field", inputs: [{ T: 1, in: "scored", value: { pts: 2 } }] }),
  ]);
  assert.deepEqual(codes(ds), ["K020", "K020", "K020", "K021", "K021"]);
  const pad = await checkTests(GAME, [{ ...padTest, inputs: [{ T: 0.5, in: "pad", value: { right: true } }] }]);
  assert.deepEqual(codes(pad), ["K021"]);
});

test("the simulated runner passes the score's draft tests and reports a wrong expectation as H006", async () => {
  const ok = await runPackageTests(SCORE, scoreTests);
  assert.deepEqual(ok.results.map((r) => [r.name, r.ok]), [["event-scores", true], ["end-freezes-score", true]], JSON.stringify(ok.diagnostics));
  const wrong = await runPackageTests(SCORE, [{ ...scoreTests[0], expect: [{ at: 1.5, state: { score: 99 } }] }]);
  assert.deepEqual(codes(wrong.diagnostics), ["H006"]);
  assert.match(wrong.diagnostics[0].message, /event-scores.*1\.5.*score.*99.*10/s);
});

test("the recorded dogfood hand-ins' own tests are well formed and pass in the simulator", async () => {
  for (const leg of ["score-1/tally", "score-2/tally", "game-3/gemmaze"]) {
    const dir = fileURLToPath(new URL(`../../runs/2026-11-27-tests/${leg}`, import.meta.url));
    assert.deepEqual(await checkTests(dir), [], leg);
    const r = await runPackageTests(dir);
    assert.ok(r.results.length >= 3 && r.results.every((x) => x.ok), `${leg}: ${JSON.stringify(r.diagnostics)}`);
  }
});

test("the simulated runner delivers a pad record to the game and reads its Event output", async () => {
  const r = await runPackageTests(GAME, [padTest]);
  assert.deepEqual(r.diagnostics, []);
  const miss = await runPackageTests(GAME, [{ ...padTest, expect: [{ events: "picked", count: 1 }] }]);
  assert.deepEqual(codes(miss.diagnostics), ["H006"]);
});
