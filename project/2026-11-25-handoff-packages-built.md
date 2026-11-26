# Handoff: kit/package built and trialed, acorn vendored, the whole-file scan rebuilt

*2026-11-25, end of session. All of this session's code is reviewed except `5352f1d` (8 lines, which the integrator read). Starts after [the defineUI handoff](2026-11-25-handoff-defineui-built.md) (`2da2fc9`); this session's commits are `ee9e8a7..` HEAD. Ben was around for the whole session and ruled on every question below.*

## What happened

- **Ben's rulings** on the package draft and the UI questions, all as recommended:
  - Package format: `wb-package.json`; imports of the kit only; a checked `kit` version; uploads as files or a bundle.
  - UI: `list(type)` with no max allowed in `state` only; `stat.max` red at the max; no list queries in UI lambdas.
  - `kQu7xe`: refused in `defineUI` itself, by its structure.
  - They are recorded in the package draft, the UI state trial findings and the old handoff (`ee9e8a7`).
- **The package probe ran** (Safari 27.2): an import map resolves bare names, static or added at run time, and uploads keep the `blob:` specifier rewrite. Recorded in `scripts/m0-probe-pkg/README.md`.
- **UI** (kit/define/ui):
  - `b85bfef`: kQu7xe, list(type) in state, `stat.max`, and the first review's two findings.
  - `4a943cc`: a `const` set to a parameter chain takes the chain's Type, and a `let` may hold a scalar. Ben ruled this after the kQu7xe refusal proved too strict, since it made `s.bodies[0].mass` impossible.
  - `5352f1d` (iGiRNM): the open-list loop rule no longer depends on the order a `let` is assigned in.
- **kit/package v0** and its trial:
  - `0ca939f` builds it: the manifest, hash and import checks; `loadPackage`; `rewriteSpecifiers`; `KIT_VERSION` `"0.4"`; `scripts/pkg`; the trial checker and runner.
  - `c0ad8d8` records [the trial](2026-11-25-package-trial-findings.md). Two Sonnet agents and one Haiku agent (Ben's choice) packaged maze and particles, all clean on the first check with no massage, at difficulty 2, 2 and 3.
  - `d8b20fd` makes the trial's changes: `refusals` (Ben), examples built as the regression suite, `elements` checked against the UI, dotfiles ignored, a host-neutral K006 and a content key that covers the manifest. It also fixes two HIGH import-scan holes.
- **acorn 8.19.0 is vendored** (Ben approved it, `f442584`). Three reviews kept finding routes past the lexical import scan, so kit/package now parses each module, and a module that does not parse is refused. The reviewer's TypeScript-oracle fuzz found 0 fail-open cases in 25,777 programs.
- **The whole-file scan is rebuilt on acorn** (Ben, `9117cbd`, leaf VsPb2e):
  - kit/parse's `blank.js` and its lexical `toplevel.js` are gone, about 330 lines net.
  - `ocy5OI` is fixed.
  - `JYmuWM` stays open: the tree cannot tell a Runtime Lambda that holds a query callback from a build-time callback.
  - The define-trial checker's output on all 14 committed hand-ins is byte-identical.
  - The lambda parser stays; Ben asked us to watch for a reason to replace it too (project/backlog.md).

## Review

- **Reviewed this session:**
  - `916cd06` and `f65198f` by reviewer-ui-2.
  - `b85bfef` and `0ca939f` by reviewer-pkg-1.
  - `d8b20fd` and `4a943cc` by reviewer-pkg-2.
  - Every confirmed finding is fixed: ABzhFy, 8bkXWX, KvfF2X, 4U5MH9, OBLXnA and iGiRNM.
- **`9117cbd` (the scan rebuild) and `f442584` (the acorn import check)** were reviewed by reviewer-scan-1. Nothing serious: old and new scans agree on all 1,464 `.js` files in the repo, apart from the documented drift. Three small items are filed as issue `VwIoy7`: a `?.keyword` regex misread in acorn, a raw RangeError on very long chains, and a README overstatement.
- **Not independently reviewed:** `5352f1d` (8 lines, read in full by the integrator).
- **Commit hashes:** the integrator quoted some wrong hashes in conversation and in four job notes (since corrected). The ones above come from `git log`.

## Prerelease

`npm run test:prerelease` at `9117cbd`: 17 tests, 17 pass, 0 fail, 37.7 s. Planted faults: JS 24/26 and GLSL 21/24, with the same five escapes as before. The fast suite passes 2,155 tests.

## Next

1. `VwIoy7`: the scan rebuild's three small items (one Sonnet agent, with the reviewer's probes as red tests).
2. Close `IhJ35P`'s prerequisites: the seams leaf `hjdIRt`, which the package trial's composition answers feed. All three agents could not say "a burst where the actor reaches the goal": there was no event out, no trigger in, no coordinate mapping and no clock. Then `f2dMku` (clocks) and `HKNInI` (build record: the package content key now exists).
3. `JYmuWM`: it needs the builder's own list of the arrows it was handed (the second host).
4. Rerun the package trial with the revised reference (refusals, examples run) if the format changes again; the packet's `task.md` question 1 has been updated for it.
