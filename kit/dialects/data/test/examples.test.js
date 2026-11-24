// The data Dialect against the Dream Code's examples 2 to 5 (project/2026-11-24-data-tools-dream-code.md):
// every runtime lambda lowers (and the suite verifies it) against an Environment typed from the sources'
// schemas, step by step; a few run on sample rows through the interpreter and the emitted JS; and the
// Dream Code's mistakes give the diagnostics it promised, or the kit's nearest one.
import { test } from "node:test";
import assert from "node:assert/strict";
import { program, INTRINSICS } from "../index.js";
import { run } from "../../../interp/run.js";
import { emitKernel, instantiate } from "../../../emit/js/index.js";
import { run as runProgram, bindingText } from "../../../define/index.js";
import clean from "../examples/02-clean.js";
import params from "../examples/03-params.js";
import group from "../examples/04-group.js";
import query from "../examples/05-query.js";

/** @import { Kernel } from "../../../ir/ir.js" */

/** Example 5 reads $.topN at build time (.limit($.topN)): called with plain values, it is a builder to extend. */
const PARAMS = { topN: 10 };

/** Lowers a built Program, asserting no diagnostic, and returns each lambda's Kernel by id, and the states. @param {any} record */
function lowered(record) {
  const out = program.lower(record);
  assert.deepEqual(out.diagnostics.map((d) => `${d.code} ${d.message}`), [], record.name);
  /** @type {Record<string, Kernel>} */
  const kernels = {};
  for (const l of out.lambdas) kernels[l.ref.id] = /** @type {Kernel} */ (l.result.kernel);
  return { kernels, states: out.states };
}

/**
 * Runs a Kernel in the interpreter and as emitted JS, asserting they agree, and returns the value.
 * @param {Kernel} k @param {unknown[]} args @param {Record<string, unknown>} [$]  The params, read as the global `$`.
 */
function both(k, args, $ = {}) {
  const want = run(k, structuredClone(args), { intrinsics: INTRINSICS, globals: { $: structuredClone($) } });
  const got = instantiate(emitKernel(k, { intrinsics: INTRINSICS }), { $: structuredClone($) })(...structuredClone(args));
  assert.deepEqual(got, want, k.name);
  return want;
}

/** The codes `.check()` and lowering give for a builder, in order. @param {any} b */
function codes(b) {
  const built = b.check();
  if (built.length) return built.map((/** @type {any} */ d) => d.code);
  return program.lower(b.build()).diagnostics.map((d) => d.code);
}

test("example 2: the derive lowers against the cleaned columns and computes revenue", () => {
  const { kernels, states } = lowered(clean().build());
  assert.deepEqual(Object.keys(kernels), ["sales.derive#6"]);
  assert.deepEqual(/** @type {any} */ (states).sales.columns, { date: "date", region: "str", units: "f64", price: "f64", revenue: "f64" });
  assert.equal(both(kernels["sales.derive#6"], [{ date: 0, region: "North", units: 3, price: 2.5 }]), 7.5);
});

test("example 3: three filters over params, a str select and a date param", () => {
  const { kernels } = lowered(params().build());
  const [units, region, since] = Object.values(kernels);
  assert.equal(Object.keys(kernels).length, 3);
  for (const k of [units, region, since]) assert.equal(k.returns, "bool");
  const row = { date: Date.UTC(2026, 2, 1), region: "North", units: 60, price: 1 };
  assert.equal(both(units, [row], { minUnits: 50 }), true);
  assert.equal(both(region, [row], { region: "South" }), false);
  assert.equal(both(region, [row], { region: "All" }), true);
  assert.equal(both(since, [row], { since: Date.UTC(2026, 0, 1) }), true);
});

test("example 4: derive, truncMonth, groupBy and agg type the next step; the chart's lambdas read $", () => {
  const { kernels, states } = lowered(group().build());
  assert.equal(Object.keys(kernels).length, 7);
  assert.deepEqual(/** @type {any} */ (states).monthly.columns, { month: "date", region: "str", revenue: "f64", units: "f64", orders: "f64" });
  const month = /** @type {Kernel} */ (Object.values(kernels).find((k) => k.name.includes("derive#1")));
  assert.equal(both(month, [{ date: Date.UTC(2026, 4, 17, 9), region: "N", units: 1, price: 1, revenue: 1 }]), Date.UTC(2026, 4, 1));
  const sum = /** @type {Kernel} */ (Object.values(kernels).find((k) => k.name.includes("agg") && k.name.includes("revenue")));
  // A group is a host object: its aggregates are its methods, keyed by column name.
  assert.equal(run(sum, [{ sum: (/** @type {string} */ c) => (c === "revenue" ? 42 : 0) }], { intrinsics: INTRINSICS }), 42);
});

