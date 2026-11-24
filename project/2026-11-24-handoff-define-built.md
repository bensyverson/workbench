# Handoff: the Definition API is built; fix its review findings next

*2026-11-24 · current only while no later commit follows the one that adds it. It supersedes [the M3-planned handoff](2026-11-24-handoff-m3-planned.md).*

## Where things stand

- **`kit/define` is built** (`61faf0a`, leaf `38WI7z`, closed and labeled `reviewed`): `defineDialect`, `defineGrammar` (two slot kinds, `lambda()` as an argument spec, construct state), `grammar.lower(record)`. Proved on fields without touching it: Environment equal, `FieldProgram`s deep-equal, Kernels JSON-identical. Read [kit/define/README.md](../kit/define/README.md) for where the build departs from the draft.
- **`npm test` 837 pass; the prerelease suite passed 16 of 16** at the end of this session.
- **The independent review found six important bugs**, four of which silently drop Runtime Lambdas. Each is a leaf found-in `38WI7z` with a failing probe in `scripts/define-probes/` (named `*.probe.js` so `npm test` skips them; see its README): `OTTd8r` (a B011 drops sibling calls, `lower.js:203`), `3t38w5` (a missing `opt()` shifts arguments, `record.js:118`), `ULagYc` (`as` collisions unchecked), `1vFLxi` (probe-named slots uncallable), `uIlROy` (`lambda()` in `opens` never lowered), `BGzGkD` (lowering diagnostics not pinned to their call). Nits in `qCA7Tl`. `free.probe.js` passes (15 tests) and is coverage, not a bug.
- **The design history:** pass 1 ([design doc](2026-11-24-definition-api-design.md)), dogfood trial 1 with two Opus and one Sonnet agent ([findings](2026-11-24-definition-api-trial-1.md); hand-ins in `scripts/define-trial/runs/2026-11-24/`), then the revised draft (`scripts/define-trial/docs/api-draft.md`). The trial's main finding (a table's per-step columns need each lambda's inferred type) became construct state, and it works.

## Rulings this session (Ben, 2026-11-24)

- Dates are a **core nominal scalar** (leaf `vNfBwn`), backed by **f64 milliseconds since the Unix epoch, UTC** (Ben confirmed at the end of the session).
- Source schemas are **declared** in v0.
- The README Quick Start becomes a **walkthrough** of one Program from source through IR to JS, GLSL and the harness, with an arrow-function lambda and a type error (leaf `oLpw71`).
- Trial 2 runs **after the build**, with **two Sonnet agents and one Haiku agent**, the checker running the real builder (leaf `O63kB5`, now blocked by the six fixes and `vNfBwn`).

## Next

1. Fix the six important leaves, each red-to-green from its probe, moving the probe into `kit/define/test/`. They touch `lower.js`, `record.js` and the validators; one agent in order is the natural carve (they share files).
2. `vNfBwn`, the date scalar (backing ruled), and `oLpw71`, the README walkthrough: both small, independent of the fixes except that the walkthrough should use `kit/define` after its fixes land.
3. `O63kB5`: `check` imports `kit/define` (its validators were copied from the checker; delete the copy), the packet is updated to the built API (the leaf's note lists what), then the trial.
4. `iJtvVE`: re-declare fields in place through `kit/define` and delete the hand-written data.

## Open for Ben

- Still open from earlier: Kernel queries (`dynUhe`), a second H3 round, `peep` image checks.

## Notes for the next session

- The harness refused two trial agents' Write of `REPORT.md`; see the gotcha. Every `.js` under a `test/` folder runs as a test; see the gotcha.
- The GLSL backend's pixel-kernel shape is hard-coded (backlog entry of 2026-11-24).
