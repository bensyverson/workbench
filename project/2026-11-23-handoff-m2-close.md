# Handoff: M2 closed; one review's fixes are filed

*2026-11-23 · written at the end of the fifth session. It is current only while no later commit exists after the one that adds it. It supersedes [the M2-start handoff](2026-11-23-handoff-m2-start.md).*

## Where things stand

- **M2 is done.** All 15 of its leaves are closed (`job orient` reports "All tasks in 8qHPT3 complete"). The closing report is [the M2 findings](2026-11-23-m2-findings.md): **H2 supported** at a counted cost (M2 touched 14 of M1's 26 source files, +548 −106; the parser and the DMG Dialect were untouched), **H3 provisional**.
- **What M2 built, all committed and pushed to `origin/main`:**
  - the fields Dialect and a default number type per Dialect (`kit/dialects/fields`);
  - the reference interpreter (`kit/interp`);
  - f32 and vector emission in the JS backend (`kit/emit/js`);
  - the first LIR stage (`kit/lir`) and the GLSL ES 3.00 backend (`kit/emit/glsl`);
  - the comparison harness (`kit/harness`, `scripts/shader-diff`);
  - the pixel debugger (`kit/debugger`) with a preview page;
  - the H3 trial kit (`scripts/h3-trial`) and the call-style sketches.
- **Figures** (commands in the findings): JS equals the interpreter to the bit on all three sketches; GLSL is within 2.19e-4 per component on the Apple GPU, 5.18e-3 at the edge of a sketch's ranges; 28 planted faults, JS catches 24 of 26 and GLSL 21 of 24, each escape explained; DMG survey still 126 lambdas, 111 lowered, and the differential run 0 differences.
- **Tests:** `npm test` 760 pass, 8–10 s alone (the 26 s once seen was machine load, corrected in the findings). The prerelease suite passed at wrap-up, 16 of 16, 230 s (`sleepy` outside the sandbox).

## Review

- **Reviewed by an independent Opus reviewer, findings fixed:** the verifier and f32 types (791b985, 6e4366c; leaf 4RDskO), the fields Dialect and number-type lowering (061a664; zwqdaX), the LIR, GLSL backend and JS emission (kit/interp lightly; tXOjGg). Twenty findings in all; every review found something green tests missed.
- **Reviewed last, findings filed but not fixed:** `kit/harness`, `scripts/shader-diff`, `kit/debugger`, the call-style intrinsics, `scripts/h3-trial` and the fix commits. The reviewer confirmed that the harness's judgment is sound (a probe read all 28,836 raw components and found JS and interpreter identical; every planted fault is planted and every escape's reason is true). It found **two medium** and six low items, filed as job `piyiFx` under M2 with reproductions:
  - **Component assignment gives the wrong span** to the components it keeps (`kit/lower/assign.js:154`), so the debugger can pair a value with text it did not come from.
  - **Any read-only place bounds a loop** (`kit/lower/stmt.js:226`). DMG now accepts `for (i < w.frame)`, which `frame` makes unbounded; the fix is the Dialect-declared size flag. The findings' "DMG unchanged" still holds, since no preset writes such a loop.
  - The low items: a NaN `--tolerance` makes every GLSL comparison pass, the JS emitter can still shadow a helper, the `faults` exit code ignores unclean controls, a -0 mismatch is located wrongly, ties at other grid scales, and some docs that claim too much.
  The reviewer's probes are in the session scratchpad (`rev4/`), which a reboot clears; each reproduction is also in `piyiFx`'s description.
- **Fix `piyiFx` first next session.** It is the only open leaf. Most M2 leaves lack the `reviewed` label; label them after the fix (`job label add <ids> with reviewed`).

## Open for Ben

1. **One GLSL tolerance or two.** The findings recommend one declared figure (`GLSL_TOLERANCE = 1e-3` in `kit/harness/tolerance.js`, which should move to the GLSL target) plus a per-case override that names its reason, since the stress case reaches 5.2e-3. Ruling needed.
2. **A second H3 round** that forces vector math and has per-style diagnostic tips (the L001 and L003 tips now mention the other style). Until it runs, the H3 verdict stays provisional.
3. **`peep` image checks** (Ben offered it for MAE testing): add an image-level MAE check of interpreter against GPU renders to the harness, or not.
4. **Main-thread calls made, two-way doors:**
   - GLSL refuses `%` on f32 (R006, tip names `pmod`), because GLSL cannot reproduce JavaScript's truncating remainder.
   - Comparing two choices with different option lists is refused.
   - Truthy of an f32 uses `isnan`, which holds only where the driver honors NaN.
   - Any read-only place now bounds a loop in lowering, matching the verifier; looser than "a declared size" (noted on the M2 container).

## Next

1. Fix `piyiFx` (above), starting with the size flag, which touches lowering and the verifier.
2. **M3 is not planned yet.** The findings' "What M3 should change" lists the inputs: the Definition API and the generic `.construct()` machinery; the notes on [guarantees and testing](2026-11-23-guarantees-and-testing.md) and [Dialect composition and extension](2026-11-23-dialect-composition-and-extension.md) (neither ruled); a Dialect-declared size flag on read-only places; per-style diagnostics; range analysis. Plan it with Ben as a dated doc with a `tasks:` block.
3. One known hole is left open: an author local named like a helper the kernel calls can still shadow it in the JS emitter.
4. A worktree agent's harness may refuse commands containing "git" ([gotchas](gotchas.md)); `sleepy` and `git` both need the sandbox off.
