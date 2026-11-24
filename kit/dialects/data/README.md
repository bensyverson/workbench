# The data Dialect

The third Dialect: tables of typed columns, cleaned, derived, filtered, grouped and joined, from the [data-tools Dream Code](../../../project/2026-11-24-data-tools-dream-code.md). It is H2's first Dialect with a row Iteration Space, strings and dates. Its Runtime Lambdas are pure (a row to a value, a group to a value, the params to a value), so it tests no effects and no stores. It is declared through the [Definition API](../../define/README.md), starting from dogfood trial 2's agent A ([its hand-in](../../../scripts/define-trial/runs/2026-11-24-trial-2/agent-a/), [the trial's findings](../../../project/2026-11-24-definition-api-trial-2.md)). This is the Dialect half, plus only as much Grammar as examples 2 to 5 need to build a record; the full Grammar is a later leaf.

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
- `grammar.js`: the `defineGrammar` call, as far as the examples need. `program(name)` takes `source` (a name and a schema), `param`, `fn` and `const`; `table(name, from)` builds a table call by call from a source or a table; `chart(name, table)` takes a mark and its encodings. A table's construct state is `{ columns, keys }`: `init` reads the source's schema or the other table's final state, and `step` follows each call (`rename`, `cast`, `derive` with its lambda's inferred type, `groupBy`, `agg` with each aggregate's inferred type, `join`). A join reads the other table's columns through `step`'s context (`ctx.stateOf`, `ctx.program`) at the step where it happens.
- `examples/`: the Dream Code's examples 2 to 5 as builders (each file's comment lists what changed from the Dream Code). `test/examples.test.js` lowers them, runs some Kernels on sample rows in the interpreter and as emitted JS, and checks the Dream Code's mistakes.

## The language

**Columns and types.** A schema names each column's type: `f64`, `str`, `bool` or `date`. There is no integer type: a whole number is an f64, and `"int"` is T001 with the fix `"f64"`. A `derive` adds a column of the type its lambda infers, an `agg` keeps the group keys and adds one column per aggregate. Columns are never optional: `dropNulls` changes no type, and a lambda cannot test a column for null (see Limits).

**Dates.** `date` is a nominal scalar stored as an f64, milliseconds since 1970 UTC ([kit/ir](../../ir/README.md#nominal-scalars-m3)). Two dates compare (`row.date >= $.since`); nothing else takes one but the intrinsics. `dateOf(y, m, d)` makes one, the month counted from 1 (`dateOf(2026, 1, 1)`); D007 keeps the type's own name from being a constructor. A date param is `{ value: "2026-01-01", kind: "date" }` and reads as `$.since: date`; how the host turns its string into milliseconds is the host's.

**Intrinsics.** `dateOf`, `year`, `month` (1 to 12), `truncMonth` (the first of the month), `monthDiff(a, b)`, and `min`, `max`, `abs`, `round` on f64. JS only: the only target is `js`, compared exactly.

**Params.** `$.name`: a number param is an f64, a toggle a bool, a date param a date, any other a str (a select of strings is a str, not an enum, so it compares with a column's str).

**Codes.** Lambda errors keep lowering's codes: an unknown column is L002 with a did-you-mean (`row.revnue`), comparing a str with an f64 is L003 (`row.region > $.minUnits`). An unknown table or column in a call is B003 with a did-you-mean. The Dialect's own: **T001** a schema or cast names a type that is not a column type; **T002** a sort column with a leading `-`, fix `.sortDesc("total")`; **T003** a join key or a taken column that is not a column of its table; **T004** join keys of two types (the Dream Code's E-JOIN-TYPE); **T005** a table whose source reads as SQL text. `.sql(…)` and `.view(…)` are refused as B009.

## What became of the Dream Code

Built: every runtime lambda of examples 2 to 5 (the derive, the three filters, the two derives, three aggregates and two chart encodings, the filter, two aggregates and the limit), and their mistakes: `row.revnue` (L002 with "revenue"), `$.minUnit` (L002), `row.region > $.minUnits` (L003), `join("customer")` (B003 with "customers"), a join on keys of two types (T004), pasted SQL (T005).

Changed in the examples, as the kit builds them: a source declares its schema (no inference from the CSV); `"int"` is `"f64"` (T001 otherwise); `.table("sales", t => t.raw…)` is `.table("sales", "raw")…`; `wb.fn.truncMonth` is the bare intrinsic; `dropNulls(["date", "units"])` takes the columns as arguments; `.sort("-total")` is `.sortDesc("total")` (T002 otherwise); `.limit($.topN)` and the chart's `format` are lambdas, since a value computed from `$` outside a lambda means nothing.

Left out, with no diagnostic of the Dialect's own: a select's options `from` a build-time lambda; `.title` with a template literal (no slot; template literals are not in the Runtime Subset); `wb.controls`, layouts and grids (`.view` is B009); `built.schema(…)` and `.run()` (read `states` from `lower`); chart encodings checked against the table (`.x("monht")` is not caught: a chart has no state); the inferred result types `int` (counts are f64).

## Limits

- **The IR carries little of this Dialect's meaning.** Of the 21 table calls in examples 2 to 5, 10 hold a Runtime Lambda, and of those only the derives, filters and the limit are whole computations; an aggregate's Kernel is one call to the group's host method (`g.sum("revenue")`). `rename`, `cast`, `trim`, `replace`, `dropNulls`, `dedupe`, `groupBy`, the grouping and summing of `agg`, `join`, `sort` and every chart encoding are not Kernels: their types live in the Grammar's `step`, and nothing in the kit runs them.
- **No nullable columns.** A column is never `opt(…)`, so `dropNulls` narrows nothing. Lowering can narrow an optional by `x !== null` (a date at the epoch stays present), but this Dialect does not give its lambdas optionals yet; a host must give null, never undefined, for an empty value when it does.
- **No string building.** A lambda cannot concatenate a str with a template literal; `+` on strings is lowering's `concat`.

## What this Dialect found in the core

Recorded for H2. This Dialect needed **no change** to the core IR, lowering or the backends itself. Two changes landed just before it, at Ben's rulings, for it: an explicit null check narrows an optional (`kit/lower/nullcheck.js`; the IR's `present` takes any optional, and the JS backend spells it `x != null`, so 0 is present), and a Dialect may let its constants call pure helpers (`constants: { calls: "pure" }`, a Definition API key). Its gaps are the core language's: no integer type, no date literal (an intrinsic stands in), no string building.
