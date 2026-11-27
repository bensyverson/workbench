# Handoff: declared Controls built and reviewed twice, every open review fixed, the tests stage closed

*2026-11-27, end of session 8. Picks up after [the sketches, controls and anchor handoff](2026-11-27-handoff-sketches-controls-anchor.md) (`b115e90`). This session's commits are `f892c15..` HEAD. Ben stepped away early and asked not to be asked; every call the integrator made is listed under "Decisions made while Ben was away", each a two-way door.*

## Needs Ben's eyes

Three decisions, each an issue labeled `decision` with options and a recommendation:

- **`qsEYlW`: should outside inputs make instants?** A run of demand parts only never steps after T = 0. That covers a package played or tested alone, which is how both blind game authors in the tests rerun first wrote their games. Recommended (a): an `in`, `control` or `pointer` input makes an instant for the demand parts it reaches. It moves a boundary kit/run's "Not here" draws on purpose. Meanwhile, N014 warns.
- **`IlUYzu`: should Ref ids count per slot?** A Ref id's `#n` counts an instance's calls across all its slots, params first: `g("s").param(…).op(…)` makes the op `s.op#1`. Every author of an `each` or a runtime target gets this wrong; the draft's own example did, and both reviewers' first probes did. Options: per-slot numbering (a kit/define change to every record's ids and goldens), or a helper that gives a slot's nth call's address.
- **`ZNpW0f`: two instances of one package with a keyed Control.** S119 refuses them, so two synths cannot both show operator knobs. Options: part-qualified keyed Controls, or keys unique per part.

## What happened

1. **Every review the last handoff queued was done, and every finding fixed.** Three fresh Opus reviewers ran in parallel:
   - **`d8daa26`, the anchor and re-plan** (reviewer-anchor-59): a dotted Dialect name broke every rebuild; a record without `frames` failed late. The page canvas also used its creation-time box, which was EggIAM.
   - **`ce1e7b4`, CPU tier stage 0** (reviewer-tier0-60): in an f32 Dialect, an open list's length built no kernel (high), and a DMG loop pattern regressed.
   - **`99c47e5`, `56f45b7` and `8996823`** (reviewer-small-61): five lows.

   The fixes are `f892c15` (fixes-62, Sonnet, plus an integrator guard: a conversion without frame ids is N007), `02da80b` (tier0-fixes-63, Opus) and `142126f` (EggIAM, the integrator).
2. **Declared Controls built** (`787000e`, controls-build-58, Opus, one agent under ruling 3). It ran 67 tests red as a batch, then implemented the whole draft.
   - PAGE_CONTROLS, the fixed pad and H009 are gone, and the kit knows no Control of its own.
   - Ruling 16's stop did not trigger: every call already had a site.
   - The massage was 7 lines per game hand-in; every one had leaned on the kit's pad.
   - Not built: the host page's editor stage, drawn Grips, gamepad and MIDI listening, and zoom gestures (`GR66N2`).
3. **First review of the build** (reviewer-controls-64) found three highs:
   - write-back never refused a stale text;
   - a glue helper's two parts shared one literal;
   - page inputs were logged out of order.

   It also found that Controls with `to` were not built at all, plus six mediums. All eleven were fixed in `49bb8f6` (ctlfix-66, Opus).
4. **Second review** (reviewer-ctlfix-67, Sonnet) confirmed six of six must-nevers held, apart from four smaller findings. Those were fixed in `afe0cfc` (ctlfix2-68).
5. **The tests stage closed** (`aWrZQr`, `35c04b9`): three blind legs on the real kit, Sonnet game, Haiku game and Sonnet score (the non-game leg).
   - All were clean, their tests passed in the checker, nobody wrote a harness, and the massage was 0 lines; $1.60 in all.
   - The game task and the checker still asked for the retired pad, so trial-65 fixed both.
   - Findings are in [the tests rerun findings](2026-11-27-tests-rerun-findings.md). They led to `76cc7eb`: the Control kind table in kit/define/README.md, a shape in U017's fix, and N014 for a demand-only run.
6. **Small fixes on the main thread:** `ff7e36b` (callSite with a `data:` URL holding parentheses; its gotcha deleted) and `108d799` (`daTVc3`: a run binds params under the Dialect's `params.name`).

## Decisions made while Ben was away

- **An f32 lambda reading a short list's length computes in f32** (the tier-0 review's MEDIUM 1; note on `o2RhFb`). A length is the Dialect's number type when that type holds the list's max exactly, and f64 otherwise, matching the verifier.
- **The N014 warning** for a demand-only run, as option (b) of `qsEYlW`, pending Ben's call on (a).
- **The draft's `#<n>` example is corrected in place** (a marked block quote in the controls draft); the numbering itself is `IlUYzu`.
- **`ctx.files` on a rebuild stays as at createRun**, documented as a limit in kit/run/README.md, since new files would change the rebuild input's log format.
- **The tests rerun's task docs:** the game task now asks only that the player be steered from the page, without naming a kind.

## What landed

| Commit | Leaves | What |
|---|---|---|
| `f892c15` | dBSxqG L3O4Z4 ucJsOX OJWuhz KuRyjq | Conversions carry frame ids; N007 for a record without frames or ids; a negative time and checkpointEvery 0 refused; layer max checked; exact stamps in the tests runner |
| `02da80b` | v4Ya0z nQY0cL sD9Cfn uyQknP | A length's type follows the list's max; a const copy of a checked read lowers again; L003 wording; docs corrected |
| `787000e` | FhnOhO Lu11Q1 | **Declared Controls** |
| `ff7e36b` | Kw3FCP | callSite reads a `data:` URL with parentheses |
| `108d799` | daTVc3 | Params bound under `params.name` |
| `142126f` | EggIAM | The page and host follow the box in force |
| `35c04b9` | aWrZQr | The tests rerun; the checker plays declared Controls |
| `49bb8f6` | zXqtZO 3GBIBk 11Q293 UYk5XG 4sgOrd LnQRRL ETcTyZ udUBOI Nu6pXA JlchbQ FtbfNP | The controls review's fixes, Controls with `to` built |
| `76cc7eb` | yiU76A | The Control kind table, U017's shape, N014 |
| `afe0cfc` | x3LcAJ 8XU2O2 0sZBNV Fws2zJ | The second review's four fixes (ctlfix2-68): a wired Control's commit checked by a build, write-back compares the call's other literals, a param's `source` before `values`, the latest stamp after a rewind to the same T |

## Review

- **Reviewed this session:** `d8daa26`, `ce1e7b4`, `99c47e5`, `56f45b7`, `8996823`, `787000e` and `49bb8f6` (a second review). Every confirmed finding is fixed or filed.
- **Not reviewed:** the integrator's own small commits (`ff7e36b`, `108d799`, `142126f`, `76cc7eb`), each with red-first tests, and `afe0cfc` (about 100 lines). Two loose ends in `afe0cfc`, which the integrator read: a wired Control's commit on a param target is unchecked when the page has no `run.build`; and a page with no `run.build` throws, rather than reporting, for an arg target (as part-local Controls and Grips already did). Review `afe0cfc` with `GR66N2`, which wires `run.build` in the host.

## Prerelease

`npm run test:prerelease` at `afe0cfc`: 19 tests, 19 pass, 40 s. The planted faults are unchanged: JS 24/26 and GLSL 21/24, with the same five escapes. The fast suite is 3,275 tests (3,148 at the session's start).

## Next

1. **Ben's three decisions above.** `qsEYlW` matters most for authors.
2. **`GR66N2`, the host page**: the editor stage, write-back on commit (the host passes no `onCommit` yet), Grips drawn over the stage, gamepad polling and MIDI listening, zoom and pan, and vector, points and pick widgets. Serve the synth and the lens bench, not only the game. It is the last leaf of `1ymuQu`. A blind dogfood of the page with a non-game leg should follow it.
3. **kit/page/page.js is 560 lines**, past the ceiling. Splitting out the Controls-with-`to` block is a sensible start to `GR66N2`.
4. From the backlog when a sketch is scheduled: CPU tier stage 1 (Knuth–Plass) and its dogfood; the six browser probes; the GPU image pipeline, the audio runner, and live arguments through a rebuild.