test("example 5: a filter on year(date), a join typed from the other table at its step, agg and a limit from $", () => {
  const built = runProgram(query);
  assert.deepEqual(built.diagnostics, []);
  const record = /** @type {any} */ (built.record);
  assert.deepEqual(record.table[0].calls.at(-1), { slot: "limit", args: [10] });
  const { kernels, states } = lowered(record);
  const lines = bindingText(program.lower(record)).split("\n");
  assert.match(lines[0], /^topN\s+folded at build, read by top\.limit#5 \(05-query\.js:22\)$/);
  assert.match(lines[1], /^year\s+uniform, read by top\.filter#0$/);
  // the filter and the two agg lambdas: .limit($.topN) is a folded value now, not a lambda
  assert.equal(Object.keys(kernels).length, 3);
  assert.deepEqual(/** @type {any} */ (states).top.columns, { name: "str", segment: "str", total: "f64", orders: "f64" });
  const filter = /** @type {Kernel} */ (Object.values(kernels).find((k) => k.name.includes("filter")));
  assert.equal(both(filter, [{ id: 1, customer_id: 2, placed_at: Date.UTC(2026, 5, 1), amount: 9 }], { year: 2026 }), true);
  assert.equal(both(filter, [{ id: 1, customer_id: 2, placed_at: Date.UTC(2025, 5, 1), amount: 9 }], { year: 2026 }), false);
});

test("a date literal is written with dateOf(y, m, d), the month counted from 1", () => {
  const b = params().filter("(row) => row.date >= dateOf(2026, 1, 1)");
  const { kernels } = lowered(b.build());
  const k = /** @type {Kernel} */ (Object.values(kernels).at(-1));
  assert.equal(both(k, [{ date: Date.UTC(2026, 0, 1), region: "N", units: 1, price: 1 }]), true);
  assert.equal(both(k, [{ date: Date.UTC(2025, 11, 31), region: "N", units: 1, price: 1 }]), false);
});

test("the Dream Code's mistakes in examples 2 and 3 are lowering's L002 (with did-you-mean) and L003", () => {
  const typo = program.lower(clean().derive("margin", (/** @type {any} */ row) => row.revnue - row.cost).build()).diagnostics;
  assert.deepEqual(typo.map((d) => d.code), ["L002", "L002"]);
  assert.match(typo[0].message + typo[0].tip, /revenue/);
  assert.deepEqual(codes(params().filter("(row) => row.units > $.minUnit")), ["L002"]);
  assert.deepEqual(codes(params().filter("(row) => row.region > $.minUnits")), ["L003"]);
});

test("the Dream Code's mistakes in example 5 are refused at the call, each with its fix", () => {
  // E-TABLE-UNKNOWN: an unknown table is B003, with the did-you-mean.
  const unknown = query(PARAMS).table("t2", "orders").join("customer", { on: { customer_id: "id" } }).check();
  assert.deepEqual(unknown.map((/** @type {any} */ d) => d.code), ["B003"]);
  assert.match(unknown[0].tip ?? "", /customers/);
  // E-JOIN-TYPE: keys of two types are T004, now that step can read the other table (ctx.stateOf) and refuse (ctx.error).
  const keys = program.lower(query(PARAMS).table("t3", "orders").join("customers", { on: { customer_id: "name" } }).build()).diagnostics;
  assert.deepEqual(keys.map((d) => d.code), ["T004"]);
  assert.match(keys[0].message, /customer_id.*f64.*customers\.name.*str/);
  // A join key or a taken column that is not a column is T003.
  assert.deepEqual(codes(query(PARAMS).table("t4", "orders").join("customers", { on: { customer: "id" }, take: ["nam"] })), ["T003", "T003"]);
  // E-SQL-TEXT: SQL pasted as a table's source is T005; the old spelling `.sql(…)` is the rejected B009.
  const sql = query(PARAMS).table("t5", "SELECT name FROM customers").check();
  assert.ok(sql.some((/** @type {any} */ d) => d.code === "T005"), sql.map((/** @type {any} */ d) => d.code).join());
  assert.deepEqual(query(PARAMS).sql("SELECT 1").check().map((/** @type {any} */ d) => d.code), ["B009"]);
});

test("Dream Code spellings the kit does not build are refused with a fix: an int column, a descending sort", () => {
  const int = clean().cast({ units: "int" }).check();
  assert.deepEqual(int.map((/** @type {any} */ d) => d.code), ["T001"]);
  assert.match(int[0].tip ?? "", /"f64".*no integer type/);
  const desc = query(PARAMS).table("t6", "orders").sort("-amount").check();
  assert.ok(desc.some((/** @type {any} */ d) => d.code === "T002" && /\.sortDesc\("amount"\)/.test(d.tip ?? "")), desc.map((/** @type {any} */ d) => `${d.code} ${d.tip}`).join(" | "));
});
