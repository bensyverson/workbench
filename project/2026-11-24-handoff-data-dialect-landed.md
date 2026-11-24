# Handoff: the data Dialect landed, the Definition API filled out, binding time built

*2026-11-24, end of session. Starts after [the architecture-review handoff](2026-11-24-handoff-architecture-review.md) (`f0b0d37`); this session's commits are `64f9321..` HEAD. Ben was around for the rulings.*

## What happened

Every commit the last handoff left unreviewed was reviewed, and so was every code commit this session, each by a fresh reviewer briefed on what must never happen. Each round found real bugs, and they were fixed on the same day:

- **Reviews of the earlier work:** `a9a690d` and `64f2d2e` (kit/define: oneOf branch choice, step context), and both trial checkers (`fa61944`, `f9391e2`). Fixed in `0782905`, `cfc2c27` and `6edf1f1`.
- **`kit/query`** (`cbe32a0`): read-only queries over Kernels. The GLSL capability check now uses them, and its goldens are unchanged. Finding: a fields uniform read records no effect, so R005 in the LIR is the real guard.
- **The data Dialect** (`62bec66`, `3f262b4`). It is trial 2's agent A, fitted to the built API. Its join reads the other table through step's context, and it adds `dateOf`. The Grammar covers Dream Code examples 1–7: each one builds, or is refused with a code and a fix. The massage was +138/−50 lines on 202. **H2 evidence:** the IR carries the meaning of about 8 of the 21 table operations in examples 2–5 (derive, filter, limit), and none of the table-level semantics.
- **Null checks** (`62bec66`, corrected in `6edf1f1`). Only `x != null` / `x == null` narrow. In `62bec66`, `x !== null` also narrowed, which the review found unsound: the core itself yields undefined for `find`, for an index past the end and for an optional key read by destructuring. That premise is marked wrong in the docs.
- **Constants may call pure helpers** when a Dialect declares `constants: { calls: "pure" }`; fields does. Constants are now lowered in every inference pass, and a recursion through a constant is L007.
- **A required text view** (`6edf1f1`, D020). fields draws a frame as characters, and data prints a table.
- **Module-scope helpers and constants** (`613926f`, fixed in `c7ed99f`): `.build({ scope, sources, buildTime })`. A helper is only an arrow written by its own top-level declaration. Plain data is baked from its value, read through property descriptors. B012 refuses any other value and B013 a build-time-only name. The lexical scan moved into `kit/parse/toplevel.js`.
- **Definition API gaps from the data Grammar** (`613926f`): `names` on a construct without state (the chart's stand-in state is gone), `fix` on `rejected`, and `didYouMean` exported. Opening-shape refusals are parked in the backlog.
- **Binding-time params** (`80c93f5` design, `c7ed99f` build). A Program file exports `($) => program(…)`, and `run()` records build-time reads. `lower()` reports each param's binding time, `needsRebuild` answers from the record, and B014 refuses a run-time-only member read at build time.

## Rulings (Ben, 2026-11-24)

- The date constructor is `dateOf(y, m, d)`; D007 is kept.
- An explicit null check narrows. As built, only the loose form does (see above), and Ben was told why.
- A Dialect may let its constants call pure helpers.
- Module scope: the host passes the scope as data, and a top-level binding that shadows a Dialect or Library name is refused ([synthesis §3.2](2026-11-24-architecture-synthesis.md)).
- Binding time: Option A, the lambda form in a structure slot refused, and the Grammar names its param slot ([design doc](2026-11-24-binding-time-design.md)).

## For Ben's eyes

- **B002 also refuses a top-level name that clashes with the Program's own `.fn`/`.const`.** The ruling named only Dialect and Library names; the integrating agent extended it.
- **B002 fires on unread top-level bindings too.** A fields file with a top-level `min`, `mix` or `color`, or a data file with `year` or `round`, is refused even if no lambda reads it. That follows "one name, one meaning", but it may be stricter than wanted.
- **Composition checker:** may a cave's `.carve` read another part's output (`game.out`)? `cave.md` is ambiguous. Settle it before a composition rerun.
- **Binding-time attribution** is by call order plus line (the design's fourth fork, not asked). It stands until a trial says otherwise.

## Review

Every code commit this session has been reviewed except **`c7ed99f`**. Its reviewer (`rev-bind`) was still running at the time of writing; see the addendum below. Kept probes live in `local/rev-*-probes/` (gitignored, named `*.probe.js`; see the gotcha).

## Prerelease

`npm run test:prerelease`: 16 of 16 on the merged tree after `62bec66` (37 s), with the planted-fault report unchanged (JS 24/26, GLSL 21/24). The `bindbuild` agent also ran it in its worktree for `c7ed99f`: 16 of 16. A final run is recorded in the addendum.

## Next

1. **The dogfood trial for the new Definition API features** (bqYGEM's `vv2`; the AGENTS.md rule says a feature is not frozen before one). Cover binding time, module scope and the text view, with one Opus, one Sonnet and one Haiku agent, using the define-trial packet (its `api-draft.md` and `rules.md` are current). The recorded hand-ins all stop at D020 now, so a rerun needs fresh hand-ins.
2. bqYGEM's `6Nx` is only partly met: binding times print from `lower()` (`bindingText`), but not in the Kernel listing. Decide whether that is enough.
3. Then `qwgSOL` (START.md, API.md, hello), once the API is frozen; then `3Cd9hb` and `cqIENy`.

## Notes for the next session

- A reviewer's probes that only print results can't be copied in as red tests. Ask reviewers for asserting `*.probe.js` files, as the last brief did.
- Every recorded define-trial hand-in now stops at D020 (no `text()`) and would also fail C001 (a Program is now a function of `$`). Their verdicts are history, not regression tests.
