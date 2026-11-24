# Handoff: the widenings land, terms locked, M2 questions open

*2026-11-23 · written at the end of the third session. It is current only while no later commit exists after the one that adds it. It supersedes [the M1-close handoff](2026-11-23-handoff-m1-close.md).*

## Where things stand

- **The open M1 work has all landed, and every `job` leaf is closed:**
  - `CRTQ0c`, the review fixes to the differential tooling;
  - `m82n5e`, the subset widenings;
  - `vLmCEC`, the renames;
  - `FrMVgR`, array literals, `w.bg` and the strict call-site join.

  `job orient` has nothing actionable, and the next work is M2's plan.
- **Survey: 126 lambdas; 109 lowered, 8 helpers, 5 subset, 4 not-yet.** It was 105 / 11 / 1 / 9 at M1's close. The command is `node scripts/dmg-diff/cli.js survey`.
- **Every lowered lambda matches its original.**
  - `diff --all-presets --seeds 7,11 --frames 1200`: 109 swapped, 0 differences, no early stops.
  - `diff` over 04–07: 0 differences.
- **Tests:**
  - `npm test`: 352 tests, about 7 s.
  - `npm run test:prerelease`: 11 tests, all passing at e9515b3, in 87 s. The all-presets run is most of it.
- **Review:** the main thread read every agent's full diff before squashing it. No independent review was run this session on `kit/lower/callsites.js`, `kit/lower/pattern.js` or the helper lowering in `kit/lower/index.js`. Those are the triggers in `project/agents/review.md`, so run one early next session.
- Nothing is pushed.

## Rulings this session (each recorded where it rules)

- **Terms.** Capitalize them when used as terms. They are in [kit/glossary.md](../kit/glossary.md), and [the nomenclature decision](2026-11-23-nomenclature.md) records why. The main ones:
  - Dream Code, Language Definition (Dialect + Grammar + Library), Definition API, Domain Language, Runtime Subset;
  - Environment (was lowering's `Dialect`), Kernel, Iteration Space (was `domain`; the code field is now `space`);
  - IR and LIR, and the DMG Spec.
- **Subset widenings** (the M1 plan, "Subset widenings after M1"):
  - Array literals lower as bounded lists, with no tuple type.
  - `w.bg` is described in the DMG Dialect.
  - Parameter types are inferred with a **strict join**: a closed list, and one error naming both sites on a mismatch. A Dialect's types are nominal, and there is no `Any`. Ben's words: fail quickly and simply, because widening types "when possible" caused trouble on another project (`../loadhigh/`).
- **Not pursued; Ben will remember them, so they are not in the backlog:** porting the compiler to Rust, and a parameterized menu of storage types (that one is held for now).
- **The dream-code checker** is wanted for M3. See [its design note](2026-11-23-dream-code-checker.md); it is in the backlog.
- **Optional chaining** (`?.`) stays rejected (S105) unless Dream Code keeps reaching for it. "Possibly empty" is an optional type underneath, narrowed by plain JS checks.
- **Ben's working preference:** delegate implementation to Sonnet agents whenever they can do it.

## Answered by Ben at the end of the session

1. **A literal's exact length: yes.** Recorded in the M1 plan's widenings section and filed as job `qL6eyA`, which is ready for a Sonnet agent.
2. **M2's five shaping questions: all as recommended.** Recorded in [the M2 plan's opening section](2026-11-23-m2-shader-slice-plan.md):
   - typed operators (D1);
   - a reference interpreter as the oracle;
   - `f32` and vectors as IR value types;
   - no wasm in M2;
   - the Uncommon Math book at `local/uncommon-math-0.1.0.html`.

## Next

1. Run job `qL6eyA` (a literal's exact length) on a Sonnet agent.
2. **Finish the M2 plan** ([its rulings are in](2026-11-23-m2-shader-slice-plan.md)) with a `tasks:` block (`project/agents/planning.md`). Inputs:
   - the M1 findings, "What M2 and M3 should change": GLSL owns the lower stage, there is a verifier after each lowering, and the differential check has limits;
   - [the passes note](2026-11-23-passes-queries-and-several-irs.md);
   - the backlog: LIR, range analysis, and the tracing front end (Candela suits branch-free shaders);
   - the proposal's §5.7 (D1), §8.1 (the `fields` Dialect sketch), D3 (backend order) and D5 (tolerance).

   A good first leaf is a survey of the Uncommon Math sketches, which a Sonnet agent can do.
3. Run an independent review of this session's lowering code (see "Review" above).
