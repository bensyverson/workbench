# Report: the data-tools Dream Code on the draft Definition API

*Saved by the main thread from agent B's hand-back: the harness refused agent B's own write of this file. Text as returned.*

## 1. Difficulty

**4 of 5.** The core table pipeline went through, but only after I changed the language in three ways the Dream Code did not want: sources must declare their columns, every `derive` and `agg` must state its result type, and each aggregate is its own call. Beyond that, half the examples are mostly outside the draft: views, build-time lambdas, fragments, IR tooling and the agent session.

## 2. Per example

- **01** partly fits. The source fits, and `head(20)` became a table with `.limit(() => 20)`. Not expressible: inferring types from the CSV, `.view`, `built.schema()` and `run()`.
- **02** fits. The changes: the raw columns are declared and `derive` takes a type (`.derive("revenue", "number", row => …)`). The typo is caught by the kit's L002, but the draft does not promise the list of columns the Dream Code shows.
- **03** partly fits. The three filters fit. The select's `from: t => t.sales.distinct("region")` became data (`selectFrom: { table, column }`). Dates are f64 days. `.view`, controls and grid are refused.
- **04** partly fits. The group, aggregate and chart fit. `y` follows the param as `{ param: "metric" }`. Not expressible: a `format` that depends on the param (a lambda inside a declaration argument), the template-string title, and `.view`.
- **05** partly fits. The filter, join, groupBy, agg, sort and limit all fit. `.limit($.topN)` became `.limit(() => $.topN)`. The year select is an f64 with options, because `enumOf` takes strings only. A bad table name gives B003 and a join-key type mismatch gives my W005. Pasted SQL hits B003 first; my W002 SQL check only runs at build time, and its rewrite fixit is out of reach. `.view` is refused.
- **06** mostly refused. The source and the histograms, written out by hand, fit. The schema fan-out, `describe()` and the pivot are refused: each is a build-time lambda or a schema that depends on the data.
- **07** refused (fragments). It holds a hand expansion of winsorize and zscore, built from one-group aggregates joined back on a constant key. Column attributes (`currency`, `unit`) and `chart.rule` have no form.
- **08** refused. Nothing in the draft covers IR inspection: listing, lineage, downstreamOf, diff, toJSON.
- **09** refused (the Environment session). It holds the Program that `s.toProgram()` would propose. There is no place for a step's `why`.
- **10** partly fits. The cohort component is written out by hand as five tables, with the bucket fixed at "month". Rejected entries refuse the component, the rule, the view with its book note, and the agent permissions.

## 3. Where the draft misled me

- *"`returns: "infer"` takes the type of what the body returns."* together with *"`environment(program)` … may compute anything from the record: a table's columns after each step."* I took these to mean that a derived column's type could be inferred. It cannot. `environment` sees only the record, and the record holds the lambda's **source text**, not its inferred type. So after `.derive("revenue", row => row.units * row.price)` the next step's row type is unknown. "Infer" works for the slot that returns the value and for nothing downstream of it. I added a type argument to `derive` and `agg`.
- *"`program("p").table("a", "raw").derive(…).table("b", "a")…`"* This line suggests that tables chain naturally. But the record for a child construct with two openers is not specified. The draft says *"The opening arguments, under their namespace or `name`"*, so `opens: [name("table"), ref("table")]` would put both under the key `table`. I had to guess `{ name, from }` and wrote an `opened()` helper that tries both.
- *"`ref` is `{ id, kind, on, key }` … its leading name argument or index"*. "Index" of what is never said: among all calls, or among this slot's calls? A per-step row type depends on the answer. `derive("cohort")` after `agg("cohort")` in example 10 shows that the key alone is ambiguous.
- *"Children: a list of their records under the child's name."* and *"`record: "calls"`"*. It is not said whether a child construct's calls are interleaved in the parent's `calls`. For that reason I did not make `groupBy` a child construct with its own `agg` methods, which would have been the natural fit, and kept `agg` as a table step with an ordering check (W003).
- The worked example made `.y("name", { sort: "-x" })` look easy. But the argument spec table has no optional argument. I used `rest(data(EncodingOptions))` for "zero or one options object", which is a misuse of `rest`.

## 4. What I guessed

