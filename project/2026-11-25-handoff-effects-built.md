# Handoff: per-slot effects built, the reference scored, the Manuel short list

*2026-11-25, end of session. Starts after [the effects trial handoff](2026-11-25-handoff-effects-trial.md) (`4fed8dc`); this session's commits are `02ec35c..` HEAD. Ben was around: he asked about Manuel's consult, passes and wasm, Bench without type annotations, and Lean; he backlogged Lean, lattices and interval analysis, and ruled that `3YNVB3`'s last items go to Sonnet.*

## What happened

- **Review of `2eae282`** (the handle rule, finite numbers, B016/B017): a fresh reviewer found no fail-open case and four lows, fixed in `88a3e95` (leaf `739EEO`): one expression misusing a handle twice is one L018; a callable handle's members are refused; L018's wording matches the code (every helper parameter of object type is a handle); B017 names a function or a Promise instead of printing source. Labeled reviewed.
- **Per-slot effects, built** (leaf `8vQJOw`):
  - IR (`02ec35c`): the `bump` statement, `Place.total`, the `value` store rule; verifier, listing, interpreter (`host.bump`), JS (`+=`), LIR (R002), query walk.
  - Lowering (`9e4c510`): `SlotDecl.may` (L004 with the slot's `may` in its tip), totals lowered to bump from `+=`/`++` statements, L017. **A caller of a helper that does not lower now gets no kernel and no diagnostic of its own** (`blockedBy`): one mistake, one diagnostic. This also fixes `3YNVB3` item 3 (recursive helper). Two helper tests changed expectation; the DMG survey counts a blocked lambda under "helpers", so its M1 figures hold.
  - Definition API (`d09188c`, agent define-effects): instance spaces, writable members, totals, verbs, callable objects, `may`, `helpers`; D012 widened, D021, D022; the Environment generated. The trial checker's `--effects` shim is deleted; trial 4's hand-ins check with the same codes at the same lines.
  - Docs: kit/API.md, kit/define, kit/lower, kit/ir, kit/interp READMEs. **START.md + API.md: 7,101 tokens** (`set -a; . ./.env; set +a; node scripts/api-pilot/count-tokens.js kit/START.md kit/API.md`, all three tiers).
  - Reference (`0fbb5ff`): `scripts/particles/reference/` (trial 4 agent A's hand-in, unchanged). `node scripts/api-pilot/score.js scripts/particles/reference scripts/particles/hidden --lang particles`: **accept 27/27, reject 126/133**, the 7 misses exactly the out-of-scope ones; `scripts/particles/test/reference.test.js` pins it. The scorer gained `--lang` (`c4cca0f`).
  - The order check (informed pass item 4): `kit/define/test/order.test.js`, an instance-space lambda over 40 instances forward and in seeded shuffles, identical through the interpreter and the emitted JS, with a planted order-dependent lambda that it catches. Not done: comparing which error two backends throw.
- **`3YNVB3`**: item 7 (L007's message for `k < $.n`) fixed in `51a5d94`; items 2 (B013's message for another lambda's parameter) and 6 (function-declaration helpers) remain, both kit/define.
- **The Manuel informed pass's short list:** item 1, the "agrees with a reference" correction (`f386e71`); item 3, the layering ratchet (`kit/test/layering.test.js`, nine allow-listed files, not five); item 5, a GLSL coverage case for all eleven unrun fields intrinsics (not eight), worst 2.4e-7 (`fa561de`, agent side-tests); item 4 above. Item 2 (the Composition design lines) is Ben's.
- **A gotcha:** the harness's to-do reminders conflict with "plans and tasks live in job" (`project/gotchas.md`).

## For Ben's eyes

1. **Wasm and passes** (Ben asked, 2026-11-25). Wasm is where IR passes would pay: its engines assume an optimizing producer. Options: Binaryen's `wasm-opt` after emission (a dependency, needs your OK; blind to our facts), or our own passes using what we know (bounded loops, effects, param values), each gated by the interpreter on the original IR. Nothing filed; say which and I'll file it.
2. **Composition design lines** (informed pass item 2): a package pin is a content digest, a content key is per unit and fixed before any store exists. A paragraph now; your call where.
3. **Lean, lattices and interval analysis** are backlogged (Ben, 2026-11-25; `project/backlog.md`): one decision to keep the door open is that a Dialect's run semantics must be writable in Bench when host imports are designed.
4. Carried over: L018 also refuses comparing handles (`other !== self`); host imports as a separate `imports` key (recommended).

## Review

Reviewed this session by fresh reviewers: `2eae282` (four lows, fixed in `88a3e95`) and the whole effects build, `02ec35c`, `9e4c510`, `51a5d94`, `d09188c`, `0fbb5ff` (no high findings, two mediums and five lows, fixed in `4b349c8`, leaf `cunk5u`). The mediums: a verb on another object, or an object's call, could write or destroy an instance (now D022); h3's check hid why a pixel was blocked by a Library helper. The integrator read every merged diff. **Not independently reviewed:** `4b349c8` itself (the fixes; integrator-read), `c4cca0f` (the scorer's `--lang`), `fa561de` (test-only: the layering ratchet and the GLSL coverage case), and the doc commits. None blocks H5; review `4b349c8` with the next batch of kit code.

## In flight at handoff

Nothing. Every agent is integrated and its worktree removed.

## Prerelease

`npm run test:prerelease` at `0fbb5ff` (2026-11-25): 17 tests, 17 pass, 0 fail, 38.1 s (one new: the coverage case). Planted faults: JS 24/26, GLSL 21/24, the same five escapes.

## Next

1. Re-measure START.md + API.md (API.md grew 24 words in `4b349c8`; was 7,101 tokens): `set -a; . ./.env; set +a; node scripts/api-pilot/count-tokens.js kit/START.md kit/API.md`. Optionally bring the trial packet `scripts/define-trial/docs/api-effects.md` up to date (its D022 row lacks the verb-on-another-object case; it says "+= <any number expression>", which an f32 Dialect refines); H5 reads API.md, not the packet.
2. `3YNVB3` items 2 and 6, with a Sonnet agent (Ben, 2026-11-25), Opus only if one turns into a design question.
3. `3Cd9hb`, the H5 run: fresh agents build particles from START.md and API.md alone; score over the hidden set with the seven excluded (note on `3Cd9hb`).
