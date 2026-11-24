# Handoff: kit/define fixed, fields re-declared, trial 2 run

*2026-11-24 · current only while no later commit follows the one that adds it. It supersedes [the define-built handoff](2026-11-24-handoff-define-built.md).*

## Where things stand

- **`npm test` 1032 pass, 0 todo; the prerelease suite passed 16 of 16** at `f4f8152`, the last code commit.
- **kit/define is fixed and reviewed twice.** Commits:
  - `70016bb`, `b2633de`: the six review bugs and the nits. P5 (same-named stateful instances) was ruled by the main thread as **B002**, since `stateOf` takes a bare name.
  - `39f0804`: the first independent review then found five more bugs: instance names under a namespaced `name()`, ref-id collisions, a `name` record key, `__proto__`, and type names shadowing built-ins. This commit fixes them, with the new id scheme `[n]` / `~n`.
  - `71c5473`: `opt(ref(…, { as }))` records under its `as`.
  - `a9a690d`: `oneOf(ref, lambda)` no longer drops a lambda. The rule: a string that parses as an arrow function is the lambda. Also B008's tip for `Math`.
  - `64f2d2e`: `step(state, call, inferred, { program, stateOf, error })`.
  - `f4f8152`: the second review's nits.
- **The date scalar is in the core** (`c99faac`): `scalar("f64", { note })`. It compares only with its own kind, and the LIR refuses it. The H2 change list is a note on `vNfBwn`.
- **fields is declared through kit/define**, both halves (`4a640f7`). Lowering, JS, GLSL and the interpreter were confirmed unchanged against the old builder (second review). The harness figures are unchanged. Behavior that moved: refusals now come at `.build()`, and a constant may not call a helper (decision `iySXYx`). The H4 change list is a note on `iJtvVE`.
- **The GLSL figure lives on the target** (`575c71f`). A case's override must give a reason.
- **The README Quick Start** walks one Program (`examples/rings.js`, a real arrow function) through the IR, JS, GLSL, the harness and an L003. `test/readme.test.js` keeps it honest.
- **Trial 2 is run and recorded** ([findings](2026-11-24-definition-api-trial-2.md)). All three agents checked clean on the first run, with zero lines of massage. The convergent ask (a `step` context) is built (`64f2d2e`). The trial checker now runs the real kit/define (`f9391e2`).

## Rulings and calls made this session (main thread, two-way doors)

- P5: stateful instances share one namespace, and a second with a taken name is B002.
- `iJtvVE` covers both halves for fields. Its "Grammar out of scope" line predated the H4 narrowing (note on the leaf).
- After `ctx.error`, the state `step` returns still applies (one mistake, one diagnostic).
- `examples/rings.js` stays excluded from tsc. A `@ts-nocheck` header would sit in the README's first sample.

## Open for Ben

- **`iySXYx`** (decision): may a constant call a pure helper? Recommendation: yes, per Dialect.
- **On `5eeJED`**: should the date constructor be named `dateOf` (keeping D007), and should an explicit null check narrow an optional scalar? A date at the epoch currently reads as absent.
- Still open from earlier: Kernel queries (`dynUhe`), a second H3 round, `peep` image checks.

## Next

1. **Review first:** `a9a690d`, `64f2d2e` and `f9391e2` (the trial checker) have had no independent review. `f4f8152` is fixes for review findings.
2. **A short trial rerun** (one Sonnet agent, Dream Code example 05) on the `step` context, to confirm the `lookup`-closure workaround is gone. Use the packet and briefs in `scripts/define-trial/` (copy as in `trial-2-briefs.md`).
3. **`5eeJED`**, the data-tools Dialect: take the best trial-2 hand-in (`scripts/define-trial/runs/2026-11-24-trial-2/`) and port it to the `step` context. The core gaps (integers, nulls, string building, date literals) are its H2 inputs.

## Notes for the next session

- In a worktree, `git commit-tree <tree> -p HEAD` takes the worktree's own HEAD as parent, so the squash is a real three-way merge onto main. That is correct, and expect conflicts in shared READMEs.
- Haiku ignored the heredoc fallback for `REPORT.md` (gotcha updated).
- `local/define-trial-2/` (gitignored) still holds the trial directories; the hand-ins are copied into `runs/`.
