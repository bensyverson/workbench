# Seams relay trial

The checker for the dogfood trial of [the seams draft](../../project/2026-11-25-seams-draft.md) (M4, leaf `Qw03tp`): a relay in three blind sessions. A **maze author** adds output ports and frames to the maze package, knowing nothing of particles; a **particles author** adds an Event input that fires emitters through a `trigger` that is a `ref("in")`, and a value input read through `inputs: { object, name }`, knowing nothing of maze; a **composer** writes a glue program, `workbench.js`, with `kit/compose`, so a burst fires where the maze player picks up a coin. None of the draft is built in the kit yet, so this folder holds stand-ins for the draft's Dialect additions and for `kit/compose`, the checker over them, and a hand-made hand-in per role. It also holds the agent-facing packet and the launcher.

> **Revised 2026-11-26 (leaf `CelvhJ`):** the seams are built in the kit ([kit/seam](../../kit/seam/README.md), the ports, frames and handles in [kit/define](../../kit/define/README.md), [kit/compose](../../kit/compose/README.md)), so the stand-ins this folder held (`checker/`: a wrapped `kit/define`, a `kit/compose` stand-in, the task's G codes, C006 and LOAD) and their tests are retired; git history has them. The real kit judged the same seams a second time (a ref("in") the stand-in had already handled came back as the kit's own D031), so the two could not run together. `check.js` is now a thin command over the real kit, and `real.js` holds the acceptance check of the nine recorded legs. The task checks (G…) are gone: the relay rerun (leaf `WnmLua`) rewrites the packet against the real kit and adds what checks it needs. The docs, `brief.md` and `run.sh` below are the first relay's, unchanged.

## What is here

| Path | What |
|---|---|
| `check.js` | `node scripts/seams-trial/check.js <dir> --role maze\|particles\|compose`: one leg on the real kit. A package leg goes through the [package trial's checker](../pkg-trial/README.md) (kit/package's `loadPackage` and `checkExamples`, the defineUI checks), whose `kit/define` is the real one; a compose leg through `real.js`'s `checkComposeReal`. Prints `<file>:<line>: <code> <message>` (a composition's with its sides in brackets) and `wire …` per planned wire. Exit 0 clean, 1 violations, 2 bad invocation, 3 the checker failed, 4 a folder is missing |
| `real.js` | `RUNS` (the nine recorded legs and the massage each needs), `massage(dir)` (the forced edit, in place), `checkRunReal(run)` (a massaged, re-hashed copy checked on the real kit) and `checkComposeReal(dir)`: both packages loaded and their examples checked by kit/package, the glue's imports read by kit/compose's `scanGlue`, the glue imported with each bare package name resolved to its package's `entry.grammar` (a Node module hook), its default export called with an empty frozen `$`, and the composition's `check` and `plan` with each part's module scope |
| `test/real.test.js` | the acceptance test: each of the nine legs checks clean after exactly its recorded massage, each compose leg has a plan, and `fixtures/valid` (massaged) plans `at: maze.cell → particles.px, point, ×32 +[16, 48]` |
| `fixtures/valid/{maze,particles,compose}` | the first relay's hand-made hand-ins (maze 0.2.0's Event output still has its `from`; the test massages it) |
| `fixture-copy.js` | a fixture assembled in a fresh folder, edited, re-hashed |
| `docs/`, `brief.md`, `run.sh` | the first relay's agent packet and launcher, as run |
| `runs/2026-11-25/` | the nine recorded legs |

`fixtures/` and `runs/` hold candidate code that imports `kit/define` by its bare name, so they are excluded from `tsconfig.json` and kept out of `test/` ([project/gotchas.md](../../project/gotchas.md)).

## The massage the rulings force

The 2026-11-26 rulings change one thing the relay authors wrote: **an Event output has no `from`** (a runtime pushes its records; [the clocks draft](../../project/2026-11-25-clocks-draft.md), question 3), which the real kit refuses as D026. `massage` removes that `from` and nothing else; `RUNS` lists each edit by the recorded file's line, and the test holds it to that list.

| Leg | Massage |
|---|---|
| r1-maze, r1-compose (its `maze/`) | `from` removed from 4 Event outputs (`entered`, `picked`, `bumped`, `cleared`): maze.dialect.js lines 82–85 |
| r2-maze, r2-compose | 1 (`picked`): line 72 |
| r3-maze, r3-compose | 3 (`picked`, `bumped`, `cleared`): lines 80, 85, 90 |
| r1-, r2-, r3-particles | none |

The state lists those outputs read stay in the Dialects, unused by any port. **Not massaged:** r2's `time` and r3's `sec` frames (1-D, seconds, each package's own) and their `f64@time` / `f64@sec` outputs. The ruling gives every package the kit's `s`, but a package's own 1-D frame is still legal (only a frame named `s` is refused, D030), so nothing forces the change: a composer who wired one to a stranger's `f64@s` would get S251 and would relate the two with `.frame`. Whether a 1-D frame that means seconds should be refused is a question for the rerun. With the massage, the three compositions plan `×40 +[20, 45]` (r1, plus `level.out.cleared → fx.in.pulse`, dropping `at`), `×32 +16` (r2) and `×32 +16` (r3).

## Running the trial

A relay is three legs: the maze and particles legs run in parallel, then the compose leg on their hand-ins. Copy each leg's directory to `runs/<date>/<relay>-<role>/` afterwards. G005 trusts the package hashes, so a composer who edits a package and re-hashes it passes it: when recording a compose leg, `diff -r` its `maze/` and `particles/` against the author legs' hand-ins.

Run 2026-11-25: three relays, nine legs, all clean ([the findings](../../project/2026-11-25-seams-relay-trial-findings.md)); records in `runs/2026-11-25/r{1,2,3}-{maze,particles,compose}/`. After that run, `docs/packaging.md` became this trial's own copy of the package trial's (its stale "No ports or seams" line replaced) and `seams.md` says how a glue program's bare names resolve.
