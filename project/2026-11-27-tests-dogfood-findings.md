# Tests dogfood findings: blind authors write manifest tests from the draft, and copy its worked example

*2026-11-27, leaf `mxxKTa`, under the local dogfood ruling (AGENTS.md). The design dogfooded is the draft manifest `tests` entry ([kit/package/README.md](../kit/package/README.md), "Tests (draft, 2026-11-27, leaf 74YzpH)"), written by leaf `74YzpH` from Ben's ruling 2 in [the plan](2026-11-27-layer-and-package-tests-plan.md). Records: [scripts/m4-trial/runs/2026-11-27-tests/](../scripts/m4-trial/runs/2026-11-27-tests/).*

**Tests are optional.** The trial's task required tests (and its checker reported T030 and T031) only because the trial was testing the tests design. Ben ruled the same day that tests are optional everywhere, in kit/package, on the page and in every checker. Nothing here makes them a requirement.

## Summary

- **The form works.** All three blind Sonnet authors wrote a manifest `tests` entry that was well formed and passed at their first check. None wrote a harness outside the manifest, though every M4 author had done that the day before. They rated the work 1, 2 and 2 of 5. They spent 14 to 21 turns, 78 to 101 s and $0.59 to $0.66 each. Writing the tests took no rework: no K002, K020, K021 or H code at any check.
- **The tests mean something.** Six hand-made mutants of the three runtimes were each caught by at least one of the author's own tests (below): a score counted after the end, `worth` ignored, walls ignored, a pickup never pushed.
- **The worked example was copied, so the result overstates how easy the form is.** The draft wrote out the M4 authors' tests against their real packages. All three authors copied them, along with the M4 packages' design: names, numbers and test names. One author said so in its report. So the clean first checks show the form can be followed when an example fits. They do not show an author can write tests from the form alone. The worked tests are now placeholders (the memory rule "placeholders, not examples" was already right).
- **One expectation kind was missing.** All three asked, unprompted, to expect a **value output by name**. Each had tested the state field behind the output instead, so the output's `from` went untested. The draft gains `output`. All three also asked to expect a **Draw output's list**; that stays parked.
- **No harness, and nothing against Ben's rulings.** No leg read `ctx.controls`. The game leg took the pad as an Event input and tested it through `in`, which is the path ruling 1 (`in` retires `ctx.controls`) needs.

## The trial

Three legs, each a fresh `claude -p --model sonnet` in its own new folder (`/private/tmp/mxxKTa-<n>`), blind to the repository as in the M4 trial ([scripts/m4-trial/README.md](../scripts/m4-trial/README.md)):

- **Score 1 and score 2** got the M4 score task. **Game 3** got the M4 game task.
- **Tests required.** The tasks were adapted (`scripts/m4-trial/tests-dogfood/task-tests-<role>.md`, appended to the task). Tests had to cover every Event input. The score legs also had to cover the end of the round freezing the score; the game leg had to cover its pickup Event output too. Any test harness outside the manifest was forbidden. REPORT.md gained a **Tests** section.
- **The docs** were the kit's, with the draft already in `package/README.md` and the integration note's lines added, marked draft, to their copies of `START.md` (step 6) and `API.md` ("Testing it"), by `tests-dogfood/patch-docs.js`. The brief added one line: read long docs by offset, not `cat`.
- **The check.** `check.sh` ran `tests-dogfood/check.js`: the M4 author check on a copy whose manifest had `tests` removed (checkManifest refuses it today, K002), then the draft's static checks, then the tests themselves in a simulator.
  - The static checks are `tests-check.js`: shape as K002, names against the Dialect as K020, records against their input's seam as K021.
  - The simulator is `sim.js`. It copies kit/ to a temporary folder and patches the copy's kit/run with the draft's `in` input kind and taps. Each test runs as the draft's `runTests` would: the example alone through `examplePreset`, the test's inputs as `in` entries, each `at` read after `runUntil(at)`, and H006 to H008 reported.
  - **What it simulates, and where it differs from the draft:** it has no replay (N005), it taps every Event output, and it leaves N012 to K021. It ran the draft's own M4 tests green against the 2026-11-26 packages (`tests-dogfood/test/tests-dogfood.test.js`), which confirms the draft's numbers. tests-draft-36 had checked only the score's timing, through the page pad.

