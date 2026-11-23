# Handoff: M1 closed

*2026-11-23 · written at the end of the second session. It is current only while no later commit exists after the one that adds it. It supersedes [the first handoff](2026-11-23-handoff.md).*

## Where things stand

- **M1 is done** (`job` root `8qHPT3` and M1 `oHF0p6` are closed). The verdicts are in [the M1 findings](2026-11-23-m1-findings.md):
  - 105 of 126 runtime lambdas lower.
  - In presets 04–07, every lambda swapped for its emitted JS matches the original: 30 runs, 0 differences (`node scripts/dmg-diff/cli.js diff`).
  - H1 holds for the simpler presets and is open for the games. H10 is supported in a narrow form.
- **Code:**
  - [kit/parse](../kit/parse/README.md): the parser.
  - [kit/ir](../kit/ir/README.md): the IR.
  - [kit/lower](../kit/lower/README.md): lowering, with the DMG dialect in `kit/dialects/dmg/`.
  - [kit/emit/js](../kit/emit/js/README.md): the JS emitter.
  - Tooling: [scripts/dmg-oracle](../scripts/dmg-oracle/README.md), [scripts/dmg-lower](../scripts/dmg-lower/README.md) and [scripts/dmg-diff](../scripts/dmg-diff/README.md).
- **Tests:**
  - `npm test`: 253 tests, about 2 s. The pre-commit hook warns past a 30 s budget.
  - `npm run test:prerelease`: 10 tests, about 35 s. It passed at 35c4547. Run it once per session at wrap-up.
- **Reviewed:** every leaf except `K4kgqD` (the dmg-diff tool). Its review was dispatched at the end of this session; see "In flight".

## Decisions made this session (all recorded where they rule)

- **Parser:** S112–S114 are rejected. A fixit never changes meaning: S116 has no fixit, and S110 offers `let` only when that is safe. See the M1 plan, "Parser rulings".
- **Integer semantics in the IR:** every number is an `f64`, and the sized-integer rule lives on the store. The JS backend leaves coercion to the DMG proxy. See the M1 plan.
- **No reference interpreter in M1.** M2 will likely need one. See the findings.
- **Pass ownership: the middle path.** The kit owns the core IR, its verifier, the query and pass API, and the stages below the core. Dialects may add passes above the core. This is to be tested in M3 as H11. See [passes, queries and several IRs](2026-11-23-passes-queries-and-several-irs.md), and the proposal's §7 and §14.
- **Reuse:** take ideas from Manuel's ds-js-os, Candela and CJI, and copy no code. See the delivery decisions.
- **Fast suite budget:** 30 s. Slow tests go in `prerelease/` folders as `*.prerelease.js`. See AGENTS.md, Stack.

## Waiting on Ben

1. **The five subset widenings are ruled.** Ben accepted the recommendations on 2026-11-23. They are recorded in the M1 plan, "Subset widenings after M1", and filed as job `m82n5e` (after `CRTQ0c`).
2. **Ben's weakly held idea:** a wasm backend early, to dogfood the IR beyond JS → IR → JS. It was not decided. The cheaper first step suggested was a "hostless" JS emitter mode that applies the store rules itself. Raise it when M2 is planned. It may pull a slice of M5 ahead of M3.

## Next

- **Plan M2** (the shader slice) as a dated plan doc with a `tasks:` block (`project/agents/planning.md`), after Ben rules on the widenings, which shape M3 more than M2. Inputs:
  - the findings' "What M2 and M3 should change";
  - the passes note;
  - the backlog items dated 2026-11-23: query API, lower IR stages, range analysis, tracing front end.

## Review of dmg-diff (done)

- **The review of `scripts/dmg-diff` found nothing serious, and every figure re-ran.** `K4kgqD` is labeled reviewed.
- **The findings doc's H1 count was overstated.** Five lambdas hit a deliberate subset rule, not one. It is corrected in place as a marked block quote under the headline.
- **The rest is filed as `CRTQ0c` under the Workbench Kit root**, and it is the next leaf to take:
  - no test guards runCase's swap;
  - an early stop counts as a match;
  - the survey classifier has gaps;
  - the 105-lambda figure has no committed command.

  Its reproductions are written into the leaf, because the scratchpad probes may be gone.