- The record's shape for a table: `{ name, from, calls: [{ slot, args }] }`. For a lambda call I guessed that its `src` is the last element of `args`. For a chart I guessed `{ table, …slots }`, with a fallback.
- `ref.key` for a lambda slot with no name argument is the index among that slot's calls on the same construct instance. For a slot whose leading argument is `data("string")` rather than `name()`, I guessed the key is still that string.
- `ref.on` is the construct instance's record (with `calls`) as built so far.
- `environment` may add **new** objects, not only members of existing ones. I add `Row_<table>_<i>` and `Group_<table>_<i>`, one per step.
- A slot convention function may return a convention whose `params` name an object that `environment` adds. I assumed the two run in that order.
- `rest(data(shape))` after `data("string")` means optional trailing options.
- `enumOf` from `kit/define` is also a grammar shape. The draft lists it under both, so I took it to be one helper.
- `recordOf` is exported from `kit/define`. The import line in the draft omits it, but the shapes table names it.
- Dates are f64 days since 1970-01-01 UTC, and a `date` param's string value is parsed to that number by the language.
- String `===` / `!==` is in the Runtime Subset, and so is `||` on bools.
- A rejected method, when called, raises B001 with the rejected message. My `// REFUSED: B001 (rejected "view")` lines rest on that guess.
- In a slot `check`, `ctx.program.table` at call time already holds the current table with its calls so far. This is how my column checks find "the table as it stands".

## 5. What I needed and did not have (smallest first)

1. **`recordOf` in the documented import list** (02, 05). It is listed as a shape but missing from `import { … } from "kit/define"`.
2. **Optional declaration arguments**, e.g. `opt(data(shape))` or `"min?"` at argument level (04, 05, 06, 10: `.x("month", { type: "time" })`).
3. **Naming the record key of an opener** (`as` on an opens spec), so `name("table"), ref("table")` lands as `{ name, from }` (every example with a table).
4. **A specified `ref.key` / step index for lambdas on a `record: "calls"` construct**, ideally `ref.index` (the call's position in `calls`) (every derive, filter and agg).
5. **Numeric enums** in shapes and types, e.g. `enumOf([2024, 2025, 2026])` (05).
6. **A way for `environment` to read a lambda's inferred type**, such as an `inferred(ref)` callback, or a two-pass contract where `environment` runs again after each lambda is typed. Without it, every `derive`/`agg` needs a hand-written type (02, 04, 05, 07, 09, 10). This is the largest gap that the API, not the kit, could close.
7. **Runtime values in declaration arguments.** `.limit($.topN)`, a chart `format` that follows a param, `.y(() => $.metric)`. I needed either a "lambda or data" argument spec or a `paramRef()` spec (04, 05). I turned `limit` into a zero-argument lambda slot, which makes `.limit(10)` read as `.limit(() => 10)`.
8. **A path in `ctx.error`'s `arg`** (e.g. `[1, "on", "customer_id"]`), so a check can point inside an object argument (05's join key error).
9. **A multi-edit or rewrite fix** in `ctx.error`, to support 05's SQL rewrite fixit.
10. **A check that runs before `ref()` fails**, or a `ref` fallback hook. Pasted SQL as a table's `from` gets "no table 'SELECT …'" (B003) instead of the SQL diagnostic (05).
11. **Child constructs whose calls are interleaved in the parent's ordered `calls`**, so `groupBy(…)` can open a grouping whose `agg` methods exist only there (04, 05, 07, 10).
12. **A lambda that sees another table**, e.g. a scalar lookup or a per-table stats object: zscore's `stats.mean(column)`, the cohort's `first("users", { … })` (07, 10). I had to fake it with a constant key and a join.

## 6. Gaps in the kit

- **No date type.** Dates are f64 day counts. Comparison works, but there is no literal, no display, no time zone, and the `date` param's value is a string that only my language knows how to convert. (01, 02, 03, 04, 05, 10)
- **No integer type.** `count()`, `countDistinct`, `topN` and `period` are f64, and `limit` cannot require a whole number at the type level. (04, 05, 10)
- **Nulls.** CSV columns can be null and `dropNulls` should change a column from `opt(T)` to `T`. I left nullability out entirely: every column is non-null in the row type, which is wrong before `dropNulls`. (02)
- **Build-time phase.** There is no build-time phase (by design for now). It is needed for a schema fan-out, a pivot whose columns come from the data, `describe()`, and choosing a bucket from the data's range (06, 10). Related: `environment` never sees the data, so column types cannot be inferred from a CSV (01).
- **Views, layout, controls, book notes.** These are rendering, which R8 excludes. Every example has a view.
- **Fragments and components** (07, 10). Their absence is why 07 and 10 are hand-expanded.
- **Effects and mutation**: the agent session and its event log (09, 10). The kit's "Environment" name also collides with this example's `wb.env`.
- **String building** in lambdas: template-string titles and formats (04, 10).
- **IR tooling**: listing, lineage, downstream-of-a-param and diff (08). Lineage would need each lambda's free names, and `environment` and checks receive only source text.
- Queries (`list`/`queries` in the Dialect) were not needed. All list-like work happens at the table level, between lambdas, which the draft's lambda model covers only per row and per group.
