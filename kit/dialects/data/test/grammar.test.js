// The data Grammar against the Dream Code's examples 1, 6 and 7 and the parts of every example the kit does
// not build (project/2026-11-24-data-tools-dream-code.md): what runs runs through the generated builder, and
// each refusal carries its code and a fix. Examples 2 to 5 are in examples.test.js.
import { test } from "node:test";
import assert from "node:assert/strict";
import { program, INTRINSICS } from "../index.js";
import { run } from "../../../interp/run.js";
import firstLook from "../examples/01-first-look.js";
import params from "../examples/03-params.js";
import group from "../examples/04-group.js";
import query from "../examples/05-query.js";
import profile from "../examples/06-profile.js";
import outliers from "../examples/07-outliers.js";

/** @import { Kernel } from "../../../ir/ir.js" */

/** Lowers a built Program, asserting no diagnostic. @param {any} record */
function lowered(record) {
  const out = program.lower(record);
  assert.deepEqual(out.diagnostics.map((d) => `${d.code} ${d.message}`), [], record.name);
  return out;
}

/** The diagnostics `.check()` gives, else lowering's. @param {any} b @returns {any[]} */
function diagnostics(b) {
  const built = b.check();
  return built.length ? built : program.lower(b.build()).diagnostics;
}

/** @param {any} b */
const codes = (b) => diagnostics(b).map((d) => d.code);

test("example 1: a source with its schema and a named view of it build, and lower to nothing", () => {
  const record = firstLook().build();
  assert.deepEqual(record.view, [{ name: "first", table: "sales", head: 20 }]);
  const { lambdas, states } = lowered(record);
  assert.equal(lambdas.length, 0);
  assert.deepEqual(record.source.sales.columns, { date: "date", region: "str", units: "f64", price: "f64" });
  assert.deepEqual(Object.keys(states), []);
});

