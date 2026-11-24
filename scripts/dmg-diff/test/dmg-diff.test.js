// The survey's classes, a short differential smoke run, and the CLI's exit codes.
// The full multi-seed run is in ../prerelease/diff.prerelease.js.
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadDmg } from "../../dmg-oracle/load.js";
import { classify, survey, tally, hostMembers } from "../survey.js";
import { CASES, runCase, builder, emitGroup, failed, allPresetCases } from "../differential.js";
import { lowerPreset } from "../../dmg-lower/pipeline.js";
import { main, describeRun } from "../cli.js";
import { MUTANTS, mutantStatus } from "../sensitivity.js";

const dmg = loadDmg();

const host = new Set(["bg", "repeat", "toUpperCase"]);
const hostHas = (/** @type {string} */ n) => host.has(n);
/** @param {string} code @param {string} message @param {string} [text] */
const err = (code, message, text = "") => ({ code, message, text });

test("a rejection is helpers first, then not-yet only when every error is a lowering gap", () => {
  assert.equal(classify([], [], hostHas), "lowered");
  assert.equal(classify([err("S111", "closure")], ["isBrick"], hostHas), "helpers");
  assert.equal(classify([err("L012", "for…of is not lowered yet."), err("L002", "the world has no member 'bg'.", "bg")], [], hostHas), "not-yet");
  assert.equal(classify([err("L015", "reduce got 1 argument.")], [], hostHas), "not-yet");
  assert.equal(classify([err("L015", "w.toast got 3 arguments.")], [], hostHas), "subset");
  assert.equal(classify([err("L012", "x"), err("L007", "loop")], [], hostHas), "subset");
});

test("L015 is not-yet only for reduce: arity on filter, find, some and every is the program's", () => {
  for (const q of ["filter", "find", "some", "every"]) assert.equal(classify([err("L015", `${q} got 2 arguments.`)], [], hostHas), "subset", q);
});

test("L002 is not-yet only for a member the host has; a typo is the program's", () => {
  assert.equal(classify([err("L002", "\"@\" has no member 'repeat'.", "repeat")], [], hostHas), "not-yet");
  assert.equal(classify([err("L002", "the world has no member 'tll'.", "tll")], [], hostHas), "subset");
  assert.equal(classify([err("L002", "has no member 'bg'.", "bg"), err("L002", "no member 'tll'.", "tll")], [], hostHas), "subset");
});