## The legs

`node scripts/seams-trial/summary.js /private/tmp/mxxKTa-1 /private/tmp/mxxKTa-2 /private/tmp/mxxKTa-3`, and each leg's REPORT.md:

| Leg | Package | Checks | Codes | Turns | Time | Cost | Difficulty | Tests | Harness outside the manifest | Massage |
|---|---|---|---|---|---|---|---|---|---|---|
| score 1 | `tally` | 3 | none; clean at run 1 | 18 | 101 s | $0.66 | 1 | 4, all passing | none | 0 lines |
| score 2 | `tally` | 2 | none; clean at run 1 | 14 | 78 s | $0.59 | 2 | 3, all passing | none | 0 lines |
| game 3 | `gemmaze` | 4 | none; clean at run 1 | 21 | 95 s | $0.59 | 2 | 3, all passing | none | 0 lines |

The transcripts were read for harnesses (`node scripts/m4-trial/tests-dogfood/scan.js <leg dir>`: every Bash and Write call, and any path outside the folder). No leg wrote a script that imports its runtime, stubs `defineRuntime` or calls `step`. Game 3 used a `python3 -I` one-off to write a long array of pad records into its manifest, which is a text edit, not a harness. No tool call names a path outside the leg's folder.

### What the tests cover (read by hand)

- **Score 1** (4 tests): the default and explicit `points`, two records at one stamp, zero and negative points, fractional points, a record at T = 0, and the end: a record at 29.99 counts, and records at 30 and 31 do not, with the score held to 35 s.
- **Score 2** (3 tests): the default and explicit `points`, a negative value, three records inside one 0.1 s step, the records at 4.95, 5 and 5.05 around a 5 s end, and the score held to 8 s with `until: 10`.
- **Game 3** (3 tests): a tap moves one cell, walls block (with a later move that must succeed, added after the author saw its first version would pass with the input ignored), and holding repeats and picks up a gem, with the exact `picked` record and a count of 0 in the tap test.

### Were the expectations right? Mutants

`node scripts/m4-trial/tests-dogfood/mutate.js <package> <runtime file> <old> <new>` copies the package, makes one change to its runtime, rehashes it and runs its tests in the simulator:

| Leg | Mutant | Result |
|---|---|---|
| score 1 | records count after the end (`rec.$T < end - EPS && ` removed) | killed: end-freezes-score, at 30 s and 35 s |
| score 1 | `worth` ignored (`rec.points * state.worth` → `rec.points`) | killed: 2 of 4 tests |
| score 2 | records count after the end (`if (event.$T < end) ` removed) | killed: end-freezes-score |
| score 2 | `worth` ignored | killed: events-score |
| game 3 | walls ignored | killed: walls-block |
| game 3 | no pickup record pushed | killed: holding-repeats-and-picks-up's `events` expectation |

### What misled, and what they guessed

- **"Not built" against "the check runs them"** (all three). package/README.md says checkManifest refuses `tests` (K002). START.md step 6 says the check runs them. The task's note on the stand-in settled it each time. This is a dogfood artifact, and it ends when the build removes the draft marking. No draft change.
- **The worked M4 tests** (all three copied them; score 1 flagged it):
  - Both score legs named their package `tally`. Each had an `examples/sprint.js` 30 s round worth 10 and an input `scored: Event<{ points: f64 = 1 }>`, and kept the "counts when `$T` is before the end" rule. Score 2's test names are the draft's (`events-score`, `end-freezes-score`).
  - Game 3's example is `examples/garden.js`, with the player at [1, 1] and a gem at [4, 1]. Its first test is the draft's `pad-moves-player` with one stamp changed (0.6 → 0.55) and a new name. Its refusal is `refusals/two-starts.js`, the M4 game's.
