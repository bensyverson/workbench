// Review of c7ed99f (job tIbqDV), findings L1, L2 and L5, from the reviewer's probes
// local/rev-bind-probes/{params,values,ex05}.probe.js. The recording $ is read by name only: `in`, spread,
// Object.keys and JSON.stringify are refused (B015), not answered with nothing; a param named like a runtime
// probe is refused where it is declared; the host's values are checked at run() whether or not build-time code
// reads them, and the record's param declarations carry them; bindingText says where a read was, not who used it.
// @ts-nocheck: lambdas name the Dialect's free names, which TypeScript cannot see.
import { test } from "node:test";
import assert from "node:assert/strict";
import { run, bindingText } from "../index.js";
import { PROBES } from "../validate-grammar.js";
import { program } from "../../dialects/data/grammar.js";
import { field } from "../../dialects/fields/grammar.js";

const SALES = { csv: "s.csv", columns: { region: "str", units: "f64" } };
const base = ($) => program("q").source("sales", SALES).param("topN", { value: 10, min: 1, max: 50 }).param("year", { value: 2020 }).param("kind", { value: "bar", options: ["bar", "line"] }).table("t", "sales");
/** @param {any[]} ds */
const codes = (ds) => ds.map((d) => d.code);

// L1: the recording $ is read by name only

test("`in` on $ is B015 with the fix to read the param by name; reading by name still works", () => {
  const r = run(($) => base($).limit("topN" in $ ? $.topN : 7));
  assert.equal(r.record, null);
  assert.deepEqual(codes(r.diagnostics), ["B015"]);
  assert.equal(r.diagnostics[0].fix, "$.topN");
  assert.match(r.diagnostics[0].tip, /by name/);
  assert.deepEqual(run(($) => base($).limit($.topN)).diagnostics, []);
});

test("spread, Object.keys, Object.entries, JSON.stringify and a rest pattern on $ are each B015", () => {
  const forms = {
    spread: ($) => ({ ...$ }),
    keys: ($) => Object.keys($),
    entries: ($) => Object.entries($),
    json: ($) => JSON.stringify($),
    descriptor: ($) => Object.getOwnPropertyDescriptor($, "topN"),
    rest: ($) => { const { topN, ...others } = $; return [topN, others]; },
  };
  for (const [label, use] of Object.entries(forms)) {
    const r = run(($) => { const p = base($); use($); return p.limit(3); });
    assert.deepEqual(codes(r.diagnostics), ["B015"], label);
    assert.match(r.diagnostics[0].tip, /\$\.name|by name/, label);
  }
  const d = run(($) => { const p = base($); const { topN } = $; return p.limit(topN); });
  assert.deepEqual(d.diagnostics, [], "destructuring by name is reading by name");
});

test("`in` on a leaked $ after its run throws as a read does", () => {
  let leaked;
  run(($) => { leaked = $; return base($); });
  assert.throws(() => "topN" in leaked, /after run\(\) returned/);
});

test("\"t\" in u, a run-time-only member, is B014", () => {
  const r = run((u) => field("f").const("T0", "t" in u ? "1" : "0").pixel((uv) => color(0, 0, 0)));
  assert.deepEqual(codes(r.diagnostics), ["B014"]);
  assert.match(r.diagnostics[0].message, /u\.t/);
});

// constructor, valueOf and toString are Object.prototype's: a lambda reads such a param fine (fields'
// param-names.test.js), so they stay legal, and $ answers them by name once declared.
const PROTO = ["constructor", "valueOf", "toString"];

test("a param named like a runtime probe is B004 at its declaration, with the fix to rename it", () => {
  assert.ok(PROTO.every((n) => PROBES.includes(n)));
  for (const nm of PROBES.filter((n) => !PROTO.includes(n))) {
    const ds = program("q").source("sales", SALES).param(nm, { value: 4 }).table("t", "sales").check();
    assert.deepEqual(codes(ds), ["B004"], nm);
    assert.match(ds[0].message, new RegExp(`'${nm.replace(/\$/g, "\\$")}'`), nm);
    assert.match(ds[0].tip, /rename/, nm);
  }
  assert.deepEqual(codes(field("f").param("then", { value: 1 }).pixel((uv) => color(0, 0, 0)).check()), ["B004"]);
  assert.deepEqual(program("q").source("sales", SALES).param("thenBy", { value: 4 }).table("t", "sales").check(), []);
});

