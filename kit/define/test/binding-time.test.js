// Binding-time parameters (leaf bqYGEM; Option A as ruled in project/2026-11-24-binding-time-design.md): a
// Program is a function of its params, `run` calls it with a recording `$`, a build-time read folds the value
// into the record and is kept in `record.reads`, lowering says each param's binding time, and a run-time-only
// member read at build time is refused.
// @ts-nocheck: lambdas name the Dialect's free names, which TypeScript cannot see.
import { test } from "node:test";
import assert from "node:assert/strict";
import { run, needsRebuild, bindingText, defineDialect, defineGrammar, name, data, lambda, exact, DefinitionError } from "../index.js";
import { program } from "../../dialects/data/grammar.js";
import { field } from "../../dialects/fields/grammar.js";
import { INTRINSICS } from "../../dialects/data/dialect.js";
import { run as interpret } from "../../interp/run.js";

const HERE = import.meta.url;
const SALES = { csv: "s.csv", columns: { region: "str", units: "f64" } };

/** A data Program: topN read at build (folded into .limit), minUnits read in a filter's Kernel, both read by `both`. */
const query = ($) => program("q")
  .source("sales", SALES)
  .param("topN", { value: 10, min: 1, max: 50 })
  .param("minUnits", { value: 5 })
  .param("both", { value: 2 })
  .param("unused", { value: "x" })
  .table("t", "sales")
  .filter((row) => row.units >= $.minUnits && row.units > $.both)
  .limit($.topN + $.both);

test("run calls the Program with a recording $: a build-time read is the plain value, folded into the record", () => {
  const { record, diagnostics } = run(query);
  assert.deepEqual(diagnostics, []);
  const t = record.table[0];
  assert.deepEqual(t.calls.at(-1), { slot: "limit", args: [12] });
  assert.deepEqual(record.reads.map((r) => [r.param, r.value, r.by]), [["topN", 10, "t.limit#1"], ["both", 2, "t.limit#1"]]);
  assert.equal(record.reads[0].file, HERE);
  assert.ok(record.reads[0].loc.start.line > 1);
});

test("the host's values replace the declared ones, and needsRebuild answers from the record", () => {
  const first = run(query).record;
  assert.equal(needsRebuild(first, ["topN"]), true);
  assert.equal(needsRebuild(first, ["minUnits"]), false, "a Kernel read is a uniform: no rebuild");
  assert.equal(needsRebuild(first, ["unused"]), false);
  const again = run(query, { values: { topN: 20 } }).record;
  assert.deepEqual(again.table[0].calls.at(-1), { slot: "limit", args: [22] });
  assert.equal(again.reads[0].value, 20);
});

test("a Kernel read of a param stays a uniform: the lowered lambda reads $ at run time, so a new value needs no rebuild", () => {
  const { record } = run(query);
  const out = program.lower(record);
  assert.deepEqual(out.diagnostics, []);
  const k = out.lambdas.find((l) => l.ref.id === "t.filter#0").result.kernel;
  const keep = (minUnits) => interpret(k, [{ region: "n", units: 6 }], { intrinsics: INTRINSICS, globals: { $: { minUnits, both: 2 } } });
  assert.equal(keep(5), true);
  assert.equal(keep(7), false);
});

