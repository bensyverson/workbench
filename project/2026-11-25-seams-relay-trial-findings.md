# Seams relay trial: two authors who never met, and a composer

*2026-11-25, leaf `cDqmIK` (under `hjdIRt`, M4 Composition, `SPPLaM`). The dogfood pass on [the seams draft](2026-11-25-seams-draft.md), before any of it is built. Each relay is three blind sessions. A maze author adds outputs and frames to the maze package, knowing nothing of particles. A particles author adds inputs and frames to particles, knowing nothing of maze. Then a composer gets only the two hand-ins and writes `workbench.js` so that a burst plays where the player picks up a coin. Packet and checker: [scripts/seams-trial/](../scripts/seams-trial/README.md) (`9b58a8c`). Runs: `scripts/seams-trial/run.sh maze|particles <dir> <model>`, then `run.sh compose <dir> <model> <maze-leg> <particles-leg>`, in `/private/tmp/3d093c96-seams/`. Records: `scripts/seams-trial/runs/2026-11-25/`. Figures come from `node scripts/particles/h5/summarize.js <dirs>`; each hand-in rechecks with `node scripts/seams-trial/check.js <dir> --role <role>`. The models were the integrator's choice, since Ben was away.*

## The result in one paragraph

**The seams held.** All nine legs checked clean. All three composers wired the two packages with **no edit to either** (`diff -r` against the authors' hand-ins), put the only cross-package frame fact in the glue (`"fit"`, all three), and converted nothing by hand. Every author offered or accepted an `Event` with a position, and every pair met with no fix-up. One caveat bounds this, as it did the composition trial: **the reference's worked example is this very pairing.** Its example shows `picked`, `burst`, `{ at: point2@… }` and `trigger: ref("in")`, and all six authors used those names. So the trial shows the mechanics can be followed by strangers. It does not show that strangers' ports meet when nobody showed them the same example. What all three composers hit instead was **the page and time, not the seams**: "drawn over the maze" cannot be said, the hidden maze's D-pad may not reach it, and nobody can tell when a burst plays relative to its pickup. The authors' convergent gaps were a home for the host's duties, a `ref("in")` that can ask for Event inputs only, Event records that cannot reach lambdas, and rates (`px` per second) that cannot be tagged.

## The runs

| Relay | Leg | Model | Difficulty (of 5) | Turns | Time | Cost | Checker runs (first clean) |
|---|---|---|---|---|---|---|---|
| r1 | maze | Sonnet 5.5 | 2 | 7 | 84 s | $0.27 | 4 (1st) |
| r1 | particles | Sonnet 5.5 | 2 | 9 | 84 s | $0.31 | 4 (2nd) |
| r1 | compose | Sonnet 5.5 | 2 | 13 | 72 s | $0.32 | 4 (1st) |
| r2 | maze | Haiku 5.5 | 3 | 10 | 82 s | $0.02 | 2 (1st) |
| r2 | particles | Haiku 5.5 | 3 | 19 | 101 s | $0.03 | 4 (2nd) |
| r2 | compose | Haiku 5.5 | 3 | 11 | 81 s | $0.02 | 2 (1st) |
| r3 | maze | Opus 5.5 | 2 | 6 | 89 s | $0.44 | 4 (2nd) |
| r3 | particles | Opus 5.5 | 2 | 8 | 132 s | $0.65 | 4 (2nd) |
| r3 | compose | Sonnet 5.5 | 2 | 12 | 66 s | $0.31 | 3 (1st) |

Massage: none. No hand-in was changed. No leg read outside its directory: the summarizer's "outside" lines are `cd`s into the leg's own folders.

What each offered:
- **maze, outputs:**
  - r1: nine outputs (`player`, `move: vec2@cell`, and the Events `entered`, `picked`, `bumped`, `cleared`, plus `score`, `coinsLeft`, `t`).
  - r2: `player`, `picked`, `score`, `coinsLeft`, `t: f64@time`.
  - r3: `picked`, `bumped`, `cleared`, `player`, `score`, `coinsLeft`, `t: f64@sec`.
- **particles, inputs:**
  - r1: `burst`, `pulse: Event<{}>`, `intensity: f64`, `wind: vec2@px`, `target: point2@px`, and an emitter `count`.
  - r2: `burst`, `radius: f64@px`.
  - r3: `burst`, `level: f64`, `target: point2@px`.
- **the wires:**
  - All three composers wired `picked` to `burst` through `"fit"`. The plans: r1 `×40 +[20, 45]`, r2 and r3 `×32 +16`.
  - r1 also wired `cleared` to `pulse`. The record's `at` is dropped there, which is the extra-field rule at work.

## Where they converged

| Finding | Who |
|---|---|
| **One part cannot be drawn over another.** `.show` takes one stage. The maze package has only a text view. The frame relation aligns wires but not pictures | all three composers |
| **A hidden part's UI is undefined**: whether its D-pad, tiles and readouts still reach the page. If the pad goes with the stage, nobody can play | all three composers |
| **When a burst plays is unknown**: no shared clock, order of steps, latency bound, or exactly-once delivery across rates. They also asked about pause, rewind and replay | all three composers; r3 particles |
| **The host's duties have no home.** Refilling an Event list, setting a triggered particle's position, and how many particles a record makes all live in comments that nothing checks. A composer sees only `note` | five of six authors |
| **`ref("in")` cannot ask for Event inputs only**, so a `trigger` may name a value input. r1 and r3 wrote their own refusal (R010) | all three particles authors |
| **An Event record cannot reach a lambda**, so a burst cannot carry a strength or a kind, and `spawn` cannot read `at`. Two authors kept the record to `at` for that reason | all three particles authors; r2 composer |
| **A value lambda cannot build a vector from scalars**, so every maze author duplicated the player's position (`player.at` beside `x`, `y`) | all three maze authors |
| **`record` in `extent(record)` is never defined.** All three guessed it is the built Program, and were right | four authors |
| **Rates cannot be tagged**: `px` per second is only `vec2@px`, so a stranger's per-step or per-beat speed converts wrongly. Two authors left a velocity port out for that reason | r1 maze, r1 and r3 particles |
| **`packaging.md` says "No ports or seams … still being designed"**, which contradicts `seams.md` (a packet bug) | r2 maze, r2 particles, r2 composer |
| **A unit such as seconds is per package.** Two maze authors invented a 1-D frame for `t` (`time`, `sec`), and then `t` reaches no untagged input (S252). Every glue would have to restate "1 s = 1 s" | r2, r3 maze (tagged); r1, r3 maze (said so) |
| **An example cannot exercise a port**, since only a glue uses one | r1, r2 maze |

Single mentions:
- An Event list's overflow is unstated.
- Whether `Event<{}>` is allowed: r1 used it and the checker accepted it.
- The spelling of a vector `default`.
- The point/vector distinction is lost inside lambdas (`inp.target + p.pos` passes).
- No way to ask whether an input is wired; a default cannot depend on the Program.
- A list of remaining coins needs a max the grid does not bound.
- A composer cannot size particle speeds "in cells" after `"fit"`.
- How bare package names resolve in a glue program.

## What this changes

In the seams design (answers for Ben in the draft's questions, `oEgyLA`):

1. **`ref("in", { kind: "event" })`** (and `"value"`): a Grammar can ask for one kind of input.
2. **Event records reach the lambdas that an input drives.** An Event input names the lambda slots that see its record, and through which name. In particles, `spawn` would read `ev.at` and any other fields. This replaces "the host places the particle", which every particles author had to describe in prose.
3. **Kit-wide units.** The kit declares a few shared 1-D frames (`s` for seconds), so `t: f64@s` means the same thing in every package, and rates are written `vec2@px/s`. A rate converts by the space edge and the time unit. This is the smallest form that covers all three rate findings and the per-package seconds.
4. **Output lambdas may build a vector** (`(s) => [s.player.x, s.player.y]` for a `point2`), so a port needs no duplicated state.
5. **Doc fixes:** `extent(record)` takes the built record (as `edges` does); a vector `default` is an array; `Event<{}>` is allowed (a bare "it happened"); what happens when an Event list overflows.

Elsewhere:

6. **The host contract is the scheduler leaf's (`f2dMku`).** The kit should own one step protocol: inputs in, state committed, Events delivered exactly once, in order, across rates. Then a package states only what is its own (what a record does) in `note`, and the prose duties go away. The composers' timing questions are that leaf's acceptance list: clock, step order, latency, exactly-once delivery, queue bound, pause, rewind and replay.
7. **The composed page is a new leaf:** layering one part's stage over another's, aligned by the frame relation the glue already gives, and what a part that is not shown keeps (its inputs, tiles and readouts). It belongs to the UI and page work, not to seams. It matters before `IhJ35P`, whose workbench must be playable.
8. **The packet:** drop `packaging.md`'s stale "No ports or seams" line, and say how a glue program's bare names resolve. **The next run must not show the answer:** the reference's example should be a pairing unlike the task's (a sound language and a scoreboard, say), so that whether strangers' field names meet is actually tested. With extra fields dropped and no glue lambdas, a name mismatch (`pos` against `at`) has no fix but a package edit. That is the next design risk, and this trial could not see it.
