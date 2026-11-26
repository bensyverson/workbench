// Gaps the data Grammar found (job NrXepo): a stateless construct's refs checked against names it derives from
// the record and other instances' final states (`names`, checked when lowering, as a state namespace is); `fix`
// on a `rejected` entry (B009); `fix` on a step's ctx.error; didYouMean exported from kit/define.
// @ts-nocheck: lambdas name the Dialect's free names, which TypeScript cannot see.
import { test } from "node:test";
import assert from "node:assert/strict";
import { defineDialect, defineGrammar, exact, name, ref, data, lambda, recordOf, enumOf, DefinitionError, didYouMean } from "../index.js";

const dialect = defineDialect({
  name: "tbl", numberType: "f64", text: () => "", spaces: { row: { pure: true } }, targets: { js: { accepts: "*", compare: exact() } },
  slots: { calc: { params: [], returns: "f64", space: "row" } },
});

/** @param {Record<string, any>} [chartExtra] @param {Record<string, any>} [tableExtra] */
const makeGrammar = (chartExtra = {}, tableExtra = {}) => defineGrammar(dialect, {
  root: "program",
  constructs: {
    program: { opens: [name()], slots: { source: { kind: "decl", args: [name("table"), data(recordOf(enumOf(["f64", "str"])))], as: "sources" } } },
    table: {
      parent: "program", opens: [name(), ref("table", { as: "from" })], record: "calls",
      state: {
        init: (opened, { program, stateOf }) => ({ columns: { ...(program.sources?.[opened.from] ?? stateOf(opened.from)?.columns) } }),
        step: (s, call, _inferred, ctx) => {
          if (call.slot === "add") return { columns: { ...s.columns, [call.args[0]]: "f64" } };
          if (call.slot === "odd") ctx.error("T001", "odd step", { tip: "drop it", fix: ".even()" });
          return s;
        },
        names: { column: (s) => Object.keys(s.columns) },
      },
      slots: { add: { kind: "decl", args: [data("string")] }, odd: { kind: "decl", args: [] } },
      ...tableExtra,
    },
    chart: {
      parent: "program", opens: [name(), ref("table")],
      names: { column: (record, { program, stateOf }) => Object.keys(program.sources?.[record.table] ?? stateOf(record.table)?.columns ?? {}) },
      slots: { x: { kind: "decl", args: [ref("column")], once: true }, tip: { kind: "decl", args: [lambda("calc")], once: true } },
      rejected: { layer: { message: "layers are not built", tip: "drop it", fix: ".x(\"…\")" } },
      ...chartExtra,
    },
  },
});
const g = makeGrammar();
const base = () => g("p").source("s", { a: "f64", b: "str" }).table("t", "s").add("c");

test("a stateless construct's ref is checked, when lowering, against its names: another instance's final state", () => {
  const ok = base().chart("k", "t").x("c").tip(() => 1);
  assert.deepEqual(ok.check(), []);
  const record = ok.build();
  assert.deepEqual(record.chart, [{ name: "k", table: "t", x: "c", tip: "() => 1" }], "the chart keeps its by-slot record");
  assert.deepEqual(g.lower(record).diagnostics, []);
  const typo = base().chart("k", "t").x("cc");
  assert.deepEqual(typo.check(), [], ".check() does not judge a names namespace: it exists only when lowered");
  const ds = g.lower(typo.build()).diagnostics;
  assert.deepEqual(ds.map((d) => d.code), ["B003"]);
  assert.match(ds[0].message, /'cc'.*did you mean 'c'/i);
  assert.ok(ds[0].file && ds[0].loc, "pinned at the call");
});

test("names may read the record alone: a chart over a source", () => {
  assert.deepEqual(g.lower(g("p").source("s", { a: "f64" }).chart("k", "s").x("a").build()).diagnostics, []);
  assert.deepEqual(g.lower(g("p").source("s", { a: "f64" }).chart("k", "s").x("b").build()).diagnostics.map((d) => d.code), ["B003"]);
});

test("names must map namespaces to functions, may not sit beside state, and may not reuse a Program namespace (D015)", () => {
  const d015 = (/** @type {() => unknown} */ f) => assert.throws(f, (e) => e instanceof DefinitionError && e.diagnostics.some((d) => d.code === "D015"));
  d015(() => makeGrammar({ names: { column: "nope" } }));
  d015(() => makeGrammar({}, { names: { column: () => [] } }));
  d015(() => makeGrammar({ names: { table: () => [] } }));
});

test("a rejected entry may carry a fix, which B009 carries; another key is still D001", () => {
  const ds = base().chart("k", "t").layer().check();
  assert.deepEqual(ds.map((d) => [d.code, d.fix]), [["B009", '.x("…")']]);
  assert.throws(() => makeGrammar({ rejected: { layer: { message: "m", hint: "h" } } }), (e) => e instanceof DefinitionError && e.diagnostics.some((d) => d.code === "D001"));
});

test("a step's ctx.error carries its fix", () => {
  const ds = g.lower(base().odd().build()).diagnostics;
  assert.deepEqual(ds.map((d) => [d.code, d.fix, d.tip]), [["T001", ".even()", "drop it"]]);
});

test("didYouMean is exported from kit/define", () => {
  assert.match(didYouMean("monht", ["month", "year"]), /month/);
});

test("a ref in an opening argument is checked against the construct's names too (WBd36m)", () => {
  const g2 = makeGrammar({ opens: [name(), ref("table"), ref("column", { as: "col" })] });
  const make = (/** @type {string} */ col) => g2("p").source("s", { a: "f64", b: "str" }).table("t", "s").add("c").chart("k", "t", col).x("c");
  assert.deepEqual(g2.lower(make("c").build()).diagnostics, []);
  const ds = g2.lower(make("cc").build()).diagnostics;
  assert.deepEqual(ds.map((d) => d.code), ["B003"]);
  assert.match(ds[0].message, /'cc'.*did you mean 'c'/i);
});

test("a stateful construct's opening ref is checked against its state when it opens, before any step (WBd36m)", () => {
  const g3 = makeGrammar({}, { opens: [name(), ref("table", { as: "from" }), ref("column", { as: "key" })] });
  const make = (/** @type {string} */ key) => g3("p").source("s", { a: "f64", b: "str" }).table("t", "s", key).add("c");
  assert.deepEqual(g3.lower(make("a").build()).diagnostics, []);
  const ds = g3.lower(make("c").build()).diagnostics;
  assert.deepEqual(ds.map((d) => d.code), ["B003"], "c is added by a step, so it is not there when the table opens");
  assert.match(ds[0].message, /no column 'c' when it opens/);
});
