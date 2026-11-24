# Report: data-tools language on the Definition API

## 1. Difficulty

2 of 5: the definition checked on the second run and only one example call needed a fix; the effort went into choosing how to model table state and into noticing what could not be modeled.

## 2. Per example

1. Partly fits: columns must be declared on the source (no inference); `int` is f64; the view is a `head` step; no `built.schema`/`run`.
2. Partly fits: every cleaning step fits. The deliberate-typo table is a lowering error (L002), so it is not a Program that checks (verified with a scratch file: L002 with "did you mean" members).
3. Partly fits: sliders, select (as a list of options), date param, three filters. Not: select `from:` a build-time lambda, `wb.controls`, layout, grid.
4. Partly fits: derive, truncMonth, groupBy, agg, sort, line chart with runtime `y` and `format`. Not: `.title` with a template literal, `.view`. Chart columns are unchecked strings.
5. Partly fits: filter with year, join with `take`, groupBy, agg, descending sort, limit from a param, bar chart. Not: SQL text (B009 via `rejected`, verified), join type mismatch and unknown-table diagnostics (the unknown table is B003, the key-type mismatch is not expressible).
6. Refused: build-time lambdas (`// REFUSED: B009`, with a `charts` entry in `rejected`).
7. Partly fits: winsorize and zscore written as derive steps with params. Refused: fragments, column attributes (`fragment` and `column` are `rejected`, B009).
8. Refused: it is about the built object (listing, lineage, diff, toJSON); there is nothing to define, and no diagnostic.
9. Refused: Environment sessions, mutation, event log; no effects in the API; no diagnostic.
10. Partly fits: params, semiJoin, keepGroups, the cohort expansion written out with core steps (month bucket fixed), heatmap. Not: `wb.component`, build-time bucket choice, the `retention` self-lookup column, the second chart's rule, book note, layout, `.agent`.

## 3. Where the API document misled you

- "`step(state, call, inferred)`" next to `init(opened, { program, stateOf })`: it reads as if `step` can reach other tables. It cannot, so a `join` could not learn the right table's columns until I carried a `lookup` function inside the state. It worked (state may hold a function), but the document does not say that is allowed.
- "`name(ns)` ... a string that declares a name in Program namespace `ns`" and the `table` opens `ref("table", ...)`: nothing says a source can share the `table` namespace with table constructs, or that `program.source[name]` is what `init` should read; I copied the shape from the `init` example.
- The `step` example uses `pick(...)` as if it were available; it is not defined in the document (I wrote my own).
- "A construct's opening arguments ... `{ as: "key" }`" is fine, but the record section's "(one value, or an array of several)" for a name-first slot did not make clear whether `args` in `call.args` of a `rest(...)` slot is flat. It is flat (`["month","region"]`); I used `.flat()` defensively.
- `enumOf` for a select param: "a type enum holds strings only" so a numeric select (`options: [2024, 2025]`) cannot be an enum type; I fell back to f64.

## 4. What you guessed

- A source is a `decl` slot of `program` taking `name("table")` and a shape with explicit `columns`, not a construct; a table's `init` reads `program.source`, else `stateOf`.
- `table` and `chart` are child constructs of `program`; chart opens `[name(), ref("table")]`; chart has no state.
- Column types are the type names `f64`, `str`, `bool`, `date`; `int` maps to `f64`.
- Descending sort is a separate `sortDesc` slot (`"-total"` strings do not fit `ref("column")`).
- Date params carry `kind: "date"` and a string `value`; the environment types them `date`. How the string becomes milliseconds at run time is unsaid.
- Select params are typed `str` (or `f64` when options are numbers), not enums, to compare freely with column values.
- One convention function per result type (`row`/`pred`, `group`/`groupPred`) because the convention's `returns` cannot depend on the slot otherwise.
- `calc` convention (no params, returns infer) for lambdas that read only `$`.
- Aggregates as a `keyed` object, with numeric-only keys for `sum` and `mean`, built from the state's columns in a convention function.
- Dropped the `glsl` target and kept only `js` (there is no pixel space; "a target that accepts a space" needs one).
- Intrinsic `spell` is JS-only; dates are f64 milliseconds UTC.
- `rejected` entries (`sql`, `charts`, `component`, `fragment`, `agent`, `view`, `column`) as the in-language refusals for what the examples use.
- A partial example (a Program plus a trailing `// REFUSED (part)` comment) is how I show what did not fit.

## 5. What you needed and did not have

Smallest first:

1. `step` (and `init`) able to report a diagnostic, and `step` given `stateOf`/program. Needed by 05 and 10 for join key-type checks (`customer_id` int vs `name` string) and for reading the right table's columns without the function-in-state workaround.
2. A way for a slot to check a column against a table named elsewhere in its own arguments (chart `x`/`y`/`color`/`tooltip` against the chart's table). Chart columns are unchecked strings in 04, 05, 07, 10; the `E-ENC-COLUMN` diagnostic is lost. A `ref` into another construct's state namespace would do.
3. A convention whose `returns` depends on the slot, so one `row` convention can serve `derive` (infer) and `filter` (bool) without two names.
4. A `ref` argument that accepts a prefix (`-total`) or a `desc` option, so sort is one slot.
5. String building in a lambda (concatenation or a template): `.title(() => `Monthly ${$.metric} ...`)` in 04, and format strings.
6. A hook to compute the type of a nominal param from a string (a date param whose value is a string), or a `date` literal in a shape (03, 05).
7. Aggregate and set-like lookups that return a value for another row (`first("users", {cohort, period: 0})` in 10): needs a table-valued intrinsic or a window.
8. Build-time slots (06, 10) and effects (09): listed as not built; I needed them there.
9. A non-Program deliverable: 08 and 09 describe a runtime object API, not a language, so nothing in the Definition API can host them.

## 6. Gaps in the kit

- No integer type: `units`, `orders`, `period` and `int` columns are f64; `E-JOIN-TYPE` int vs string is representable but int vs f64 distinction is lost (01, 05).
- No nullable columns in lambdas for `dropNulls`/`opt`: a column type cannot be nullable in the state, so null handling in a lambda (`row.price ?? 0`) is not expressible; `opt(t)` exists for types but I did not find a way to put it in a column's declared type, since column types here are plain names.
- No string operations (concat, lower, startsWith, contains) in the Runtime Subset or the intrinsics (they could be intrinsics, but string arguments and `str` returns were not tried; template literals are refused).
- Date arithmetic: dates are nominal, so `row.date + 7 days` is impossible; only intrinsics (`truncMonth`, `monthDiff`) work, and a date literal cannot be written in a lambda (a date constant has to come through a param).
- Group aggregates keyed by a column name are checked, but there is no `where` form or conditional aggregate (`sum` where ...).
- Tables as values (a `distinct("region")` column of options for a select, `quantiles`, `describe`): there is no list-of-rows type usable at the Program level.
- Chart, layout and view declarations are only data; nothing in the kit can type-check them against a table.
