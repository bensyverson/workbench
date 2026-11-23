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

1. **The five subset widenings** in the findings, "H1":
   - program helpers as lowered functions;
   - `for…of` over a bounded list;
   - destructuring;
   - list indexing with a declared bound, plus string intrinsics;
   - a constant loop step other than ±1.

   None is decided. Program helpers remove the largest class of rejections (11 lambdas).
2. **Ben's weakly held idea:** a wasm backend early, to dogfood the IR beyond JS → IR → JS. It was not decided. The cheaper first step suggested was a "hostless" JS emitter mode that applies the store rules itself. Raise it when M2 is planned. It may pull a slice of M5 ahead of M3.

## Next

- **Plan M2** (the shader slice) as a dated plan doc with a `tasks:` block (`project/agents/planning.md`), after Ben rules on the widenings, which shape M3 more than M2. Inputs:
  - the findings' "What M2 and M3 should change";
  - the passes note;
  - the backlog items dated 2026-11-23: query API, lower IR stages, range analysis, tracing front end.

## In flight

- **A fresh reviewer is checking `scripts/dmg-diff/` (K4kgqD, in 35c4547).** It writes probes under the session scratchpad, in `review-diff/`. If it returns after this session ends, its report is lost with the session: re-dispatch a review of `scripts/dmg-diff/` and the findings doc's figures (`project/agents/review.md`). When it is clean, run `job label add K4kgqD with reviewed`.
