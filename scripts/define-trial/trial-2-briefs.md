# Trial 2: the briefs

*2026-11-24, leaf `O63kB5`. What the integrator gives the three fresh agents of dogfood trial 2, and how to record the runs. Trial 1 kept no copy of its brief; this file is the record for trial 2. The task is trial 1's, adjusted only for the built API: the packet in `docs/` now describes the API as built, and the checker runs the real `kit/define` (builder, construct state, conventions, lowering).*

## The agents

| Agent | Model | Directory |
|---|---|---|
| A | Sonnet | `local/define-trial-2/agent-a` |
| B | Sonnet | `local/define-trial-2/agent-b` |
| C | Haiku | `local/define-trial-2/agent-c` |

Ben ruled the mix (2026-11-24): two Sonnet and one Haiku, after the build. Name the exact model versions in the findings doc.

## Setting up each directory

In the main checkout (`local/` is gitignored), for each agent `x` in `a`, `b`, `c`:

1. `mkdir -p local/define-trial-2/agent-x`
2. Copy `scripts/define-trial/docs/api-draft.md` and `scripts/define-trial/docs/rules.md` into it, and `project/2026-11-24-data-tools-dream-code.md` as `dream-code.md`.
3. Write `check.sh` there (mode 755), with the absolute paths filled in:

```sh
#!/bin/sh
# Checks this directory against rules.md.
DEFINE_TRIAL_LOG=/Users/ben/git/workbench/local/define-trial-2/agent-x/log.jsonl exec node /Users/ben/git/workbench/scripts/define-trial/check.js /Users/ben/git/workbench/local/define-trial-2/agent-x "$@"
```

Before dispatching, run `node scripts/define-trial/check.js scripts/define-trial/fixtures/valid` (it must print `no violations`), so a broken checker is not measured as the agents' difficulty.

## The brief

Give each agent this text, with `<DIR>` replaced by its directory's absolute path. Nothing else: no repository context, no hints about the language, no mention of trial 1.

> You are taking part in a trial of an API design. Work only in `<DIR>`. It holds four files: `rules.md`, `api-draft.md`, `dream-code.md` and `check.sh`.
>
> Read `rules.md`, `api-draft.md` and `dream-code.md`, and nothing else in the repository: do not open any other file under `/Users/ben/git/workbench`, and do not search the web. Then do the task `rules.md` sets: define the data-tools language with the Definition API that `api-draft.md` describes, rewrite each of the ten Dream Code examples as a Program in the builder your definition generates (or refuse it, as rule R6 says), and write `REPORT.md` with the sections rule R9 lists.
>
> Check your work with `<DIR>/check.sh`. It runs the real API over your files: your definitions, every example's builder calls, and the type-checking of every lambda. It prints each problem with its file, line, code and a fix. Run it as often as you like; it logs each run.
>
> Where the API cannot express something, do not invent API: refuse the example or report the gap. How hard this is tells us about the API, not about you, so an honest report of where it failed you is the most useful thing you can hand in.
>
> If your file-writing tool refuses to write `REPORT.md`, write it from the shell with a heredoc instead: `cat > <DIR>/REPORT.md <<'EOF'`, the report, then `EOF` on its own line. Do not return the report as text instead of writing the file.
>
> When you are done, reply with your difficulty score (1 to 5) and one paragraph on the hardest part.

## Recording the runs

For each agent, after it reports:

1. Copy its `data.dialect.js`, `data.grammar.js`, `examples/`, `REPORT.md` and `log.jsonl` into `scripts/define-trial/runs/2026-11-24-trial-2/agent-x/`, replacing the `.gitkeep` there. If the trial runs on another day, rename the directory to that date (`runs/<date>-trial-2/`) and update the links that name it.
2. Record from the harness's usage report: tokens, tool calls, time. From `log.jsonl`: checker runs and the first clean run (`node -e` over the file, counting lines and `"ok":true`), as trial 1's findings doc did.
3. Run the checker once more over the recorded copy and keep its output for the findings: how much each hand-in needed changing to check clean is the massage figure the AGENTS.md ruling asks for.
4. Write the findings as `project/<date>-definition-api-trial-2.md`, in trial 1's shape ([project/2026-11-24-definition-api-trial-1.md](../../project/2026-11-24-definition-api-trial-1.md)), and correct the design in place.
