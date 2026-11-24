# Report: data-tools language on the Definition API (agent-b)

Checker result: `no violations (the definitions and 10 examples checked)`. Beyond the ten examples I tried failures by temporarily editing examples (restored afterwards): a column typo in a derive (L002 with "did you mean 'revenue'"), comparing str with f64 (L003), an unknown `$` member (L002), `sortDesc("totl")` (B003 "at this step", did you mean 'total'), and a SQL string as a table source (B003 plus my own W001). The checker did not report a wrong join key type.

## 1. Difficulty

**3.** The definitions went in quickly and checked, because construct state plus convention functions handle the core idea (typed rows per step) well; but the main Dream Code features (build-time lambdas, fragments, components, the Environment/agent, layout, IR inspection) have no API, and several smaller things needed workarounds.

## 2. Per example

1. Fits, with a change: column types are declared on `.source` (no inference); "view 20 rows" is `.table("head","sales").limit(20)`.
2. Fits. The `row.revnue` typo demo was verified separately (L002 with did-you-mean); it is not in the file.
3. Partly fits: `select({from: t => ...distinct})` is build-time, so options are written out; `controls`, `layout.column`, `grid({pageSize})` dropped.
4. Partly fits: title template literal is static text; `y(() => $.metric)` became `yBy`; format became `formatBy` lambda; controls/layout dropped.
5. Partly fits: `sort("-total")` became `sortDesc`; E-JOIN-TYPE and result `schema()` listing are not expressible; the SQL refusal is `rejected.sql` (B009) plus a table check W001 (verified, not in the file).
6. Refused (B009 `.charts`, `.pivot`, `.describe`; build-time lambdas). One hand-declared histogram kept.
7. Refused (B009 `.fragment`; column attributes have no home). `winsorize` and `zscore` written out by hand as derives, using a stats object I gave the derive lambda.
8. Refused (output side: `ir`, `listing`, `lineage`, `downstreamOf`, `diff`, `toJSON` are not builder calls). Example 4's Program plus a filter step is kept.
9. Refused (Environment, session, event log, undo, permissions). The resulting Program is kept.
10. Partly fits/refused: `.cohort` (component, build-time) and `.agent`, book note, layout are refused (B009). `semiJoin`, `keepGroups`, params and a per-user aggregate are expressed.

## 3. Where the API document misled you

- "`oneOf(a, b, …)`" in a shape, with the example `limit: data(oneOf("number", lambda("scalar")))`, suggested `data(oneOf(ref("column"), lambda("scalar")))` would work for `y`. It does not: the lambda was treated as a column name (B003 "there is no column '() => $.metric'"). The `ref` branch wins for a function. I split it into `y` and `yBy`.
- "The opening arguments, each under its `as`, else its namespace, else `name`": my construct check read `record.name` and got `undefined`; with `name("node")` the label is under `node`. The text is right but the check examples (`program.params`) hide that a check on `opens` needs the namespace key.
- "`ctx.state` is always `undefined`" is clear, but nothing says that `step` also cannot report anything and sees no `program`; I only found `stateOf` was missing from `step` by reading its signature.

## 4. What you guessed

- A convention function returning a string refuses the lambda; I used it for "no state" (never hit).
- That a lambda may declare fewer parameters than its convention (`row => ...` against a two-parameter `derive` convention). It passes.
- That a convention's `returns: "bool"` makes `filter` check the body type; and that function objects inside state survive threading (I stored a `lookup` closure in state so `step` can read another table's columns for `join`). It worked.
- That a `data(...)` arg in `opens` is allowed (chart's mark, `as: "mark"`). It was.
- That `name("node")` can be shared by sources, tables and charts so `ref("node")` finds any of them, and that `stateOf` on a chart/source name is fine.
- Column types as `["f64","str","date","bool"]` as a data `enumOf`, used directly as member types. Works.
- Param types derived in `environment` from the value (`isDate` flag for dates, since a string value cannot say it is a date).
- That `rest(ref(...))` and `data(listOf(ref(...)))` both resolve against state at lowering. They do.
- That `rejected` on `program` shows up on the table builder (inherited), and on `table` for `pivot`/`describe`.

## 5. What you needed and did not have

Smallest first:
1. A `step(state, call, inferred, ctx)` that can report a diagnostic, and see `program`/`stateOf` (join key type mismatch, example 5 E-JOIN-TYPE; check that `take` names exist in the other table).
2. `oneOf(ref, lambda)` that picks by argument kind (example 4 `y`).
3. A ref spec that transforms the string before lookup, or a modifier for `"-col"` (example 5 `sort("-total")`); I added `sortDesc`.
4. String building in lambdas (concat or template for `title(() => \`Monthly ${$.metric}\`)`, example 4), or a way for a convention to return a dynamic `str`.
5. A way to ask the lowered result's types (`built.schema("top")`, examples 1 and 5) from the Program; `grammar.lower(record).states` may give this, but the document does not say what it holds.
6. Type inference of source columns from a file (examples 1-5): sources need declared columns.
7. A `check` on a slot or construct that can see state (missing columns, E-PARAM style checks at call time).
8. A `rejected` that can match an argument shape (a string argument that reads as SQL is only caught by a construct check, W001, and then B003 also fires).
9. Build-time lambdas (6, 10), fragments/mixins (7), custom components (10), effects/Environment (9), layout (3, 4, 5, 10), an IR/listing output (8): all declared out of scope; reported, not invented.

## 6. Gaps in the kit

- No integer type: `int` columns (`units`, `orders`) are `f64`; `cast` to `"int"` became `"f64"`.
- Dates: only the nominal scalar. No `date("2026-01-01")` literal, so a date param is a string value plus an `isDate` flag; `year`, `truncMonth` are intrinsics with `Date` in their spelling. No `trunc(unit, d)` or `diff(unit, a, b)` (they would need string-keyed intrinsics or enums; I did not try `enumOf` params in an intrinsic).
- String operations (`+`, templates) in lambdas.
- Keyed members can describe `g.sum("amount")`, but the keys are rebuilt by a convention function for every table; there is no way to ask the checker for numeric-only columns except by building the key set by hand as I did.
- Aggregates returning date (`g.min("ts")`) work only because keyed returns can differ per key; that was not obvious from the text.
- Windowed lookups such as `first("users", {cohort, period: 0})` (example 10 retention) have no member form.
