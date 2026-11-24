<!-- Saved by the integrator from agent C's returned text: the harness refused its Write of REPORT.md ("Subagents should return findings as text, not write report files") and it did not use the shell fallback the brief gave. Text unchanged below. -->

Agent C, trial report.

Files written: data.dialect.js, data.grammar.js, examples/01.js to 10.js in /Users/ben/git/workbench/local/define-trial-2/agent-c. Checker: `./check.sh` returns "no violations (the definitions and 10 examples checked)". Before that I planted three faults in a copy of example 02 (a misspelled column, cast to "int", trim on a number column). Each was reported with the right code (L002, B004, B003), and the file was restored.

## 1. Difficulty
4 of 5. The definitions checked on the first run and the table core (rename, cast, trim, replace, dedupe, derive, filter, groupBy, agg, sort) was expressible. But half the examples did not fit: join, build-time lambdas, fragments and the session all lie outside what the API states, so most of the work was deciding what to refuse.

## 2. Per example
1. Partly fits. The source declares its columns (no CSV reader, so no inference). The .view is refused (rendering, R8).
2. Partly fits. units "int" is refused by the cast shape (B004); I cast to f64. dropNulls is omitted (no nullable columns). rename, cast and trim take one column per call, because a keyed map's keys cannot be checked against a namespace.
3. Partly fits. The wb.select with a data-driven option list is a build-time lambda, so region is a plain value. wb.date({value:"2026-01-01"}) is written as milliseconds. The view is refused.
4. Partly fits. The table fits. The chart and view are refused. orders is f64.
5. Refused, B009 (join, a rejected entry on the table). A step cannot see another table's columns, so the joined columns cannot be typed. The SQL paste is refused by the same rule.
6. Refused, B009 (charts, a rejected entry on the program). Build-time lambdas are not in the API.
7. Refused, B001. No fragments, no column attributes. zscore needs whole-column statistics inside a row lambda, which no slot or intrinsic gives.
8. Partly fits. The Program is example 4's table. The IR tools (listing, lineage, diff, toJSON) are tooling over the record, not Program syntax.
9. Partly fits. The Program is the base table of example 4. The Environment session (effects and store rules, R8) is refused.
10. Refused, B009 (semiJoin, a rejected entry). The cohort component takes build-time arguments, keepGroups has no meaning the language can state, and the agent is an effect.

## 3. Where the API document misled you
Nothing I can quote as wrong. Two places cost a re-read:
- "scalar(of, { note }) declares a nominal scalar (see "Types" above)" sits under types, while the Types section says an inline scalar is D002. They agree, but the cross-reference is circular.
- The step example's call.args[0] is clear for a named slot, but the doc does not say what call.args holds for a rest(...) slot or a recordOf argument. I assumed a flat list and the object itself. Both held.

## 4. What you guessed
- A source is a child construct with name("table"), sharing the "table" namespace with table, so ref("table") resolves either one.
- A table's from is read in init through stateOf(opened.from). This is the only way the API lets a state see another instance, and it runs before the first call only.
- data(shape, {as}) accepts as, and opens may hold data(...). The doc says any spec takes as but shows data only in slots.
- Column types are the type-name strings "f64", "str", "date", not helper values.
- keys is reset to [] after agg.
- A Program's name() declares into the "program" namespace (no ref uses it).
- Convention names (where, derive, group, value) differ from grammar slot names (filter, derive, agg, limit). I took lambda(convention) to take a convention name that need not match the slot.
- Param shape {date: <ms>} marks a date parameter. Numeric options use "number[]".
- For a feature the language does not have at all (fragments, sessions), the table has no diagnostic. I used B001 as the nearest code. That is a gap in R6, not a choice the API made.
- JS spellings: yearOf, monthOf, truncMonthOf as preludes; only the js target is declared (accepts "*").

## 5. What you needed and did not have (smallest first)
1. A ref with a descending sign. sort("-total") (examples 5, 10) cannot be written; I used a sortDesc slot.
2. Keys of a recordOf checked as names. cast, rename, replace and a join's on keys are unchecked as maps; I split them into one-per-call slots. Needed by 2 and 5.
3. A step that can refuse. A step returns state and cannot report a diagnostic. A check sees no state. A type rule for a step is only expressible as a namespace (ref("text")). Needed by any step with a type rule (2's dropNulls).
4. Another instance's state in step. step(state, call, inferred) does not receive stateOf, so a join's columns cannot be computed mid-stream. Needed by 5 and 10. The only workaround is joining in init, which changes step order.
5. Narrowing an opt type. A null-dropping step needs opt(T) to become T; the doc does not say how state reads an opt type. Needed by 2.
6. Date literals. A date as an ISO string in a shape or record. Needed by 3.
7. A build-time option list. wb.select({from: t => ...}). Needed by 3 (out of scope by R8).
8. A source read from a file with inferred schema. Needed by 1, 2, 6, 8. Its absence is by design (no effects): a gap to name, not a request.
9. Date parts with a unit: trunc(unit, d), diff(unit, a, b), which need a str unit and a per-unit ref. Needed by 10.
10. Named refusals with a code. R6 wants a code for "not in the language". A rejected entry gives B009 only when a builder call is made. A file refusing a feature the language lacks needs no call, so a comment is the only record. Needed by 7 and 9.

## 6. Gaps in the kit
- Step semantics. The API types lambdas and tracks column state. It says nothing about what a step does to rows (filter, groupBy, dedupe, sort, limit), so nothing checks or runs those. A data-tools language needs table semantics in the kit; this trial could only type the lambdas inside it.
- No integer type. Counts, limit, topN and year are integers in the Dream Code. I used f64 throughout.
- No nulls. No nullable column and no way to narrow one (examples 2 and 10).
- No date literals or parsing. Dates compare (>=, ===) and the scalar works, but a date enters only as a number.
- No string operations. trim and replace are steps with no lambda, so no string semantics are checked. Equality on str works in a lambda.
- Aggregates. count, sum, min, max are written. countDistinct and mean (example 6's pivot, example 10's countDistinct) are not.
- Multi-table steps. Only init sees another table, so a join cannot be typed (see 5.4).
- Group-scoped row filters. keepGroups (keep every row of a group that passes) needs a group-scoped filter the API does not state.

Difficulty: 4 of 5. Hardest part: the definitions checked, and the table core was expressible, but the examples that matter most (join, build-time, fragments, sessions) lie outside the API, so the hard work was deciding what to refuse and how to record it when no diagnostic exists for "not in the language".
