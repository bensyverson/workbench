// Review of 04567fb (jobs L85Num, zRN8LA, wymAtE), from the reviewer's probes
// local/rev-04567fb-probes/params.probe.js. A param's declared value is held to its own declaration at the
// .param call (B004), as run() holds a host value; a read before the Program opens is refused for the Dialect
// the Program turns out to have; and a refusal the recording `$` throws is recorded on the run, so build-time
// code that catches it does not make the run succeed.
// @ts-nocheck: lambdas name the Dialect's free names, which TypeScript cannot see.
import { test } from "node:test";
import assert from "node:assert/strict";
import { run } from "../index.js";
import { program } from "../../dialects/data/grammar.js";
import { field } from "../../dialects/fields/grammar.js";

const SALES = { csv: "s.csv", columns: { region: "str", units: "f64" } };
const q = (decl) => ($) => program("q").source("sales", SALES).param("n", decl).table("t", "sales").limit($.n);
/** @param {any[]} ds */
const codes = (ds) => ds.map((d) => d.code);

for (const [label, decl, why] of [
  ["outside min..max", { value: 99, min: 1, max: 5 }, /1\.\.5/],
  ["not one of options", { value: 9, options: [1, 2] }, /one of 1, 2/],
  ["NaN", { value: NaN }, /finite/],
  ["a string not one of options", { value: "pie", options: ["bar", "line"] }, /"bar", "line"/],
]) {
  test(`a data param whose declared value is ${label} is B004 at the .param call, not folded`, () => {
    // a string param goes nowhere limit would refuse it for its type
    const r = run(typeof decl.value === "string" ? ($) => program("q").source("sales", SALES).param("n", decl).table("t", "sales").filter((row) => row.region === $.n) : q(decl));
    assert.equal(r.record, null);
    assert.deepEqual(codes(r.diagnostics), ["B004"], `folded: limit(${JSON.stringify(r.record?.table[0].calls.at(-1).args)})`);
    assert.match(r.diagnostics[0].message, /'n'/);
    assert.match(r.diagnostics[0].message, why);
    assert.equal(r.diagnostics[0].arg, 1);
    assert.match(r.diagnostics[0].file, /params-declared\.test\.js$/);
  });
}

test("a declared value inside its declaration still builds, and .check() finds the misfit without run()", () => {
  assert.deepEqual(run(q({ value: 3, min: 1, max: 5, options: [1, 3] })).diagnostics, []);
  assert.deepEqual(run(q({ value: 1, min: 1, max: 1 })).diagnostics, []);
  assert.deepEqual(codes(program("q").source("sales", SALES).param("n", { value: 0, min: 1 }).table("t", "sales").check()), ["B004"]);
});

test("run treats a declared value like the same host value: both are refused", () => {
  const decl = { value: 99, min: 1, max: 5 };
  assert.notDeepEqual(run(q(decl)).diagnostics, []);
  assert.throws(() => run(q(decl), { values: { n: 99 } }), TypeError);
});

test("fields keeps its own F001 for a value outside its range, without a second B004", () => {
  const r = run((u) => field("f").param("k", { value: 9, min: 0, max: 1 }).pixel((uv, u) => color(u.k, 0, 0)));
  assert.deepEqual(codes(r.diagnostics), ["F001"]);
});

test("a data Program reading $.t before it opens is B003, not fields' B014 about u.t", () => {
  void field; // fields' Grammar is defined, so its run-time-only members are known to the kit
  const r = run(($) => { const n = $.t; return program("q").source("sales", SALES).table("t", "sales").limit(n); });
  assert.deepEqual(codes(r.diagnostics), ["B003"], r.diagnostics[0]?.message);
  assert.doesNotMatch(r.diagnostics[0].message, /u\.t/);
  assert.match(r.diagnostics[0].file, /params-declared\.test\.js$/);
});

test("a fields Program reading u.t before it opens is still B014 about u.t, placed at the read", () => {
  const r = run((u) => { const t = u.t; return field("f").const("T0", String(t)).pixel((uv) => color(0, 0, 0)); });
  assert.deepEqual(codes(r.diagnostics), ["B014"]);
  assert.match(r.diagnostics[0].message, /u\.t/);
  assert.match(r.diagnostics[0].file, /params-declared\.test\.js$/);
});

test("a run-time-only name read where no Program ever opens is B003 worded for no Dialect", () => {
  const r = run(($) => { const t = $.t; throw new RangeError(`knock-on of ${t}`); });
  assert.deepEqual(codes(r.diagnostics), ["B003"]);
  assert.doesNotMatch(r.diagnostics[0].message, /u\.t/);
});

test("a B014 read caught by build-time code still fails the run", () => {
  const r = run((u) => { let T = 1; try { T = u.t; } catch { /* fall back */ } return field("f").const("T0", String(T)).pixel((uv) => color(0, 0, 0)); });
  assert.equal(r.record, null);
  assert.deepEqual(codes(r.diagnostics), ["B014"]);
});

test("a caught B015 and a caught B003 still fail the run, each reported once", () => {
  const base = ($) => program("q").source("sales", SALES).param("n", { value: 3 }).table("t", "sales");
  const b015 = run(($) => { const b = base($); let n = 2; try { n = Object.keys($).length; } catch { /* fall back */ } return b.limit(n); });
  assert.deepEqual(codes(b015.diagnostics), ["B015"]);
  const b003 = run(($) => { const b = base($); let n = 2; try { n = $.m; } catch { /* fall back */ } return b.limit(n); });
  assert.deepEqual(codes(b003.diagnostics), ["B003"]);
  const thrown = run(($) => base($).limit($.m));
  assert.deepEqual(codes(thrown.diagnostics), ["B003"], "a refusal not caught is reported once");
});
