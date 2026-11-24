# Data tools workbench: Dream Code examples

Examples only, from simple to complex, of a fluent builder API for a small data-tools workbench: load, clean and transform tables, chart them, and query them with a SQL plugin. Nothing here is implemented.

The shape used throughout:

- `wb.program(name)` starts a builder. Each fluent call adds a node to a DAG (the IR). Nothing runs until `.build()` (static checks, build-time lambdas) or `.run()` / an attached view (runtime lambdas).
- The core grammar has a few composable component kinds: **source**, **table** (transforms), **param**, **chart**, **sql** and **view**. Every component takes lambdas where it needs custom behavior.
- A lambda is either **build-time** (it receives schemas and params' declared ranges and returns more grammar), or **runtime** (it receives rows and current param values). The component decides which one by default, and `wb.build(fn)` / `wb.run(fn)` mark it explicitly.
- Rows, schemas and builders are Proxy objects. A misspelled column, a missing method or a type mismatch gives a diagnostic with a span and a fix, not `undefined`.
- **Fragments** add methods or attributes to one component kind without forking the kit.
- An **Environment** wraps a built program for direct mutation by an agent (or a UI) as an append-only event log.

## 1. Load a CSV and look at it

The smallest program: one source, one view. Column types are inferred when the program is built.

```js
import { wb } from "@workbench/data";

const p = wb.program("first-look")
  .source("sales", wb.csv("data/sales.csv"))   // types inferred: date, region, units, price
  .view(t => t.sales.head(20));

const built = await p.build();
built.schema("sales");
// { date: "date", region: "string", units: "int", price: "f64" }

await built.run();   // renders a 20-row grid
```

## 2. Clean the data, with a runtime lambda and a proxy diagnostic

Transforms chain on a table. `derive` takes a runtime lambda over a row; the row is a Proxy that knows the schema.

```js
const p = wb.program("clean-sales")
  .source("raw", wb.csv("data/sales.csv", { header: true }))
  .table("sales", t => t.raw
    .rename({ "Unit Price": "price" })
    .cast({ date: "date", units: "int", price: "f64" })
    .trim("region")
    .replace("region", { "N.": "North", "S.": "South" })
    .dropNulls(["date", "units"])
    .dedupe(["date", "region"])
    .derive("revenue", row => row.units * row.price));

// A typo is caught when the program is built, not as NaN at run time:
p.table("bad", t => t.sales.derive("margin", row => row.revnue - row.cost));
await p.build();
// E-COL-UNKNOWN  clean-sales:18:52  row.revnue: no column "revnue" on table "sales".
//   did you mean "revenue"?       fixit: replace "revnue" with "revenue"
// E-COL-UNKNOWN  clean-sales:18:65  row.cost: no column "cost" on table "sales".
//   columns: date, region, units, price, revenue
```

## 3. Parameters: sliders and selects that drive runtime lambdas

Params are components too. A lambda that reads a param is runtime: moving the slider reruns only the nodes downstream of it.

```js
const p = wb.program("filters")
  .source("sales", wb.csv("data/sales.csv"))
  .param("minUnits", wb.slider({ min: 0, max: 500, step: 10, value: 50, label: "Minimum units" }))
  .param("region",   wb.select({ from: t => t.sales.distinct("region"), value: "All" }))
  .param("since",    wb.date({ value: "2026-01-01" }))
  .table("picked", (t, $) => t.sales
    .filter(row => row.units >= $.minUnits)
    .filter(row => $.region === "All" || row.region === $.region)
    .filter(row => row.date >= $.since))
  .view((t, $) => wb.layout.column(
    wb.controls($.minUnits, $.region, $.since),
    t.picked.grid({ pageSize: 25 })));

await p.run();

// Wrong param use is caught at build:
p.table("x", (t, $) => t.sales.filter(row => row.units > $.minUnit));
// E-PARAM-UNKNOWN  no param "minUnit"; did you mean "minUnits"?
p.table("y", (t, $) => t.sales.filter(row => row.region > $.minUnits));
// E-TYPE-COMPARE  compares string (row.region) with number ($.minUnits)
```

## 4. Group, aggregate and chart

A chart is a component built from encodings. Aggregates are named, so the chart can refer to them by name and the proxy can check that name.

```js
const p = wb.program("revenue-by-month")
  .source("sales", wb.csv("data/sales.csv"))
  .param("metric", wb.select({ options: ["revenue", "units"], value: "revenue" }))
  .table("monthly", t => t.sales
    .derive("revenue", row => row.units * row.price)
    .derive("month", row => wb.fn.truncMonth(row.date))
    .groupBy("month", "region")
    .agg({
      revenue: g => g.sum("revenue"),
      units:   g => g.sum("units"),
      orders:  g => g.count(),
    })
    .sort("month"))
  .chart("trend", (t, $) => wb.chart.line(t.monthly)
    .x("month", { type: "time" })
    .y(() => $.metric, { format: $.metric === "revenue" ? "$,.0f" : ",d" })   // runtime: follows the select
    .color("region")
    .tooltip("month", "region", "revenue", "orders")
    .title(() => `Monthly ${$.metric} by region`))
  .view(c => wb.layout.column(wb.controls(c.$.metric), c.trend));

// wb.chart.bar(t.monthly).x("monht")
// E-ENC-COLUMN  chart "trend": encoding x names "monht"; did you mean "month"?
```

## 5. SQL: a query over the program's tables

The SQL plugin is one more component. Its text is parsed when the program is built: table names resolve to the program's tables, `${$.param}` becomes a bound parameter (never string-spliced), and the result's schema is inferred, so later builders are checked against it.

```js
const p = wb.program("top-customers")
  .source("orders",    wb.csv("data/orders.csv"))
  .source("customers", wb.csv("data/customers.csv"))
  .param("topN", wb.slider({ min: 5, max: 50, value: 10 }))
  .param("year", wb.select({ options: [2024, 2025, 2026], value: 2026 }))
  .sql("top", ($) => wb.sql`
      SELECT c.name, c.segment,
             SUM(o.amount)            AS total,
             COUNT(*)                 AS orders
      FROM orders o
      JOIN customers c ON c.id = o.customer_id
      WHERE strftime('%Y', o.placed_at) = ${$.year}
      GROUP BY c.name, c.segment
      ORDER BY total DESC
      LIMIT ${$.topN}`)
  .chart("bars", t => wb.chart.bar(t.top).x("total").y("name", { sort: "-x" }).color("segment"))
  .view(c => wb.layout.row(wb.controls(c.$.topN, c.$.year), c.bars, c.t.top.grid()));

const built = await p.build();
built.schema("top");   // { name: "string", segment: "string", total: "f64", orders: "int" }

// SQL errors come back with spans inside the SQL text:
//   FROM order o
// E-SQL-TABLE  top:6:12  no table "order"; tables: orders, customers.  fixit: "orders"

// SQL and builder steps mix freely: a SQL result is just a table.
p.table("bigOnly", t => t.top.filter(row => row.total > 10_000).derive("avg", r => r.total / r.orders));
```

## 6. Build-time lambdas: grammar that depends on the data's shape

A build-time lambda runs once while the program is built. It sees schemas and declared param ranges, not rows, and returns more grammar. Here one chart per numeric column, and a pivot whose columns come from the data's distinct values.

```js
const p = wb.program("profile")
  .source("survey", wb.csv("data/survey.csv"))
  // build-time: fans out over the schema
  .charts("histograms", wb.build(({ schema, t }) =>
    schema.survey.columns
      .filter(c => c.type.isNumeric)
      .map(c => wb.chart.histogram(t.survey).x(c.name, { bins: 30 }).title(c.name))))
  // build-time: profile the columns once and keep it as a static table
  .table("profile", wb.build(({ t }) => t.survey.describe()))   // count, nulls, min, max, mean per column
  // build-time pivot: the distinct quarters become columns in the IR
  .table("byQuarter", wb.build(async ({ t, sample }) => {
    const quarters = await sample(t.survey.distinct("quarter"));
    return t.survey.pivot({ rows: "team", cols: "quarter", values: g => g.mean("score"), expect: quarters });
  }))
  .view(c => wb.layout.grid(2, c.t.profile.grid(), ...c.histograms));

// A runtime value used in a build-time lambda is refused:
p.table("z", wb.build(({ t, $ }) => t.survey.limit($.n)));
// E-PHASE  build-time lambda reads param "n", which is only known at run time.
//   mark the lambda wb.run(...), or give "n" a fixed value
```

## 7. Fragments: extend a component's methods and attributes

A fragment adds methods (or attributes) to one component kind. It is written in the same grammar, so its nodes show up in the IR and its errors carry the caller's span.

```js
// New table method, written in terms of the core grammar.
wb.fragment("table", {
  winsorize(column, { lo = 0.01, hi = 0.99 } = {}) {
    const q = this.quantiles(column, [lo, hi]);        // build-time if the table is static
    return this.derive(column, row => Math.min(Math.max(row[column], q[lo]), q[hi]));
  },
  zscore(column, as = `${column}_z`) {
    return this.derive(as, (row, { stats }) => (row[column] - stats.mean(column)) / stats.sd(column));
  },
});

// New column attributes: units and display format travel with the column.
wb.fragment("column", {
  attrs: { unit: wb.attr.string(), currency: wb.attr.enum(["USD", "EUR", "GBP"]) },
});

// New chart method.
wb.fragment("chart", {
  rule(value, { label } = {}) { return this.layer(wb.mark.rule().y(value).label(label)); },
});

const p = wb.program("outliers")
  .source("sales", wb.csv("data/sales.csv"))
  .table("clean", t => t.sales
    .column("price", c => c.currency("USD"))
    .column("weight", c => c.unit("kg"))
    .winsorize("price")
    .zscore("price"))
  .chart("dist", t => wb.chart.histogram(t.clean).x("price_z").rule(3, { label: "3σ" }));

// t.sales.winsorise("price")
// E-METHOD-UNKNOWN  table has no method "winsorise"; did you mean "winsorize" (fragment from outliers.js:2)?
// c.currency("YEN")
// E-ATTR-VALUE  currency must be one of USD, EUR, GBP
```

## 8. The IR: inspect, list, diff and trace lineage

`.build()` returns the DAG. Each node carries its kind, its schema, its phase (build or run), its params and its source span. The same IR feeds the views, the cache and the agent.

```js
const built = await wb.program("revenue-by-month") /* … example 4 … */ .build();

built.ir.nodes.map(n => [n.id, n.kind, n.phase]);
// [ ["sales", "source", "build"], ["monthly.derive#1", "derive", "run"], …, ["trend", "chart", "run"] ]

console.log(built.listing());
// sales       source csv data/sales.csv              {date, region, units, price}
// monthly.1   derive revenue = units * price         f64
// monthly.2   derive month = truncMonth(date)        date
// monthly.3   groupBy month, region
// monthly.4   agg revenue=sum(revenue) units=sum(units) orders=count()
// trend       chart line x=month y=$metric color=region
//             depends on: monthly.4, $metric

built.lineage("trend", "revenue");      // ["sales.units", "sales.price"]
built.downstreamOf("$metric");          // ["trend"]  (moving the select reruns one node)

// Diff two versions of a program, node by node, before accepting a change.
const next = await built.program.table("monthly", t => t.monthly.filter(r => r.units > 0)).build();
built.diff(next);
// + monthly.5  filter units > 0
// ~ trend      input changed: monthly.4 → monthly.5

const json = built.ir.toJSON();         // stable form: golden tests, sharing, replay
```

## 9. An agent working in the Environment by mutation

At run time an agent doesn't rebuild programs from source. It opens a session on the Environment and applies small typed mutations. Each mutation is checked like builder code, then appended to an event log, so it can be undone, replayed or reviewed.

```js
const env = await wb.env(built);             // a live program: tables, params, views
const s = env.session({ actor: "agent" });

// Read the state the way a user sees it.
s.tables();                                  // [{ name: "sales", rows: 18234, schema: {…} }, …]
s.peek("sales", { rows: 5 });
s.profile("sales", "price");                 // { nulls: 112, min: -4, max: 99999, … }

// Mutate directly.
await s.set("$.minUnits", 100);              // moves the slider, like a user
await s.addStep("sales", wb.step.filter(row => row.price > 0), { why: "negative prices are refunds" });
await s.addSql("refunds", `SELECT region, COUNT(*) AS n FROM sales_raw WHERE price < 0 GROUP BY region`);
await s.addChart("refundBars", c => wb.chart.bar(c.t.refunds).x("region").y("n"));

// Invalid mutations are refused with the same diagnostics, and nothing is applied.
await s.addStep("sales", wb.step.derive("x", row => row.prise * 2));
// { ok: false, code: "E-COL-UNKNOWN", message: 'no column "prise"; did you mean "price"?',
//   fixit: { replace: "prise", with: "price" } }

// The log is the record.
s.log();
// 1 set $.minUnits 50 → 100
// 2 addStep sales filter price > 0          why: negative prices are refunds
// 3 addSql refunds                          schema {region: string, n: int}
// 4 addChart refundBars
await s.undo();                               // removes 4
const proposal = s.toProgram();               // back to builder form, for a person to review
await env.commit(s, { review: "required" });  // or env.discard(s)
```

## 10. A whole workbench: a custom component, SQL, params, charts and an agent hook

A new grammar component, `cohort`, is defined once from core pieces. It takes both kinds of lambda: a build-time one to choose the bucketing from the data's date range, and a runtime one to classify rows. The program combines it with SQL, params, fragments and a view, and exposes a narrow mutation surface to the agent.

```js
wb.component("cohort", {
  args: {
    table:   wb.arg.table(),
    user:    wb.arg.column({ type: "string" }),
    at:      wb.arg.column({ type: "date" }),
    bucket:  wb.arg.build(({ range }) => range.days > 400 ? "month" : "week"),  // build-time default
    active:  wb.arg.run((row) => true),                                         // runtime predicate
  },
  expand({ table, user, at, bucket, active }) {
    const first = table.groupBy(user).agg({ cohort: g => g.min(at) })
                       .derive("cohort", r => wb.fn.trunc(bucket, r.cohort));
    return table.filter(active)
      .join(first, { on: user })
      .derive("period", r => wb.fn.diff(bucket, r.cohort, r[at]))
      .groupBy("cohort", "period")
      .agg({ users: g => g.countDistinct(user) })
      .derive("retention", (r, { first }) => r.users / first("users", { cohort: r.cohort, period: 0 }));
  },
});

const p = wb.program("retention")
  .source("events", wb.csv("data/events.csv"))
  .source("plans",  wb.csv("data/plans.csv"))
  .param("plan",    wb.select({ from: t => t.plans.distinct("name"), value: "pro" }))
  .param("minEvents", wb.slider({ min: 1, max: 20, value: 3 }))
  .sql("eligible", ($) => wb.sql`
      SELECT e.user_id, e.ts, e.kind
      FROM events e JOIN plans p ON p.user_id = e.user_id
      WHERE p.name = ${$.plan}
        AND e.user_id IN (SELECT user_id FROM events GROUP BY user_id HAVING COUNT(*) >= ${$.minEvents})`)
  .cohort("ret", (t, $) => ({
    table: t.eligible,
    user: "user_id",
    at: "ts",
    active: row => row.kind !== "heartbeat",   // runtime: classifies each row
  }))
  .chart("heat", t => wb.chart.heatmap(t.ret)
    .x("period").y("cohort", { type: "ordinal" })
    .color("retention", { scheme: "sequential", format: ".0%" }))
  .chart("curves", t => wb.chart.line(t.ret).x("period").y("retention").color("cohort").rule(0.2, { label: "target" }))
  .view(c => wb.layout.column(
    wb.controls(c.$.plan, c.$.minEvents),
    wb.layout.row(c.heat, c.curves),
    wb.book.note(md => md`Retention for **${c.$.plan}** users with at least ${c.$.minEvents} events.`)))
  .agent(a => a
    .can("set", ["$.plan", "$.minEvents"])
    .can("addStep", { on: ["eligible"], kinds: ["filter", "derive"] })
    .can("addChart")
    .cannot("editSql")                                        // SQL stays human-owned
    .describe("Explore retention by plan. Explain each change in `why`."));

const built = await p.build();
built.listing({ expand: "ret" });   // shows the cohort's expansion as core nodes, with spans into wb.component
// built.ir.node("ret.bucket").value === "month"   (picked at build time from the events' 2-year range)

const env = await wb.env(built);
const s = env.session({ actor: "agent" });
await s.set("$.plan", "team");
await s.editSql("eligible", "…");
// { ok: false, code: "E-AGENT-DENIED", message: 'agent may not "editSql" in program "retention"' }
```

## Assumptions

I assumed the data is small enough to fit in the page, and that the SQL plugin is an embedded engine that reads the program's tables by name (SQLite-like, so `strftime` and `JOIN`), takes `${…}` values as bound parameters, and reports a result schema when the program is built without running the query. I assumed that a build-time lambda may ask for a sample of the data (the `sample` in example 6 and the date range in example 10) but never for param values, and that this phase rule is checked. I assumed that charts use a Vega-Lite-like encoding model, that "fragments" can add both methods and typed attributes to one component kind, and that the agent works only through the Environment's mutation API, under per-program permissions, and never edits builder source. The namespaces (`wb.csv`, `wb.fn`, `wb.step`, `wb.book`), the diagnostic codes and the listing format are made up for illustration.
