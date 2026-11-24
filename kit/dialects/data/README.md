# The data Dialect

The third Dialect: tables of typed columns, cleaned, derived, filtered, grouped and joined, from the [data-tools Dream Code](../../../project/2026-11-24-data-tools-dream-code.md). It is H2's first Dialect with a row Iteration Space, strings and dates. Its Runtime Lambdas are pure (a row to a value, a group to a value, the params to a value), so it tests no effects and no stores. It is declared through the [Definition API](../../define/README.md), starting from dogfood trial 2's agent A ([its hand-in](../../../scripts/define-trial/runs/2026-11-24-trial-2/agent-a/), [the trial's findings](../../../project/2026-11-24-definition-api-trial-2.md)). Its Grammar covers the Dream Code's examples 1 to 7: each runs through the generated builder as the kit writes it, and each part the kit does not build is refused with a code and a fix ([below](#what-became-of-the-dream-code)).

```js
import { program } from "./index.js";

const record = program("top-customers")
  .source("orders", { csv: "data/orders.csv", columns: { customer_id: "f64", placed_at: "date", amount: "f64" } })
  .source("customers", { csv: "data/customers.csv", columns: { id: "f64", name: "str" } })
  .param("year", { options: [2024, 2025, 2026], value: 2026 })
  .table("top", "orders")
  .filter((o) => year(o.placed_at) === $.year)                 // o is typed from the orders schema
  .join("customers", { on: { customer_id: "id" }, take: ["name"] })
  .groupBy("name")
  .agg({ total: (g) => g.sum("amount") })                      // g's sum takes only a numeric column of this step
  .build();
const { lambdas, diagnostics, states } = program.lower(record); // states.top.columns: { name: "str", total: "f64" }
```

## Files

- `index.js`: what to import: `data` (the Dialect value), `program` (the builder), `INTRINSICS`, `COLUMN_TYPES`.
- `dialect.js`: the `defineDialect` call: the `date` scalar, the `row`, `group` and `calc` spaces, `$` and the `environment` hook that types each param, the intrinsics, and the slot conventions. `row` and `pred` give a lambda one parameter, the row, an object whose members are the table's columns at that step (`pred` returns a bool, `row` infers); `group` gives it the group, whose aggregates are keyed methods over the columns at that step; `calc` gives no parameter, only `$`.
- `grammar.js`: the `defineGrammar` call. `program(name)` takes `source` (a name and a schema), `param`, `fn` and `const`; `table(name, from)` builds a table call by call from a source or a table; `chart(name, table)` takes a mark and its encodings; `view(name, table)` shows one table's rows, with an optional `.head(n)`. A table's construct state is `{ columns, keys }`: `init` reads the source's schema or the other table's final state, and `step` follows each call (`rename`, `cast`, `derive` with its lambda's inferred type, `groupBy`, `agg` with each aggregate's inferred type, `join`). A join reads the other table's columns through `step`'s context (`ctx.stateOf`, `ctx.program`) at the step where it happens. `semiJoin(other, { on })` checks its keys as a join does and keeps the columns; `keepGroups(key, (g) => …)` keeps the columns and wants a bool. A chart's state is its table's final columns, so its encodings (`x`, `y`, `color`, `tooltip`) are state refs, checked when lowered. The names the kit refuses are each construct's `rejected` (B009).
- `examples/`: the Dream Code's examples 1 to 7 as builders (each file's comment lists what changed from the Dream Code). `test/examples.test.js` lowers 2 to 5, runs some Kernels on sample rows in the interpreter and as emitted JS, and checks the Dream Code's mistakes; `test/grammar.test.js` covers 1, 6 and 7, views, chart encodings, `semiJoin` and `keepGroups`, and every refusal.

## The language

**Columns and types.** A schema names each column's type: `f64`, `str`, `bool` or `date`. There is no integer type: a whole number is an f64, and `"int"` is T001 with the fix `"f64"`. A `derive` adds a column of the type its lambda infers, an `agg` keeps the group keys and adds one column per aggregate. Columns are never optional: `dropNulls` changes no type, and a lambda cannot test a column for null (see Limits).

**Dates.** `date` is a nominal scalar stored as an f64, milliseconds since 1970 UTC ([kit/ir](../../ir/README.md#nominal-scalars-m3)). Two dates compare (`row.date >= $.since`); nothing else takes one but the intrinsics. `dateOf(y, m, d)` makes one, the month counted from 1 (`dateOf(2026, 1, 1)`); D007 keeps the type's own name from being a constructor. A date param is `{ value: "2026-01-01", kind: "date" }` and reads as `$.since: date`; how the host turns its string into milliseconds is the host's.

**Intrinsics.** `dateOf`, `year`, `month` (1 to 12), `truncMonth` (the first of the month), `monthDiff(a, b)`, and `min`, `max`, `abs`, `round` on f64. JS only: the only target is `js`, compared exactly.

**Params.** `$.name`: a number param is an f64, a toggle a bool, a date param a date, any other a str (a select of strings is a str, not an enum, so it compares with a column's str).

**Codes.** Lambda errors keep lowering's codes: an unknown column is L002 with a did-you-mean (`row.revnue`), comparing a str with an f64 is L003 (`row.region > $.minUnits`). An unknown table, a view's table, or a column a call names as a ref (`trim`, `replace`, `dropNulls`, `dedupe`, `groupBy`, `sort`, `keepGroups`, and a chart's `x`, `y`, `color`, `tooltip`) is B003 with a did-you-mean; a table's is found by `.check()`, a column's only by `lower` (state refs need the state). The column names in a `cast` or `rename` map and in a join's `on` and `take` are data, not refs, so the Dialect checks them itself (T009, T003). The Dialect's own codes: **T001** a schema or cast names a type that is not a column type; **T002** a sort column with a leading `-`, fix `.sortDesc("total")`; **T003** a join or semiJoin key, or a taken column, that is not a column of its table; **T004** join keys of two types (the Dream Code's E-JOIN-TYPE; a key whose type a derive inferred, such as an enum of string literals, is not compared); **T005** a table whose source reads as SQL text; **T006** a source with no `columns` (no types are inferred from a CSV), with the schema to declare; **T007** a view given a lambda (layout) or no table, fix `.view("name", "table")`; **T008** a `keepGroups` lambda that does not give a bool; **T009** a `cast` or `rename` of a column the table does not have at that step, with the did-you-mean (it adds no column); **T010** a step that would give two columns one name: a rename onto a column the table keeps, or a join that takes a column the table already has (the table's own is kept; by default a join takes only the columns the table lacks). Names the kit does not build are B009, each with a fix in its tip (below).

## What became of the Dream Code

Every example runs through the generated builder as its `examples/` file writes it; what the Dream Code wrote that the kit does not build is refused, each refusal with a fix (its tip; a B009 carries no `fix` field, see the last list).

| Example | Runs as | Refused, and with which code |
|---|---|---|
| 1 First look | `01-first-look.js`: a source with its schema, `.view("first", "sales").head(20)` | a source without `columns`, T006; `.view(t => …)`, T007; `.run()`, `.schema(…)`, B009 |
| 2 Clean | `02-clean.js`: every step and the derive | `.cast({ units: "int" })`, T001 with `"f64"`; `row.revnue`, L002 with "revenue" |
| 3 Params | `03-params.js`: three params, three filters | `$.minUnit`, L002; `row.region > $.minUnits`, L003; a select `from` a build-time lambda, B004 (its shape has no `from`); `.layout`, `.controls`, `.grid`, B009 |
| 4 Group and chart | `04-group.js`: derives, groupBy, agg, a line chart | `.x("monht")`, B003 with "month" (at `lower`); `.title(…)`, B009 |
| 5 Query | `05-query.js`: filter, join, groupBy, agg, sortDesc, limit, a bar chart, a view | `join("customer")`, B003; keys of two types, T004; `.sort("-total")`, T002 with `.sortDesc("total")`; pasted SQL, T005; `.sql(…)`, B009; `.layout`, B009 |
| 6 Profile | `06-profile.js`: one histogram per numeric column, the profile as one `agg`, the pivot in long form | `.charts(…)` (build-time fan-out), `.describe()`, `.pivot(…)`, `.layout`, B009 |
| 7 Fragments | `07-outliers.js`: the winsorize as a derive between two params, a histogram | `.fragment(…)`, `.column(…)`, `.rule(…)`, `.quantiles(…)`, B009; `.winsorize(…)`, B001 (thrown at once, as every unknown method is) |

Beyond the seven, B009 also refuses examples 9 and 10's agent permissions (`.agent`), program-editing mutations (`.env`, `.session`, `.addStep`, `.addTable`, `.addChart`, `.editSource`, `.set`, `.undo`), new components (`.component`) and rendering (`.render`, `.vegaLite`, `.layer`). The Builder gaps the Dream Code lists are built: `year` and the date parts are intrinsics, `join(other, { on, take })`, `semiJoin(other, { on })`, `keepGroups(key, (g) => …)`; `sort("-col")` is T002. A lambda that reads a local variable is B008, with the fix (a `.const` or a param).

Changed in the examples, as the kit builds them: a source declares its schema; `"int"` is `"f64"`; `.table("sales", t => t.raw…)` is `.table("sales", "raw")…`; `wb.fn.truncMonth` is the bare intrinsic; `dropNulls(["date", "units"])` takes the columns as arguments; `.sort("-total")` is `.sortDesc("total")`; `.limit($.topN)` and the chart's `format` are lambdas, since a value computed from `$` outside a lambda means nothing; a chart is `.chart(name, table).mark(…)`, not `wb.chart.line(t.monthly)`.

Left out, and why:
- **Views are one table's rows.** A view of a chart, and any layout of several, is the page's; a chart is shown by itself.
- **Chart encodings are checked only by `lower`.** A slot or construct check cannot see construct state, so the chart has a state (its table's columns) only to make its encodings state refs; `.check()` and `.build()` do not catch `.x("monht")`. An encoding given as a lambda (`.y(() => $.metric)`) picks a column at run time and is not checked against the table at all.
- **No build-time phase**, so nothing of example 6's E-PHASE: there is no build-time lambda for a param to leak into.
- **Example 7's z-score**: a row lambda sees one row, not the table's mean and spread, and the Dialect has no square root.
- **`int` result types**: counts are f64.
- **B009 has no `fix`**: a construct's `rejected` takes `{ message, tip }` only, and a step's `ctx.error` takes a tip, not a fix, so T003, T004, T008, T009 and T010 carry their fix in `tip` too.

## Limits

- **The IR carries little of this Dialect's meaning.** Of the 21 table calls in examples 2 to 5, 10 hold a Runtime Lambda, and of those only the derives, filters and the limit are whole computations; an aggregate's Kernel is one call to the group's host method (`g.sum("revenue")`). `rename`, `cast`, `trim`, `replace`, `dropNulls`, `dedupe`, `groupBy`, the grouping and summing of `agg`, `join`, `sort` and every chart encoding are not Kernels: their types live in the Grammar's `step`, and nothing in the kit runs them.
- **No nullable columns.** A column is never `opt(…)`, so `dropNulls` narrows nothing. Lowering can narrow an optional by `x !== null` (a date at the epoch stays present), but this Dialect does not give its lambdas optionals yet; a host must give null, never undefined, for an empty value when it does.
- **No string building.** A lambda cannot concatenate a str with a template literal; `+` on strings is lowering's `concat`.

## What this Dialect found in the core

Recorded for H2. This Dialect needed **no change** to the core IR, lowering or the backends itself. Two changes landed just before it, at Ben's rulings, for it: an explicit null check narrows an optional (`kit/lower/nullcheck.js`; the IR's `present` takes any optional, and the JS backend spells it `x != null`, so 0 is present), and a Dialect may let its constants call pure helpers (`constants: { calls: "pure" }`, a Definition API key). Its gaps are the core language's: no integer type, no date literal (an intrinsic stands in), no string building.
