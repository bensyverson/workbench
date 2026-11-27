# Handoff: the workbench page, page inputs, and M4 closed

*2026-11-26, end of session 5. Picks up after [the Draw and param-wires handoff](2026-11-26-handoff-draw-and-param-wires.md) (`300bf42`). This session's commits are `0133775..` HEAD. Ben was around for the first part and ruled on the page, data files and page inputs; he then left with "make progress on your own", and the calls made after that are listed below.*

## Needs Ben's eyes

1. **Two decisions from the M4 trial**, filed in the issue tree with the `decision` label ([findings](2026-11-26-m4-trial-findings.md)):
   - `qynNme`: layering two Draw outputs still needs a hand-written root package whose Draw inputs copy the producers' ceilings by hand. The composer proposed `.show(a.out.view, b.out.view)` in layer order, or a built-in layer part.
   - `z3dUoJ`: an author cannot test a package's Event input alone. All three authors proposed scripted inputs in the manifest.
2. **Calls the integrator made while Ben was away** (each reversible):
   - **S116 on a page wire with no policy is a warning naming the fold**, not a refusal (`b00effc`): the run never stops for it now, so refusing would block a working composition.
   - **The UI control name is a stated convention**, `inputs.object` with its first letter lowercased (`ui.control`, `42c3367`). The kit had no rule; every runtime in the repo already reads `controls.pad`. Nothing checks that a runtime reads that name.
   - **kit/page's codes are H**, and H, K and W are now reserved letters (`619616f`). kit/lir's verifier already owned W. R stays unreserved (leaf `ZH4KWX`).
   - **A Game Boy tiles ring of any size passes** (`a71a37f`): the renderer gets a whole list each frame, so it can load any ring's visible cells into the 32×32 map.
   - **kit/define now imports kit/emit/js** (for `ui.compile`). There is no cycle.
   - **A glue's build-time `$` read is S104** (`d0b876c`), not answered from a part's params.
   - **A param input that misfits its declaration is refused before it is logged** (N008 widened), so a log never holds an input that throws on replay.

## Rulings this session (recorded in the docs they rule on)

- **The workbench page is built in full, in two leaves** (the draw-list draft, last block): kit contracts on Opus, then the HTML host on Sonnet. The in-page agent and the book are out of scope.
- **Package data files carry a declared kind** (the package format draft, last blocks): text, json and csv in a Dialect's `files`, and a PNG on `images.<name>.file`. Images are one case of the rule.
- **Page inputs deliver every press and release** (the seams draft): this reverses the coalescing in `ada0afe`.
- **A page wire past its size folds** into the latest held state and never stops its part (the seams draft, last block).

## What landed

| Commit | Leaf | What |
|---|---|---|
| `0133775`, `a71a37f` | `qciwpW` | The Game Boy profile refuses painter's orders the DMG can't draw (J043, J044) and more than 256 background tiles; wrapped rings are judged where they draw |
| `556716b` | `9t99go` | A rewind redraws stopped parts and uses the params the lists were built with; lowering and verify agree on expected lists; builder globals are limited; `PAGE_GLOBALS` replaces `name in globalThis` (a browser-only bug in kit/run/compile.js) |
| `b3a55cd`, `619616f`, `0128bf3` | `hca0YM`, `YpdWLA` | The Draw stage form (`stage: { draw }`, U014), the profile on the composed record, package data files (D034, K017–K019, bytes in the file map, base64 in bundles), kit/page (`createPage`, H001–H005), and their review fixes |
| `3bfd8ee`, `b00effc`, `d1c1a85` | `mEQycb`, `gwKU85` | Every press and release delivered; `PAGE_CHANGES_PER_FRAME = 2`; the fold past a page wire's size |
| `f6b34e3`, `42c3367` | `qnw0Qc`, `dXp5WO` | The workbench page in `kit/page/host/` (screenshot there), and the kit pieces moved out of it: `ui.compile(record).evaluate`, `ui.control`, `withScope`/`moduleScope`, `examplePreset`, `sweepRuns` |
| `8a7b642`, `eeaea8c` | `IhJ35P` | The M4 trial: two blind packages composed by a third session, playing on the page with 0 lines of massage; two doc corrections from it |

**M4 (`SPPLaM`) is closed.**

## Review

- Reviewed and fixed: `0133775`, `556716b` (reviewer-draw-19), `b3a55cd`/`619616f` (reviewer-page-20), `3bfd8ee`/`b00effc` (reviewer-taps-27).
- **`f6b34e3` and `42c3367` were reviewed by reviewer-host-28**: three HIGH, four MEDIUM and several LOW findings, probes in `local/rev-host-28/`. Their fixes are leaves `1Bfx8t` (kit side) and `sr8Yp1` (host side). Both landed in `d0b876c` (hostfix-29): `run.params`, param inputs checked before they are logged (N008), UI `$` bound to the run's, part warnings kept, glue loading in kit/compose (S103, S104), async cancellable sweeps, bytes and module paths decided by kit/package. `d0b876c` itself was not reviewed again; review it first next session.
- `8a7b642` (scripts only, a trial harness) and `eeaea8c` (docs) were not reviewed.

## Prerelease

`npm run test:prerelease` at `d0b876c`: 19 tests, 19 pass, 37 s. Planted faults: JS 24/26 and GLSL 21/24, the same five escapes as before. The fast suite is 2,918 tests in about 11 s.

## Gotchas this session

- **`git reset --hard` on main discards job's uncommitted log** (added to gotchas). It cost a redo of the session's job events.
- **The parallel-branch break happened again**: the M4 trial's checker imported `kit/page/host/scope.js`, which the parallel kit-gaps branch deleted. Typecheck in the pre-commit hook caught it, and the fix was one import.

## Next

0. **Review `d0b876c`** (the host review fixes), and `8a7b642`'s trial harness if wanted. One call in it to confirm: **a glue's build-time read of `$` is refused (S104)**, following kit/compose's ruling that there is no glue-level `$`, instead of answering from some part's params. Issue `aRnKm8` (rebuild a glue part) is then moot; close it if Ben agrees.
1. **Ben's two decisions**, `qynNme` and `z3dUoJ`, then the next milestone ("form and book move down one" from the M4 container).
2. **Open issues:** `aRnKm8` (rebuild a glue part on a build-time param edit; may be closed by `1Bfx8t`), `cfoinu` (an L003 message with two identical types), `JYmuWM` (a false B013).
