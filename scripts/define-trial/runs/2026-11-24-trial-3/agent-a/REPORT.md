# Report: the data-tools language on the Definition API

## 1. Difficulty

2 of 5: the definitions and all ten Programs checked clean within a few runs, and most of the work was deciding how much of the Dream Code is language and how much is host. But the clean check covers only types. It says nothing about what a table step *does*, and that half of the language is plain JavaScript I wrote with no help from the kit.

## 2. Per example

1. **Partly fits.** The source and a 20-row `limit` fit. The view (a rendered grid) is refused with B009 `.view`. Column types are declared on the source, not inferred from the CSV.
2. **Fits.** I had to declare the raw columns as `str`, and `"Unit Price"` can only be renamed: a lambda cannot read it (`row["Unit Price"]` is L009). The typo case gives L002 with a did-you-mean on `revnue` and on `cost`.
3. **Partly fits.** The params and the three filters fit. The view and controls are refused with B009. The date param's value is a number written as `Date.UTC(2026, 0, 1)`, not `"2026-01-01"`. The `from: t => t.sales.distinct("region")` options became the data `{ table, column }`, which is never checked against the table's columns. Both wrong-param cases are caught (L002 and L003).
4. **Partly fits.** The table, the group/agg and the chart fit. The y format reads `$.metric` at build time, so it is folded and does not follow the select. The title is a ternary because template literals are not in the Runtime Subset. The view is refused with B009. `.y(() => $.metric)` is accepted, but nothing checks that the returned string names a column.
5. **Partly fits.** The whole query fits, including the join type check (T001) and `.sort("-total")`. `.limit($.topN)` is folded at build. Pasting SQL is refused with B009 `.sql`. There is no way to recognize SQL *text* passed where a table opens: it is just a ref that fails with B003.
6. **Partly fits, mostly refused.** `.charts(build-time fan-out)` is refused with B009. Because the schema is declared in the file, the Program function loops over it and opens one histogram per numeric column (build-time code, not a build-time lambda). `describe()` is a runtime step rather than a static table. The pivot's quarters must be written out in `expect` because there is no data sample at build time. The phase error has no counterpart.
7. **Refused as written, partly fits as an expansion.** `fragment` is refused with B009. `winsorize` and `zscore` are written out as 5 tables: one-group aggregates under a constant key `k`, joined back. That is a large massage for two one-line methods. The column attributes (currency, unit) and the chart's `.rule` are not expressible.
8. **The Program fits (example 4); the rest is refused.** Inspecting, listing, diffing and tracing the IR are host calls, so no diagnostic applies. The "next" version reopens `monthly`, which is B002.
9. **The Program fits; the session is refused.** The Environment (sessions, the log, undo, commit) is not built. The Program the log describes, once applied, checks clean.
10. **Partly fits.** `component`, `agent` and `view` are refused with B009. The cohort expansion is written out as 5 tables with the bucket fixed to "month", because the build-time choice needs the data's date range. The retention denominator became a join with a cohort-size table. The inline filtered table inside `semiJoin` became its own table. `.rule` and the markdown note are dropped.

## 3. Where the API document misled you

- "Every key is optional except `name`, `numberType`, `spaces`, `targets`, `slots` and `text`." The `defineDialect` key list (lines 40–55) has no `params` key. Yet "Params, and when each is read" says "the Dialect says which object lambdas read the params through … `params: { object: "Params", name: "$" }`". I added it on faith and it was accepted, so the key list is incomplete.
- `list: { … }, queries: [ … ], // optional: members and callback methods on lists` and `conversions` are listed as keys but never described. I could not tell whether `list`/`queries` would give a row lambda list methods (for a `from` list, or `distinct`), so I did not use them.
- The `step` example writes `ctx.error("T001", msg, "tip")`, and a check's `ctx.error` takes `{ suggest }`. I put a did-you-mean in my message *and* passed `suggest`, and got "Did you mean 'revenue'? Did you mean 'revenue'?". The document does not say that `suggest` appends the did-you-mean itself.
- "The record: … `.table("monthly", "sales")` … gives `{ name: "monthly", from: "sales" }`" and, two paragraphs later, "a `name()` with no namespace is the construct's own name, declared in the namespace named after the construct". It took me a moment to see that the record key is `name` while the namespace is `table`. The two rules sit far apart.

## 4. What you guessed

