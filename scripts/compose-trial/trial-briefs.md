# Composition trial: the briefs

*2026-11-24, leaf `ZCE0qf`. What the integrator gives the three fresh agents of the composition paper trial, and how to record the runs. The trial tests a draft design, not built machinery: the packet in `docs/` describes composition and three dialects that do not exist, and the checker's stand-ins record and check the calls a program makes. Design: [the architecture synthesis](../../project/2026-11-24-architecture-synthesis.md) §3.5 and §6 item 3.*

## The agents

| Agent | Model | Directory |
|---|---|---|
| A | Opus | `local/compose-trial/agent-a` |
| B | Sonnet | `local/compose-trial/agent-b` |
| C | Haiku | `local/compose-trial/agent-c` |

Ben ruled the mix (2026-11-24): one of each tier, to see the spread. Name the exact model versions in the findings doc. Because Haiku is in the mix, the brief below spells out every step and the report fallback word for word.

## Setting up each directory

In the main checkout (`local/` is gitignored), for each agent `x` in `a`, `b`, `c`:

1. `mkdir -p local/compose-trial/agent-x/lib`
2. Copy the five files in `scripts/compose-trial/docs/` into `local/compose-trial/agent-x/`: `rules.md`, `composition-draft.md`, `cave.md`, `tiles.md`, `glow.md`.
3. Write `check.sh` there (mode 755), with the absolute paths filled in:

```sh
#!/bin/sh
# Checks this directory against rules.md.
COMPOSE_TRIAL_LOG=/Users/ben/git/workbench/local/compose-trial/agent-x/log.jsonl exec node /Users/ben/git/workbench/scripts/compose-trial/check.js /Users/ben/git/workbench/local/compose-trial/agent-x "$@"
```

Before dispatching, run `node scripts/compose-trial/check.js scripts/compose-trial/fixtures/valid` (it must print `no violations`), so a broken checker is not measured as the agents' difficulty.

Each agent must start from a context that holds none of our design. Per [project/gotchas.md](../../project/gotchas.md), a subagent launched from this session inherits `AGENTS.md`, which names the kit's parts but not the composition draft; that is acceptable for this trial (the draft is new). If a cleaner start is wanted, run each as `claude -p --model <model>` from its directory with the brief as the prompt.

## The brief

Give each agent this text, with `<DIR>` replaced by its directory's absolute path. Nothing else: no repository context, no hints about the design, no mention of the other agents.

> You are taking part in a trial of a design for combining small programming languages. Work only in `<DIR>`. It holds six files: `rules.md`, `composition-draft.md`, `cave.md`, `tiles.md`, `glow.md` and `check.sh`, and an empty `lib/` folder.
>
> Read all five `.md` files, starting with `rules.md`. Read nothing else: do not open any other file under `/Users/ben/git/workbench`, do not search the repository, and do not search the web.
>
> Then do the task in `rules.md`:
>
> 1. Write `<DIR>/program.js`: one program that builds the game `rules.md` describes from a `cave` part, a `tiles` part and a `glow` part, as `composition-draft.md` and the three dialect references describe.
> 2. Write at least one helper file in `<DIR>/lib/`, for the helper the game shares between parts.
> 3. Run `<DIR>/check.sh` and fix what it reports. It prints each problem with its file, line, code and a `fix:` line. Run it as often as you like; it logs each run. Keep going until it prints `no violations`, or until you are sure the documents cannot express what the game needs.
> 4. Write `<DIR>/REPORT.md` with the five sections rule R12 lists, in order: Difficulty (1 to 10), What you had to guess, Where the documents misled you (quote them), Checker runs, What you would change.
>
> Where the documents cannot express part of the game, do not invent API. Write the closest program that checks, mark the gap with a `// GAP: <what>` comment, and say so in your report. How hard this is tells us about the design, not about you, so an honest report of where it failed you is the most useful thing you can hand in.
>
> If your file-writing tool refuses to write `REPORT.md`, write it from the shell with a heredoc instead: `cat > <DIR>/REPORT.md <<'EOF'`, the report, then `EOF` on its own line. Do not return the report as text instead of writing the file.
>
> When you are done, reply with your difficulty score (1 to 10) and one paragraph on the hardest part.

## Recording the runs

For each agent, after it reports:

1. Copy its `program.js`, `lib/`, `REPORT.md` and `log.jsonl` into `scripts/compose-trial/runs/2026-11-24/agent-x/`, replacing the `.gitkeep` there. If the trial runs on another day, rename the directory to that date and update the links that name it. If an agent returned its report as text anyway, save it as `REPORT.md` and mark it as saved by the integrator ([project/gotchas.md](../../project/gotchas.md)).
2. Record from the harness's usage report: tokens, tool calls, time. From `log.jsonl`: checker runs and the first clean run (`node -e` over the file, counting lines and `"ok":true`).
3. Run the checker once more over the recorded copy and keep its output.
4. **Review each program by hand** against the leaf's questions: did cross-part values go through `out` (not internals), did signal-dependent arguments become lambdas, did frames cross through a named conversion, and which side converted? Count, per hand-in, what a seam check caught (from the log: each S-code the agent hit and then fixed), what the checker could not see (a `// GAP:`, a wrong conversion that arithmetic hid, a cycle that would not converge), and how much the final program needed changing to be correct: that is the massage figure the AGENTS.md ruling asks for.
5. Write the findings as `project/<date>-composition-trial.md`, in the shape of [the Definition API trial 1 findings](../../project/2026-11-24-definition-api-trial-1.md), and correct the composition design in place.
