# Handoff: seams drafted and trialed, clocks drafted

*2026-11-25, end of session. This picks up after [the packages handoff](2026-11-25-handoff-packages-built.md) (`df6f263`); this session's commits are `81afc6a..` HEAD. Ben was away the whole session. Every design choice below is a recommendation waiting for his ruling, and the trial models were the integrator's choice.*

## Needs Ben's eyes

1. **The seams draft's questions 1–11** ([project/2026-11-25-seams-draft.md](2026-11-25-seams-draft.md), end; decision leaf `oEgyLA`). They block the build, `wwG0JR`.
   - The draft's core: dialects written by strangers declare ports in seam types; the composer's glue program wires them and relates frames; the kit converts on the wire.
   - Points, vectors and quantities are kept apart, so lengths convert by the scale alone.
   - Questions 8–11 came from the trial: `ref("in", { kind })`, Event records reaching lambdas, kit-wide units and rates (`vec2@px/s`), and output lambdas that build vectors.
2. **The clocks draft's questions 1–7** ([project/2026-11-25-clocks-draft.md](2026-11-25-clocks-draft.md); decision leaf `ETSYfC`). They block `ZH4KWX`.
   - A runtime module per package: `defineRuntime`, with `init` and `step` over the package's own state.
   - One workbench time on rational tick instants, with wire order inside an instant.
   - Exactly-once, bounded Event delivery; replay from an input log; rebuilds between instants.
   - Its question 3 changes the seams draft: Event outputs would be pushed in `step`, not refilled in state.
3. **The composed page, `FqsPVJ`** (new; it blocks `IhJ35P`). All three composers could not say "drawn over the maze" (one stage per page), and none could tell whether a hidden part's D-pad still works. This needs a design pass with Ben.

## What happened

- **`VwIoy7`, `81afc6a`:** the acorn scan's three residue items, fixed by fixer-scan-2 (Sonnet). The integrator narrowed its `?.` regex rule, which also refused valid `o?.[/a/.source]`.
- **The seams draft, `aeeed13`:** leaf `MajmbQ`.
- **The relay trial checker, `9b58a8c`:** leaf `C0nNGy`, by checker-seams-1 (Opus).
  - It stands in for the draft's Dialect additions and `kit/compose`, and wraps the real kit/define.
  - Building it revised the draft in place: extra record fields are dropped on the wire, an `extent` is a box, and S102 and S257 were added.
  - The integrator wrote the packet in `scripts/seams-trial/`: `docs/`, `brief.md` and `run.sh`.
- **The relay trial, `16d0b82`:** leaf `cDqmIK`, [the findings](2026-11-25-seams-relay-trial-findings.md).
  - Three relays: r1 all Sonnet, r2 all Haiku, r3 Opus authors with a Sonnet composer.
  - All nine legs were clean. Every composer wired the strangers' packages with no package edit and no hand conversion, all through `"fit"`.
  - The caveat: the reference's example was the task's own pairing, so whether strangers' field names meet unprompted is still untested. The next run must use an unrelated example (findings, item 8).
- **`WBd36m`, `715adcf`:** kit/define now checks a ref in a construct's opening arguments against its `names`; it used to fail open. The checker found it.
- **The clocks draft, `b96118c`:** leaf `IBo0RD`.
- **The checker's review fixes, `abbe1de`:** reviewer-seams-1 found nothing HIGH, two MEDIUM and seven LOW, all fixed by checker-seams-1. All nine recorded hand-ins still check clean.

## Review

- `9b58a8c` was reviewed by reviewer-seams-1, and its findings were fixed in `abbe1de`. `abbe1de` itself was read in full by the integrator, and the recorded runs were rechecked.
- `81afc6a` and `715adcf` were reviewed by reviewer-kit-5, who found nothing serious. Its fuzz of 3,360 `?.keyword` programs against V8 found 0 hidden declarations. It found one pre-existing MEDIUM, filed as `ufTowc`: a `rest()` opening argument keeps only its first value, so 715adcf's check sees only that value. Probes are in `local/rev-kit5/`. Its doc nit on `kit/API.md` is fixed.
- The drafts and findings are documents; Ben's ruling is their review.

## Prerelease

`npm run test:prerelease` at `abbe1de`: 17 tests, 17 pass, 0 fail, 37.8 s. Planted faults: JS 24/26 and GLSL 21/24, with the same five escapes as before. The fast suite passes 2,245 tests.

## Next

1. Ben's rulings on `oEgyLA` and `ETSYfC`, then the design pass for `FqsPVJ`.
2. Build `wwG0JR` (kit/compose and the seams in kit/define) from the ruled draft. The trial checker in `scripts/seams-trial/checker/` is the starting point. Its gotcha entry says to add the handles inside kit/define, not by wrapping the builder.
3. If the seams change much, rerun the relay with a reference example unlike the task's pairing (findings, item 8).
4. `HKNInI` (the build record) is undrafted. The clocks draft says what it needs from it: a revision per rebuild, visible to consumers.
5. `ufTowc` (the `rest()` opening argument): one Sonnet agent, with reviewer-kit-5's probe as the red test.
6. `JYmuWM` is still parked (it needs the builder's list of handed arrows).