test("example 1: a source without a schema is T006, with the fix to declare its columns", () => {
  const d = program("first-look").source("sales", { csv: "data/sales.csv" }).check();
  assert.deepEqual(d.map((/** @type {any} */ x) => x.code), ["T006"]);
  assert.match(d[0].tip, /columns: \{/);
  // a source with its schema is still fine
  assert.deepEqual(firstLook().check(), []);
});

test("example 1: a view given a lambda is layout, T007 with the fix; a view of no table is T007 too", () => {
  const layout = program("first-look").source("sales", { csv: "x.csv", columns: { a: "f64" } }).view((/** @type {any} */ t) => t.sales.head(20)).check();
  assert.deepEqual(layout.map((/** @type {any} */ x) => x.code), ["T007"]);
  assert.match(layout[0].tip, /\.view\("name", "table"\)/);
  const none = program("p").source("s", { csv: "x.csv", columns: { a: "f64" } }).view("v").check();
  assert.deepEqual(none.map((/** @type {any} */ x) => x.code), ["T007"]);
  // a view of an unknown table is the builder's B003, with the did-you-mean
  const typo = program("p").source("sales", { csv: "x.csv", columns: { a: "f64" } }).view("v", "sale").check();
  assert.deepEqual(typo.map((/** @type {any} */ x) => x.code), ["B003"]);
  assert.match(typo[0].message, /sales/);
});

test("example 5's grid is a named view of its table", () => {
  assert.deepEqual(query().build().view, [{ name: "topRows", table: "top" }]);
});

test("a chart's encodings are checked against its table's columns: an unknown one is B003 with the did-you-mean", () => {
  const typo = diagnostics(group().chart("bad", "monthly").mark("bar").x("monht"));
  assert.deepEqual(typo.map((d) => d.code), ["B003"]);
  assert.match(typo[0].message, /monht.*month/);
  assert.deepEqual(codes(group().chart("bad", "monthly").mark("bar").x("month").color("regoin").tooltip("month", "ordrs")), ["B003", "B003"]);
  // a column an agg made, and one a derive made before it, are encodable
  assert.deepEqual(codes(group().chart("ok", "monthly").mark("bar").x("month").y("orders").tooltip("revenue")), []);
  // a chart over a source reads the source's schema (the chart has no state of its own: its column names
  // come from the table's final state or the source's schema, job NrXepo)
  lowered(profile().build());
  const bad = program.lower(profile().chart("h", "survey").mark("histogram").x("agee").build()).diagnostics;
  assert.deepEqual(bad.map((d) => d.code), ["B003"]);
  assert.match(bad[0].message, /agee.*age/);
});

test("example 6: written out, the histograms, the profile and the long-form pivot lower; their schemas follow", () => {
  const { lambdas, states } = lowered(profile().build());
  assert.equal(lambdas.length, 5);
  assert.deepEqual(Object.keys(states).sort(), ["byQuarter", "profile"]);
  assert.deepEqual(/** @type {any} */ (states).profile.columns, { n: "f64", scoreMin: "f64", scoreMax: "f64", scoreMean: "f64" });
  assert.deepEqual(/** @type {any} */ (states).byQuarter.columns, { team: "str", quarter: "str", score: "f64" });
});

test("example 6: a build-time fan-out, describe and pivot are B009, each with the builder form that replaces it", () => {
  const charts = diagnostics(profile().charts("histograms", "…"));
  assert.deepEqual(charts.map((d) => d.code), ["B009"]);
  assert.match(charts[0].tip, /\.chart\(/);
  const describe = diagnostics(profile().table("p2", "survey").describe());
  assert.deepEqual(describe.map((d) => d.code), ["B009"]);
  assert.match(describe[0].tip, /\.agg\(/);
  const pivot = diagnostics(profile().table("p3", "survey").pivot({ rows: "team", cols: "quarter" }));
  assert.deepEqual(pivot.map((d) => d.code), ["B009"]);
  assert.match(pivot[0].tip, /\.groupBy\(.*\.agg\(/);
});

test("example 7: the winsorize written as a derive clamps between two params", () => {
  const { lambdas, states } = lowered(outliers().build());
  assert.deepEqual(/** @type {any} */ (states).clean.columns, { price: "f64", weight: "f64" });
  assert.equal(/** @type {any} */ (states).dist, undefined, "a chart has no state of its own (job NrXepo)");
  const k = /** @type {Kernel} */ (lambdas[0].result.kernel);
  assert.equal(run(k, [{ price: 900, weight: 1 }], { intrinsics: INTRINSICS, globals: { $: { lo: 1, hi: 500 } } }), 500);
  assert.equal(run(k, [{ price: 20, weight: 1 }], { intrinsics: INTRINSICS, globals: { $: { lo: 1, hi: 500 } } }), 20);
});

test("example 7: fragments, column attributes and a chart's rule are B009 with a fix; a fragment's method is B001", () => {
  for (const b of [outliers().fragment("table", {}), outliers().table("c2", "sales").column("price", {}), outliers().rule(3, { label: "3σ" })]) {
    const d = diagnostics(b);
    assert.deepEqual(d.map((x) => x.code), ["B009"]);
    assert.ok(d[0].tip.length > 0, d[0].message);
  }
  assert.throws(() => outliers().table("c3", "sales").winsorize("price"), (/** @type {any} */ e) => e.code === "B001");
});

test("layout, rendering, agent permissions and program-editing mutations are B009, each with a fix", () => {
  const p = () => query();
  const refused = {
    layout: p().layout("row"), controls: p().controls("topN"), grid: p().table("g", "top").grid({ pageSize: 25 }), head: p().table("h", "top").head(20),
    run: p().run(), schema: p().schema("top"), title: p().title("Top"), vegaLite: p().vegaLite({}), render: p().render(), layer: p().layer(),
    agent: p().agent(() => 0),
    env: p().env(), session: p().session({ actor: "agent" }), addStep: p().addStep("top", {}), addTable: p().addTable("x"), addChart: p().addChart("x"), editSource: p().editSource("orders"),
    sql: p().sql("SELECT 1"),
  };
  for (const [name, b] of Object.entries(refused)) {
    const d = diagnostics(b);
    assert.deepEqual(d.map((x) => x.code), ["B009"], name);
    assert.ok(d[0].tip.length > 0, `${name} has a fix`);
  }
  // the head of a view is not refused
  assert.deepEqual(codes(p().view("v2", "top").head(5)), []);
});

test("semiJoin keeps a table's columns and checks its keys; keepGroups keeps them and wants a bool", () => {
  const base = () => program("retention")
    .source("events", { csv: "e.csv", columns: { user_id: "str", ts: "date", kind: "str" } })
    .source("plans", { csv: "p.csv", columns: { user_id: "str", name: "str", seats: "f64" } })
    .param("minEvents", { min: 1, max: 20, value: 3 })
    .table("eligible", "events");
  const ok = base().semiJoin("plans", { on: { user_id: "user_id" } }).keepGroups("user_id", "(g) => g.count() >= $.minEvents");
  const { states, lambdas } = lowered(ok.build());
  assert.deepEqual(/** @type {any} */ (states).eligible.columns, { user_id: "str", ts: "date", kind: "str" });
  assert.equal(/** @type {Kernel} */ (lambdas[0].result.kernel).returns, "bool");
  assert.deepEqual(codes(base().semiJoin("plans", { on: { ts: "seats" } })), ["T004"]);
  assert.deepEqual(codes(base().semiJoin("plans", { on: { user: "user_id" } })), ["T003"]);
  const notBool = diagnostics(base().keepGroups("user_id", (/** @type {any} */ g) => g.count()));
  assert.deepEqual(notBool.map((d) => d.code), ["T008"]);
  assert.match(notBool[0].tip, />=/);
  assert.deepEqual(codes(base().keepGroups("usr", (/** @type {any} */ g) => g.count() > 1)), ["B003"]);
});

test("a lambda that reads a local variable is B008, with the fix: a Program constant or a param", () => {
  const threshold = 3;
  const d = diagnostics(params().filter((/** @type {any} */ row) => row.units > threshold));
  assert.deepEqual(d.map((x) => x.code), ["B008"]);
  assert.match(d[0].tip, /\.const\("threshold"/);
  assert.match(d[0].tip, /\$\.threshold/);
  // the same lambda over a Program constant builds
  assert.deepEqual(codes(params().const("threshold", "3").table("picked2", "sales").filter("(row) => row.units > threshold")), []);
});
