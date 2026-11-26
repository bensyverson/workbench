# Why-text trial: findings

*2026-11-26, leaf `HKNInI` (M4 Composition, `SPPLaM`). Before the kit builds the build record's agent-facing "why" text ([the build record draft](2026-11-26-build-record-draft.md), "Next"), the composition trial's double descent was played as a real run on kit/compose and kit/run. A draft formatter turned its build events into text, and fresh blind agents were given the bug report, the game's files and either that text or the raw build events as JSON. They were asked to say what happened and fix it. The tooling, the record and every hand-in are in [scripts/why-trial/](../scripts/why-trial/README.md).*

## The result in one paragraph

**All twelve legs found the double descent and fixed it.** That is two rounds × three models (Opus, Sonnet and Haiku 5.5) × two arms (the text, or the raw build events and log as JSON), and every fix passes a scripted check of four sessions. So the "why" text misled no one, but this trial cannot show that the text is needed: the game's code makes the cause visible on its own (see Round 1). The text's value showed in what the agents had to guess. In round 1, five of six agents listed as a guess whether the game's step at the rebuild's instant sees the new cave. Version 2 of the text states it, and in round 2 one text-arm agent of three still listed it, quoting the line that answers it, against all three JSON-arm agents. With the session script removed, version 2's `inputs:` line was the text arm's only source for the pad's timing, and all three used it. **The run itself is the larger result. The kit can express the scenario only through a host bridge,** because no wire carries a part's output into another part's build-time param. A host that advances the run in chunks then brings the double descent back, which the clocks draft says goes away. And **a build-time param's value is part of the content key,** so the draft's "rebuilt, nothing changed" case cannot happen for a param change. Both go to Ben as kit questions. The recommended format is version 2 below.

## The scenario, on the real kit

*Glowworm Deep* has two parts. The `cave` builds a level at build time from `seed`, `depth` and `roughness`, runs on a demand clock, and outputs the `start` and `exit` cells. The `game` moves a miner one cell per 1/30 s tick and adds one to `depth` on every tick the miner stands on the exit. The miner reaches the exit at T = 7/30 and the player lets go there. The game descends at 7/30, 4/15 and 3/10, every time on the old exit. Then the host forwards depth 3, and the cave rebuilds before 1/3. Two distractors follow: a roughness change at T ≈ 1, and a save of the glue with no change at T ≈ 1.2. `node scripts/why-trial/run-scenario.js <out>` plays it and writes `log.json`, `builds.json`, `why.txt` and `replay.json` (the replay matches). `node scripts/why-trial/verify.js` fails the unfixed game on 2 of 4 sessions.

**The kit can express the scenario, but not as the composition trial and the clocks draft describe it.** Two findings for the kit build:

1. **No wire carries a part's output into another part's build-time param.** A param changes only through a `param` input from outside the run. So "the game raises `depth`, the cave rebuilds" needs a host that reads the game's state and sets the cave's param. The clocks draft says "the cave … rebuilds before instant `n + 1`", but that holds only if the host bridges after every instant. A host that advances the run in chunks, as any host driving `runUntil` from a frame loop does, brings the double descent back. In this run the chunk was 1/10 s, three game ticks. So the double descent has not been designed away. It has moved into the host, where no check sees it. **Recommended for the kit:** a glue-level wire from an output to a build-time param (`.wire(game.out.depth, cave.param.depth)` or similar), applied by kit/run between instants, so the rebuild lands before the consumer's next step whatever the host does. Short of that, kit/run's README should say that a host bridging state into params must do it after every instant. This is a design question for Ben, not a fix (queued below).
2. **A build-time param's value is in the record (`record.params`), so any change to it changes the content key.** The draft's no-op case for a param ("a param changed, but nothing at build read it differently … keeps the revision") therefore cannot happen. The roughness change 45 → 46 builds the identical level (carve rounds roughness to the nearest 10), yet the cave goes to revision 3, and every consumer sees a new `$rev` with nothing new in it. Only a `rebuild` input whose record is identical (the glue save) yields "rebuilt, nothing changed". **Recommended for the kit:** leave the params' values out of `partKey`, since the declarations are already in the record and what build code made from the values is in the rest of it, so that a param change that builds the same record keeps the revision. kit/build's README invariant ("A param build-time code read is in the record where the code put it") is right, but the key also hashes the value a second time, through `params`. The scenario test pins today's behavior (`scripts/why-trial/test/scenario.test.js`).

