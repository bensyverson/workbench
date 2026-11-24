# Report: data-tools on the Definition API (agent C)

## 1. Difficulty

4 of 5. The table and parameter parts mapped onto `defineGrammar` cleanly, and the checker passed on the first run. But seven of the ten examples are only partly expressible, and the hardest part (the step functions that type columns across joins, renames and casts) had to be hand-written against an API that offers only `stateOf` and the state's `step` for it.

## 2. Per example

1. Partly fits. The source takes a declared schema; file load, view and run are refused.
2. Partly fits. Rename, cast, trim, replace, dedupe and derive fit. `int` is written as `f64`. `dropNulls` has no null type to act on. The rename and cast keys are not checked by the grammar.
3. Partly fits. The three params and three filters fit (the date param is a number with `date: true`). The `wb.select({ from })` options are refused (build-time lambda). The view is refused.
4. Partly fits. The table (derive, groupBy, agg, sort) fits. Chart and view are refused.
5. Partly fits. Params, filter, join, groupBy, agg, sort and limit fit. `year`'s numeric options become `f64`, since there is no numeric enum type. Chart and view are refused. The SQL paste is refused (B009 for `wb.sql`, B004 for the callback form).
6. Refused (B001). Build-time lambdas (`wb.build`) and the `charts` fan-out are not in the API.
7. Refused (B001). Fragments and mixins are not built.
8. Partly fits. The Program is example 4's. The IR listing, lineage, diff and downstream queries are host tools with no API, so they are refused.
9. Refused (B001). Environment sessions, mutation, undo and commit are not built.
10. Partly fits. The `eligible` table (a named table for the plans filter, semiJoin, keepGroups, select) fits. `wb.component` / `.cohort` (user constructs), the build-time `bucket`, the plan options from data, chart, view and agent are refused.

All ten files pass the checker. To confirm the checker is live, I planted a typo (`row.pirce`) in example 4: it reported L002 with "Did you mean 'price'?". I then reverted the typo and the checker passed again.

## 3. Where the API document misled you

- "Construct state", the `init` example: `const source = program.source?.[opened.from];` implies the record carries a `source` key holding each source's columns. Nothing else in the document defines that key, and `init` receives only `opened` (the opening arguments) and `{ program, stateOf }`. I did not use it. The example should say where a source's schema comes from, or drop the line.

## 4. What you guessed

- A source is its own construct with `record: "calls"`, opened as `.source(name, columns)`, with the columns as an opening `data(recordOf(enumOf([...])), { as: "columns" })`. The document does not say how a source's schema is given.
- Source and table both declare `name("relation")`, so `ref("relation")` accepts either, and `stateOf` finds either.
- Column types: `"f64"`, `"str"`, `"bool"`, `"date"` (the date scalar). `numberType: "f64"`.
- Spaces: `row` and `group`, both pure. Targets: `js` only, accepting both; the intrinsics are spelled for `js` only. No `glsl` target, since no example runs in GLSL.
- The `group` convention: `sum` as a `keyed` method over the f64 columns, and `count` as a `fn`, built from state at each call.
- Param shapes: numeric `options` are allowed and typed `f64`; a param with `date: true` is typed `date`; string and boolean params map to `str` and `bool`.
- `sort` takes `rest(data("string"))`, so a leading `-` is checked in `step` (T004), not by a `ref`.
- `join` without `take` brings in every column of the right table except its key columns; a name clash is T006.
- `semiJoin` takes `on` as either a string or a record.
- Error codes: the letter `T` (T001 to T007 in steps, T010 for a param outside its range).
- `month` is spelled `(new Date($0).getUTCMonth() + 1)`, with parentheses, since the spelling may sit inside an operator. `truncMonth` has a `prelude`.
- `rejected: { sql: ... }` sits on the `program` construct, so every child construct inherits it.
- `text(state)` prints the columns of one relation, one per line.

## 5. What you needed and did not have

Smallest first.

1. **Column names as keys in a data shape.** `rename`, `cast` and the `on` keys of `join` and `semiJoin` hold column names as record keys, and `recordOf(ref("column"))` checks only the values. Needed by example 2 (`rename`, `cast`) and examples 5 and 10 (`join`, `semiJoin`). I checked these in `step` with T002, T005 and T007 rather than at the call with B003.
2. **A numeric enum type.** `enumOf` in a type holds strings only, so example 5's `options: [2024, 2025, 2026]` becomes `f64` with nothing enforced. Needed by example 5.
3. **A sort direction.** A shape for a column ref with a leading `-`, so `.sort("-total")` is checked at the call. Needed by example 5.
4. **A date param shape.** The `date: true` flag is my invention; a first-class date in `ParamShape` would be expected. Needed by example 3 (`since`) and example 10.
5. **A table as an argument.** Example 10 wants `semiJoin(t.plans.filter(p => p.name === $.plan))`. The API takes only a relation name, so I named an intermediate table. Example 5's join on a filtered table would need the same.
6. **A null or optional column type.** `dropNulls` has nothing to drop. Needed by example 2.
7. **A declared source schema from data.** The source's columns are written by the author; the Dream Code infers them from a CSV. This is really an I/O gap (section 6), and it is why example 1 is only partly a Program.
8. **Aggregates beyond `sum` and `count`.** Example 10 uses `min(at)` on a date and `countDistinct`. Needed by example 10 once it is written.

## 6. Gaps in the kit

- **Integers.** No integer type. `limit`, `count` and `int` columns are `f64`. Example 2 and example 5 both write `int`.
- **Nulls.** No optional or nullable column type. Example 2's `dropNulls`.
- **Input.** No file or CSV input, and no schema inference. Examples 1, 2 and 6.
- **Rendering.** No charts, views, layouts, grids or book notes. Examples 1, 3, 4, 5, 6, 7, 8 and 10.
- **Build-time lambdas.** No code that runs while a Program is built over the schema, the data or a sample (`wb.build`, `wb.select({ from })`, the build-time `bucket` argument). Examples 3, 6 and 10.
- **Fragments, mixins and user constructs.** No way to add a method to a construct, or to define a new construct from parts (`wb.fragment`, `wb.component`). Examples 7 and 10.
- **Effects and the Environment.** No mutation API, no session, no event log, no agent permissions. Example 9, and the agent part of example 10.
- **IR inspection.** No listing, lineage, diff or downstream query over a built Program; `.build()` returns the record only. Example 8.
- **Pivot, quantiles, distinct, describe, sample.** None of these exist. Examples 6 and 7.
- **Strings.** No string functions in lambdas. The Dream Code uses none beyond `trim`, which here is a table step, not a lambda.

The checker does not check the `// REFUSED:` claims. The codes in those comments (B001, B004, B009) are my reading of which diagnostic the kit would give, and I did not verify them by running the refused forms.
