// The survey's classes, a short differential smoke run, and the CLI's exit codes.
// The full multi-seed run is in ../prerelease/diff.prerelease.js.
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadDmg } from "../../dmg-oracle/load.js";
import { classify, survey, tally } from "../survey.js";
import { CASES, runCase, builder } from "../differential.js";
import { main } from "../cli.js";

const dmg = loadDmg();

test("a rejection is helpers first, then not-yet only when every error is a lowering gap", () => {
  assert.equal(classify([], []), "lowered");
  assert.equal(classify([{ code: "S111", message: "closure" }], ["isBrick"]), "helpers");
  assert.equal(classify([{ code: "L012", message: "for…of is not lowered yet." }, { code: "L002", message: "the world has no member 'bg'." }], []), "not-yet");
  assert.equal(classify([{ code: "L015", message: "reduce got 1 argument." }], []), "not-yet");
  assert.equal(classify([{ code: "L015", message: "w.toast got 3 arguments." }], []), "subset");
  assert.equal(classify([{ code: "L012", message: "x" }, { code: "L007", message: "loop" }], []), "subset");
});

test("the survey covers every preset and lambda; these are the M1 report's figures", () => {
  const rows = survey(dmg);
  const t = tally(rows, dmg.presets.map((p) => p.id));
  assert.equal(t.length, 22);
  assert.equal(t.find((r) => r.preset === "02")?.total, 0, "preset 02 has no runtime lambdas");
  assert.equal(rows.length, 126);
  const n = (/** @type {string} */ s) => rows.filter((r) => r.status === s).length;
  assert.deepEqual({ lowered: n("lowered"), helpers: n("helpers"), subset: n("subset"), notYet: n("not-yet") }, { lowered: 105, helpers: 11, subset: 1, notYet: 9 });
  assert.equal(rows.filter((r) => r.topLevelRefs.length > 0).length, 11, "the inventory's topLevelRefs count");
  for (const id of ["04", "05", "06", "07"]) assert.ok(rows.filter((r) => r.preset === id).every((r) => r.status === "lowered"), id);
});

test("a short differential run of one case matches, and reports what it swapped", () => {
  const c = /** @type {import("../differential.js").DiffCase} */ (CASES.find((x) => x.label === "04 sweep"));
  const r = runCase(dmg, c, { seed: 7, frames: 300 });
  assert.deepEqual(r.mismatches, []);
  assert.deepEqual(r.skipped, []);
  assert.equal(r.swapped.length, 4);
  assert.ok(r.coverage.rng >= 0);
});

test("an edit whose text is not in the preset is refused, not silently skipped", () => {
  assert.throws(() => builder(dmg, { label: "x", preset: "04", why: "", edit: ["no such text", "y"] }), /not in preset 04/);
});

test("the CLI prints a primer bare and refuses bad usage with exit 2", () => {
  const log = console.log, err = console.error;
  /** @type {string[]} */
  const out = [];
  console.log = (/** @type {string} */ s) => out.push(s);
  console.error = (/** @type {string} */ s) => out.push(s);
  try {
    assert.equal(main([]), 0);
    assert.match(out.join("\n"), /Start with/);
    assert.equal(main(["frobnicate"]), 2);
    assert.equal(main(["diff", "--frames", "zero"]), 2);
    assert.equal(main(["diff", "--case", "99"]), 2);
  } finally { console.log = log; console.error = err; }
});
