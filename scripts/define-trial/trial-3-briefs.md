# Trial 3: the briefs

*2026-11-24, leaf `bqYGEM` (criterion `vv2`: dogfood binding time before it is frozen). The first trial on the API with binding-time params, module-scope helpers and constants, and the required text view. The task, the packet and the checker are trial 2's as they stand at `04567fb`: `docs/api-draft.md` and `docs/rules.md` already describe those features, and the checker builds each example through `run()`.*

## The agents

| Agent | Model | Directory |
|---|---|---|
| A | Opus | `local/define-trial-3/agent-a` |
| B | Sonnet | `local/define-trial-3/agent-b` |
| C | Haiku | `local/define-trial-3/agent-c` |

One agent per tier, as the handoff [2026-11-24-handoff-data-dialect-landed.md](../../project/2026-11-24-handoff-data-dialect-landed.md) set out, to see the spread across tiers. Name the exact model versions in the findings doc.

## Setup and brief

As in [trial-2-briefs.md](trial-2-briefs.md), with `define-trial-2` replaced by `define-trial-3` in every path. The brief is trial 2's word for word, with only the directory changed. The fixture checked clean before the dispatch (`node scripts/define-trial/check.js scripts/define-trial/fixtures/valid` printed `no violations (the definitions and 3 examples checked)`).

## Recording the runs

As in trial 2, into `runs/2026-11-24-trial-3/agent-x/`. The findings doc is `project/2026-11-24-definition-api-trial-3.md`. It must say, for each of the three features, whether any agent used it, misused it, or worked around it.
