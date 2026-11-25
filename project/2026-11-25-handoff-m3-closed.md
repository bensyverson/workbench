# Handoff: the H5 rerun, M3 closed, a fail-open shadow scan fixed

*2026-11-25, end of session. Starts after [the H5-run handoff](2026-11-25-handoff-h5-run.md) (`ffb0109`); this session's commits are `ec9e703..` HEAD. Ben was not around; every call below was a two-way door, and each is listed.*

## What happened

- **The H5 rerun** (`WkDS5a`, closed, reviewed): [project/2026-11-25-h5-rerun.md](2026-11-25-h5-rerun.md); record in `scripts/particles/h5/runs/2026-11-25-rerun/`.
  - Six blind agents (two each of Opus, Sonnet, Haiku) at `ffb0109`. Over the scored set (27 accepts, 141 rejects):
    - A–D were perfect, beating the reference (they also refuse r06d and r08b);
    - F missed only those two, as the reference does;
    - E also missed r12f–j, because it never turned on `conditions: "bool"`.
  - **The rulings worked:** none of the four gaps all six named last time appears in any report, and difficulty was 3 on every agent.
  - **Hand-written checks did not fall:** A (Opus), C and D (Sonnet) wrote tokenizers or parsers of 320–560 lines. They now serve the parked rules: the narrower subset, reserved local names, lambdas written in place, handles passed whole, plus uncalled helpers' parameter types.
  - No tool call named a repository path.
  - The recorded checker logs keep only changed files per line (13 MB → 1.8 MB; README says so).
- **Kit issues `CQKwBO` and `Uv2uas`** (Sonnet), fixed in `a8921a7`: own-key lookup of declared tables, and one L003 for a non-bool `||`/`&&` operand.
- **The M3 findings** (`cqIENy`, closed, reviewed; M3 `As6TAt` auto-closed): [project/2026-11-25-m3-findings.md](2026-11-25-m3-findings.md).
  - **H4:** not tested against DMG. Three Grammars (fields, data, particles) generated with no hand-written builder.
  - **H2:** supported for four Dialects. The core is neutral: 24 of 53 core files changed, +517/−151, with no domain logic, and the DMG and fields Kernels and figures did not move. Effects gained a second user. The IR carries 7 of the data Dialect's 21 table calls.
  - **H5:** holds for building a language, but not for a sheet's full strictness.
  - **H11:** not tested.
  - **Corrections in place:** the proposal §5.1, §5.2, §8.1, §8.2, §11.2, §14 and §15; a closing block on the plan; backlog notes; the AGENTS.md overview (M3 done, M4 Composition current).
  - **Fact-check:** a fresh reviewer re-ran every figure, and all reproduce. Its two mediums were fixed in `f97377f`. Main one: "DMG output did not move" overstated it, since four DMG lambdas lost a knock-on L014 and the survey keeps M1's classes through two lines added to `survey.js` in `9e4c510`.
- **Kit review** of `2d87cc2`, `ada5def` and `a8921a7` (reviewer-kit-3). Findings fixed in `fcee599` (Sonnet), leaves `uDx3xL`, `G8GO8X`, `BysMnQ`, `Foxtoi`:
  - **High, failed open:** `ada5def`'s narrowed shadow scan missed five shapes (a named export, a function export, `export { f as default }`, a build-time callback, an IIFE), so a lambda silently got the top-level value. The new rule: a name bound by any function that holds another function counts. It fails closed for a helper that holds a callback (documented in kit/parse and kit/define READMEs).
  - A chain `a || b || 0` gave one L003 per operator.
  - Program-built tables (events, helpers) were looked up through the prototype.
  - The data Dialect dropped a `__proto__` param.
  - **Rescore:** every particles hand-in (both runs), the reference and the pilot reference score as before.

## Calls made without Ben (two-way doors)

