# Report: the data-tools Dream Code on the draft Definition API

## 1. Difficulty

**4 of 5.** The definition checks, but only because I moved the language's hardest parts into plain-JavaScript `environment` and slot-convention functions written against record details the draft does not specify, and added a type argument to every `derive` and `agg` that the Dream Code never needed; three of the ten examples are mostly refused.

## 2. Per example

1. **Partly fits.** Source and "first 20 rows" as a table fit; the view (a grid) is refused (R8); column types are declared, not inferred from the CSV.
2. **Partly fits.** Every step fits; `.cast` cannot name `date` or `int`; `.derive` needs an explicit `"f64"`. The typo diagnostics come from the kit (`L002`), so the Dream Code's "columns: …" list is not mine to add.
3. **Partly fits.** Params and filters fit; the select's `from: t => t.sales.distinct("region")` became data (`distinctOf: { table, column }`); the date param is a `str`; the controls/grid view is refused.
4. **Partly fits.** Table, groupBy, aggregates and chart fit; `agg({...})` became one `.agg(name, type, g => …)` per aggregate; `y(() => $.metric)` became `.y({ param: "metric" })`; the conditional format became a separate `.format("y", () => …)` lambda; the title template literal became nested `concat` calls; the view is refused.
5. **Partly fits.** The query fits (filter, join, groupBy, agg, sort `-total`, limit by param); `.limit($.topN)` became `.limit({ param: "topN" })`; the SQL check fires only after a `B003` from `ref("table")` and cannot produce the rewrite fixit; the join-key type check is possible but not written; the view is refused.
6. **Mostly refused.** The histogram fan-out and the sampled pivot are build-time lambdas (R8). Kept: `.describe()` as a built-in step with a fixed schema, and the pivot with its quarters written out by hand.
7. **Mostly refused as written.** Fragments are refused (R8); the Program fits only because I made `winsorize`, `zscore`, `column(attrs)` and the chart `rule` built-in steps. `zscore` as a row lambda needs whole-column stats, which nothing in the draft provides.
8. **Refused** (IR inspection, listing, lineage, diff are not builder grammar). Kept: the "next" version of example 4; the added filter has to go in a second table, since a table cannot be reopened.
9. **Refused** (Environment, sessions, mutations, log, undo: effects, outside the draft). Kept: the Program `s.toProgram()` would return.
10. **Mostly refused.** The custom `cohort` component, its build-time bucket, the agent hook, book note and view are refused. Kept: the `eligible` table (semiJoin via a helper `onPlan` table, keepGroups, select).

## 3. Where the draft misled me

- *"A convention may also be a function `(ref, program) => convention`, for languages where a lambda's parameter types depend on the Program (a row whose columns come from a table)."* This suggests the row-typed-by-table case is solved. It is only half solved: a table's columns change at every step, and the step after a `derive` needs the type the derive's body returns. That type is known only after lowering, but `environment(program)` and the convention function run before it, on the record. I had to make the author write the type (`.derive("revenue", "f64", row => …)`, and the same for `.agg`).
- *"`ref` is `{ id, kind, on, key }`: … its leading name argument or index."* "Index" of what: of calls to this slot, of all calls in `on.calls`, or of lambda slots? I need the call's position in `on.calls` to know the step's columns, and had to guess (I search `on.calls` for the slot and key, or count calls of the slot).
- *"names declared with `name("table")` anywhere in the Program are what `ref("table")` accepts."* Namespaces are program-global, so I could not use `name("column")` for derived or aggregated columns: example 4 derives `revenue` and then aggregates into `revenue` (B002), and two tables may each have a `month`. Columns are per table and per step; the namespace mechanism has no scope. All column references fell back to `data("string")` plus hand-written checks that replay the schema.
- *"The opening arguments, under their namespace or `name`."* With `opens: [name("table"), ref("table")]` (the obvious way to write `.table("monthly", "sales")`) both arguments land under the key `table`. I used `[name(), ref("table")]` and guessed that `name()` in construct `table` declares into namespace `table` (otherwise sources and tables could not refer to each other).

## 4. What I guessed

