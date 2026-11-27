# Handoff: the layer part and package tests built, ctx.controls retired

*2026-11-27, end of session 6. Picks up after [the page and M4 handoff](2026-11-26-handoff-page-and-m4-closed.md) (`89592a5`). This session's commits are `665c1ca..` HEAD. Ben was around for the whole session and ruled as it went; every ruling is in the doc it rules on, listed below.*

## Needs Ben's eyes

1. **`Lu11Q1` (decision): page buttons share one seam.** With `ctx.controls` retired, kit/page's `examplePreset` wires each page control to the one Event input whose seam is exactly the control's. The four buttons share `Event<{ held: bool }>`, so a part run alone with a button input fits all four, gets none wired, and shows H009. That makes solo button input a regression. The options are in the leaf; the recommendation is a name tiebreak (`in.<control>` takes `page.out.<control>` when seams alone are ambiguous). Two related facts to confirm: H009 is a *warning* (the example loads unwired), though Ben ruled "refuse, with a clear code"; and a held pad no longer survives a rebuild (it lives in part state, and the page sends only changes), documented in kit/run/README.md.

## Rulings this session (each recorded where it rules)

- **Layering is a built-in part; package tests are a declarative manifest entry**: [the plan](2026-11-27-layer-and-package-tests-plan.md), "Rulings", and its "Later rulings": `in` retires `ctx.controls` ("a smaller and simpler API surface is always better if possible"); tests are always optional; keep the `output` expectation; refuse ambiguous page wiring with a code; the anchored frame edge was parked, then **un-parked** after 5 of 5 blind composers asked for it.
- **`aRnKm8` closed as moot** after S104 (a glue's build-time read of `$` is refused).
- **Blind dogfood legs run on Sonnet plus at least one Haiku, never Opus** (memory `dogfood-tiers`; noted on the trial leaves).

## What landed

| Commit | Leaf | What |
|---|---|---|
| `665c1ca` | `cfoinu` | L003 says which list has a known length and which a max when the two print alike |
| `2d24568`, `84b7eb1`, `770e210` | `g21AQF`, `GYDKN0` | Review fixes for `d0b876c`: a session's stop cancels sweeps and is final; kit/package decides the element module path; a param input is judged against the record it applies under (refused at insert only if it misfits every record that can be in force, else skipped at apply as N008); N009, N010; UI params bound by the Dialect's name |
| `640d6b7` | `JYmuWM` | False B013 fixed: kit/define runs the shadow scan with the lambdas it was handed (`BuildOptions.file`) |
| `6af00fd` | | The layer and package tests plan (container `XlXLSp`) |
| `22e3a65`, `703a41d` | `LiOmY9`, `teBNYM` | Layer draft and its dogfood: 3 blind Sonnet composers, 0 massage |
| `39f1fc9`, `02db249` | `74YzpH`, `mxxKTa` | Tests draft and its dogfood: 3 blind Sonnet authors, no harness outside the manifest, all 6 mutants caught; the worked tests were copied, so they became placeholders |
| `13747db` | `pQKgWN`, `r2GURg` | **The built-in layer part** (`layer(...)`, `.show(<output>, ...)`, S404; kit/run never steps a layer); S206 reworded |
| `e84624c` | `KYpY7Q` | Closing layer trial on the real kit: Sonnet and Haiku composers clean at first check, no package; run.sh path bug fixed |
| `c2f8b64` | `twGnKT` | S206's fix states an intended default with `set`, which silences it |
| `0639eb3` | `ceE4ib` | **Package tests** (`tests` in the manifest, kit/run `in`, `taps`, `run.output`, kit/package `checkTests`, kit/page `runTests`, the host's Tests row) and **`ctx.controls` retired** |

## Review

- Reviewed: `d0b876c` (reviewer-hostfix-30), its fixes `2d24568`, `640d6b7`, `84b7eb1` (verifier-34: nothing serious), `13747db` (reviewer-layer-42: nothing serious; four LOWs filed as `WAzKpM`).
- **Not reviewed: `0639eb3`** (package tests and the `ctx.controls` retirement: about 1,000 lines of production code across kit/run, kit/package, kit/page, kit/seam and the host). **Review it first next session.** Its author flagged its weakest spots: the host's Tests row UI has no test and no screenshot; H008 for a state path naming an undeclared Program field is not built (it reads null and fails as H006); H007's replay-divergence path has no test.
- Also unreviewed, small: `665c1ca`, `770e210`, `c2f8b64`.

## Prerelease

`npm run test:prerelease` at `0639eb3`: 19 tests, 19 pass, 41 s. Planted faults: JS 24/26, GLSL 21/24, the same five escapes as before. The fast suite is 3,064 tests.

## Next

0. **Review `0639eb3`**, then dispatch `WAzKpM` (the layer review's LOWs: a blank page with no diagnostic when the bottom frame has no extent, hand-edited layer records kit/run runs anyway, Dialect-name matching of `layer`; kit/run and kit/page).
1. **Ben's decision `Lu11Q1`** (buttons), then its fix.
2. **The anchor stage**: `JBkhsf` (draft, Opus), `wCDTzk` (dogfood: one Sonnet, one Haiku leg, reusing `run.sh layer`), `QqirvU` (build).
3. **`aWrZQr`**: the tests stage's closing trial (one Sonnet and one Haiku author leg, tests from placeholders only, on the real kit).
4. Open issues: `daTVc3` (kit/run binds params as `$` whatever the Dialect's `params.name`).
