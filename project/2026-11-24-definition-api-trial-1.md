# Definition API, dogfood trial 1: findings

*2026-11-24. Leaf `lMNmIB`. Three fresh agents mapped the data-tools Dream Code onto the pass-1 draft of the Definition API ([the design](2026-11-24-definition-api-design.md); packet in [scripts/define-trial/docs](../scripts/define-trial/docs/)). Their hand-ins, reports and checker logs are in [scripts/define-trial/runs/2026-11-24](../scripts/define-trial/runs/2026-11-24/). The packet given to them is the one at commit `e44ff1e`.*

## The result in one paragraph

The draft's overall shape held: all three agents, working apart, built the same language skeleton (a table as a child construct opened by `.table(name, from)` with `record: "calls"`, one call per aggregate, a `$` params object filled by `environment`), and agent B's example 4 reads close to the Dream Code. But every agent hit the same hole: **a table's columns change at every step, and the draft has no way to carry that state from one step to the next.** The two Opus agents worked around it by making the author write each derived column's type (`.derive("revenue", "f64", row => …)`); the Sonnet agent used one shared `Row` object for every table, which passes and is wrong. The program-global namespaces made the same hole worse for column names. The checker, meanwhile, found nothing to report in 14 runs, so it measured nothing; the reports carry all the signal.

## The runs

| Agent | Model | Difficulty | Checker runs | First clean | Tokens | Tool calls | Time |
|---|---|---|---|---|---|---|---|
| A | Opus 5.5 | 4 of 5 | 3 | run 1 | 94.7k | 10 | 312 s |
| B | Opus 5.5 | 4 of 5 | 8 | run 2 | 98.1k | 16 | 328 s |
| C | Sonnet 5.5 | 3 of 5 | 3 | run 1 | 71.2k | 7 | 83 s |

*Tokens, tool calls and time are the harness's per-agent usage report. Runs and first clean come from each `log.jsonl`: `node -e` over `scripts/define-trial/runs/2026-11-24/agent-*/log.jsonl`, counting lines and `"ok":true`. Agent B's one failed run was made before any file existed. Ben chose two Opus and one Sonnet for model diversity.*

**No diagnostic code appears in any log.** The checker (`check` v0) validates definition structure, parses lambdas and applies the free-name rule; it does not run `environment()`, slot `check`s, the builder's `B…` checks or lowering. Every real problem the agents found lives exactly there. The figure for "massage needed to pass the checker" is therefore zero, and it means the checker checks too little, not that the output complies.

## Where they converged

