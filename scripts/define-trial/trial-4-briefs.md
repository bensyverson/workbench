# Trial 4: the briefs

*2026-11-25, leaf `HDwkdF` (for the effects dogfood trial `Tc0QRH`). What the integrator gives the three fresh agents of dogfood trial 4, and how to record the runs. The first trial of a design that is not built: per-slot effects ([docs/api-effects.md](docs/api-effects.md); the design and its reasons are [the effects draft](../../project/2026-11-25-per-slot-effects-draft.md)). The language is particles ([its sheet](../particles/docs/dream-code.md)), not data-tools, and the checker runs in `--effects` mode, which stands in for the draft: it checks the effect declarations, strips them so the real `kit/define` accepts the rest, lowers against a patched Environment and checks each lambda's effects against its slot's `may` ([README](README.md), "The --effects mode").*

## The agents

| Agent | Model | Directory |
|---|---|---|
| A | Opus | `local/define-trial-4/agent-a` |
| B | Sonnet | `local/define-trial-4/agent-b` |
| C | Haiku | `local/define-trial-4/agent-c` |

One agent per tier, as in trial 3, to see the spread across tiers. Name the exact model versions in the findings doc.

## Setting up each directory

In the main checkout (`local/` is gitignored), for each agent `x` in `a`, `b`, `c`:

1. `mkdir -p local/define-trial-4/agent-x`
2. Copy `scripts/define-trial/docs/rules-effects.md`, `scripts/define-trial/docs/api-draft.md` and `scripts/define-trial/docs/api-effects.md` into it, and `scripts/particles/docs/dream-code.md` as `dream-code.md`.
3. Write `check.sh` there (mode 755), with the absolute paths filled in:

```sh
#!/bin/sh
# Checks this directory against rules-effects.md.
DEFINE_TRIAL_LOG=/Users/ben/git/workbench/local/define-trial-4/agent-x/log.jsonl exec node /Users/ben/git/workbench/scripts/define-trial/check.js /Users/ben/git/workbench/local/define-trial-4/agent-x --effects --lang particles "$@"
```

Before dispatching, run `node scripts/define-trial/check.js scripts/define-trial/fixtures/effects-valid --effects --lang garden` (it must print `no violations`, after one `REFUSED` line for `r01.js`), so a broken checker is not measured as the agents' difficulty.

## The brief

Give each agent this text, with `<DIR>` replaced by its directory's absolute path. Nothing else: no repository context, no hints about the language, no mention of earlier trials.

> You are taking part in a trial of an API design. Work only in `<DIR>`. It holds five files: `rules-effects.md`, `api-draft.md`, `api-effects.md`, `dream-code.md` and `check.sh`.
>
> Read `rules-effects.md`, `api-draft.md`, `api-effects.md` and `dream-code.md`, and nothing else in the repository: do not open any other file under `/Users/ben/git/workbench`, and do not search the web. Then do the task `rules-effects.md` sets: define the particles language with the Definition API that `api-draft.md` describes and the effects addition that `api-effects.md` describes, write the example Programs and refusals rule R6 and the hand-in table list in the builder your definition generates, and write `REPORT.md` with the sections rule R9 lists.
>
> Check your work with `<DIR>/check.sh`. It runs the real API over your files, with a stand-in for `api-effects.md`, which is not built yet: your definitions, every example's builder calls, the type-checking of every lambda, and each lambda's effects against what its slot allows. It prints each problem with its file, line, code and a fix. Run it as often as you like; it logs each run.
>
> Where the API cannot express something, do not invent API: refuse the example or report the gap. How hard this is tells us about the API, not about you, so an honest report of where it failed you is the most useful thing you can hand in.
>
> If your file-writing tool refuses to write `REPORT.md`, write it from the shell with a heredoc instead: `cat > <DIR>/REPORT.md <<'EOF'`, the report, then `EOF` on its own line. Do not return the report as text instead of writing the file.
>
> When you are done, reply with your difficulty score (1 to 5) and one paragraph on the hardest part.

## Recording the runs

For each agent, after it reports:

1. Copy its `particles.dialect.js`, `particles.grammar.js`, `examples/`, `REPORT.md` and `log.jsonl` into `scripts/define-trial/runs/2026-11-25-trial-4/agent-x/`. If the trial runs on another day, name the directory for that date (`runs/<date>-trial-4/`) and update the links that name it. The `runs/` folder is already excluded from `tsconfig.json`.
2. Record from the harness's usage report: tokens, tool calls, time. From `log.jsonl`: checker runs and the first clean run (`node -e` over the file, counting lines and `"ok":true`), as trial 1's findings doc did.
3. Run the checker once more over the recorded copy (`--effects --lang particles`) and keep its output for the findings: how much each hand-in needed changing to check clean is the massage figure the AGENTS.md ruling asks for. For each refusal, compare the code the `REFUSED` line printed with the one declared, and whether the mistake is the one the sheet number names.
4. Write the findings as `project/<date>-definition-api-trial-4.md`, in trial 1's shape ([project/2026-11-24-definition-api-trial-1.md](../../project/2026-11-24-definition-api-trial-1.md)), with a section on each effects decision the draft lists (instance spaces, `may` with prefix match, per-member writes, verbs and calls, totals, helpers read-only) saying whether any agent used it, misused it, or worked around it; and correct the draft in place.