- **Ran the two kit issues during the rerun**, but merged them only after scoring, so the agents' kit stayed fixed at `ffb0109`.
- **Trimmed the recorded checker logs** to changed files per line rather than committing 11 MB.
- **The M3 findings depart from `cqIENy`'s prescribed verdict wording** where particles overtook it:
  - "single-construct Grammars" is now three Grammars, two of them multi-construct;
  - "effects and stores remain DMG-only" is now "integer stores remain DMG-only";
  - "on hello" is now "on particles".

  The fact-check reviewer judged all three justified.
- **Did not start M4.** Its next leaves are architectural, and `CwuGpd` waits on your UI decision.

## For Ben's eyes

> **Ruled (Ben, 2026-11-25):** change the brief, not the kit or the sheet. An agent now reports a refusal the API cannot express, instead of building it ([brief.md](../scripts/particles/h5/brief.md)). r06d and r08b are expected misses ([hidden/README.md](../scripts/particles/hidden/README.md)). No third H5 run: the verdict stands, and the next fresh-agent run will test the brief. This settles items 1 and 2.

1. **The parked rules now drive the hand-written parsers** (rerun findings, "For Ben"). Either build a Dialect `syntax` deny list with reserved local names and inline-only lambdas, or strike those rules from the particles sheet as out of H5's scope. Either needs room in START.md + API.md, which are at 7,994 of 8,000 tokens.
2. **Uncalled helpers' parameter types** (hidden r06d, r08b): accept them as known misses, or let a helper declare its parameter types. Four rerun agents caught them only with their own parsers.
3. **Carried from last session:**
   - record the M4 UI decision on `CwuGpd` (criterion 5gd; the four points are in [the last handoff](2026-11-25-handoff-h5-run.md));
   - the token budget.

## Review

- **Reviewed this session:**
  - `ec9e703` (the rerun record), via the findings fact-check;
  - `02a0a81` and `f97377f` (findings), by the fact-check;
  - `2d87cc2`, `ada5def` and `a8921a7` (kit), by reviewer-kit-3, with findings fixed in `fcee599`.
- **Fix verification:** the same reviewer re-ran its probes at `fcee599` and all pass, except the out-of-scope `??` case. Probing the new shadow rule found two narrow cases, filed and documented in kit/parse/README.md:
  - `kRYm3Y`, fails open, medium-low: a method keyed by a computed name, a string or a number, or named `of`, `new` or `if`, records no parameters;
  - `JYmuWM`, a false B013, low: a lambda that holds a query callback taints its own parameter's name for other lambdas.

  Both are limits of the lexical scan, which the backlog's "harden the module-scope scan, or replace it with a real parser" covers. Probes are in `local/rev-kit3-probes/shadow-rule.probe.js`.
- **Not independently reviewed:** `ce4ff4f` (scorer copies own modules), `4a9111e` (H5 tooling) and the probe page `scripts/m0-probe-ui/`, all carried over.

## Prerelease

`npm run test:prerelease` at `02a0a81` (2026-11-25): 17 tests, 17 pass, 0 fail, 39.3 s. Planted faults: JS 24/26, GLSL 21/24, the same five escapes. `fcee599` landed after that run. It changes lowering diagnostics and the shadow scan, and touches no backend; the fast suite passes at 1,790.

## Next

1. Ben's decisions above. If he chooses to build the parked rules, that is a design leaf, then dogfood, then a third H5 run.
2. **M4 Composition** (`SPPLaM`): `CwuGpd` (the UI decision) first, then `Uld5D0` (packages); `hjdIRt`, `f2dMku` and `HKNInI` are unblocked design leaves.
3. Issues `kRYm3Y` and `JYmuWM` (the shadow scan; Sonnet-sized, red tests from `local/rev-kit3-probes/shadow-rule.probe.js`). `JYmuWM`'s narrow fix needs to know which arrows are Runtime Lambdas, which the builder knows and the scan does not.
4. Review `ce4ff4f` and `4a9111e` with the next batch.