| Finding | A | B | C |
|---|---|---|---|
| A table's columns after a step need the previous step's lambda's inferred type, which `environment(program)` cannot see (it gets source text, and runs before lowering) | yes: type argument on `derive` and `agg` | yes: same | yes: one shared `Row`, a dummy keyed key `_` |
| `ref.key`'s "index" is undefined, and a convention function needs it to find its step | yes | yes | yes (`ref.on` undefined too) |
| Two `opens` arguments land under one record key (`name("table"), ref("table")`) | yes | yes | — |
| Namespaces are program-global, so they cannot hold columns (`revenue` derived, then aggregated, is B002) | yes: the largest single ask | implied (hand-written column checks) | — |
| No optional declaration argument (`.y("name")` beside `.y("name", { sort })`) | yes | yes (misused `rest`) | — |
| A declaration argument cannot take a runtime value (`.limit($.topN)`, `.y(() => $.metric)`) | yes: `{ param: "topN" }` | yes: `.limit(() => $.topN)` | yes: dropped |
| `agg({...})` needs a map of lambdas; became one call per aggregate | yes | yes | yes |
| No code for a call to a `rejected` name (each guessed B001) | yes | yes | — |
| `recordOf` missing from the documented import line | yes | yes | yes (used it) |
| No date, integer or null narrowing in the kit | yes | yes | yes |
| Lambdas cannot see another table or a whole-column statistic (`zscore`, the cohort's `first(...)`) | yes | yes | yes |

They also converged on what to refuse: examples 6 to 9 (build-time lambdas, fragments, IR tooling, the Session) are refused or kept only as a hand-written Program, as the design predicted; A and B wrote example 10's cohort out by hand as tables.

## Where they diverged

- **Row types.** Opus made one object per table step in `environment` (`Row_monthly_3`); Sonnet made one global `Row`. The Opus form is right and costs a type argument; the Sonnet form type-checks a lambda against every table's columns at once. The draft let both through, which is the problem: it should have one obvious way.
- **Runtime values in declarations.** A used a `{ param: "topN" }` data shape plus a check; B turned `limit` into a zero-argument lambda slot (`.limit(() => 10)`); C dropped it. Three answers mean the draft lacks the form.
- **Dates.** A used ISO strings compared as text, B used f64 day counts, C used strings. Each knows its choice is wrong.

## Where the draft misled them (quoted from it)

1. *"A convention may also be a function `(ref, program) => convention`, for languages where a lambda's parameter types depend on the Program (a row whose columns come from a table)."* All three read this as solving per-table rows. It solves only the first step.
2. *"`ref` is `{ id, kind, on, key }`: … its leading name argument or index."* Index of what was never said.
3. *"The opening arguments, under their namespace or `name`."* Two openers collide.
4. *"names declared with `name("table")` anywhere in the Program are what `ref("table")` accepts."* Correct, and the reason namespaces cannot hold columns.
5. *"`returns: "infer"` takes the type of what the body returns."* It does, for that slot only; nothing downstream sees it.

## What this changes in the design (for pass 2)

In order of weight. Each is a recommendation for the revised draft, not yet built.

1. **Threaded construct state.** A `record: "calls"` construct may declare a state that flows through its calls: an initial value from its opening (a table's columns from its source) and a step function `(state, call, inferred) => state`, where `inferred` is the lowered lambda's return type. The kit lowers each lambda in call order, with the slot convention reading the current state. This removes the type arguments, the hand-written schema replays in all three hand-ins, and the shared-`Row` shortcut, and it is the one place lowering's results feed back into the builder.
2. **Namespaces scoped to that state.** `ref("column")` resolves against the current state's names, so a column typo gets the kit's own did-you-mean in `groupBy`, `sort`, `select`, `join` keys and chart encodings, with no Dialect check.
3. **Specify `ref`:** `ref.on` is the construct instance's name, `ref.index` the call's position in its `calls`; and `as` on an opening argument names its record key.
4. **Small argument additions:** `opt(spec)` for an optional trailing argument; `ref(ns)` usable inside a data shape; numeric `enumOf`; a "value or param" argument (`.limit(10)` and `.limit($.topN)`); a map of lambdas (`agg({ total: g => … })`); a path in `ctx.error`'s `arg`.
5. **Name the codes the draft left open:** a call to a `rejected` name is B009 with its message; `recordOf` joins the import line.
6. **The checker must check what the trial depends on.** Once `38WI7z` builds the real builder, `check` runs it: `environment`, slot `check`s, `B…` codes and lowering. A second trial without that would again measure nothing.

**Not changed:** the data-not-fluent shape, the three slot kinds, child constructs by `parent`, functions or text as the lambda form, the free-name rule, and the out-of-v0 list. No agent asked for any of them to change, and all three used them as designed.

## For Ben

- **Dates, integers and nulls** (design decision 12): all three agents needed dates, in three incompatible workarounds. A core nominal scalar (a `date` any Dialect could declare, as vectors are declared) is the likely smallest change; it would be the first change to the core for H2.
- **Schema inference from data** (example 1): all three declared source columns by hand. Recommendation: keep declared schemas in v0; threaded state (change 1) makes inference a later, contained addition (the initial state read from a sample).
- **Whether to rerun the trial** on the revised draft before building, with the stronger checker. The local ruling says to rerun after changing the design; the cost is about 100k tokens per agent.
