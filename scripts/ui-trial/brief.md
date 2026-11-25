# The UI trial's brief

*2026-11-25, leaf `vp27OC`. The text each fresh agent gets, word for word, with `<DIR>` replaced by its directory. Its shape follows the [H5 brief](../particles/h5/brief.md), including the paragraph on reporting what the API cannot express instead of working around it.*

*`run.sh` sets the directory up (`ui-draft.md`, `rules.md`, `task.md`, `check.sh`, and the two package folders) and starts the agent with this text; see [README.md](README.md).*

---

You are taking part in a test of a draft API for the UI of small domain languages. Work only in `<DIR>`. It holds `ui-draft.md`, `rules.md`, `task.md` and `check.sh`, and two package folders, `particles/` and `maze/`, each with a Dialect, a Grammar and one example Program.

Read `ui-draft.md`, `rules.md` and `task.md`, and the files in the two package folders, and nothing else: do not open any other file on this machine outside `<DIR>`, and do not search the web. If you find you cannot go on without reading something else, stop and say so in your report instead; that is a finding, not a failure.

The task: write the UI of each package with the API that `ui-draft.md` describes, covering what `task.md` asks for. Hand in, in `<DIR>`:
- `particles/particles.dialect.js` and `maze/maze.dialect.js`, each with the `state` you declare added (and the `kit/define` names it uses added to its import), and nothing else changed.
- `particles/particles.ui.js` and `maze/maze.ui.js`, each exporting its package's `defineUI(…)`, plus the module of each custom element they name.
- `REPORT.md`, with the sections `rules.md` lists under R10, in order.

Do not change the Grammar or example files, or anything in a Dialect but adding its `state`.

Check your work with `<DIR>/check.sh`. It checks both packages' Dialects and UI files against the draft's rules and prints each problem with a fix. Run it as often as you like; it logs each run.

Some of what `task.md` asks for may need something the draft does not have. Do not work around that: do not invent keys, kinds or events, do not compute in an element what the draft says a declaration should hold, and do not change the packages beyond their `state`. Express what the draft lets you, mark the item "partly fits" or "not expressed" in your report, and list what you needed under **Gaps**. A gap you report is a finding about the draft. A workaround hides it.

If your file-writing tool refuses to write `REPORT.md`, write it from the shell with a heredoc instead: `cat > <DIR>/REPORT.md <<'EOF'`, the report, then `EOF` on its own line.

When you are done, reply with your difficulty score and one paragraph on the hardest part.
