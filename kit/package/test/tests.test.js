// The manifest's `tests` (leaf ceE4ib; README.md, "Tests"): its shape is checkManifest's (K002), what needs the loaded
// Dialect but no run is checkTests's (K020 names, K021 records), and a package with no tests is clean everywhere.
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkManifest, checkTests, readStatePath, sameData } from "../index.js";
import { defineDialect } from "../../define/index.js";
import { mazeDecl } from "../../define/fixtures/seams-dialects.js";

const H = "sha256-" + "A".repeat(43) + "=";
const TEST = () => ({ name: "pad-moves", example: "examples/01.js", inputs: [{ T: 0.5, in: "pad", value: { up: false, down: false, left: false, right: true } }], expect: [{ at: 1, state: { "player.x": 2 } }] });
/** @returns {Record<string, any>} */
const good = (tests = [TEST()]) => ({
  name: "tiles", version: "0.4.0", kit: "0.4",
  entry: { dialect: "tiles.dialect.js", grammar: "tiles.grammar.js", runtime: "tiles.runtime.js" },
  examples: ["examples/01.js", "examples/02.js"], refusals: [{ module: "refusals/r.js", code: "L004" }], tests,
  files: Object.fromEntries(["tiles.dialect.js", "tiles.grammar.js", "tiles.runtime.js", "examples/01.js", "examples/02.js", "refusals/r.js"].map((p) => [p, H])),
});
const check = (/** @type {any} */ m) => checkManifest(JSON.stringify(m));
const codes = (/** @type {any} */ m) => check(m).diagnostics.map((d) => d.code);
/** The manifest with the one test changed. @param {(t: any) => void} f */
const edited = (f) => { const t = TEST(); f(t); return good([t]); };
const says = (/** @type {any} */ m, /** @type {RegExp} */ re) => assert.ok(check(m).diagnostics.some((d) => d.code === "K002" && re.test(d.message)), check(m).diagnostics.map((d) => d.message).join("\n"));

test("a manifest with tests passes, and a manifest with none is clean (tests are optional)", () => {
  assert.deepEqual(check(good()).diagnostics, []);
  assert.deepEqual(check(good()).manifest?.tests, [TEST()]);
  const none = good(); delete none.tests;
  assert.deepEqual(check(none).diagnostics, []);
  assert.deepEqual(check(good([])).diagnostics, [], "an empty list is no tests");
});

test("tests must be an array of objects with exactly name, example, inputs, expect, until and seed", () => {
  says({ ...good(), tests: {} }, /"tests" must be an array/);
  says({ ...good(), tests: [3] }, /tests\[0\] must be an object/);
  says(edited((t) => { t.extra = 1; }), /unknown key "extra"/);
  for (const k of ["name", "example", "inputs", "expect"]) says(edited((t) => { delete t[k]; }), new RegExp(k));
});

test("a test's name is lowercase words and digits joined by hyphens, and unique", () => {
  for (const n of ["Pad", "1st", "a b", "a_b", "", 3]) says(edited((t) => { t.name = n; }), /name/);
  says(good([TEST(), TEST()]), /two tests are named "pad-moves"/);
});

test("a test's example is one of the manifest's examples: not a refusal, not another module", () => {
  says(edited((t) => { t.example = "refusals/r.js"; }), /example.*not one of/);
  says(edited((t) => { t.example = "lib/x.js"; }), /example.*not one of/);
  assert.deepEqual(codes(edited((t) => { t.example = "examples/02.js"; })), []);
});

test("a package with tests names a runtime: only a runtime runs", () => {
  const m = good(); delete m.entry.runtime; m.files = Object.fromEntries(Object.entries(m.files).filter(([p]) => p !== "tiles.runtime.js"));
  says(m, /runtime/);
  const none = good([]); delete none.entry.runtime;
  assert.deepEqual(codes(none), [], "no tests, no runtime needed");
});

test("an input is { T, in, value }: T a stamp, in a name, value an object, in log order", () => {
  says(edited((t) => { t.inputs = [{ T: 1, in: "pad" }]; }), /inputs\[0\].*value/);
  says(edited((t) => { t.inputs[0].extra = 1; }), /inputs\[0\].*unknown key "extra"/);
  says(edited((t) => { t.inputs[0].T = -1; }), /inputs\[0\]\.T/);
  says(edited((t) => { t.inputs[0].T = "soon"; }), /inputs\[0\]\.T/);
  says(edited((t) => { t.inputs[0].T = 1 / 3 + 1e-9; }), /inputs\[0\]\.T.*denominator/);
  says(edited((t) => { t.inputs[0].in = 3; }), /inputs\[0\]\.in/);
  for (const T of [0, 0.25, "1/3", 12]) assert.deepEqual(codes(edited((t) => { t.inputs[0].T = T; })), [], String(T));
  says(edited((t) => { t.inputs.push({ T: 0.25, in: "pad", value: {} }); }), /inputs\[1\].*before/);
  assert.deepEqual(codes(edited((t) => { t.inputs.push({ T: 0.5, in: "pad", value: {} }); })), [], "two at one stamp are in the order written");
});