test("a param named constructor, valueOf or toString is declared, and $ answers it by name, recorded", () => {
  for (const nm of PROTO) {
    let v;
    const r = run(($) => { const p = program("q").source("sales", SALES).param(nm, { value: 4 }).table("t", "sales"); v = $[nm]; return p.limit(v); }, { values: { [nm]: 6 } });
    assert.deepEqual(r.diagnostics, [], nm);
    assert.equal(v, 6, nm);
    assert.deepEqual(r.record.reads.map((x) => x.param), [nm]);
  }
  const undeclared = run(($) => { assert.equal($.valueOf, undefined); assert.equal(String($), "[the params]"); return base($); });
  assert.deepEqual(undeclared.record.reads, [], "an undeclared one is still a probe, answered with nothing");
});

// L5: a run-time-only member read before the root opens

test("a run-time-only member read before the Program opens is B014, not B003", () => {
  const r = run((u) => { const t = u.t; return field("f").const("T0", String(t)).pixel((uv) => color(0, 0, 0)); });
  assert.deepEqual(codes(r.diagnostics), ["B014"]);
  assert.match(r.diagnostics[0].message, /u\.t/);
  const early = run(($) => { const n = $.topN; return base($).limit(n); });
  assert.deepEqual(codes(early.diagnostics), ["B003"], "any other read before the Program opens stays B003");
});

// L2: the host's values

test("a host value of the wrong type is refused at run() even when only a lambda reads the param", () => {
  assert.throws(() => run(($) => base($).filter((row) => row.units > $.year), { values: { year: "two thousand" } }), (e) => e instanceof TypeError && /year/.test(e.message));
  assert.throws(() => run(base, { values: { kind: 3 } }), (e) => e instanceof TypeError && /kind/.test(e.message));
});

test("a host value outside its declaration's min..max or options, or not finite, is refused at run()", () => {
  for (const values of [{ topN: 1e9 }, { topN: 0 }, { topN: NaN }, { year: Infinity }, { kind: "pie" }]) {
    const k = Object.keys(values)[0];
    assert.throws(() => run(base, { values }), (e) => e instanceof TypeError && e.message.includes(`'${k}'`), JSON.stringify(values));
    assert.throws(() => run(($) => base($).limit($.topN + ($.kind === "bar" ? 0 : 1) + $.year * 0), { values }), TypeError, `${JSON.stringify(values)} read at build`);
  }
  assert.deepEqual(run(base, { values: { topN: 50, year: -3, kind: "line" } }).diagnostics, []);
});

test("the record's param declarations carry the host's values: record.params is what was built", () => {
  const { record } = run(($) => base($).filter((row) => row.units > $.year).limit($.topN), { values: { year: 2025, topN: 20 } });
  assert.equal(record.params.year.value, 2025);
  assert.equal(record.params.topN.value, 20);
  assert.equal(record.params.topN.max, 50, "the rest of the declaration stays");
  assert.equal(record.params.kind.value, "bar", "a param the host gave no value keeps its own");
  const f = run((u) => field("f").param("speed", { value: 1 }).pixel((uv, u) => color(u.speed, 0, 0)), { values: { speed: 3 } });
  assert.equal(f.record.params.speed.value, 3);
});

test("an unknown values key is reported even when the Program's code throws a BuildError", () => {
  assert.throws(() => run(($) => base($).limit($.nope), { values: { typo: 1 } }), (e) => e instanceof TypeError && /typo/.test(e.message) && /B003/.test(e.message));
});

// L5: bindingText says where a read was

test("bindingText says where a build-time read was and which builder call came next, not who used it", () => {
  const r = run(($) => { const p = base($); const n = $.topN; return p.filter((row) => row.units > 1).limit(n); });
  const lines = bindingText(program.lower(r.record)).split("\n");
  assert.match(lines[0], /^topN\s+folded at build, read at params-review\.test\.js:\d+ \(before t\.filter#0\)$/);
  const late = run(($) => { const p = base($).limit(3); void $.year; return p; });
  assert.match(bindingText(program.lower(late.record)).split("\n")[1], /^year\s+folded at build, read at params-review\.test\.js:\d+ \(after the last builder call\)$/);
});