- `name()` with no namespace declares into the namespace named after the construct, so `ref("table")` sees both `.source(...)` names (`name("table")`) and table names.
- In a `record: "calls"` construct, a lambda call's `args` are the leading declaration arguments followed by the lambda's source text.
- `ctx.program` inside a slot `check` includes the table being built, with its calls so far, as the last entry of `program.table`; my column checks read it to replay the schema.
- `ref.key` for a lambda whose leading argument is `data("string")` (not `name()`) is still that string; with no leading argument, it is the index among calls of the same slot.
- Object names created by `environment` (`Row_monthly_3`, `Group_monthly_3`) may be returned as `params` type names from a convention function, though they are not declared statically.
- `rejected` names on the root construct are also rejected on child builders (children inherit parent methods), and a rejected name reports as `B001` with my message (the draft gives no code); that is what I wrote after `// REFUSED:`.
- `opens` may include a `data(...)` argument (the chart's mark), and a decl slot may have `args: []` (`.describe()`).
- `recordOf` is exported from `kit/define`; `oneOf` with object shapes whose required keys differ discriminates correctly; `"string"` as one branch of `oneOf` is allowed.
- `enumOf` serves both as a type (in `environment`) and as a shape (in `data(...)`).
- The dialect file may export a helper (`schemaOf`) besides `data`, so the grammar's checks and the environment share one schema replay.
- `===`, `||`, and string comparison (`row.date >= $.since`) are in the Runtime Subset and type-check on `str`.
- A slot convention with `params: []` (title and format lambdas) is allowed, and a pure space `run`, evaluated once per run, is a legitimate Iteration Space; so is `group`, once per group.
- Optional trailing declaration arguments do not exist, so `.winsorize("price", { lo, hi })` and `.rule(3, { label })` require their option object.
- A number param with a `max` gets `size: true`, copied from the fields example.
- Codes for my checks start with `W` (the obvious letter, `D`, is the kit's).

## 5. What I needed and did not have (smallest first)

1. **An error code for `rejected` entries** (every refusal file): I wrote `B001` by guess.
2. **Optional trailing declaration arguments** (`minArgs` on decl slots): `.y("name", { sort: "-x" })` vs `.y("name")` (ex. 5), `.winsorize("price")` (ex. 7), `.rule(3)`.
3. **A `ref` inside a data shape**, e.g. `{ param: ref("param") }` or `{ table: ref("table"), column: "string" }`: `.limit({ param: "topN" })` (ex. 5), `.y({ param: "metric" })` (ex. 4), `distinctOf` (ex. 3, 10). Today each needs a hand-written check.
4. **A spelling for `rest` arguments** (`$...`): a variadic `concat` for the title (ex. 4) had to be a nested two-argument call.
5. **A precise `ref` for convention functions**: the call's index in `on.calls` (or the call itself), stated, not "its leading name argument or index" (every derive/filter/agg).
6. **A slot that takes a map of lambdas**, e.g. `args: [recordOf(lambda("agg"))]`: `.agg({ revenue: g => …, units: g => … })` (ex. 4, 5, 9, 10).
7. **A slot that is either data or a lambda**: `.y("name")` and `.y(() => $.metric)` in one slot; `.limit(10)` and `.limit($.topN)` (ex. 4, 5).
8. **Scoped namespaces**: something like `name("column", { scope: "table" })` / `ref("column")` that resolve against the current table at the current step, with "did you mean" for free (ex. 2, 4, 5, every `groupBy`, `sort`, `select`, `tooltip`, chart encoding). This is the biggest saving: most of my check code is this, and charts still have no column check because I stopped writing them.
9. **Inferred lambda result types available to later steps**: a staged environment, or a `returns: "infer"` whose result feeds the next step's row type, so `.derive("revenue", row => …)` needs no type argument (ex. 2, 4, 5, 8, 9; also agg result types).
10. **Schema inference from data at build time**, or an async environment that can read a sample: `wb.csv(...)` with types inferred (ex. 1–10 all declare columns by hand).
11. **A whole-column / window context for row lambdas** (mean and sd of a column, a lookup into another row): `zscore` (ex. 7) and `first("users", { cohort, period: 0 })` (ex. 10).
12. **Fragments, custom components, build-time lambdas, effects (Environment mutations), IR inspection, views and layout**: ex. 6, 7, 8, 9, 10. All excluded by the draft on purpose; listed so the size of the exclusion is visible: about half the Dream Code.

## 6. Gaps in the kit

- **No date type.** Dates are ISO strings; `truncMonth` and `year` slice strings; comparisons are lexicographic; date arithmetic (`trunc(bucket, d)`, `diff(unit, a, b)`, the 400-day range in ex. 10) has no honest representation. A `str` date also cannot be told from a region name, so `row.date >= row.region` would type-check.
- **No integer type.** `units`, `orders`, counts, ids and the `year` select are f64; the Dream Code's `int` vs `string` join-key error (ex. 5) becomes f64 vs str.
- **No nullability in practice.** CSV columns are nullable and `dropNulls` should narrow `opt(f64)` to `f64`; `opt` exists, but the narrowing would be my hand-written JS. I modeled every column as non-null.
- **No string building** beyond declared intrinsics; template literals (ex. 4 title, ex. 10 note) need intrinsics, and variadic ones cannot be spelled.
- **Column attributes** (`currency`, `unit` travelling with a column, ex. 7) have no place in the type system; I accept them as data and drop them.
- **Group (aggregate) semantics** exist only as a keyed object I generate per step; nothing says how a target implements a `group` space or a `run` space.
- **Comparison**: `exact()` on a JS-only target is fine, but floating sums in a group space depend on row order; the draft has no order-insensitive compare.