Smaller kit notes: a param read's `file` is an absolute `file://` URL, so the formatter takes a `base` to shorten it. A `param` input records no origin (the host or the person), so the text cannot say who set it. Building a part with its reads takes host plumbing: `host.js` composes with builders and then swaps in each part's record from `run(program, { values })`, as kit/run's own tests do.

## The format

`scripts/why-trial/why.js`: `why(builds, log, { part?, since?, base? })` and `formatBuild(event, { log?, base?, inputs? })`, pure, from kit/build's build event and kit/run's input log. Version 2, as the round-2 agents read it (the first build of the scenario; `runs/2026-11-26/record-v2/why.txt`):

```
build cave@2 after instant T=3/10 (0.3 s), before instant T=1/3 (0.333 s)
  because:     param cave.$.depth changed 0 → 3, set by a param input stamped T=1/3 (0.333 s)
               read at build time at glue.js:12 (before cave.grid)
  key:         sha256-Il/pah… → sha256-fGVdjA… (record changed: exit, grid, params, start)
  kernels:     cave.shade unchanged
  consumers:   game.in.start, game.in.exit read cave@1 at every step before T=1/3 (0.333 s), and cave@2 ($rev 2) from their first step at or after it
  inputs:      since the run started: T=1/30 (0.033 s) game pad right; T=1/4 (0.25 s) game pad none; T=1/3 (0.333 s) cave.$.depth = 3
```

The no-op and the params-only build:

```
build cave@3 after instant T=6/5 (1.2 s), before instant T=37/30 (1.233 s): rebuilt, nothing changed; revision kept
  because:     glue edit (the call was not recorded)
  key:         sha256-LFGR3I… unchanged
  consumers:   game.in.start, game.in.exit keep reading cave@3 (no new revision)

  key:         sha256-fGVdjA… → sha256-LFGR3I… (record changed: params only: the param values differ, but nothing the build made from them does)
```

A failed build's first line is `build cave FAILED after instant …; cave@1 keeps running`, followed by `diagnostics:`. A package trigger reads `package changed <key> → <key> (files: …)`, and a kit trigger reads `kit upgraded <from> → <to>`.

**Version 1**, the one round 1 read (`runs/2026-11-26/record/why.txt`), differed in three places. Its first line was `build cave@2 at T=1/3 (0.333 s), between instants T=3/10 (0.3 s) and T=1/3 (0.333 s)`. Its consumers line was `… see cave@2 ($rev 2) from their next step at or after T=1/3`. It had no `inputs:` line, and no special wording for a params-only record.

## Round 1: the full packet

Each agent got `BUG.md`, the packages, `glue.js`, `carve.js`, `host.js`, `session.js` (the pad script), and the evidence: `why.txt` v1 (text arm) or `builds.json` and `log.json` (JSON arm). Rubric: [scripts/why-trial/rubric.md](../scripts/why-trial/rubric.md), written before the runs. Each item scores 0 or 1; R5 scores ½ for an edge trigger, which counts once per arrival rather than once per level (the agents named that gap themselves).

| Leg | Model | R1 cause | R2 host chunk | R3 distractors | R4 verify | R5 principled | R6 no false claim | Score | Turns | Time | Cost |
|---|---|---|---|---|---|---|---|---|---|---|---|
| text-opus | Opus 5.5 | 1 | 1 | 1 | 4/4 | ½ edge trigger | 1 | 5.5 | 7 | 66 s | $0.364 |
| text-sonnet | Sonnet 5.5 | 1 | 1 | 1 | 4/4 | 1 flag until new start | 1 | 6 | 18 | 69 s | $0.221 |
| text-haiku | Haiku 5.5 | 1 | 1 | 1 | 4/4 | ½ edge trigger | 1 | 5.5 | 12 | 86 s | $0.018 |
| json-opus | Opus 5.5 | 1 | 1 | 1 | 4/4 | 1 flag until new start | 1 | 6 | 13 | 87 s | $0.463 |
| json-sonnet | Sonnet 5.5 | 1 | 1 | 1 | 4/4 | 1 flag until new start | 1 | 6 | 12 | 69 s | $0.242 |
| json-haiku | Haiku 5.5 | 1 | 1 | 1 | 4/4 | ½ edge trigger | 1 | 5.5 | 10 | 79 s | $0.018 |

