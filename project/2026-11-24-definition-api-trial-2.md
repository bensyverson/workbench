# Definition API, dogfood trial 2: findings

*2026-11-24, leaf `O63kB5`. Two Sonnet agents and one Haiku agent defined the data-tools language with the Definition API as built (`kit/define` at `71c5473`), each from the packet in [`scripts/define-trial/docs/`](../scripts/define-trial/docs/) and nothing else, and were checked by the real builder (definitions, every example's builder calls, construct state, conventions and the lowering of every lambda). Briefs: [`scripts/define-trial/trial-2-briefs.md`](../scripts/define-trial/trial-2-briefs.md). Hand-ins: [`scripts/define-trial/runs/2026-11-24-trial-2/`](../scripts/define-trial/runs/2026-11-24-trial-2/). Trial 1: [its findings](2026-11-24-definition-api-trial-1.md).*

## The result in one paragraph

Trial 1's main finding (a table's columns change at every step, so each step's lambdas need the previous lambdas' types) is solved: all three agents typed rows, groups and aggregates against construct state, and none of them asked for it again. All three hand-ins checked clean on their first checker run and were refused nothing at the end, and the checker was not vacuous: every fault an agent planted, and every real slip, was caught with the right code (L002, L003, B003, B004, B009). The massage needed for compliance is zero lines. What the agents could not express is now one level up. Two Sonnet agents, independently, hid a `lookup` closure inside the state so that `join` could read the other table's columns, because **`step` cannot see other instances and cannot report a diagnostic**. All three wanted a descending sort ref, string building in a lambda, an integer type and date literals. One finding was a silent-drop bug in the kit, confirmed and filed: a lambda passed into `oneOf(ref, lambda)` as a function is dropped without a diagnostic (leaf `fE5VVV`).

## The runs

| Agent | Model | Difficulty | Checker runs | First clean | Tokens | Tool calls | Time |
|---|---|---|---|---|---|---|---|
| A | Sonnet 5.5 | 2 of 5 | 7 | run 1 | 88.7k | 8 | 163 s |
| B | Sonnet 5.5 | 3 of 5 | 13 | run 1 | 93.9k | 11 | 207 s |
| C | Haiku 5.5 | 4 of 5 | 7 | run 1 | 126.7k | 13 | 266 s |

Tokens, tool calls and time are the harness's usage report for each agent. Checker runs and the first clean run come from each `log.jsonl` (`node -e` over the file: lines, and the index of the first `"ok":true`). The runs after the first were the agents planting faults to see whether the checker caught them, and fixing real slips (B's runs 2–3, B003). Rechecking the recorded copies (`node scripts/define-trial/check.js scripts/define-trial/runs/2026-11-24-trial-2/agent-x`) prints `no violations` for all three: the compliance massage is zero lines. Definition sizes: 202, 219 and 196 lines (dialect plus grammar).

All three refused or split the same examples: 06 (build-time lambdas), 07 (fragments, column attributes), 08 and 09 (the IR tools and the Environment session, which are not a language), and parts of 05 and 10 (join, cohort, agent). Haiku refused 05 outright. The Sonnet agents typed it with the workaround below.

Haiku's Write of `REPORT.md` was refused by the harness ("Subagents should return findings as text"). It returned the report as text instead of using the shell fallback the brief gave it, so the integrator saved it, marked as such (see the gotcha of 2026-11-24).

## Where they converged

| Finding | A | B | C |
|---|---|---|---|
| `step` cannot see another instance's state or the Program, so a `join` cannot learn the other table's columns | yes: a `lookup` closure in the state | yes: same | yes: joined only in `init`, refused 05 |
| `step` cannot report a diagnostic, so a join key-type mismatch (Dream Code's E-JOIN-TYPE) is lost | yes | yes | yes ("a step that can refuse") |
| `sort("-total")` cannot be written: a `ref` takes no sign or modifier | yes: `sortDesc` | yes: `sortDesc` | yes: `sortDesc` |
| No string building in a lambda (`title(() => \`Monthly ${$.metric}\`)`) | yes | yes | — (titles static) |
| No integer type | yes | yes | yes |
| No date literal: a date enters only as a number or a param | yes | yes | yes |
| No nullable column, no narrowing for `dropNulls` | yes | — | yes |
| A slot or construct check sees no state, so chart columns are unchecked against their table | yes (refs into another construct's state) | yes | — |
| `call.args` for a `rest(...)` or `recordOf` argument is undocumented | yes | — | yes |

## Where they diverged

- **One convention per result type.** A wrote `row`/`pred` and `group`/`groupPred` because a convention's `returns` cannot depend on the slot. B reused one `row` convention with fewer lambda params. C reported the convention names and slot names as unrelated.
- **Sources.** A made a source a `decl` slot of the program, read in `init` through `program.source`. B and C made it a construct sharing the table's namespace, read through `stateOf`.
- **Recording refusals.** A and B declared `rejected` entries (B009). C used B001 for features that have no call and asked for a code for "not in the language" (R6 has none when no builder call is made).

## Where the packet misled them (quoted from it)

- "`step(state, call, inferred)`" beside "`init(opened, { program, stateOf })`" reads as if `step` can reach other tables (A). It cannot.
- The `step` example called "`pick(state.columns, state.keys)`", which the packet never defines (A). **Corrected in place** in `api-draft.md`.
- "`call.args`" for a `rest(...)` slot and a `recordOf` argument was unstated (A, C). **Corrected in place**: the `step` comment now says what `call` holds.
- "`oneOf(a, b, …)`", with the example `limit: data(oneOf("number", lambda("scalar")))`, suggested `oneOf(ref("column"), lambda(...))` would work. It does not: the lambda is matched as a ref or dropped (B). This is a kit bug, not a doc error (leaf `fE5VVV`).
- "scalar(of, { note }) declares a nominal scalar (see "Types" above)" sends the reader in a circle (C). This is minor and left as is.

## What this changes in the design

1. **Give `step` a context: `step(state, call, inferred, { program, stateOf, error })`.** It is the only change all three asked for, two of them by hiding a closure in the state. `stateOf` in `step` makes a join's columns computable at the step where the join happens. `error(code, message, tip)` lets a step refuse a call with a Dialect code, pinned at the call, as B011 already is. Filed as a leaf. A rerun of the trial should follow it.
2. **The `oneOf(ref, lambda)` drop** is a fail-closed bug and is fixed first (leaf `fE5VVV`, in flight).
3. **A descending sort** needs no kit change: the packet should show the idiom `sort: { args: [ref("column"), opt(data(enumOf(["asc", "desc"])))] }`. Parked with the doc pass for H5 (leaf `qwgSOL`).
4. **Integers, nulls, string building and date literals** are the core-language gaps trial 1 also named. They stay H2 inputs for the data Dialect (leaf `5eeJED`). The open questions about the date scalar (a constructor's name; narrowing an optional date) are queued for Ben on that leaf.

## Hand review

The hand-ins check clean, but checking clean is not the same as being right. A's and B's `join` steps read the other table through a closure captured in `init`. That works only because `stateOf` is called eagerly there, so it would break silently if the kit ever rebuilt state lazily. That fragility is the strongest argument for change 1. C's refusals are honest but recorded as comments: a refused example produces no diagnostic, which is R6's gap and not C's.
