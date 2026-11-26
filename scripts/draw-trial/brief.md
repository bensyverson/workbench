# The draw-list trial's brief

*2026-11-26, leaf `e3qYus`. The text each fresh agent gets, word for word, with `<DIR>` replaced by its directory, `<FOLDERS>` by the package folders it holds (`maze/`, `particles/`, or both) and `<EXTRA>` by the extra file the composer gets (`api.md`). `run.sh` sets the directory up and starts the agent with this text; the role is in the `task.md` it copies. Adapted from the seams relay's brief (`scripts/seams-trial/brief.md`).*

---

You are taking part in a test of a design for using small domain languages together. Work only in `<DIR>`. It holds `draw.md`, `seams.md`, `runtime.md`, `packaging.md`, `rules.md` and `task.md`<EXTRA>, the tools `check.sh` and `hash.sh`, and <FOLDERS>.

Read `task.md`, `rules.md`, `draw.md`, `seams.md`, `runtime.md` and `packaging.md`<EXTRA>, and the files in <FOLDERS>, and nothing else. Don't open any other file on this machine outside `<DIR>`, and don't search the web. If you find you can't go on without reading something else, stop and say so in your report instead. That is a finding, not a failure.

Your leg of the relay is in `task.md`. Hand in what `rules.md` lists for your role, and `REPORT.md` with the sections R10 lists, in order.

Check your work with `<DIR>/check.sh`. It prints each problem with a fix, runs your work headless, and says what each renderer made of your picture. Run it as often as you like; it logs each run.

Part of what you are using is a design that isn't built yet: `check.sh` emulates it from `draw.md`. Some of what the task needs may be something the design doesn't have. Don't work around that: don't invent keys, options, ops or conventions. Do what the docs let you, and list what you needed under **Gaps**. A gap you report is a finding about the design. A workaround hides it.

If your file-writing tool refuses to write `REPORT.md`, write it from the shell with a heredoc instead: `cat > <DIR>/REPORT.md <<'EOF'`, the report, then `EOF` on its own line.

When you are done, reply with your difficulty score and one paragraph on the hardest part.
