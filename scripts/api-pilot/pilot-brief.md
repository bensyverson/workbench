# The pilot's brief

*2026-11-24, leaf `qwgSOL`. The text each fresh agent got, word for word, with `<DIR>` replaced by its directory (`local/api-pilot/run-a`, `run-b`, `run-c`: Opus, Sonnet and Haiku). Each directory held `kit/START.md`, `kit/API.md` (at `ca06ede`), `docs/dream-code.md` and a `check.sh` running `node scripts/define-trial/check.js <DIR> --lang budget` with `DEFINE_TRIAL_LOG=<DIR>/log.jsonl`.*

---

You are taking part in a pilot of a language kit's documentation. Work only in `<DIR>`. It holds four files: `START.md`, `API.md`, `dream-code.md` and `check.sh`.

Read `START.md`, `API.md` and `dream-code.md`, and nothing else: do not open any other file under `/Users/ben/git/workbench`, and do not search the web. If you find you cannot go on without reading something else, stop and say so in your report instead; that is a finding, not a failure.

The task: implement the budget-planner language that `dream-code.md` describes, with the API that `API.md` describes. Hand in, in `<DIR>`:
- `budget.dialect.js` and `budget.grammar.js`. The grammar file must export the builder as `budget`, since Programs import `{ budget } from "../budget.grammar.js"`.
- `examples/`: Programs in your language that check clean (at least the one in `dream-code.md`, verbatim, as `examples/00.js`). Do not leave the must-refuse Programs here: write each one, confirm `check.sh` refuses it, then delete it.
- `REPORT.md`, with these sections in order: **Difficulty** (1 easy to 5 could not do it, one sentence why); **Refusals** (for each of the 12 numbered refusals, the code your language gives, or "not refused" and why); **Where the documents misled you** (quote them); **What you guessed** (every place the documents did not say, and what you chose); **Gaps** (what you needed that the API does not have); **Files** (every file you opened, and confirm you opened nothing else under the repository).

Check your work with `<DIR>/check.sh`. It runs the real kit over your files: your definitions, every example's builder calls, and the type-checking of every lambda. Run it as often as you like; it logs each run.

Your language will be tested with Programs you have not seen, written from `dream-code.md` alone: some must check clean and some must be refused. So follow the sheet exactly, including its refusals.

If your file-writing tool refuses to write `REPORT.md`, write it from the shell with a heredoc instead: `cat > <DIR>/REPORT.md <<'EOF'`, the report, then `EOF` on its own line.

When you are done, reply with your difficulty score and one paragraph on the hardest part.
