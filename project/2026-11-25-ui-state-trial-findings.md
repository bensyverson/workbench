# UI trial, round three: the state in the Dialect

*2026-11-25, leaf `u6I0Lc` (under `J7Uzdr`). A short dogfood check of the parts of the UI design that changed after [the first two rounds](2026-11-25-ui-trial-findings.md): the run's state moved into the Dialect (Ben's Q1 ruling), written in the Dialect's own types (`"f64"`, `struct`, `list(type, max)`) rather than the Grammar's shapes; `stat` gained `max`; `U006` was retired. Plan: [the defineUI build plan](2026-11-25-defineui-build-plan.md). Records: `scripts/ui-trial/runs/2026-11-25-state/agent-{a,b,c}/`.*

## Setup

Each agent got the revised packet (`scripts/ui-trial/docs/ui-draft.md`, `rules.md`, `task.md`) and both packages with their Dialects as they were before the build (`scripts/ui-trial/packages/given/`): the state described in a comment above `text(state)`, not declared. The task was the same as round two, plus declaring each Dialect's `state` first. The checker is now the kit's own `defineDialect` and `defineUI` (`d5d3f90`), not a stand-in. Runs: `scripts/ui-trial/run.sh /private/tmp/3d093c96-ui2/agent-{a,b,c} claude-{opus,sonnet,haiku}-5-5`; figures from `node scripts/particles/h5/summarize.js <dirs>`.

## Results

| Agent | Model | Difficulty (of 5) | Checker runs | First run clean | Massage | Outside reads |
|---|---|---|---|---|---|---|
| A | Opus 5.5 | 2 | 6 (3 `check.sh`) | yes | none | none |
| B | Sonnet 5.5 | 2 | 6 (3) | yes | none | none |
| C | Haiku 5.5 | 3 | 4 (2) | yes | none | none |

All three declared the same two states, field for field, and they match what the builder wrote into the packages' own Dialects: nested objects as `struct`, lists as `list(struct(…), max)`, the maze grid as `list("str", …)`. Nobody wrote `"number"`, a bare nested object or `listOf`, and nobody put `state` in the UI. **The move and the vocabulary switch cost nothing.**

## Where they converged

| Finding | A | B | C |
|---|---|---|---|
| **A list `max` the language does not hold.** Emitters, counters and maze rows have no bound in the Grammar; each agent guessed (64, or 256 for the grid; particles took the Grammar's `maxParticles` ceiling, 10000) and listed it as a gap | gap | gap | gap |
| **`stat.max` turns red only past the cap**, so "red when full" needed a `badIf` at `>=` too; all read the first wording as covering it and corrected themselves | yes | yes | yes |
| **"Add `state`, change nothing else"** clashes with adding `struct` and `list` to the import line, which `state` needs | yes | noted | yes |
| Composition (item 14): cross-package state, events and annotation reads are unsaid; already Q9, with the seam work (`hjdIRt`) | yes | yes | yes |

Single mentions: whether a `tone` lambda may give `null` (A; the checker cannot tell until lowering lands); that `max?` "(a number)" reads like a literal until "Values" says paths and lambdas count (B); an integer type for counts (A, "relies on exact float equality"); number formatting in a `stat` (B); the stage's coordinate convention, theme colors, and pick feedback (A, B).

## What changed

- **Packet (done, 2026-11-25):** the import line may gain the names `state` uses (rules.md, brief.md); `stat.max` says it is a path or lambda and that it is red past `max`, not at it, and that `max` and `badIf` combine as "red if either"; a `tone` lambda may give `null`. Small enough that no rerun is planned for them.
- **Ruled 2026-11-25 (Ben): option (b); UI lambdas get no list queries yet.** The list maximum. The core list Type needs a `max` (a bounded loop), but a run's state often has lists whose length only the Program knows. Options: (a) keep `list(type, max)` and have the author pick a ceiling, which `checkState` enforces (today; three of three guessed); (b) allow `list(type)` in `state` only, with no ceiling, and give UI lambdas a list they may read by `length` and index but not loop over; (c) let a max name a param (`list(t, "$maxParticles")`). Recommended: (b), since a UI lambda rarely loops and `checkState` is the host's guard anyway; it waits on the lowering leaf (`mkPzcU`), which settles how UI lambdas read lists.
- **Ruled 2026-11-25 (Ben): red at `max`.** Whether `stat.max` should go red **at** `max`. A cap is usually reached, not passed, so all three agents wrote the same extra `badIf`. Ruled as "red past it" (Q7); a one-word change if Ben agrees.
