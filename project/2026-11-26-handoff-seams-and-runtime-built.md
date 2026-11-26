# Handoff: seams and runtime built, four drafts ruled

*2026-11-26, end of session. This picks up after [the seams-trialed handoff](2026-11-25-handoff-seams-trialed.md) (`cb7a308`); this session's commits are `b73d216..` HEAD. Ben was around for most of it and ruled on everything below as it came up.*

## Needs Ben's eyes

1. **The R-code collision** (from runtime-build-1, on `ZH4KWX`). kit/run's run-time codes R001–R006 reuse a letter that kit/lir already uses for R001–R006 (the GLSL backend's refusals). The particles packages also use R001–R010 as their own Dialect codes, including a refusal manifest that expects R010. **Recommended:** give the run's codes a free letter and reserve it (check `T` first). Renaming kit/lir's family is the alternative. Reserving R would break the particles packages.
2. **Two design calls runtime-build-1 made that change what a package author writes.** Both are noted on `ZH4KWX`. Confirm or redirect:
   - **Each Event port's per-step max is declared in the runtime:** `defineRuntime(grammar, { events: { out: { picked: 8 }, in: { burst: 8 } }, … })`. Nothing else could carry it once Event outputs lost their `from`.
   - **A runtime calls its lambdas by full id:** `ctx.kernels[`${ctx.part}.control`]`, not the draft's `kernels.control`. An alias by slot name would close the gap.
3. **Whether `W8gh6f` (boolean-only conditions) keeps an opt-out.** The plan has none; Ben hasn't objected.

## What happened

- **Rulings,** each written into its draft's rulings block:
  - **Seams draft (`oEgyLA`, `b73d216`).** Recommendations as given, plus:
    - data-only renames on a wire;
    - a cycle is an error unless one wire is `delay`;
    - per-input Event delivery (`reliable` or `keepLast`);
    - the kit unit `s` and per-second rates;
    - `point1`, from the review.
  - **Clocks draft (`ETSYfC`).** Recommendations as given, plus:
    - cycles break only at a `delay` wire;
    - no drop-oldest: queue bounds are checked at composition (synchronous-dataflow style), and overload slows workbench time.
  - **[The draw-list draft](2026-11-26-draw-list-draft.md) (`FqsPVJ`), new:**
    - a root part composes the others' pictures;
    - a `Draw<max>@frame` output is built by per-item lambdas or a draw handle, plus list concatenation;
    - a general 2-D vocabulary (Ben: don't overfit DMG), with platform limits only in renderer profiles;
    - renderer shaders as `fields` Kernels;
    - 3-D parked.

    Includes a read of how the DMG Workbench draws.
  - **[The build record draft](2026-11-26-build-record-draft.md) (`HKNInI`), new.** All five as recommended.
- **[The seams build plan](2026-11-26-seams-build-plan.md):** four leaves under `wwG0JR`.
- **`c513d92`, the seams (seams-build-1, Opus):**
  - `kit/seam`;
  - ports, frames and handles inside kit/define;
  - `kit/compose`;
  - a package reference;
  - the nine relay hand-ins clean on the real kit;
  - `ufTowc` closed by refusing `rest()` in openings.

  **Reviewed** by reviewer-seams-2: nothing serious. Its findings are filed as `cUXOI7`, and `point1` is added to that leaf.
- **`04fc8f2`, the runtime (runtime-build-1, Opus):**
  - `defineRuntime`;
  - `kit/run`: rational instants, wire order, delayed wires, exactly-once Events, S116 queue bounds, a capped real-time driver, replay and rewind;
  - `kit/build`: keys, revisions, build events;
  - runtime modules for the trial's maze and particles fixtures. A pickup at T = 19/8 bursts at T = 2.4, and replay matches.

  The integrator fixed one carry bug with a regression test.
- **AGENTS.md (`9212530`):** subagents never run the full prerelease suite.
- **Memory:** example workbenches are sketches, not oracles.
- **Backlog:** 3-D (rotation, a Scene seam, a 3-D renderer).

## Review

- `c513d92`: reviewed by reviewer-seams-2. Its leaves are labeled `reviewed`, and its findings are in `cUXOI7`, with probes in `local/rev-seams-1/r2-*`.
- **`04fc8f2`: reviewer-run-1 was still running at handoff.** Its probes are in `local/rev-run-1/`. If its report didn't land this session, rerun the review of `04fc8f2` first (the brief is in this session's transcript; its goal list is the clocks rulings). Then file the findings with `--found-in ZH4KWX` and label ZH4KWX `reviewed`.

## Prerelease

`npm run test:prerelease` at `04fc8f2`: 17 tests, 17 pass, 37.8 s. Planted faults: JS 24/26 and GLSL 21/24, with the same five escapes as before. The fast suite passes 2,314 tests.

## Next

1. **`cUXOI7` plus `3knMDf`:** one Sonnet agent, kit/compose and kit/seam.
   - the six LOW findings;
   - `point1`;
   - S301 for any test or comparison of a handle, by scanning the glue.

   Every finding has a probe as its red test.
2. **`W8gh6f`:** boolean-only conditions everywhere, DMG presets moved to a maintained file and rewritten, with traces compared on the original runtime. Sonnet.
3. **`WnmLua`:** the relay rerun on the real kit, now with runtime modules. Use a reference example unlike the task's pairing. This is the first dogfood of `record: { name, slots }`, renames, `delay` and `defineRuntime`.
4. **`HIX61h`:** list concatenation.
5. **`LUSPEC`:** a sampler in `fields` and kit/emit/glsl.
6. **`e3qYus`:** the draw-list paper trial.
7. **The build record's `why` text:** the draft's small trial, before it is fixed.
