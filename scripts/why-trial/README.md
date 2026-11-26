# Why-text trial

The dogfood trial of the build record's agent-facing "why" text (leaf `HKNInI`), run before the text is built into
the kit. The composition trial's double descent is replayed as a real run on kit/compose and kit/run, and a draft
formatter writes its build events as text. Fresh blind agents get only the bug report, the game's files and that
text (or, in the control arm, the raw build events and input log as JSON), and are asked to say what happened and fix
it. Findings: [project/2026-11-26-why-text-trial-findings.md](../../project/2026-11-26-why-text-trial-findings.md).

## What is here

| Path | What |
|---|---|
| `why.js` | the draft formatter: `why(builds, log, { part?, since?, base? })` and `formatBuild(event, { log?, base?, inputs? })`, pure, from kit/build's build events and kit/run's input log (version 2: the findings' recommended format) |
| `scenario/` | *Glowworm Deep*, in two parts (details below) |
| `run-scenario.js` | plays the session and writes its record: `log.json`, `builds.json`, `why.txt`, `states.json`, `replay.json`; `--scenario <dir>` plays another copy |
| `verify.js` | plays four sessions against a scenario folder and checks the depth each ends at; this is how a fix is scored (rubric R4) |
| `packet.js` | `out` makes a blind agent's folder, with the kit imported by bare name (`--no-session` leaves out `session.js`: round 2); `back` copies an agent's files back with the kit's paths |
| `packet/` | the packet's `TASK.md`, `BUG.md` (round 1) and `BUG-nosession.md` (round 2) |
| `run-blind.sh` | one blind leg: the packet in `/private/tmp/HKNInI-<tag>`, then a `claude -p` run from there, its JSON result in `/private/tmp/HKNInI-<tag>.result.json` |
| `collect.sh` | brings a finished leg into `runs/2026-11-26/<tag>/` and saves `verify.txt` |
| `summary.js` | turns, wall time, cost and verify passes per leg, as a table |
| `rubric.md` | the scoring rubric, written before the runs |
| `runs/2026-11-26/` | `record/` (round 1's evidence, with why.txt v1), `record-v2/` (round 2's), and each leg's hand-in: `<arm>-<model>/` (round 1) and `r2-<arm>-<model>/` (round 2). `reference-host/host.js` (the host forwards after every instant) and `reference-rev/game.package.js` (the game goes down once per cave revision, by `ctx.inputs.$rev.exit`) are the two principled fixes, written before the runs, and each passes `verify.js` when copied into a packet |
| `test/` | the formatter's tests and the scenario's (in `npm test`) |

`scenario/` holds `cave.package.js` (a level carved at build time, on a demand clock, with outputs `start` and `exit`), `game.package.js` (a miner on 1/30 s ticks, who goes down a level while standing on the exit) and `carve.js` (the build-time generator). `glue.js` holds the Programs and the composition. `host.js` builds the parts, runs the composition, and forwards the game's depth to the cave's `depth` param after each chunk of the run. `session.js` is the bug session.

## Usage

```sh
node scripts/why-trial/run-scenario.js <out-dir>                       # the bug session's record, why.txt among it
node scripts/why-trial/verify.js [<scenario-dir>]                      # 4 sessions; exit 0 when a fix passes all
node scripts/why-trial/packet.js out <dir> --arm text|json --record <out-dir> [--no-session]
node scripts/why-trial/packet.js back <agent-dir> <scenario-dir>
scripts/why-trial/run-blind.sh <text|json> <model id> <tag> [<record-dir> [--no-session]]   # sandbox off
scripts/why-trial/collect.sh <tag>
node scripts/why-trial/summary.js
```

On the unfixed `scenario/`, `verify.js` fails two of four sessions: depth 3 where 1 is wanted, and 3 where 2 is. That is the bug. Line 3 of `glue.js` turns off TypeScript for the lambdas, which the kit types. `packet.js out` blanks that line, so a packet's line numbers match `why.txt`'s.

## The scenario

The game ticks every 1/30 s. The cave rebuilds only when its `depth` param changes, and a part's params change only through an input from outside the run, so the host bridges the two. After each 1/10 s `runUntil`, it reads the game's depth and sets the cave's. The miner reaches the exit at T = 7/30 and stops on it. The game therefore goes down at 7/30, 4/15 and 3/10, every time on the old exit, before the host forwards depth 3 and the cave rebuilds at 1/3. A host chunk of 1/4 s or 1/30 s happens to forward in time, which is why the bug is intermittent. Two distractors follow. At T ≈ 1 a roughness slider moves, a real rebuild in which only `params` changes in the record. At T ≈ 1.2 the glue is saved: rebuilt, nothing changed.
