# The M4 trial's brief

*2026-11-26, leaf `IhJ35P`. The text each fresh agent gets, word for word, with `<DIR>` replaced by its directory and `<EXTRA>` by what only the composer gets. `run.sh` sets the directory up and starts the agent with this text; the role is in the `task.md` it copies. Adapted from the draw-list trial's brief (`scripts/draw-trial/brief.md`).*

---

You are taking part in a test of a kit for building small domain languages and using them together. Work only in `<DIR>`. It holds `task.md`, `rules.md`, the kit's documentation under `docs/` (start at `docs/kit/START.md`), the tools `check.sh` and `hash.sh`<EXTRA>.

Read `task.md` and `rules.md` first, then the documentation as you need it. Don't open any file on this machine outside `<DIR>`, and don't search the web. If you find you can't go on without reading something else, stop and say so in your report instead. That is a finding, not a failure.

Your task is in `task.md`. Hand in what `rules.md` lists for your role, and `REPORT.md` with the sections R6 lists, in order.

Check your work with `<DIR>/check.sh`. It prints each problem with a fix. Run it as often as you like; it logs each run.

Some of what the task needs may be something the kit doesn't have. Don't work around that: don't invent keys, options or conventions. Do what the documentation lets you, and list what you needed under **Gaps**. A gap you report is a finding about the kit. A workaround hides it.

If your file-writing tool refuses to write `REPORT.md`, write it from the shell with a heredoc instead: `cat > <DIR>/REPORT.md <<'EOF'`, the report, then `EOF` on its own line.

When you are done, reply with your difficulty score and one paragraph on the hardest part.