test("lower() gives each param's binding time, and bindingText prints one line per param", () => {
  const out = program.lower(run(query).record);
  assert.deepEqual(Object.keys(out.params), ["topN", "minUnits", "both", "unused"]);
  assert.deepEqual(out.params.topN.build.map((b) => b.by), ["t.limit#1"]);
  assert.deepEqual(out.params.topN.kernels, []);
  assert.equal(out.params.topN.live, false);
  assert.deepEqual(out.params.minUnits, { build: [], kernels: ["t.filter#0"], live: true });
  assert.equal(out.params.both.live, false);
  assert.deepEqual(out.params.both.kernels, ["t.filter#0"]);
  assert.deepEqual(out.params.unused, { build: [], kernels: [], live: true });
  const text = bindingText(out).split("\n");
  assert.equal(text.length, 4);
  assert.match(text[0], /^topN\s+folded at build, read by t\.limit#1 \(binding-time\.test\.js:\d+\)$/);
  assert.match(text[1], /^minUnits\s+uniform, read by t\.filter#0$/);
  assert.match(text[2], /^both\s+folded at build, read by t\.limit#1 \(binding-time\.test\.js:\d+\); also read by t\.filter#0$/);
  assert.match(text[3], /^unused\s+uniform, not read$/);
});

test("a record built without run has no build reads: every param is a uniform", () => {
  const record = program("q").source("sales", SALES).param("n", { value: 1 }).table("t", "sales").filter((row) => row.units > $.n).build();
  const out = program.lower(record);
  assert.deepEqual(out.params.n, { build: [], kernels: ["t.filter#0"], live: true });
  assert.equal(needsRebuild(record, ["n"]), false);
});

test("a param read at build before it is declared, or never declared, is B003 with a did-you-mean", () => {
  const typo = run(($) => program("q").source("sales", SALES).param("topN", { value: 10 }).table("t", "sales").limit($.topn));
  assert.equal(typo.record, null);
  assert.deepEqual(typo.diagnostics.map((d) => d.code), ["B003"]);
  assert.match(typo.diagnostics[0].message, /no param 'topn'/);
  assert.match(typo.diagnostics[0].message, /topN/);
  const early = run(($) => { const n = $.topN; return program("q").param("topN", { value: n }); });
  assert.deepEqual(early.diagnostics.map((d) => d.code), ["B003"]);
  assert.match(early.diagnostics[0].tip, /\.param\("topN"/);
});

test("a run-time-only member read at build time is B014, with the fix to read it inside the lambda", () => {
  const r = run((u) => field("f").param("speed", { value: 1 }).const("T0", String(u.t)).pixel((uv, u) => color(uv.x * u.speed, 0, 0)));
  assert.equal(r.record, null);
  assert.deepEqual(r.diagnostics.map((d) => d.code), ["B014"]);
  assert.match(r.diagnostics[0].message, /u\.t/);
  assert.match(r.diagnostics[0].tip, /\(uv, u\) => … u\.t …|inside the lambda/);
  assert.equal(r.diagnostics[0].file, HERE);
});

test("a fields Program reads a param at build through u, and the same param in its pixel Kernel", () => {
  const r = run((u) => field("f").param("bands", { value: 3, min: 1, max: 8 }).const("B", String(u.bands * 2)).pixel((uv, u) => color(floor(uv.x * u.bands) / B, 0, 0)));
  assert.deepEqual(r.diagnostics, []);
  assert.deepEqual(r.record.units.find((x) => x.name === "B"), { name: "B", kind: "const", src: "6" });
  const out = field.lower(r.record);
  assert.deepEqual(out.diagnostics, []);
  assert.equal(out.params.bands.live, false);
  assert.deepEqual(out.params.bands.kernels, ["f.pixel"]);
});

test("the lambda form in a structure slot is refused, with the fix to pass the value: .limit($.topN)", () => {
  const ds = program("q").source("sales", SALES).param("topN", { value: 10 }).table("t", "sales").limit(() => $.topN).check();
  assert.deepEqual(ds.map((d) => d.code), ["B004"]);
  assert.equal(ds[0].fix, ".limit($.topN)");
  assert.match(ds[0].tip, /\.limit\(\$\.topN\)/);
});

test("the thunk's $ is not a build-time local to the lambdas that read the Dialect's $", () => {
  const r = run(query, { buildTime: ["$"] });
  assert.deepEqual(r.diagnostics, []);
});

test("run passes scope, sources and buildTime through to the build", () => {
  const MIN = 3;
  const r = run(($) => program("q").source("sales", SALES).table("t", "sales").filter((row) => row.units > MIN), { scope: { MIN } });
  assert.deepEqual(r.diagnostics, []);
  assert.deepEqual(r.record.units, [{ name: "MIN", kind: "const", src: "3" }]);
  const bad = run(($) => program("q").source("sales", SALES).table("t", "sales").filter((row) => row.units > cut), { buildTime: ["cut"] });
  assert.deepEqual(bad.diagnostics.map((d) => d.code), ["B013"]);
  assert.equal(bad.record, null);
});

test("a host's mistake throws: a value for an undeclared param or of the wrong type, a non-function, a non-builder result", () => {
  assert.throws(() => run(query, { values: { nope: 1 } }), /nope/);
  assert.throws(() => run(query, { values: { topN: "ten" } }), /topN/);
  assert.throws(() => run(query, { wat: 1 }), TypeError);
  assert.throws(() => run(program("q")), TypeError);
  assert.throws(() => run(($) => program("q").build()), /builder/);
  assert.throws(() => run(($) => 3), /builder/);
});

test("$ answers runtime probes with nothing, and a run closes even when the Program throws", () => {
  const r = run(($) => { assert.equal($.then, undefined); assert.equal(String($), "[the params]"); return program("q").source("sales", SALES); });
  assert.deepEqual(r.diagnostics, []);
  assert.throws(() => run(() => { throw new RangeError("boom"); }), RangeError);
  assert.deepEqual(run(query).diagnostics, [], "a later run opens");
});

const tiny = defineDialect({
  name: "tiny", numberType: "f64", text: () => "",
  objects: { P: { label: "the params", members: { clock: "f64" } } },
  globals: { $: "P" },
  params: { object: "P", name: "$", runtime: ["clock"] },
  spaces: { row: { pure: true } },
  targets: { js: { accepts: "*", compare: exact() } },
  slots: { keep: { params: ["f64"], returns: "f64", space: "row" } },
  environment: (rec) => ({ objects: { P: { members: Object.fromEntries(Object.keys(rec.params ?? {}).map((n) => [n, "f64"])) } } }),
});

test("a Grammar names its param slot: a slot that is not a root decl slot opening with a name is D011", () => {
  const slots = { param: { kind: "decl", args: [name("param"), data({ value: "number" })], as: "params" }, keep: { kind: "decl", args: [lambda("keep")] } };
  assert.doesNotThrow(() => defineGrammar(tiny, { root: "c", params: { slot: "param" }, constructs: { c: { opens: [name()], slots } } }));
  for (const params of [{ slot: "nope" }, { slot: "keep" }, { slots: "param" }, "param"]) {
    assert.throws(() => defineGrammar(tiny, { root: "c", params, constructs: { c: { opens: [name()], slots } } }), (e) => e instanceof DefinitionError && e.diagnostics.some((d) => d.code === "D011" || d.code === "D001"), JSON.stringify(params));
  }
});

test("the root may not put anything else under the record key reads (D017)", () => {
  assert.throws(() => defineGrammar(tiny, { root: "c", constructs: { c: { opens: [name()], slots: { reads: { kind: "decl", args: [lambda("keep")] } } } } }), (e) => e instanceof DefinitionError && e.diagnostics.some((d) => d.code === "D017"));
});

test("a Dialect's params name a declared object, an identifier, and members of that object (D011)", () => {
  const base = { name: "t2", numberType: "f64", text: () => "", objects: { P: { label: "p", members: { clock: "f64" } } }, globals: { $: "P" }, spaces: { row: { pure: true } }, targets: { js: { accepts: "*", compare: exact() } }, slots: {} };
  assert.doesNotThrow(() => defineDialect({ ...base, params: { object: "P", name: "$", runtime: ["clock"] } }));
  for (const params of [{ object: "Q", name: "$" }, { object: "P", name: "1x" }, { object: "P", name: "$", runtime: ["nope"] }, { object: "P" }]) {
    assert.throws(() => defineDialect({ ...base, params }), (e) => e instanceof DefinitionError && e.diagnostics.some((d) => d.code === "D011" || d.code === "D001"), JSON.stringify(params));
  }
});
