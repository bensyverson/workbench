# Report: data-tools language on the Definition API

## 1. Difficulty

**2.** The definitions and the examples that fit went in with few problems; most of the time went on design guesses about state and namespaces, and the checker passed on the first run after one D010 fix. Six of the ten examples can only partly be written, or not at all, because they use things the API marks "not built".

## 2. Per example

1. Partly fits: source + `.limit(20)` fit; the view is rendering, and column types must be declared (no inference from the CSV).
2. Fits, minus the deliberate typo (the file must check clean; the typo's diagnostic is L002-style at lowering, verified by planting one).
3. Partly fits: `select({ from: build-time lambda })` and the layout/controls view do not; `region` is a plain string param, `since` a date param.
4. Partly fits: tables, aggregates and the chart construct fit; `.y(() => $.metric)` and the template-literal title (a runtime-chosen column name and text) do not.
5. Partly fits: query, joins and typed errors fit (planted B003 and L011 verified); the SQL-text-in-a-string check (E-SQL-TEXT) and the view do not (only `.sql` is a B009 `rejected` name).
6. Refused (B007 named in the file): all build-time lambdas and a data-dependent pivot.
7. Refused (B001): fragments; also no `this`, quantiles/stats or column attributes.
8. Partly fits: only the Program (ex. 4 plus the extra filter); IR, listing, lineage and diff are tooling, not Program text.
9. Partly fits: only the Program the session ends with; the Environment, sessions, undo and log are effects.
10. Partly fits: the `eligible` table (semiJoin, keepGroups, select) and params; the `cohort` component, build-time `bucket`, charts over `ret`, layout, book and the agent hook do not.

## 3. Where the API document misled you

- The Dialect's key list reads `Every key is optional except name, numberType, spaces, targets, slots and text`, and lists no `params:` key. The "Params" section then says "the Dialect says … `params: { object: "Params", name: "$" }`". I added it and it was accepted, but the first list should name it.
- "Child … builder also has every method of its parent." I put `fn`/`const` on both `program` and `table` and got D010; the example hides this because the fields Dialect has one construct. It means a child cannot have its own helper slot, which is a loss (see 5).
- "A construct's opening `name()` is a label instead, any non-empty string" suggests the opening name is not declared in a namespace. It is: `name("relation")` in `opens` made `ref("relation")` resolve to tables and sources both. The document never says so, and I only found out by trying.

## 4. What you guessed

- Source declaration: `.source(name("relation"), data({ csv, header?, columns: recordOf(enumOf([...])) }))` on the program, so `program.source[name].columns` gives `init` the schema. The doc's `init` example does `program.source?.[opened.from]` but never says how a source is declared.
- One namespace `"relation"` for sources and tables, so `.table("t", from)` and `.join(other)` take either (via `ref("relation")`). Chart `names.column` and `init` use `program.source?.[n]?.columns ?? stateOf(n).columns`.
- Column types are `"str" | "f64" | "bool" | "date"` strings kept in state; `inferred` is a type-name string, stored as is.
- Conventions: two row conventions (`row` returning `infer`, `rowTest` returning `bool`) and two group conventions, each built with `object(label, ...)` from state. Group object members `sum`, `mean`, `min`, `max`, `countDistinct` are `keyed` with keys from the current columns (numeric / orderable / all); `count` is a `fn`.
- Params: types `f64` (number), `str` (string), `bool`, `date` (a `type: "date"` key on a string-valued param); a string param is not an `enumOf`, so `$.region === "All"` type-checks.
- `sort("-col")`, `dropNulls`, `trim`, `dedupe`, `select` take `rest(ref("column"))` or strings; the `-` sorts are checked in `step`, not by a `ref`.
- Charts as a stateless child construct with `names.column`, an `x/y/color/tooltip/title` set of `once` slots and a `mark` slot. Not rendering; just declarations.
- Targets: js only (every space accepts `"*"`); no GLSL.
- `step`'s `ctx.error` is given `(code, message, { arg, tip })` with code `T…`; I used `T001..T004` and Dialect letter `T`. The `ctx.name` I referenced in an error message is undefined (not in the documented ctx).

## 5. What you needed and did not have

Smallest first:
1. A `names` on a state construct that sees the program, so `ref("relation")`-like checks can depend on both (`names` takes only `state`; I used the Program namespace instead).
2. The `ctx.error` in `step` carrying the instance's name, for messages like `no column "x" on table "sales"` (I wrote a constant).
3. A way to give a child construct its own units (`fn`/`const`) without a D010 against the parent (or to say a parent slot is inherited).
4. A param value usable where a slot takes a column ref or a string at build time inside a lambda's text, i.e. a runtime-chosen column (`.y(() => $.metric)`, ex. 4), or a template/text lambda for titles. Needs string building in the Runtime Subset.
5. A check hook on any argument, a table's arguments in particular, so a SQL string passed to `.table(...)` can be refused as E-SQL-TEXT with a rewrite (ex. 5). `rejected` only covers method names.
6. Build-time lambdas that see schemas and sampled values and return grammar (ex. 6, 10).
7. Fragments / mixins: user methods and column attributes (ex. 7).
8. Constructs defined inside a Program (a component with `expand`) (ex. 10).
9. Effects, an event log and an Environment of mutations, with per-program permissions (ex. 9, 10 `.agent`).
10. Layout, views, controls and the book (exs. 1, 3, 4, 5, 10).
11. Tooling over the record: listing, lineage, downstream, diff are not described anywhere as API a Program could call (ex. 8).

## 6. Gaps in the kit

- No integer type: the Dream Code's `int` columns are `f64` (`units`, `customer_id`, `orders` count); an int and its schema line `orders: int` cannot be told from `f64`.
- Dates exist only as the nominal scalar: no constructor, so a date param is a string in the declaration and typed `date` by `environment`; a date literal in a lambda (`row.date >= "2026-01-01"`) cannot be written. Date arithmetic and `diff(unit, a, b)` / `trunc(unit, d)` with a runtime unit need more intrinsics (I declared only `year`, `month`, `truncMonth`).
- No nullable columns in the row convention, though `dropNulls` implies them (`opt` exists for types, but I did not use it; the state would need a `nullable` mark per column).
- No text operations in the Runtime Subset for `trim`/`replace` as lambda helpers, and no template literals for titles (ex. 4).
- No window function / "first value of a group by key" (ex. 10 `first("users", { cohort, period: 0 })`): a row lambda cannot reach other rows.
- Column names with spaces (`"Unit Price"`) cannot be read as `row["Unit Price"]` in a lambda, only `rename`d first.
- GLSL is irrelevant here, but a data Dialect with one target (`js`) shows nothing about comparing targets.