Model ids `claude-opus-5-5`, `claude-sonnet-5-5`, `claude-haiku-5-5`. Turns, time and cost: `node scripts/why-trial/summary.js` (from each leg's `result.json`). R4: each leg's `verify.txt`, from `scripts/why-trial/collect.sh <tag>`.

**Every leg found the cause, the host's chunk and the distractors, and every fix passes.** No leg used `$rev`, and none fixed the host. All six fixed `gameStep`: three with a flag that holds until a new start arrives, three with an edge trigger. The evidence's form made no difference that the rubric can see. The reason is the trial's confound: `host.js`'s own comment says the host forwards depth "after each chunk", and `session.js` gives the pad's timing, so the agents could trace the ticks by hand from the code. They did. Every leg reconstructed 7/30, 8/30, 9/30 itself, and cited the evidence only for "0 → 3 at 1/3" and for the distractors. **Where the text left them guessing** (their GUESSES sections; nothing misled them into an error):

- **Whether the step at 1/3 sees the rebuild.** Five of six listed it as a guess. v1's `at T=1/3, between instants 3/10 and 1/3` and `from their next step at or after T=1/3` did not settle it. v2 says `after instant 3/10, before instant 1/3` and `cave@2 from their first step at or after it`.
- **What the consumer read before the rebuild.** That the game's steps at 7/30 to 3/10 read cave@1 had to be inferred. v2 says `read cave@1 at every step before T=1/3`.
- **The pad's timing.** The text arm took it from `session.js`, and the JSON arm from `log.json`. v1's text had no inputs at all. v2 adds the log's inputs since the part's previous build.
- **Whether the roughness build changed the level.** Every leg settled it by working out `carve`'s rounding (`Math.round(4.5) = Math.round(4.6)`), not from `record changed: params`. v2 words a params-only change explicitly (and the kit should make it a no-op, finding 2).
- Packet slips: round 1 wrote `result.json` into the agent's folder, where four agents saw an empty file and said so. json-opus wrote a scratch script to `/tmp/gwsim/` against "do not look outside this folder" (it never ran). Two agents tried to run a Node simulation of the step and were refused.

## Round 2: no session script

To make the evidence carry weight, round 2 removed `session.js`. `BUG.md` says the player kept no script, so the pad's timing is only in the evidence: in v2's `inputs:` line, or in `log.json`. The text arm read v2. Same models, same rubric, fresh folders, the result JSON written outside the folder.

| Leg | Model | R1 | R2 | R3 | R4 verify | R5 principled | R6 | Score | Turns | Time | Cost |
|---|---|---|---|---|---|---|---|---|---|---|---|
| r2-text-opus | Opus 5.5 | 1 | 1 | 1 | 4/4 | ½ edge trigger | 1 | 5.5 | 5 | 54 s | $0.310 |
| r2-text-sonnet | Sonnet 5.5 | 1 | 1 | 1 | 4/4 | 1 flag until new start | 1 | 6 | 16 | 61 s | $0.207 |
| r2-text-haiku | Haiku 5.5 | 1 | 1 | 1 | 4/4 | ½ edge trigger | 1 | 5.5 | 11 | 77 s | $0.016 |
| r2-json-opus | Opus 5.5 | 1 | 1 | 1 | 4/4 | 1 flag until new start | 1 | 6 | 9 | 66 s | $0.365 |
| r2-json-sonnet | Sonnet 5.5 | 1 | 1 | 1 | 4/4 | 1 flag until new start | 1 | 6 | 13 | 85 s | $0.269 |
| r2-json-haiku | Haiku 5.5 | 1 | 1 | 1 | 4/4 | 1 edge trigger, and the host forwards every tick | 1 | 6 | 16 | 107 s | $0.023 |

The same commands produce every figure: `node scripts/why-trial/summary.js` and each leg's `verify.txt`.

**Again every leg is correct.** Removing the session did not make the task hard. The bug report says "let go of the pad" on the exit, and `carve.js` gives the exit's cell, so the agents could still trace the ticks by hand. What changed:

- **The pad's timing came from the evidence.** The three text-arm agents took it from v2's `inputs:` line (`T=1/4 (0.25 s) game pad none`). Haiku listed as a guess that "pad none" means a release at that instant, which it does. The JSON arm read it from `log.json`.
- **The boundary guess mostly went away in the text arm.** Only r2-text-opus listed it, and it gave the consumers line as its source ("as the log's 'consumers' line says"). All three JSON-arm agents still guessed it. For example, r2-json-haiku wrote "an input stamped at the next instant applies before that instant's step. If the input applies after the step, …". r2-json-sonnet also guessed that `consumers` "lists what is wired to the cave, not what changed value", which the text states.
- **The text was not misread.** r2-text-sonnet pointed out that "the `@2` and `@3` in the log are build revisions, not level numbers": cave@2 is the depth-3 level, and a reader could confuse the two. No agent did, but the identity notation invites it.
- **Speed and cost:** the text arm was a little quicker and cheaper per model (Opus 54 s against 66 s, Sonnet 61 s against 85 s, Haiku 77 s against 107 s). With one leg per cell, that is noise until shown otherwise.
- **Packet slips again:** r2-json-sonnet left an unrun script in `/private/tmp/glowworm-sim-HKNInI/`, and three agents were refused a Node simulation.

**Why no rerun with a harder scenario.** The question the brief asked can be answered now: can an agent say what happened and fix it from this output? Yes, and the text neither misleads nor loses anything that the JSON carries. Testing whether the text is needed would take a scenario whose cause the code does not show, such as a package swap whose changed file is not in the packet. That is parked below.

## Recommended format for the kit build

**Version 2, as above,** written by a pure formatter in kit/build (`formatBuild(event, { inputs?, base? })`), beside `buildEvent`, so that the scheduler, the page and the lab API share one text (the draft's "one struct for every reader"). kit/run's `why(part?, since?)` passes it the run's builds and its input log. Each build is one block:

1. **A head line:** `build <part>@<rev> after instant <A>, before instant <B>`, plus `: rebuilt, nothing changed; revision kept` for the no-op, or `build <part> FAILED … ; <part>@<rev> keeps running` for a failure. Each time is given as rational text with seconds beside it.
2. **`because:`** the trigger. For a param: the param's old and new values, the input that set it, and each build-time read (file, line, the next builder call). For a package: the two keys and the files that changed. For a glue edit: the call. For a kit upgrade: the two versions.
3. **`key:`** the two keys cut to six characters, and the record's top-level fields that changed.
4. **`kernels:`** each Kernel recompiled, added, removed or unchanged.
5. **`consumers:`** what read the old revision before the boundary, and the new revision (`$rev`) from the first step at or after it. For a no-op, that consumers keep the old revision.
6. **`inputs:`** the log's inputs since the part's previous build, frames left out.

**Changes for the kit build, beyond what was trialed:**

- **When finding 2 is fixed, remove the `params only` wording.** A param change that builds the same record would then be a no-op and say so. Until then the wording is what keeps readers from taking a new revision for a new level.
- **Add an origin to `param` and `rebuild` inputs** (the page, the host, a script), so `because:` can say who set the value. The agents inferred it was the host from `host.js`. Without that file they could not have.
- **Shorten `file` against the workbench's root in kit/run,** not in the formatter: a read's `file` is an absolute `file://` URL today.
- **Keep the text and the events both.** The JSON costs nothing to keep, and agents read either one correctly. The text answered the questions that the JSON left the agents guessing about.

## Queued for Ben

- **A wire into a build-time param** (finding 1). This is the double descent's real fix. Should the glue be able to wire an output into another part's build-time param, so kit/run applies it between instants? Or is the host the right owner, with a rule that it bridges after every instant? Recommended: the wire. A host bridge is invisible to every check, and the clocks draft's promise depends on it.
- **Param values out of the content key** (finding 2). Recommended. Without it, the draft's no-op case for a param cannot happen, and consumers see revisions with nothing new in them.
- **Parked: a harder why trial,** one whose cause the packet's code does not show, such as a package swap whose changed file is left out, or a failed rebuild that keeps the old revision running. It would test whether the text is *needed*, where this trial tested whether it *misleads*. Un-park it when kit/build's text is built, with the same tooling (`packet.js` would take the files to leave out, as `--no-session` does for one).

## Reproduce

```sh
node scripts/why-trial/run-scenario.js scripts/why-trial/runs/2026-11-26/record      # the record (why.txt is v2 now: see below)
node scripts/why-trial/verify.js                                                     # the unfixed scenario: 2 of 4 fail
scripts/why-trial/run-blind.sh text claude-sonnet-5-5 text-sonnet                    # a round-1 leg (sandbox off)
scripts/why-trial/run-blind.sh text claude-sonnet-5-5 r2-text-sonnet scripts/why-trial/runs/2026-11-26/record-v2 --no-session
scripts/why-trial/collect.sh <tag>                                                   # hand-in to runs/, verify.txt
node scripts/why-trial/summary.js                                                    # turns, time, cost, verify per leg
```

`run-scenario.js` writes the formatter's current text. Round 1 read v1, which is kept as `runs/2026-11-26/record/why.txt`. Rerunning the first command overwrites it with v2. The blind runs are not deterministic, so a rerun gives new hand-ins.
