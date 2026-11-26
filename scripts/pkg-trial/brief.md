# The package trial's brief

*2026-11-25, leaf `bo1glT`. The text each fresh agent gets, word for word, with `<DIR>` replaced by its directory. Its shape follows [the UI trial's brief](../ui-trial/brief.md). `run.sh` sets the directory up and starts the agent with this text.*

---

You are taking part in a test of a draft package format for small domain languages. Work only in `<DIR>`. It holds `packaging.md`, `rules.md` and `task.md`, two tools (`hash.sh` and `check.sh`), and two folders of loose parts, `particles/` and `maze/`.

Read `packaging.md`, `rules.md` and `task.md`, and the files in the two folders, and nothing else. Don't open any other file on this machine outside `<DIR>`, and don't search the web. If you find you can't go on without reading something else, stop and say so in your report instead. That is a finding, not a failure.

The task: package each language as `packaging.md` describes, under `<DIR>/out/`, and answer `task.md`'s questions. Hand in `out/particles/`, `out/maze/` and `REPORT.md`, with the sections `rules.md` lists under R7, in order.

Check your work with `<DIR>/check.sh`. It loads both packages as a host would and prints each problem with a fix. Run it as often as you like; it logs each run.

Some of what the task needs may be something the draft doesn't have. Don't work around that: don't invent manifest keys or conventions, and don't change what a definition says. Do what the draft lets you, and list what you needed under **Gaps**. A gap you report is a finding about the draft. A workaround hides it.

If your file-writing tool refuses to write `REPORT.md`, write it from the shell with a heredoc instead: `cat > <DIR>/REPORT.md <<'EOF'`, the report, then `EOF` on its own line.

When you are done, reply with your difficulty score and one paragraph on the hardest part.
