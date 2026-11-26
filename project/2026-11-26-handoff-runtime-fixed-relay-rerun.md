# Handoff: runtime and compose fixes landed, relay rerun and placeholder A/B run

*2026-11-26, end of session 2. Picks up after [the seams-and-runtime handoff](2026-11-26-handoff-seams-and-runtime-built.md) (`bcc5398`). This session's commits are `23511c1..` HEAD. Ben ruled on everything below while he was around, then left; nothing waits on him to continue.*

## Needs Ben's eyes

1. **`Vv3lQY`: six runtime-contract design calls from the relay rerun** (labeled `decision`). Each changes what a package author writes. Recommendations are in [the rerun findings](2026-11-26-seams-relay-rerun-findings.md), "For Ben":
   1. kernels by name for repeated slots;
   2. per-Program state;
   3. a `$T` stamp on delivered Event records;
   4. optional record fields with defaults;
   5. a glue call naming which part a control drives;
   6. a record global that reads as absent outside a record-driven call.

   The placeholder relay D made two of them sharper. It refused every `.field()` Program (state), and it stopped at S116 because the maze's Event max came from a snippet's literal `8` and no glue can fix a max. Both are in [the placeholder findings](2026-11-26-placeholder-docs-findings.md).
2. **S116 has no composer-side fix.** Both of its fixes (raise a max, or `keepLast`) are package edits. That is filed inside item 1's evidence; Ben may want it as a seventh call.

## Rulings this session (all recorded)

- **Run codes move to N** (N001–N006, N reserved); kit/lir keeps R. Recorded on `ZH4KWX` and in the clocks draft (correction block).
- **Event per-step maxes stay in the runtime.** `ctx.kernels.<slot>` aliases the part's own lambdas.
- **Boolean-only conditions, no opt-out.**
- **A stopped part takes no Events:** they are dropped, counted in `stats().stopped` and noted once per wire as N001, and a restart begins with empty queues. Recorded in the clocks draft, rulings block.
- **Docs for agents use `<placeholder>` snippets, never worked examples or made-up names** (memory `placeholders-not-examples`; A/B evidence in the placeholder findings).

## What landed

| Commit | Leaf | What |
|---|---|---|
| `e50172c` | `cUXOI7`, `3knMDf` | Six LOW compose/seam fixes, `point1`, S301 glue scan (compose-fix-1, Sonnet) |
| `469c3c6` | — | `.gitignore` ignores a `node_modules` symlink (see gotchas) |
| `7ae02ef` | `W8gh6f` | Boolean-only conditions; DMG presets in `scripts/dmg-oracle/presets.json`, 29 edits, 54 trace runs identical (bool-1, Sonnet) |
| `acc5434` | `p3OBui`, `0aVPIi`, `TB849g` | The driver honors S116's window; an N002 intake check; run codes moved to N; kernel alias; a failed rebuild keeps its revision; content-key canonical form; carry by path (runtime-fix-1, Opus) |
| `d8bba18` | `uQiXiX` | S301: no false positive on a logical's result; a handle throws on an unknown property (compose-fix-2, Sonnet) |
| `055a0b0` | `WnmLua` | The relay packet rewritten against the real kit, with a checker that runs every leg (relay-1, Opus) |
| `8dc6638` | `WnmLua` | The rerun: relays A (Sonnet) and B (Haiku), all clean; [findings](2026-11-26-seams-relay-rerun-findings.md) |
| `73a6c06` | `HIX61h` | List concatenation `[...a, ...b]`, a `concat` IR op, maxes summed (concat-1, Sonnet) |
| `829ddef` | `59Gz7b` | Packet doc fixes, D030 names where `edges` goes, G008/G013 count only new particles (docfix-1, Sonnet) |
| `883c7b0` | `4WMA0R` | Restarts deterministic under any `runUntil` chunking, replay tails, display `runUntil` steps frame parts, S116 demand→frame, stopped parts drop Events (runtime-fix-2, Opus) |
| `1a51fe0` | `KTrmEL` | Placeholder-snippet packet (`PACKET=placeholder`), relays C and D, [findings](2026-11-26-placeholder-docs-findings.md); the checker gives S116 as a diagnostic (placeholder-1, Opus) |

## The two trials in one paragraph

On the real kit, strangers' packages compose without trouble. All four relays' composers were clean or blocked only by a package's numbers, and `rename` was found unaided wherever names differed. The **runtime contract** is where authors guess and stall: the record's shape, kernel ids for repeated slots, per-Program state, an Event's instant. That is why `Vv3lQY` matters. Placeholders cost nothing measurable and drop example-traced names, but most names come from the task and packages, and literal numbers in snippets still leak.

## Review

- **Reviewed:** `e50172c` by reviewer-compose-3 (findings fixed in `d8bba18`). `acc5434` by reviewer-run-2 (findings fixed in `883c7b0`). Probes are in `local/rev-compose-3/` and `local/rev-run-2/`.
- **Not independently reviewed: review these first.**
  - `883c7b0` (runtime-fix-2). The highest stakes: a runtime contract with new public API (`run.advance`, `record().T`, `stats().stopped`) and a new scheduling path (`upcoming`, `floor`, `logFrames`). The reviewer's fuzzers held on the branch (chunk 300, driver 320, tick-instants 400, plus a new runUntil fuzz at 320).
  - `d8bba18`: the handle Proxy.
  - `7ae02ef`: lowering.
  - `73a6c06`: a new IR op.
  - `829ddef`: D030 and the checker.

  `055a0b0` and `1a51fe0` are trial tooling, so they are lower priority.

## Prerelease

`npm run test:prerelease` at `1a51fe0`: 19 tests, 19 pass, 38 s. Planted faults: JS 24/26 and GLSL 21/24, with the same five escapes as before. The fast suite passes 2,416 tests.

## Gotchas and lessons

- Main's `node_modules` was replaced by a self-link when a squash carried a worktree's symlink, so npm failed silently with ELOOP. It is fixed at the source (`.gitignore`), and the entry is in `project/gotchas.md`. Integrators: after `git -C <wt> add -A`, `git -C <wt> rm --cached node_modules` was still needed for worktrees branched before `469c3c6`; it is harmless after.
- `npm` and `git commit` (which runs npm in its hook) need the sandbox off here.

## Next

0. **Review `883c7b0`** (Opus, fresh reviewer; the probes and fuzzers in `local/rev-run-2/` are the starting kit), then `d8bba18`, `7ae02ef`, `73a6c06` and `829ddef` (one Sonnet reviewer can take these four).
1. **`Vv3lQY`, once Ben rules.** Build the rulings (Opus, the runtime contract). Then run a runtime-focused relay with a language whose Programs declare their own data, and a second package pairing.
2. **`yfSlwY`:** placeholder snippets in kit/START.md and kit/API.md, plus the `vec2@px/s` leak in `kit/package/reference.js`. Sonnet.
3. **`p4IYui`:** split `kit/run/scheduler.js` (about 570 lines). Sonnet, after the review of `883c7b0`.
4. **`LUSPEC`:** a sampler in `fields` and kit/emit/glsl. Opus; design.
5. **`e3qYus`:** the draw-list paper trial, in placeholder style.
6. **`HKNInI`:** the build record's `why` text and its small trial.
