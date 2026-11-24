# Handoff: M2 planned and started; M1's review fixed

*2026-11-23 · written at the end of the fourth session. It is current only while no later commit exists after the one that adds it. It supersedes [the widenings handoff](2026-11-23-handoff-widenings.md).*

## Where things stand

- **M2 is planned and under way.** [The M2 plan](2026-11-23-m2-shader-slice-plan.md) has a `tasks:` block, imported under `6r597q`. Six of its 14 leaves are done:
  - the sketch survey (`4ZsFh5`): [its finding](2026-11-23-uncommon-math-sketches.md) picks `13-filters/uv-remaps` (swirl, bulge) and `04-noise/domain-warp`;
  - the IR verifier (`lH5oTo`): V001–V012, `kit/ir/verify.js`, run on every lowering under test;
  - f32 and vector value types (`psq9tb`), M2's one change to the core;
  - three decisions (`DR0XNq`, `rSIftv`, and the one below).
- **M1's follow-ups are closed and filed under M1 (`oHF0p6`):**
  - a literal's exact length (`qL6eyA`), which lowered 2 more lambdas;
  - the lowering review's ten fixes (`Zxo3pY`), each with a regression test;
  - non-finite literals, now L016 (`jNzjV0`).
- **Survey: 126 lambdas; 111 lowered, 7 helpers, 4 subset, 4 not-yet** (`node scripts/dmg-diff/cli.js survey`).
- **Every lowered lambda matches its original.** `node scripts/dmg-diff/cli.js diff --all-presets --seeds 7,11 --frames 1200` gives 42 runs, 111 swapped, 0 differences. This was the agents' run on each branch; the main thread ran the suites.
- **Tests:**
  - `npm test`: 442 tests, about 3 s wall time, with the verifier on (`kit/test/verify-lowering.js` is preloaded).
  - `npm run test:prerelease`: 11 of 11 at 6e4366c, 54 s.
- Nothing is pushed.

## Review

- **Reviewed:** last session's lowering code (`m82n5e`, `FrMVgR`), by an independent Opus reviewer. Its probe confirmed ten defects, all now fixed.
- **Not yet independently reviewed:** the main thread read every diff before squashing, but no fresh reviewer has seen these:
  - **791b985**, the IR verifier;
  - **6e4366c**, the f32 and vector types (`kit/lower/numeric.js`, the `OPS` rules in `kit/ir/verify-rules.js`, the hooks in `kit/lower/expr.js`).

  Together they are about 1,500 lines of production code, which is review.md's trigger. **Review them first next session**, before building the fields Dialect on them. The verifier is fail-closed in both directions; the value types carry D1's typing rules.

## Rulings this session (each recorded where it rules)

- **Nested literals do not join** (`Dy4py1`; the M1 plan, under "Subset widenings after M1"). `f({ d: "up" })` next to `f({ d: "down" })` stays one L014. The message names the field and suggests passing that value as its own parameter. Ben: "I'd rather be slightly too strict but helpful in our error messages than silently accept something which creates ambiguity and errors."
- **GLSL runs through `sleepy`** (`DR0XNq`; the M2 plan's Rulings). `sleepy` is the headless WebKit browser already on the machine. A probe page got WebGL2, compiled GLSL ES 3.00, and read back float pixels. The harness page runs in the prerelease suite, skipping with a message where `sleepy` is absent. No npm dependency is added.
- **The sketches' integer hash is a fields intrinsic** (`rSIftv`; the M2 plan's Rulings). `ihash` has three versions:
  - JS: the book's own code;
  - GLSL: `uint` arithmetic;
  - the interpreter: a reference implementation.

  There are no integer value types.
- **Main-thread calls**, two-way doors, reported to Ben:
  - Baked list and struct constants stay baked, and `===` on lists and structs is L003.
  - A non-finite literal is L016.
- **Ben's working rules**, kept as memories:
  - delegate implementation to Sonnet where it can do it;
  - file every follow-up under its M container, never as a sibling of the M-series.

## Open for Ben

1. ~~A number literal takes f32 from its context.~~ **Answered:** Ben ruled that literals are untyped until used and each Dialect declares its default number type (the M2 plan, Rulings). The fields Dialect leaf implements it.

## Next

1. **Review 791b985 and 6e4366c** (above), and dispatch any fixes.
2. **The fields Dialect** (`gmyAFW`, now `job orient`'s target). Its notes carry what it needs:
   - the hash ruling;
   - the f32 literal choice;
   - the gaps the value-types leaf left: `++` on f32, a ternary's literal arm, f32 store rules, vector conversions, rgba names.
3. **The reference interpreter** (`ijlr3x`) is unblocked and touches only new files (`kit/interp/`), so it can run in parallel with the fields Dialect. The JS backend's f32 and vector emission (`ZDCBUt`) waits on the Dialect.
4. A worktree agent may find its harness refusing any command that contains "git" ([gotchas](gotchas.md)).
