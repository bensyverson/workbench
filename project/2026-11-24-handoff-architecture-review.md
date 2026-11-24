# Handoff: the architecture review, the composition trial, and the backend direction

*2026-11-24, end of session. Starts after [the trial-2 handoff](2026-11-24-handoff-trial-2.md) (`e2a0f21`); this session's commits are `efcd361..` HEAD. No kit code changed this session: it was design review, trial tooling and one trial.*

## What happened

Ben asked whether a better pipeline exists than the one we have, and was willing to discard all of it. The answer, from two independent design consults: **keep it**, and add what it lacks.

- **Two consults** (Opus, effort xhigh) designed the pipeline from first principles from [the brief](2026-11-24-architecture-consult-brief.md): [consult A](2026-11-24-architecture-consult-design.md), a subagent that inherited `AGENTS.md` (partly anchored), and [consult B](2026-11-24-architecture-consult-design-blind.md), a separate `claude -p` run outside the repo (fully blind). B independently arrived at our declarative Definition API, construct state and D1.
- **[The synthesis](2026-11-24-architecture-synthesis.md)** says what changes, folds in [Manuel's pass-design gist](https://gist.github.com/wesen/2c6e5beb40c65cfdb958c240d2de63e0) (§3.7: dependency records that say why, identity apart from revision and content key), and records Ben's ruling (§6).
- **Experiment 1, subset friction**, was answered by the existing surveys (synthesis §7): 111 of 126 DMG lambdas lower; 379 of 548 *Uncommon Math* candidate functions are inside the subset.
- **Experiment 2, [the composition paper trial](2026-11-24-composition-trial.md)** (Opus, Sonnet, Haiku; packet in `scripts/compose-trial/`): the composition rules were easy, with no seam mistakes. All three hit a level reload with no place in the tick and no visible revision; two found no conversion for a length in cells.
- **[Backend direction](2026-11-24-backend-direction.md):** in the browser, the real assembly is wasm; domain passes are where provenance pays. A C compiler in the page and unkernel (Linux in wasm) are parked in the backlog.

## Rulings (Ben, 2026-11-24)

- **Dialects will mostly be written fresh, but must be reusable.** A dialect is a portable package.
- **Composition is "a DSL at `bensyverson/mydsl` plus one on disk or uploaded; use both to do XYZ"**, inside one workbench page.
- **The synthesis's §6 plan, all four items:** M3 gains a required text view, binding-time parameters (replacing `live: true`) and module-scope helpers and constants; a **Composition** milestone follows M3, ahead of form and book (roadmap now M4 Composition, M5 Form and book, M6 More backends, M7 Regenerate); both experiments run now; the proposal is corrected in place.
- **Trial mix:** one Opus, one Sonnet, one Haiku, to see the spread.
- **Backend direction** as in its note (agreed, not a roadmap change).

## Calls made on the main thread (two-way doors)

- Skipped the consults' gap-analysis pass: their agreement answered it.
- Capture: consult B's form (resolve free names against a snapshot of top-level bindings), not consult A's whole-file rewrite (synthesis §5).
- Kept the opaque `Native` slot from consult A (synthesis §5).

## Corrections made this session

- My summary to Ben called D1 "open"; it was ruled and built before M2. The synthesis says so.
- The synthesis's §3.2 understated the kit: DMG lowering already resolves top-level helpers and constants. Corrected in place.

## State of the tracker

- `Cy9u98` (the consult) and `ZCE0qf` (the paper trial) are done.
- New under M3 (`As6TAt`): `wKd0l8` (required text view), `bqYGEM` (binding-time parameters), `gS9dBz` (module-scope helpers and constants).
- New: **M4 Composition (`SPPLaM`)**, with `Uld5D0` (packages and loading), `hjdIRt` (seam types, ports, frames), `f2dMku` (clocks and the scheduler), `HKNInI` (the build record), `IhJ35P` (a workbench from two separately written dialects, with a harder trial). The trial's findings feed them (reloads and revisions into `f2dMku` and `HKNInI`; length frames into `hjdIRt`).

## Review

Not independently reviewed: **the compose-trial checker** (`fa61944`, about 1,900 lines under `scripts/compose-trial/checker/`). The integrator read the packet's docs in full and confirmed three planted seam faults (S301, S251, S312) at the right lines, but did not read the checker's code. Still open from the trial-2 handoff: `a9a690d`, `64f2d2e` and `f9391e2`. `job ls --status done --leaves --without-label reviewed --since 2026-11-23T15:00:00-06:00` lists the leaves.

## Prerelease

`npm run test:prerelease` (2026-11-24, end of session): 16 tests, 16 pass, 0 fail, 42.9 s. Its planted-fault report reads as before: JS 24/26 caught, GLSL 21/24, with the same five escapes the M2 findings explain (no kit code changed this session).

## Next

1. **Review first:** the commits above.
2. **M3 continues** where the trial-2 handoff left it (`5eeJED`, the data-tools Dialect; open decisions `iySXYx` and the date questions on `5eeJED`), plus the three new leaves. Each new Definition API feature gets a dogfood run before it is frozen.
3. **Before any composition rerun,** fix the packet slips the trial found (its findings, item 3).
4. **Ben may want the wasm emitter earlier** than M6 once Composition lands (backend note, a suggestion, not ruled).

## Notes for the next session

- A subagent launched from this session inherits `AGENTS.md`, so it cannot design blind; use `claude -p` from a folder outside the repo (gotchas).
- Trial agents finish fast (50–106 s); a short run is not evidence of skipped reading, but check their hand-in against the docs before trusting a low difficulty score.
- `local/compose-trial/` (gitignored) holds the trial directories; the hand-ins are copied into `scripts/compose-trial/runs/2026-11-24/`. The blind consult's scratch folder is in the job's tmp directory, which is deleted with the job; its design is saved in `project/`.
