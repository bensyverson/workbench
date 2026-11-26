# Handoff: the runtime contract built, reviews closed, sampler and draw-list trial landed

*2026-11-26, end of session 3. Picks up after [the runtime-fixed handoff](2026-11-26-handoff-runtime-fixed-relay-rerun.md) (`cbfa965`). This session's commits are `78c3f9a..` HEAD. Ben ruled on the seven runtime-contract calls at the start, then left and asked for progress without him; every call the integrator made in his absence is listed below.*

## Needs Ben's eyes

1. **`pSo5YA`: draw-list draft changes from the paper trial** (labeled `decision`). The trial found three premises to change before `Draw` is built, plus a ruling on what a builder may read. Recommendations are on the leaf and in [the trial findings](2026-11-26-draw-list-trial-findings.md), "Recommendations".
2. **Calls the integrator made while Ben was away.** Each can be reversed; say so and it gets a leaf.
   - **S116, on Ben's deferral:** a wire takes `{ overflow: "keepLast" | "keepFirst" }`, which turns S116 into a warning. `reference.md` shows each port's max. Program-derived maxes are in the backlog.
   - **R1:** `runUntil` on a display run logs frames on the nominal 1/60 grid from the last frame, never one at an off-grid target, on every display run. First frame after a rewind is clamped to the catch-up cap (`617e60e`). One carve-out: a hand-written log holding frames ahead of T.
   - **R2:** every input takes effect at its own stamp, ahead of the next instant. A restart never waits on an unrelated part. A rebuild's `boundary.before` is now its stamp.
   - **R3:** a stopped-drop N001 is once per wire per stop.
   - **F1:** a wire's planned fill always wins over a stray field a runtime pushes under that name.
   - **F2:** S206, a warning when a wire drops a producer field and fills a compatible consumer field (a probable missed rename). `build()` now throws only on errors.
   - **Sampler:** texel index from the f32 product, as a GPU computes it. Images are validated at the harness's boundary.
   - Accepted from agents:
     - An undeclared field in the extensible struct is N003 in every run.
     - The extensible struct may sit anywhere in state: the ruling said "member", and it is broader than that.
     - Page handles are `page.out.<control>`, and `ctx.controls` stays for a part running alone.
     - An unguarded record read is L008.
     - The draw trial's legs all ran on Sonnet.

## What landed

| Commit | Leaf | What |
|---|---|---|
| `78c3f9a` | `Vv3lQY` | The [runtime contract plan](2026-11-26-runtime-contract-plan.md) from Ben's seven rulings |
| `203c4c6` | `yfSlwY` | Placeholder snippets in kit/START.md and kit/API.md (docs-ph-1, Sonnet) |
| `9a58c83` | `uA3uqz` | Review fixes for d8bba18, 7ae02ef, 73a6c06, 829ddef: concat mixed run (HIGH), stale L008 tip, S301 gaps, G008 (fix-kit-4, Sonnet) |
| `8b5c171` | `62J2dk` | Per-Program state (extensible struct) and Event input field defaults (rc-define-1, Opus) |
| `aa63215` | `2ifUyY` | Review fixes for 8b5c171: fill always wins, S206 (fix-define-5, Sonnet) |
| `d4e2fd0` | `p4IYui`, `9JOZKN` | scheduler.js split into frames/instants/wires; the 883c7b0 review fixed under R1–R3 (runtime-fix-3, Opus) |
| `617e60e` | — | runUntil's first frame after a rewind clamped to the cap (integrator, from reviewer-run-6) |
| `69cdb16` | `LUSPEC` | A sampler type: `fields` Kernels read images in the interpreter, JS and GLSL (sampler-1, Opus) |
| `3ef2838` | `6fwujM` | Review fixes for 69cdb16: f32 texel index, image validation (fix-sampler-7, Sonnet) |
| `ad611dc` | `e3qYus` | The draw-list paper trial, scripts/draw-trial, [findings](2026-11-26-draw-list-trial-findings.md) (drawtrial-1, Opus) |
| `5e0813e` | `Z2OE0M`, `pdNoFH` | Named kernels, `$T`, a null record global, the page part of controls, the overflow policy (rc-run-1, Opus) |

## Review

- **Reviewed this session:**
  - 883c7b0 by reviewer-run-3, fixed in d4e2fd0.
  - d4e2fd0 by reviewer-run-6, fixed in 617e60e.
  - d8bba18, 7ae02ef, 73a6c06 and 829ddef by reviewer-kit-4, fixed in 9a58c83.
  - 8b5c171 by reviewer-define-5, fixed in aa63215.
  - 69cdb16 by reviewer-sampler-7, fixed in 3ef2838.

  Probes are in `local/rev-*`.
- **Not independently reviewed. Review these first:**
  - **`5e0813e`** (rc-run-1). It is new runtime contract: per-closure record variables in kit/run/compile.js, kit/run/delivery.js, kit/compose/page.js, and optional-global narrowing in kit/lower. One gap is known: there is no test that the overflow note returns after a restart. Give it a fresh Opus reviewer; the fuzzers in `local/rev-run-2`, `rev-run-3` and `rev-run-6` are the starting kit.
  - The integrator-read fix commits (`9a58c83`, `aa63215`, `3ef2838`, `617e60e`) were verified against their reviewers' probes, not reviewed again.
  - `ad611dc` is trial tooling, so it is lower priority.

## Prerelease

`npm run test:prerelease` at `5e0813e`: 19 tests, 19 pass, 37 s. Planted faults: JS 24/26 and GLSL 21/24, the same five escapes as before. The fast suite is at about 2,560 tests in about 9 s. The GPU agreement at texel edges after 3ef2838 is covered by `scripts/shader-diff/prerelease/glsl.prerelease.js` in that run.

## Gotchas

- A reviewer extracted an old `kit/` under `local/` to compare against, and its `test/` folders failed the commit. Recorded in `project/gotchas.md`.
- A leaf that lands after a parallel branch forks can carry code a ruling on that branch now refuses. The draw trial's fixtures had unguarded `ev` reads, fixed at integration. Before you squash a contract change, grep the newly landed trees for the pattern it outlaws.

## Next

0. **Review `5e0813e`** (Opus, fresh).
1. **`UTdvE6`: the runtime relay.** The runtime contract is now built, so dogfood it: a language whose Programs declare their own data, and a second package pairing, in placeholder style. The relay harness is scripts/seams-trial. Its docs and docs-placeholder runtime.md and seams.md were updated for `$T`, null records and the page part.
2. **`pSo5YA`, once Ben rules,** then the `Draw` build leaf under `FqsPVJ`.
3. **`HKNInI`:** the build record's `why` text and its small trial.
4. **Debugger texture upload** for image params (it refuses them by name today). It is not filed; file it when the debugger needs it.
