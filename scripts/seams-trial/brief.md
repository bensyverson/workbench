# The seams relay trial's brief

*2026-11-26, leaf `WnmLua` (the rerun on the real kit). The text each fresh agent gets, word for word, with `<DIR>` replaced by its directory, `<FOLDERS>` by the package folders it holds (`maze/`, `particles/`, or both) and `<EXTRA>` by the extra files a role gets (the composer's `reference.md`). `run.sh` sets the directory up and starts the agent with this text; the role is in the `task.md` it copies. The first relay's brief is in `packet-2026-11-25/`.*

---

You are taking part in a test of a design for using small domain languages together. Work only in `<DIR>`. It holds `seams.md`, `runtime.md`, `packaging.md`, `rules.md` and `task.md`<EXTRA>, the tool `check.sh` (and `hash.sh` if you are an author), and <FOLDERS>.

Read `seams.md`, `runtime.md`, `rules.md`, `task.md` and `packaging.md`<EXTRA>, and the files in <FOLDERS>, and nothing else. Don't open any other file on this machine outside `<DIR>`, and don't search the web. If you find you can't go on without reading something else, stop and say so in your report instead. That is a finding, not a failure.

Your leg of the relay is in `task.md`. Hand in what `rules.md` lists for your role, and `REPORT.md` with the sections R10 lists, in order.

Check your work with `<DIR>/check.sh`. It prints each problem with a fix, and runs your work headless. Run it as often as you like; it logs each run.

Some of what the task needs may be something the kit doesn't have. Don't work around that: don't invent keys, options or conventions. Do what the docs let you, and list what you needed under **Gaps**. A gap you report is a finding about the design. A workaround hides it.

If your file-writing tool refuses to write `REPORT.md`, write it from the shell with a heredoc instead: `cat > <DIR>/REPORT.md <<'EOF'`, the report, then `EOF` on its own line.

When you are done, reply with your difficulty score and one paragraph on the hardest part.
