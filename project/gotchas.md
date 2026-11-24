# Gotchas

Project-specific traps that cost real time and that no general rule predicts. Read at session start; append when you hit one.

- **Fix at the source when you can.** A gotcha is a bug report on our tooling, not a permanent fact — if it can be fixed in code, file it in `job` and fix it instead of recording it here.
- **Delete anything that becomes obvious, gets fixed, or stops recurring.** Keep this list short; a long list is one nobody reads.
- **Feedback about `AGENTS.md` itself** — a rule that was wrong, misread, or cost time — goes here too, prefixed `rule:`. It is harvested when the shared rules are reviewed.

Format: one dated H2 headline, then one paragraph. If an entry needs more than that, it's a finding — write it as a dated doc under `project/` and link it from the paragraph.

---

## 2026-11-23: a worktree has no node_modules

`npm run typecheck` in a fresh worktree fails because `node_modules` is gitignored and so absent. Symlink the main checkout's (`ln -s /Users/ben/git/workbench/node_modules <worktree>/node_modules`) and remove the link before handing back. `npm test` needs no packages and runs without it.

## 2026-11-23: a worktree agent's harness may refuse any command whose text contains "git"

The survey agent (job 4ZsFh5) found every command refused as "too complex to verify" when its text held `git`, even inside a path such as `/Users/ben/git/workbench/...` or `.gitignore`; splitting the command did not help. Every absolute path in this repo contains `git`. It worked around it by running Node scripts that took the paths as arguments. Other agents this session did not hit it, so it depends on the isolation mode. If you hit it, do the same, and say so in your report.

## 2026-11-24: every `.js` under a `test/` folder runs as a test

`node --test` (and so `npm test`) runs every `.js` file under any directory named `test/`, not only `*.test.js`. A fixture that is candidate code (it imports a module only a hook supplies, such as the define-trial's `kit/define`) fails there as a test file. Keep such fixtures beside `test/`, as `scripts/define-trial/fixtures/` does, and exclude them from `tsconfig.json`.

## 2026-11-24: a subagent's Write of a file named like a report may be refused

In dogfood trial 1 the harness refused two of three agents' Write of `REPORT.md` ("Subagents should return findings as text, not write report files"); one wrote it with a shell heredoc, one returned it as text for the main thread to save. When a trial's hand-in includes a report file, tell the agent in the brief to write it with a shell heredoc if Write is refused, or have it return the report and save it yourself.
