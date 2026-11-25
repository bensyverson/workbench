# Handoff: the H5 run, Ben's rulings built, the M4 UI survey and artifact probe

*2026-11-25, end of session. Starts after [the effects-built handoff](2026-11-25-handoff-effects-built.md) (`0c8eba2`); this session's commits are `4a9111e..` HEAD. Ben was around all session.*

## What happened

- **Kit lows** (`3YNVB3`, closed): top-level `function name() {}` helpers are accepted as their arrow twins, and B013 names "a parameter of another lambda" (`6df64d0`). A review then found a reassigned function slipping past the text guard (high). The fix vouches for the helper by identity, not text (`2d87cc2`).
- **The H5 run** (`3Cd9hb`, closed). Six blind agents, two each of Opus, Sonnet and Haiku, built particles from START.md and API.md alone.
  - **Score:** none read kit source (measured from their transcripts). Four scored perfectly on the scored hidden set. D and F refused seven valid Programs on a sheet ambiguity, now settled.
  - **Gaps:** all six named the same strictness rules the API could not say.
  - **Findings and tooling:** [project/2026-11-25-h5-run.md](2026-11-25-h5-run.md). Tooling is in `scripts/particles/h5/`: `run.sh` runs a blind `claude -p` outside the repository, and `summarize.js` reports each run's figures.
  - **Scorer fix:** the scorer now copies a hand-in's own modules (`ce4ff4f`).
- **Hidden set grown** (`JWdGeK`): a blind author added 15 programs for the untested rules (`75e4412`).
- **Ben's rulings** (`MpZZsU`; `6092011`).
  - **Built:**
    - `conditions: "bool"`;
    - `vector(…, { multiply: "scalar" })`;
    - returns on every path (default on);
    - `body: "block"`;
    - one code after L010;
    - `helpers: { check: "all" }`;
    - member `rejected`;
    - the units `keyword`;
    - a B013 for build-time shadowing.
  - **Commits:** the build is `8ad7338` (`ydiY5Y`, `LWKjTf`, Sonnet). The doc and message fixes are `9dfb56b` (`p5NKGd`).
  - **Sheet changes:**
    - helper parameters have one type, so a28 is now r12n;
    - refusal 11's example changed.
  - **Parked:** inline-only lambdas, handles passed whole, slot defaults, the narrower Runtime Subset.
- **Review of `9dfb56b`+`8ad7338`:** one high (the shadow scan counted lambda and helper parameters), two mediums and two lows, fixed in `ada5def` (`PhGecR`). Two lows that predate this batch are filed as issues `CQKwBO` and `Uv2uas`.
- **M4** (`CwuGpd`): survey of nine Workbenches' UI ([project/2026-11-25-workbench-ui-survey.md](2026-11-25-workbench-ui-survey.md)). Then the artifact UI probe ([project/2026-11-25-artifact-ui-probe.md](2026-11-25-artifact-ui-probe.md), `scripts/m0-probe-ui/`): 40 of 41 checks pass. Only programmatic focus fails before the viewer has clicked.
- **Ben's standing preference** (memory): Sonnet for fixes and straight implementation; Opus for design, discovery and review judgment.

## For Ben's eyes

1. **Record the M4 UI decision on `CwuGpd`** (its criterion 5gd), from your direction:
   - a dogfooded kit UI DSL;
   - Web Components as an optional extension inside it, always with a fallback a low-end host renders;
   - controls as declared input events a host lowers (keys, on-screen pad, gamepad);
   - stages as a contract (state and params in, events out) with `text(state)` as the required fallback.
   I can write it as the decision doc on your word.
2. **Token budget:** START.md + API.md is 7,994 of 8,000 (`set -a; . ./.env; set +a; node scripts/api-pilot/count-tokens.js kit/START.md kit/API.md`). The next API addition needs cuts first, or a decision to raise the budget.
3. **Two particles hidden rejects are still beyond the API.** r06d and r08b kill or write through an uncalled helper's parameter, whose type nothing gives. Either accept them as known misses, or let an uncalled helper declare its parameter types.

## Review

**Reviewed this session by fresh reviewers:**
- `4b349c8`, `6df64d0` and `c4cca0f`: findings fixed in `2d87cc2`.
- `9dfb56b` and `8ad7338`: findings fixed in `ada5def`.
Each fix was verified against the reviewer's probes (`local/rev-kit-probes/`, `local/rev-strict-probes/`).

**Not independently reviewed (integrator-read):**
- `2d87cc2` and `ada5def` (the fixes themselves, verified by probe);
- `ce4ff4f` (the scorer copying own modules);
- `4a9111e` (the H5 tooling);
- the probe page `scripts/m0-probe-ui/`;
- the doc commits.

None blocks the rerun. Review `ada5def` with the next batch of kit code.

## In flight at handoff

Nothing. Every agent is integrated and its worktree removed.

## Prerelease

`npm run test:prerelease` at `ada5def` (2026-11-25): 17 tests, 17 pass, 0 fail, 37.7 s. Planted faults: JS 24/26, GLSL 21/24, the same five escapes.

## Next

1. **`WkDS5a`, the H5 rerun** (unblocked):
   - Run six agents with `scripts/particles/h5/run.sh` (two each of `claude-opus-5-5`, `claude-sonnet-5-5` and `claude-haiku-5-5`), in fresh folders under `/private/tmp/<job>-h5b/`.
   - Score: `node scripts/api-pilot/score.js <dir> scripts/particles/hidden --lang particles`. Report over the grown set and the excluded seven separately. The reference misses r06d and r08b.
   - Compare with the first run. The figure to watch is lines of hand-written checks (C and D wrote 700–900).
   - Before reading `summarize.js`'s "outside its directory" list, scan the transcripts for repository paths; it over-flags heredocs (`scripts/particles/h5/README.md`).
2. **Then `cqIENy`, the M3 findings**, with the H5 verdict from the rerun.
3. **Issues `CQKwBO`** (Object.prototype member lookup) **and `Uv2uas`** (three L003s for `||`): small and Sonnet-sized.
