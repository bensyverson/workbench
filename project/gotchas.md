# Gotchas

Project-specific traps that cost real time and that no general rule predicts. Read at session start; append when you hit one.

- **Fix at the source when you can.** A gotcha is a bug report on our tooling, not a permanent fact — if it can be fixed in code, file it in `job` and fix it instead of recording it here.
- **Delete anything that becomes obvious, gets fixed, or stops recurring.** Keep this list short; a long list is one nobody reads.
- **Feedback about `AGENTS.md` itself** — a rule that was wrong, misread, or cost time — goes here too, prefixed `rule:`. It is harvested when the shared rules are reviewed.

Format: one dated H2 headline, then one paragraph. If an entry needs more than that, it's a finding — write it as a dated doc under `project/` and link it from the paragraph.

---

## 2026-11-23: a worktree has no node_modules

`npm run typecheck` in a fresh worktree fails because `node_modules` is gitignored and so absent. Symlink the main checkout's (`ln -s /Users/ben/git/workbench/node_modules <worktree>/node_modules`) and remove the link before handing back. `npm test` needs no packages and runs without it.
