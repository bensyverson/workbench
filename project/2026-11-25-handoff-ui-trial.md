# Handoff: the UI DSL trial, its rulings, and the shadow-scan and tooling fixes

*2026-11-25, end of session. Starts after [the M3-closed handoff](2026-11-25-handoff-m3-closed.md) (`96163e8`); this session's commits are `0cc0c95..` HEAD. Ben joined at the end and ruled on every open question.*

## What happened

- **The UI DSL trial** (`vp27OC`, closed, reviewed). Findings: [project/2026-11-25-ui-trial-findings.md](2026-11-25-ui-trial-findings.md). Records: `scripts/ui-trial/runs/2026-11-25-{first,rerun}/`.
  - Two rounds of three blind agents (Opus, Sonnet, Haiku). All six were clean on their first checker run, needed no change to comply, and rated difficulty 1–2.
  - Round 1's worked example and snippets were the particles answer, so every example moved to an `orbits` package before the rerun.
  - **Draft changes:**
    - `runs` takes `seconds`, not `ticks`;
    - `$` inside a swept run is defined;
    - the element's update order (`state` last), early properties and size are stated;
    - "a number" means a path or a lambda;
    - `stage` is always present;
    - lambdas cannot build strings;
    - `Math.abs` in the example, which Haiku caught as invalid.
- **Ben's rulings on the draft's nine questions** are the closing block of [the draft](2026-11-25-ui-dsl-draft.md) (`tRGuXV`, closed).
  - The headline is that **the state's shape moves to the Dialect**, which is a Definition API change.
  - The others: `stat` gains `max?`; `U` is reserved; `runs` stays in the language and its host waits on clocks; `defineUI` goes in `kit/define`. Program-level UI is parked in the backlog, and Q9 goes to the seam work (`hjdIRt`).
- **Shadow scan** (`kit/parse/toplevel.js`):
  - `kRYm3Y` fixed in `0cc0c95`.
  - reviewer-kit-4's findings on it fixed in `1eb82c9` (`wLPEcG`) and verified: no misses on its probes, and linear on the measured shapes.
  - The verification's fresh attacks are filed as `ocy5OI` (two rare fail-open forms, two quadratic shapes) and listed in kit/parse/README.md (`5269de0`).
- **Ben ruled acorn stays parked** (backlog entry updated). Reviews will keep finding holes in either design, so a misread in a real Program is the trigger. `JYmuWM` stays open and unscheduled (it fails closed). Do it when the page host also needs module-scope assembly; it is then `build({ scope, file: text })`, with kit/define running the scan.
- **Trial tooling** (`ahT3go`, `fad3e5c`). reviewer-tools-1's findings on the UI checker, both `run.sh`, `summarize.js` and the api-pilot scorer are fixed: U007 on Dialect globals, U008 via `blank`, own-key state lookups, logging on every exit, the canonicalized `run.sh` guard, and summarize's path detection. Recorded verdicts and scores are unchanged.
  - The findings doc's wrong cause for summarize's "outside" lines is corrected in place (`6c96923`).
  - The `summarize` figures for H5 runs changed for `outside` only, which now judges against each transcript's init cwd.

## Calls made without Ben (all later accepted)

- The trial used one agent per tier, as the leaf says, not the handoff's "2 Sonnet, 1 Haiku".
- A second round, because the first one tested copying.

## Review

- **Reviewed:**
  - `0cc0c95` and `1eb82c9` by reviewer-kit-4, the latter verified;
  - `b8210fa`, `66dae9f`, `ce4ff4f` and `4a9111e` by reviewer-tools-1.
- **Not independently reviewed:** `fad3e5c` (the tooling fixes; the integrator read the whole diff). It is tooling only and touches nothing in `kit/`. Review it with the next batch.

## Prerelease

`npm run test:prerelease` at `66dae9f`: 17 tests, 17 pass, 0 fail, 37.8 s; planted faults JS 24/26, GLSL 21/24, the same five escapes. Later commits touched only `kit/parse` (the shadow scan) and trial tooling; the fast suite passes at 1,908.

## Next

1. **Build `defineUI`** (`J7Uzdr`, now unblocked), from the draft plus the rulings. The state shape in `defineDialect` is the first piece. The agent-facing draft (`scripts/ui-trial/docs/ui-draft.md`) still declares state in the UI and must move with the build. Since Q1 moves state, a short dogfood check of the changed parts fits the AGENTS.md ruling.
2. **M4 Composition:** `Uld5D0` (packages), `hjdIRt` (seams, now also holding UI Q9), `f2dMku` (clocks, which `runs` waits on) and `HKNInI` (build record). These are architectural design leaves.
3. **Issues:** `ocy5OI` (scan residue, low) and `JYmuWM` (see above). Neither is scheduled.
4. Review `fad3e5c` with the next batch.