test("expect has at least one entry, each of exactly one kind with that kind's keys", () => {
  says(edited((t) => { t.expect = []; }), /expect.*at least one/);
  says(edited((t) => { t.expect = [{ at: 1 }]; }), /expect\[0\].*no kind/);
  says(edited((t) => { t.expect = [{ at: 1, state: { a: 1 }, output: "x", value: 1 }]; }), /expect\[0\].*two kinds/);
  says(edited((t) => { t.expect = [{ at: 1, state: { a: 1 }, records: [] }]; }), /expect\[0\].*unknown key "records"/);
  says(edited((t) => { t.expect = [{ state: { a: 1 } }]; }), /expect\[0\]\.at/);
  says(edited((t) => { t.expect = [{ at: 1, state: {} }]; }), /expect\[0\]\.state/);
  says(edited((t) => { t.expect = [{ at: 1, output: "x" }]; }), /expect\[0\].*value/);
  says(edited((t) => { t.expect = [{ at: 1, output: "x", value: 1, within: -1 }]; }), /within/);
  says(edited((t) => { t.expect = [{ events: "e" }]; }), /records.*count/);
  says(edited((t) => { t.expect = [{ events: "e", records: [], count: 0 }]; }), /records.*count/);
  says(edited((t) => { t.expect = [{ events: "e", count: 1.5 }]; }), /count/);
  says(edited((t) => { t.expect = [{ events: "e", records: [3] }]; }), /records/);
  says(edited((t) => { t.expect = [{ events: "e", count: 0, from: "x" }]; }), /from/);
  says(edited((t) => { t.expect = [{ diagnostic: "n002" }]; }), /diagnostic/);
  for (const e of [{ at: 1, state: { a: 1 }, within: 0.5 }, { at: 1, output: "x", value: [1, 2] }, { events: "e", from: 1, to: 2, records: [{ n: 1 }] }, { events: "e", count: 0 }, { diagnostic: "N002" }, { diagnostic: "N002", at: 2 }]) {
    assert.deepEqual(codes(edited((t) => { t.expect = [e]; })), [], JSON.stringify(e));
  }
});

test("until is a stamp and seed a whole number", () => {
  says(edited((t) => { t.until = -1; }), /until/);
  says(edited((t) => { t.seed = 1.5; }), /seed/);
  assert.deepEqual(codes(edited((t) => { t.until = 5; t.seed = 3; })), []);
});

test("every K002 for a test names the test and has a fix", () => {
  const ds = check(edited((t) => { t.expect = []; })).diagnostics;
  assert.ok(ds.length && ds.every((d) => d.code === "K002" && d.fix && /pad-moves/.test(d.message)));
});

// ---- checkTests: names and records against the loaded Dialect

const decl = () => {
  const d = mazeDecl();
  d.ports.in = {
    pad: { seam: "Event<{ up: bool, down: bool, left: bool, right: bool }>", note: "the pad" },
    nudge: { seam: "Event<{ by: f64 = 1, at: point2@cell }>", note: "a nudge" },
    slot: { seam: "f64", default: 0, note: "a value" },
  };
  d.inputs = { object: "In", name: "inp" }; d.objects.In = { label: "the inputs (inp)", members: {} }; d.globals.inp = "In";
  return d;
};
const dialect = defineDialect(/** @type {any} */ (decl()));
/** @param {any[]} tests */
const loaded = (tests) => ({ name: "maze", dialect, runtime: {}, tests, diagnostics: [] });
const T = (/** @type {Record<string, any>} */ over = {}) => ({ ...TEST(), ...over });
const PAD = { up: false, down: false, left: false, right: true };
const found = (/** @type {any} */ tests) => checkTests(loaded(tests));

test("checkTests: a test that fits the Dialect is clean, and a package with no tests is clean", () => {
  assert.deepEqual(found([T()]), []);
  assert.deepEqual(found([]), []);
  assert.deepEqual(checkTests({ name: "x", dialect: null, diagnostics: [{ code: "K006" }] }), [], "a package that did not load has nothing to check");
  assert.deepEqual(checkTests({ name: "maze", dialect, diagnostics: [] }), [], "no tests key at all");
});

test("K020: an `in` that is not an Event input of the Dialect: missing, a value input, an output", () => {
  for (const name of ["nothing", "slot", "picked", "player"]) {
    const ds = found([T({ inputs: [{ T: 1, in: name, value: {} }] })]);
    assert.deepEqual(ds.map((d) => d.code), ["K020"], name);
    assert.match(ds[0].message, /pad-moves/);
    assert.match(ds[0].message, new RegExp(`'${name}'`));
    assert.match(ds[0].message, /Event inputs: pad, nudge/);
    assert.ok(ds[0].fix);
  }
});