- **When the first step is** (score 1 guessed it). The draft said "its first step at T = 0" only inside the score example. Every `T` and `at` depends on it.
- **What `until` does** (score 2). It extends the run but checks no state at the end.
- **Event input sizing for unknown producers** (both score legs picked a large max, 1024 and 256). This is not about tests; it is the M4 trial's known sizing friction.

### What they wanted and could not say

- A value output by name: all three.
- A Draw output's ops: all three ("TIME UP", the goal color, a picked gem gone from the picture).
- A test's own small level or params: score 1 and game 3.
- "Unchanged since" as a relation: score 1.
- Defaults on the pad's fields, since a tap is two four-field records: game 3.
- A glue-level test: score 2.

## Draft changes, and why

In kit/package/README.md, "Tests (draft …)", still marked draft:

1. **The worked M4 tests became placeholders** ("Two common tests, in placeholders": a test of an Event input, and a test that something stops). The section also warns that a test showing nothing happened passes when the input is ignored, which game 3 met. Why: all three legs copied the worked tests and the M4 designs. The M4 tests are kept below, as evidence, and they pass in the simulator.
2. **A fourth expectation kind, `output`:** `{ at, output, value, within? }`, the value a wire would read, through a new draft `run.output(part, port)` in kit/run. It is K020 when it names no value output. Why: three of three authors asked for it, and testing the state behind an output leaves the output's `from` untested.
3. **When the part steps** is stated: T = 0, then the clock's instants, and `init` has no T. Why: score 1 had to guess it.
4. **`until`** says it checks no state. Why: score 2.
5. **Questions for Ben became Rulings (Ben, 2026-11-27)**, quoted:
   - **(1) `in` retires `ctx.controls`.** The draft names what must hold: a part takes each control as an Event input with the control's seam; on the page, `examplePreset` wires the page's controls to the one input per control that takes the control's seam, keeping the page wire's fold (two such inputs are ambiguous and reported); headless runs and tests use `in`. It also names the readers to migrate: the seams-trial fixtures and checker, the why-trial scenario, and kit/run's tests.
   - **(2) Tests are optional everywhere**, and the trial-only requirement is named as such.
6. **"Not in this draft"** lists each dogfood request that stays parked, with what would un-park it.

The pointer sections follow. kit/run's draft gains `run.output` and the retirement of `ctx.controls`. kit/page's draft says a package without tests shows nothing, and that `examplePreset` wires the page's controls (while `runTests` builds without those wires, since an `in` to a wired input is N011).

## For Ben

Neither ruling is challenged by what the legs did. Two points touch them:

- **Ruling 1 has a cost the draft now names.** On the page, a part played alone needs the preset to wire the page's controls, a small new behavior with an ambiguity case (two inputs that take one control's seam). That replaces `ctx.controls` rather than adding surface. Whether the ambiguity is refused or resolved by a naming convention is open; the draft refuses.
- **Ruling 1 and the new `output` kind pull against each other.** "A smaller and simpler API surface" argues against a fourth kind. The case for it is that all three authors asked for it, and it reads the port a composer actually wires. If Ben prefers fewer kinds, `state` could narrow to value outputs only; no leg needed a state path that no output exposes except the game's `held.right` and `gems.length`.

## Reproducing

```sh
scripts/m4-trial/run-tests-dogfood.sh score /private/tmp/mxxKTa-1 sonnet   # sandbox off: claude reads ~/.claude
scripts/m4-trial/run-tests-dogfood.sh score /private/tmp/mxxKTa-2 sonnet
scripts/m4-trial/run-tests-dogfood.sh game  /private/tmp/mxxKTa-3 sonnet
node scripts/seams-trial/summary.js /private/tmp/mxxKTa-1 /private/tmp/mxxKTa-2 /private/tmp/mxxKTa-3
node scripts/draw-trial/record.js /private/tmp/mxxKTa-1 scripts/m4-trial/runs/2026-11-27-tests/score-1   # and the others
node scripts/m4-trial/tests-dogfood/check.js --role game scripts/m4-trial/runs/2026-11-27-tests/game-3/gemmaze
node scripts/m4-trial/tests-dogfood/mutate.js scripts/m4-trial/runs/2026-11-27-tests/score-1/tally tally.runtime.js 'rec.$T < end - EPS && ' ''
node --test scripts/m4-trial/tests-dogfood/test/
```

