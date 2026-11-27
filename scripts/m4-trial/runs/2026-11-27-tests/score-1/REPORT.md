# Report

## Difficulty
1: the package passed `./check.sh` on its first run, and the docs hold a near-worked example of this task (see "Where the docs misled me").

## What I built
`tally/`: one timed round and its score. A Program:

```js
export default () => tally("sprint")
  .title("SPRINT")   // optional: card heading (else the Program's name)
  .seconds(30)       // required: 1 to 3600
  .worth(10)         // optional: score per point, whole, default 1
  .goal(100);        // optional: target shown beside the score
```

- **In:** Event `scored`, `Event<{ points: f64 = 1 }>`. Each record adds `points * worth`; a producer with no `points` field gets 1; `points <= 0` adds nothing; the score is kept to thousandths.
- **Out:** `score` (`f64`), `left` (`f64@s`), `over` (`bool`), `view` (`Draw<8>@card`, a 160 by 40 translucent card with title, score and goal, seconds left and a shrinking bar).
- **Rules:** the round starts at the part's first step. A record counts only if its stamp is before the end. Reaching the goal does not end the round; it only changes the score's color.
- **Examples:** `sprint.js` (30 s, worth 10, goal 100) and `blitz.js` (8 s, defaults).
- **Use:** a composer wires any Event output to `scored` and layers `view` over their picture.

There is no UI module, param, Event output or refusal module; the task asked for none. A title over 19 characters, or a very long score with a goal, runs past the card's edge; I did not add a check for it.

## Where the docs misled me
- `kit/package/README.md` says tests are "Draft, not built" and that `checkManifest` refuses a `tests` key (K002), also in its manifest table. `kit/START.md` step 6 says "The check runs them and reports H006-H008" with only "(draft)". Here `./check.sh` accepts and runs them, as `task.md` says, so the task settled it.
- **Not misleading, but it affects this trial:** `kit/package/README.md`, "The M4 authors' tests, in this form", describes an earlier score-and-timer package (`scoretimer`, `examples/sprint.js`, 30 s, `worth` 10, input `scored`, `points` defaulting to 1, "counts when its `$T` is before the end") with its two tests written out. `task.md` told me to read that section. My names, numbers, end rule and first two tests follow it closely, so this run is not independent evidence that a newcomer can design this package or write its tests from the form alone.

## What I guessed
- A tick part first steps at T = 0. `init` has no `T`, so I store the start at the first step (as `kit/run` advises); the tests that send a record at T = 0 and expect the end at 8 pass.
- `events.in.scored: 1024`. The right number depends on producers I will never see, and too small a one gets a stranger's wire refused (S116).
- Tick of 1/30 s, and an epsilon of 1e-9 when comparing instants as floating seconds.
- `slots: {}` is acceptable for a Dialect with no lambdas, and `params`, `types` and `objects` may be left out. All were accepted.
- A Draw builder may concatenate a string and a number, and a rect of width 0 is fine.
- The ignoring of `points <= 0`, the rounding, the card's size and the optional `title`, `goal` and `worth` are my own design choices.

## APIs I fought
None; nothing had to be rewritten. Two things shaped the design:
- A Draw builder has no number formatting without declaring globals or library helpers, so the runtime keeps `shown` (whole seconds) and rounds the score in state.
- A builder reading an optional slot from `record` would be awkward, so the runtime copies `title`, `goal`, `worth` and `seconds` into state.

## Gaps
- **Sizing an Event input for unknown producers.** A runtime must name one whole number for records per step. Smallest change: let an input that only accumulates say it takes any number, or let the composer set the max on the wire.
- The other gaps found concern tests and are listed below.

## Tests
Easy to write: four tests as manifest data, each passing the first time it ran. They cover the one Event input (default field, explicit points, two records at one stamp, zero and negative points, fractions), the clock, and the end (a record just before it counts; records at and after it do not; the score holds to 35 s).

Where the draft left me guessing:
- Whether the doc's "not built" note or the checker was right (above).
- When the first step happens, which every `at` and `T` depends on. The draft only shows it inside another author's example ("its first step at T = 0").

What it cannot say, or I could not test:
- **Value outputs by name** (`score`, `left`, `over`). I checked the state fields they read, so a wrong `from` would go unnoticed. The draft already parks `run.output`.
- **The picture.** No expectation reads the draw list, so "TIME UP", the goal color and the bar are untested. `check.sh` only checks that the picture is non-empty and changes. Smallest change: an expectation on a Draw output's ops at an instant.
- **"Unchanged since the end"** as a relation. I can only repeat the literal value at later instants, which is enough here.
- **A variant Program** (another goal or length) needs another entry in `examples`, since a test cannot bring its own Program or values.

## Docs I could not reach
None needed. I did not follow the links into `docs/project/` or outside `docs/`.

## Checker runs
3. All printed "no violations" and exited 0, with no codes: the first with 3 of 3 tests passed, the second (after adding rounding and its test) and a final confirming run with 4 of 4.