test("K020: an `events` that is not an Event output, an `output` that is not a value output", () => {
  assert.deepEqual(found([T({ expect: [{ events: "picked", count: 0 }] })]), []);
  assert.deepEqual(found([T({ expect: [{ at: 1, output: "player", value: [1, 1] }] })]), []);
  for (const e of [{ events: "nothing", count: 0 }, { events: "player", count: 0 }, { at: 1, output: "picked", value: [] }, { at: 1, output: "nothing", value: 1 }, { at: 1, output: "pad", value: 1 }]) {
    const ds = found([T({ expect: [e] })]);
    assert.deepEqual(ds.map((d) => d.code), ["K020"], JSON.stringify(e));
  }
  assert.match(found([T({ expect: [{ events: "player", count: 0 }] })])[0].message, /Event outputs: picked/);
  assert.match(found([T({ expect: [{ at: 1, output: "picked", value: [] }] })])[0].message, /value outputs: player, home, score/);
});

test("K020: a state path names fields the Dialect's state has, as checkState names them", () => {
  for (const path of ["score", "player.x", "player", "home.x", "home", "home.y", "grid.length", "grid[0]", "t"]) assert.deepEqual(found([T({ expect: [{ at: 1, state: { [path]: 1 } }] })]), [], path);
  for (const path of ["nothing", "player.z", "score.x", "grid.size", "grid[x]", "home.q", "player.x.y"]) {
    const ds = found([T({ expect: [{ at: 1, state: { [path]: 1 } }] })]);
    assert.deepEqual(ds.map((d) => d.code), ["K020"], path);
    assert.match(ds[0].message, new RegExp(path.replace(/[.[\]]/g, "\\$&")));
  }
});

test("K021: a record that does not fit its input's seam: missing, unknown, mistyped, mis-sized", () => {
  const rec = (/** @type {any} */ value, name = "pad") => found([T({ inputs: [{ T: 1, in: name, value }] })]);
  assert.deepEqual(rec(PAD), []);
  assert.deepEqual(rec({ at: [1, 2] }, "nudge"), [], "a defaulted field may be left out");
  assert.deepEqual(rec({ at: [1, 2], by: 3 }, "nudge"), []);
  for (const [value, name, re] of /** @type {Array<[any, string, RegExp]>} */ ([[{ up: true }, "pad", /'down' is missing/], [{ ...PAD, a: true }, "pad", /'a' is not a field/], [{ ...PAD, up: 1 }, "pad", /'up'/], [{}, "nudge", /'at' is missing/], [{ at: [1] }, "nudge", /'at'.*point2/], [null, "pad", /record/]])) {
    const ds = rec(value, name);
    assert.deepEqual(ds.map((d) => d.code), ["K021"], JSON.stringify(value));
    assert.match(ds[0].message, re);
    assert.match(ds[0].message, /pad-moves/);
  }
});

test("checkTests reports every problem of every test, each naming its test, and carries file and test on the diagnostic", () => {
  const ds = found([T({ name: "one", inputs: [{ T: 1, in: "nothing", value: {} }] }), T({ name: "two", inputs: [{ T: 1, in: "pad", value: {} }], expect: [{ events: "nope", count: 0 }] })]);
  assert.deepEqual(ds.map((d) => [d.code, d.test]), [["K020", "one"], ["K021", "two"], ["K020", "two"]]);
  assert.ok(ds.every((d) => d.file === "wb-package.json"));
});

test("readStatePath and sameData: a path's value, and exact JSON-data equality with a tolerance", () => {
  const s = { a: { b: [10, 20, 30] }, v: [1, 2, 3], n: null, o: { x: 1 } };
  assert.equal(readStatePath(s, "a.b[1]"), 20);
  assert.equal(readStatePath(s, "a.b.length"), 3);
  assert.equal(readStatePath(s, "v.y"), 2);
  assert.equal(readStatePath(s, "v"), s.v);
  assert.equal(readStatePath(s, "a.b[9]"), null, "past the end reads null");
  assert.equal(readStatePath(s, "n.x"), null);
  assert.equal(readStatePath(s, "o.z"), null);
  assert.equal(sameData({ a: [1, 2] }, { a: [1, 2] }, 0), true);
  assert.equal(sameData({ a: 1 }, { a: 1, b: 2 }, 0), false, "exactly its fields");
  assert.equal(sameData(1, 1.05, 0.1), true);
  assert.equal(sameData(1, 1.2, 0.1), false);
  assert.equal(sameData([1], { 0: 1 }, 0), false);
  assert.equal(sameData(null, null, 0), true);
});
