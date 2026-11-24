# Report: agent-c, data-tools language

## 1. Difficulty

3. The statically declared parts went quickly, but the table-shaped core of the language (rows and aggregates whose members come from schemas that exist only at run time) has no honest home in the draft, and six of ten examples needed refusal or a heavy cut.

## 2. Per example

1. Partly fits: source and view; no `head(20)`, grid or type inference (no date/int).
2. Partly fits: the whole chain; `cast` to date/int becomes strings; the typo diagnostic would be an `L` code but `Row` is one shared object.
3. Partly fits: params and filters; `select({from: distinct})` is build-time, date is a string, layout and controls dropped.
4. Partly fits: derive, groupBy, agg, chart; no `truncMonth`, no runtime lambda for `y`/`title`, no layout.
5. Partly fits: join, groupBy, agg, sort, chart; no `year()`, `limit($.topN)` impossible, SQL refusal only as a `rejected` entry (never exercised in a chain, since `sql` is not called).
6. Refused: build-time lambdas.
7. Refused: fragments and column attributes.
8. Refused: not a Program (IR, listing, lineage, diff).
9. Refused: Environment sessions, effects, undo, agent mutation.
10. Partly fits: params, semiJoin, keepGroups, a heatmap; the `cohort` component, fragments, book note and agent permissions refused, and the chart reads a column (`period`) that no step creates.

## 3. Where the draft misled you

- "`objects`: handles with members, fixed for every Program" together with the `derive` slot "a row whose columns come from a table": it suggests per-table Row types are easy, but the only route is a slot function, and nothing says how a function convention names a per-table object, since objects are global. I used one `Row` shared by all tables.
- "`keyed`: `g.sum("revenue")` is a keyed call": keys are listed statically, but the column names of a table are not. I put a dummy key `_` in; that is a trick, not an answer.
- "`ref.on`: the construct instance it sits on": never said what that value is (a record? a name?), so I did not use it.
- "A declaration slot whose first argument is `name(...)`: an object from each name to the rest": suggests `.agg("total", g => ...)` records nicely, but the lambda slot form `args: [name("column")]` is only shown for `derive`. I reused it for `agg`; unverified.

## 4. What you guessed

- A table is a child construct `table` with `opens: [name("table"), ref("table")]`, so `.table("sales", "raw")` replaces `.table("sales", t => t.raw...)`. Source tables and derived tables share the `table` namespace.
- `record: "calls"` on tables and charts, so step order survives; `environment` reads `program.table` (the child list) and `calls`.
- Dates are `str`, whole numbers are `f64`. `numberType` is `f64`.
- `agg` takes one aggregate per call, named, not a `{name: lambda}` object, since a lambda slot takes one lambda.
- `view` and `kind` are declaration slots taking names; `chart` is a construct with `kind` as the chart type, not `wb.chart.line(t)`.
- A second space `group` and slot conventions `row`, `predicate`, `group`, `groupTest`: one per return type, because `returns` is fixed per convention.
- Slot options `once` on a decl slot is accepted by the checker; I did not know if it is meant to be.
- `rejected` goes on `program` and `table`; I assumed a child inherits nothing.
- A grammar `recordOf("string")` shape for rename/cast/replace maps.

## 5. What you needed and did not have

Smallest first:
1. Per-instance objects: a slot convention that names an object whose members the environment computes per table (examples 2, 3, 4, 5, 10). Today there is one global `Row`.
2. Dynamic `keyed` keys, computed in `environment` (all `agg` examples).
3. A lambda slot with no parameter spec for a lambda that returns a string or a plain value, e.g. `y(() => $.metric)` and `title(...)` (example 4); and slot options `returns` per call.
4. A param whose type is read by the grammar: `limit($.topN)` needs a decl argument that accepts a `$` reference (examples 5, 10).
5. An `either` arg spec: a slot that takes a string or an object of aggregates (`agg({...})`).
6. A way to declare the record's derived schema (output columns after each step) as a first-class API, instead of re-walking `calls` in `environment`; the schema inference of examples 1 and 5 depends on it, and `environment(program)` for tables is awkward.
7. A phase concept: build-time lambdas (example 6) and the E-PHASE rule.
8. Fragments or a way to extend a construct (example 7); typed attributes on a column.
9. Effects and non-pure spaces (example 9); an Environment/session API.
10. A components mechanism (`cohort`, example 10).

## 6. Gaps in the kit

- No `int` type: `units`, `orders`, counts, years, chart `bins`. Joining int to string is the type error the examples want (E-JOIN-TYPE).
- No date type and no date intrinsics (`year`, `truncMonth`, `trunc`, `diff`), and no way to compare dates beyond strings.
- No string operations in lambdas beyond equality, so `startsWith`, case folding and `trim` as a lambda cannot be written.
- No lists or tables as values a lambda can reach (`first("users", {...})` lookups), and no list-valued params.
- No IR inspection, listing, lineage or diff in the record; the record is plain data.
- No layout or rendering vocabulary (`wb.layout`, `wb.controls`, `grid`, `wb.book`).
- Empty `members: {}` for `Row`/`Params` is allowed by the checker; whether the real builder lets an empty object be filled by `environment` is untested.