- **Table values are not documented.** A Program's sources are given as a `source` slot `{ csv, header?, columns: { col: type } }`, and a table's `init` reads `program.source[from]`, as the doc's `init` example hints. I chose an explicit schema because nothing can read a file at build time.
- **Column types.** `"f64" | "str" | "date" | "bool"`, with ints as `f64`.
- **A ref that is a data shape inside a state namespace** (`rest(ref("column"))`) resolves against the state. I guessed that `data(oneOf(ref("column"), lambda("text")))` on a chart (no state, with `names`) would resolve the same way. It did.
- **Data-shape `ref("table")` inside a param** (`from: { table: ref("table") }`) resolves against the Program namespace. I could not check its `column` against that table, since params are not a construct with state.
- **The date param's value** is a number (milliseconds) declared with `widget: "date"`. `environment` types it as `date`.
- **String options type as `str`**, not `enumOf`, so `row.region === $.region` and `$.metric === "revenue"` both type.
- **A function-bodied Program** (`($) => { let p = …; for (…) p = p.chart(…); return p; }`) counts as "the Program's own `($) => …`", not a build-time lambda (example 6). The checker accepted it.
- **Steps without a lambda** (`cast`, `trim`, `rename`, `join`, `sort`, `pivot`, `describe`) report their own column errors from `step` with `ctx.error` (letter T). `sort("-x")` is a string and is checked in `step`, not as a `ref("column")`, because a ref cannot strip the `-`.
- **Nulls.** Columns are not `opt(...)`, and `dropNulls` does not change a type. I did not know how a CSV null should appear in a lambda's types.
- **A chart's text-valued lambdas** (`y`, `title`) run in a pure `chart` space with no params, reading `$`.
- **Target.** One target, `js` with `exact()`, accepting every space. There is no GPU in this language.

## 5. What you needed and did not have

Smallest first:

1. **A convention whose return is a member of a namespace.** `returns: ref("column")` or an enum built from the state, so `.y(() => $.metric)` is checked to name a column (example 4).
2. **A way for `step` to see the param declarations' types and options**, or for the param slot's `check` to see a table's columns, so `from: { table, column }` is checked (examples 3 and 10).
3. **Bracket access with a string literal** (`row["Unit Price"]`), treated as a member read, for columns that are not identifiers (example 2).
4. **A param value converter**, so a date param can be declared as `"2026-01-01"` and reach lambdas as a `date` (example 3).
5. **A string-building operation in lambdas** (template literals or a declared `concat`), for runtime titles (example 4).
6. **Opening a table with an inline sub-table** (`semiJoin(t.plans.filter(…))`) rather than naming every intermediate, or anonymous tables (examples 7 and 10).
7. **Reusable steps (fragments or macros)** that expand to calls, with the caller's span (examples 7 and 10). Without them, winsorize/zscore and the cohort cost about 5 tables each.
8. **A reference implementation for steps, not only for intrinsics.** `ref` exists for an intrinsic, but `cast`, `join`, `groupBy`, `pivot`, `sort`, `limit` and `dropNulls` have no place to say what they do. The kit types every step and runs none of them (all examples).
9. **Build-time lambdas that see a data sample or a schema read from the file**, for the inferred schema, the pivot's distinct values, `describe()` as a static table and the cohort bucket (examples 1, 6 and 10).
10. **Composite views and layout, layered marks (`rule`), and the Environment's mutation log with agent permissions** (examples 1, 3–10).

## 6. Gaps in the kit

- **No integer type.** `units` and `count()` are `f64`, so `orders: "int"` and `.limit()` lose their integer meaning.
- **No table semantics.** The kit has no notion of a table, a step or a row set. Joins, grouping, sorting, deduplication and casting exist only as types threaded by my `step`; nothing compares a target's result for them.
- **No window or cross-row operations in a lambda** (`first("users", { cohort, period: 0 })`, `stats.mean(column)` inside a row lambda). They have to become joins.
- **No dynamic member access** (L009). Column names must be identifiers.
- **No string building** in the Runtime Subset (no template literals).
- **No effects or Environment** (examples 9 and 10), **no fragments or mixins** (example 7), **no build-time slots** (examples 6 and 10), **no layout or rendering** (every view). All of these are listed as not built.
- **No null in column types by default.** `opt` exists, but CSV nulls and `dropNulls` need a type that changes from `opt(T)` to `T` at a step. I did not model that.
