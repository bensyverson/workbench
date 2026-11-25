# Handoff: defineUI built, the run's state in the Dialect, the package format drafted

*2026-11-25, end of session. Starts after [the UI trial handoff](2026-11-25-handoff-ui-trial.md) (`8aacd8c`); this session's commits are `7a5e1ae..` HEAD. Ben was away the whole session.*

## What happened

- **`defineUI` is built** (`J7Uzdr`, closed). Plan and the calls made: [the build plan](2026-11-25-defineui-build-plan.md).
  - `quSvgB` (`d5d3f90`): `defineDialect` takes an optional `state`, the **run's** state, in the Dialect's own types (`"f64"`, `struct`, `list(type, max)` …). It gains `stateType` and `checkState(value)`, and its `text(state)` throws on a value that does not fit, naming each path. A bad state is D023. `U` is reserved; api-pilot's reference codes moved to `A`.
  - `Spm6la` (`d5d3f90`): `defineUI(builder, decl, { moduleText? })` in `kit/define/ui.js` and `kit/define/ui/`, with `UI_CODES` (U006 retired; U013 now also means "the Dialect declares no state"), and `stat.max`. The UI trial's checker is now a thin consumer of it.
  - `mkPzcU` (`916cd06`): `ui.lower(record)` lowers every UI lambda through kit/lower against one Program, with `s` typed by the state, `$` by `environment(program)`, and a result Type per key. kit/lower is unchanged: list `length` and the "a number" check live in the UI's wrapper.
  - `u6I0Lc` (`f33738b`): the third UI trial. Three blind agents declared the state in each Dialect, all clean on the first check, no massage, difficulty 2, 2 and 3 of 5. Findings: [project/2026-11-25-ui-state-trial-findings.md](2026-11-25-ui-state-trial-findings.md). `run.sh` now hands agents the Dialects as given (`scripts/ui-trial/packages/given/`).
- **The package format is drafted** (`Uld5D0`, labeled `decision`): [project/2026-11-25-package-format-draft.md](2026-11-25-package-format-draft.md). Its six questions are for Ben.
- **The package probe is built but has not run.** It is in `scripts/m0-probe-pkg/` and published privately at https://claude.ai/artifact/JKj2gqGw6ixnYHknugiiWb. It answers the draft's question 5: an import map, static or added at run time, versus rewritten `blob:` imports for uploads. Open it once in a browser, then read the `pkgprobe/results` document with `ArtifactData get`.

## Calls made without Ben (two-way doors, all in the build plan)

- `state` is optional, because the data Dialect's table has no static shape. It uses the Dialect's types rather than the Grammar's shapes, and `text(state)` is checked at run time, not statically.
- The trial checker became a consumer of the kit, and the recorded runs were not rescored.
- The packet now says a `tone` lambda may give `null`, that `stat.max` takes a path or lambda, that `max` and `badIf` combine as "red if either", and that the Dialect's import line may gain the names `state` uses.
- An unknown `$` param in a UI lambda is L002 from `lower`. The packet says such a lambda "shows nothing", so a host must decide whether that diagnostic blocks the UI.

## Questions for Ben

1. **The package draft's six questions**, at its end.
2. **List maxima in a run's state.** All three trial agents had to guess one. The options are in the trial findings; the recommendation is (b), `list(type)` without a max, allowed in `state` only.
3. **Whether `stat.max` goes red at the max rather than past it.** All three agents added a `badIf` to get "red when full".
4. **List queries in UI lambdas.** `s.bodies.filter(…)` is refused by `defineUI`, and by `lower` unless the Dialect declares queries. Decide whether the UI should get them.

## Review

- **Reviewed:** `d5d3f90` and what survived of `fad3e5c`, by reviewer-ui-1. Its findings:
  - `j0zqdB` and `dPyoXH` are fixed in `f65198f` (fixer-ui-1), each with red-first tests.
  - The small slips are fixed in `10414e9`.
  - **`kQu7xe` is open (HIGH).** `defineUI`'s U007 misses state reads through a local or a root that is not a parameter (fail open). `lower()` catches all three probe shapes as L002, with a test, but `defineUI` alone does not. Decide whether to refuse them structurally or to document that the full check is `lower()`.
- **Not independently reviewed:** `916cd06` (the lowering, about 200 lines plus tests) and `f65198f` (the fixes, which the integrator read in full). Review them first next session. The probes are in `local/rev-ui1/`.

## Prerelease

`npm run test:prerelease` at `f65198f`: 17 tests, 17 pass, 0 fail, 43.8 s. Planted faults: JS 24/26 and GLSL 21/24, with the same five escapes. The fast suite passes 1,953 tests.

## Next

1. Review `916cd06` and `f65198f`, then decide and fix `kQu7xe`.
2. Get Ben's rulings on `Uld5D0` and the probe result, then build the package format, after a dogfood pass per the draft's question 6.
3. The other M4 design leaves: `hjdIRt` (seams, which also holds UI Q9), `f2dMku` (clocks, which `runs` waits on), `HKNInI` (build record) and `IhJ35P`.
4. Two more issues, neither scheduled: `ocy5OI` (scan residue) and `JYmuWM`.