The run used Sonnet 5.5 at every leg, $1.84 in all.

## Appendix: the worked M4 tests the draft held until this leaf

<!-- the block below is the draft's former section "The M4 authors' tests, in this form", verbatim -->
The tests the M4 trial's authors asked for and could not write (scripts/m4-trial/runs/2026-11-26/), against their packages' real names. They are theirs, written here in this draft's form; none of them is in a manifest.

The game author (`gemgrid`, example `examples/garden.js`: the player starts at cell [1, 1], a gem at [4, 1]; a 1/30 s tick; a new direction moves one cell at once):

```json
"tests": [
  {
    "name": "pad-moves-player",
    "example": "examples/garden.js",
    "inputs": [
      { "T": 0.5, "in": "pad", "value": { "up": false, "down": false, "left": false, "right": true } },
      { "T": 0.6, "in": "pad", "value": { "up": false, "down": false, "left": false, "right": false } }
    ],
    "expect": [
      { "at": 0.4, "state": { "player": [1, 1] } },
      { "at": 1, "state": { "player": [2, 1], "collected": 0, "held.right": false } },
      { "events": "picked", "count": 0 }
    ]
  },
  {
    "name": "taps-pick-a-gem",
    "example": "examples/garden.js",
    "inputs": [
      { "T": 0.5, "in": "pad", "value": { "up": false, "down": false, "left": false, "right": true } },
      { "T": 0.6, "in": "pad", "value": { "up": false, "down": false, "left": false, "right": false } },
      { "T": 0.7, "in": "pad", "value": { "up": false, "down": false, "left": false, "right": true } },
      { "T": 0.8, "in": "pad", "value": { "up": false, "down": false, "left": false, "right": false } },
      { "T": 0.9, "in": "pad", "value": { "up": false, "down": false, "left": false, "right": true } },
      { "T": 1.0, "in": "pad", "value": { "up": false, "down": false, "left": false, "right": false } }
    ],
    "expect": [
      { "at": 1.5, "state": { "player": [4, 1], "collected": 1, "gems.length": 4 } },
      { "events": "picked", "from": 0.9, "to": 0.9, "records": [{ "at": [4.5, 1.5], "collected": 1 }] }
    ]
  }
]
```

The score author (`scoretimer`, example `examples/sprint.js`: a 30 s round from its first step at T = 0, `worth` 10; a 0.1 s tick; a record counts when its `$T` is before the end):

```json
"tests": [
  {
    "name": "event-scores",
    "example": "examples/sprint.js",
    "inputs": [
      { "T": 1, "in": "scored", "value": {} },
      { "T": 2, "in": "scored", "value": { "points": 2 } }
    ],
    "expect": [
      { "at": 1.5, "state": { "score": 10 } },
      { "at": 2.5, "state": { "score": 30, "over": false } }
    ]
  },
  {
    "name": "end-freezes-score",
    "example": "examples/sprint.js",
    "inputs": [
      { "T": 29.5, "in": "scored", "value": {} },
      { "T": 30, "in": "scored", "value": {} },
      { "T": 31, "in": "scored", "value": { "points": 5 } }
    ],
    "expect": [
      { "at": 30, "state": { "score": 10, "over": true, "left": 0 } },
      { "at": 32, "state": { "score": 10, "over": true } }
    ]
  }
]
```

(`{}` is a whole `scored` record: its one field, `points`, has a default of 1. The record stamped 30 is taken at the step at 30 and ignored, since its `$T` is not before the end; the one at 31 reaches a round already over.)
