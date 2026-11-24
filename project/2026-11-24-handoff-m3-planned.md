# Handoff: M3 is planned; start with the design leaf

*2026-11-24 · current only while no later commit follows the one that adds it. It supersedes [the review-fixes handoff](2026-11-24-handoff-review-fixes.md), whose M2 state still holds.*

## Where things stand

- **M2 is closed and its review fixes landed** (`2e6dd1d`); `npm test` 779 pass; the prerelease suite passed at 16 of 16 earlier this session. Run it again at the end of the next session, not before.
- **M3 is planned and in the tracker** under `As6TAt`; the plan doc is [the M3 plan](2026-11-24-m3-kit-v0-plan.md). It was revised twice after three independent design reviews (one Fable, two Opus) and Ben's rulings. **The tracker is the plan**; the doc's two "Revised" blocks say what changed. Read the second block first: it supersedes the first where they conflict.
- **Rulings that bind M3 (Ben, 2026-11-24):**
  - SQL is not an input language; Dream Code that the kit won't build is rejected with a diagnostic and a fixit. SQL as an emit target is parked.
  - **Do not overcomplicate for things not yet built.** A new Local ruling in AGENTS.md also says to dogfood our own designs with a few fresh agents before locking them in.
  - A fresh agent, not the main thread, does the first conversion of the data-tools Dream Code, early, from a strict rule set and the draft API (leaf `lMNmIB`).
  - One declared GLSL tolerance on the target plus a per-case override that names its reason (leaf `JsWK1s`).
- **M3 in one paragraph:** a minimal Definition API (Dialect data, an environment hook, constructs, three slot kinds, a generated builder) proved on fields' `field()`, used by the data-tools Dialect, then docs and a pilot of fresh agents on `hello`. Parked in [the backlog](backlog.md): the program record and DAG question, the pass manager and H11, the DMG builder rewrite, the kit boundary and generic harness, SQL emit. H4 is "not tested against DMG"; H11 is "not tested"; the findings leaf `cqIENy` has the exact verdict wording.

## Next

1. **Claim `V93QGn`, the design leaf, pass 1 only.** Produce: the API section (Dialect data, `environment(decls)` hook, constructs, three slot kinds, generated builder with diagnostics), fields' `field()` written in the draft as the worked example, the strict rule set, the checker's codes, the stated lambda form, the free-variable rule and the reject-with-fixit list. Its notes (two of them; the later one wins) carry the detail. No executable DMG definition: that was dropped.
2. Then `lMNmIB`, the dogfood trial: write the checker script (it is `check` v0), brief three fresh agents with only the rules, the draft and the Dream Code, name the model, and record per agent what they guessed, asked for, and how much massage the output needed.
3. Then finish the design doc (pass 2) and build `38WI7z`.

## Open for Ben

- **Kernel queries (`dynUhe`)** stay only if they get a real client (rewrite `kit/emit/glsl/capabilities.js` on them, or the data Dialect's "which params does this lambda read"); otherwise they park with H11. Decide when the leaf comes up.
- Two earlier M2 rulings still stand open: a second H3 round, and `peep` image checks.

## Notes for the next session

- The job database's default identity is now `claude` (Ben set it on 2026-11-24 with `job identity set`), so writes need no `--as`. zsh doesn't split `$VAR` into words, so never keep a command in a variable.
- `git`, `npm` and `sleepy` need the sandbox off. `npm install` was run this session, so `node_modules` exists.
- A duplicate copy of the design note sits on `V93QGn` (harmless).
- The Dream Code file's "Builder gaps" section sits after its Assumptions paragraph; the order is fine.