test("the survey covers every preset and lambda; these are the M1 report's figures", () => {
  const rows = survey(dmg);
  const t = tally(rows, dmg.presets.map((p) => p.id));
  assert.equal(t.length, 22);
  assert.equal(t.find((r) => r.preset === "02")?.total, 0, "preset 02 has no runtime lambdas");
  assert.equal(rows.length, 126);
  const n = (/** @type {string} */ s) => rows.filter((r) => r.status === s).length;
  assert.deepEqual({ lowered: n("lowered"), helpers: n("helpers"), subset: n("subset"), notYet: n("not-yet") }, { lowered: 107, helpers: 9, subset: 3, notYet: 7 });
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

test("the host's members include the world's keys and the string and array methods", () => {
  const h = hostMembers(dmg);
  for (const n of ["bg", "oamStart", "grid", "board", "world", "repeat", "toUpperCase", "reduce"]) assert.ok(h(n), n);
  assert.ok(!h("tll"));
});

/** @param {string} label */
const caseOf = (label) => /** @type {import("../differential.js").DiffCase} */ (CASES.find((x) => x.label === label));

test("a transform that plants a fault in the emitted source is caught by runCase, for its slot and for all", () => {
  const m = MUTANTS[0];
  const transform = (/** @type {string} */ slot, /** @type {string} */ src) => (slot === m.slot ? src.replace(m.from, m.to) : src);
  const r = runCase(dmg, caseOf("04 sweep"), { seed: 7, frames: 300, transform });
  assert.deepEqual(r.mismatches.map((x) => x.slot).sort(), ["*", "timer(spawn)"]);
});

test("a run whose original stops on a runtime error is reported with its ticks and error, and fails", () => {
  const c = { label: "04 broken host call", preset: "04", why: "", edit: /** @type {[string, string]} */ (['if (w.param("sound")) w.sfx("pop");', 'if (w.param("sound")) w.nosuch("pop");']) };
  const r = runCase(dmg, c, { seed: 7, frames: 300 });
  assert.ok(r.ticks < 300, `ticks ${r.ticks}`);
  assert.match(String(r.error), /nosuch/);
  assert.deepEqual(r.mismatches, []);
  assert.ok(r.skipped.includes("timer(spawn)"));
  assert.equal(failed(r), true);
  assert.match(describeRun(r).join("\n"), /STOPPED.*after \d+ of 300.*nosuch/);
});

test("a full run reports its ticks, no error and a fingerprint that tells runs apart", () => {
  const a = runCase(dmg, caseOf("04 default"), { seed: 7, frames: 120 });
  const b = runCase(dmg, caseOf("04 default"), { seed: 11, frames: 120 });
  const s = runCase(dmg, caseOf("04 sweep"), { seed: 7, frames: 120 });
  const s2 = runCase(dmg, caseOf("04 sweep"), { seed: 11, frames: 120 });
  assert.equal(a.ticks, 120);
  assert.equal(a.error, null);
  assert.equal(failed(a), false);
  assert.notEqual(a.fingerprint, b.fingerprint);
  assert.equal(s.fingerprint, s2.fingerprint, "04 sweep reads neither the RNG nor input");
});

test("a slot group whose parts emit different code is refused, naming the slot", () => {
  const { entries } = lowerPreset({ build: builder(dmg, caseOf("04 default")) }, "04");
  const [a, b] = entries;
  assert.notEqual(a.slot.id, b.slot.id);
  assert.throws(() => emitGroup([a, b]), new RegExp(a.slot.id.replace(/[()]/g, "\\$&")));
  assert.equal(typeof emitGroup([a]), "function");
  assert.equal(typeof emitGroup([a, a]), "function");
});

test("--all-presets runs one default case per preset that has runtime lambdas", () => {
  const cases = allPresetCases(dmg);
  assert.equal(cases.length, 21, "preset 02 has none");
  assert.ok(cases.every((c) => c.label.endsWith(" default")));
  assert.ok(!cases.some((c) => c.preset === "02"));
});

/** @param {() => number} f @returns {{ code: number, out: string }} */
function capture(f) {
  const log = console.log, er = console.error;
  /** @type {string[]} */
  const out = [];
  console.log = (/** @type {string} */ s) => out.push(s);
  console.error = (/** @type {string} */ s) => out.push(s);
  try { return { code: f(), out: out.join("\n") }; } finally { console.log = log; console.error = er; }
}

test("the diff summary says how many runs are distinct", () => {
  const { code, out } = capture(() => main(["diff", "--case", "04 sweep", "--seeds", "7,11", "--frames", "60"]));
  assert.equal(code, 0);
  assert.match(out, /2 runs \(1 distinct\), 0 with a difference/);
});

test("mutants: a mutant marked equivalent that a run catches is a wrong claim; json and text agree on the exit code", () => {
  const m = MUTANTS[0];
  assert.equal(mutantStatus({ ...m, equivalent: undefined, cases: [{ label: "x", caught: [7] }] }).ok, true);
  const wrong = mutantStatus({ ...m, equivalent: "because", cases: [{ label: "x", caught: [7] }] });
  assert.equal(wrong.ok, false);
  assert.equal(wrong.text, "caught (marked equivalent: claim is wrong)");
  assert.equal(mutantStatus({ ...m, equivalent: "because", cases: [{ label: "x", caught: [] }] }).ok, true);
  assert.equal(mutantStatus({ ...m, equivalent: undefined, cases: [{ label: "x", caught: [] }] }).text, "MISSED");
});

test("mutants through main: exit 1 for a miss in both modes", () => {
  // 07's boundary mutants are caught only by some cases; one short frame count misses them.
  const text = capture(() => main(["mutants", "--seeds", "7", "--frames", "5"]));
  const json = capture(() => main(["mutants", "--seeds", "7", "--frames", "5", "--json"]));
  assert.equal(text.code, 1);
  assert.equal(json.code, text.code);
});

test("a lambda that calls a top-level helper is swapped with the helper in scope, and matches", () => {
  const r = runCase(dmg, { label: "14 default", preset: "14", why: "" }, { seed: 7, frames: 60 });
  assert.ok(r.swapped.includes("memory.onFrame#0"), "the helper's caller lowered");
  assert.deepEqual(r.mismatches, []);
});
