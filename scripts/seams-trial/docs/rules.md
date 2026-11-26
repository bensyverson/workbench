# Trial rules: one leg of a relay

*You are one leg of a relay of three sessions. Two language authors each make their own package usable by strangers, without knowing about each other; then a composer, who never met either author, uses both packages together. Your leg is in `task.md`. You also have `seams.md` (the draft you are testing: ports, frames and glue programs), `packaging.md` (the package format), and the tools `check.sh` and, for authors, `hash.sh`.*

## What you hand in

| Role | Hand in |
|---|---|
| maze author | `maze/`, the package, changed in place, and `REPORT.md` |
| particles author | `particles/`, the package, changed in place, and `REPORT.md` |
| composer | `workbench.js` and `REPORT.md`; `maze/` and `particles/` exactly as you got them |

If the tool you write files with refuses to write `REPORT.md`, write it from the shell with a heredoc (`cat > REPORT.md <<'EOF'` … `EOF`). Don't return the report as text in place of the file.

## The rules

`check.sh` checks your hand-in with a stand-in for the kit. It prints each problem as `<file>:<line>: <code> <message>` with a `fix:` line. Run it as often as you like; it logs each run.

- **R1. Only what `seams.md` and `packaging.md` give.** Don't invent a Dialect key, a port option, a seam type, a glue call or a convention. Where you needed one, write it under **Gaps**. A workaround hides a finding; a gap you report is one.
- **R2. Authors: your package is still a package.** Every file listed and hashed (`./hash.sh maze` or `./hash.sh particles` after each change), its examples build, and its version is raised (a change that adds to the language raises the minor version: `0.1.0` becomes `0.2.0`). (K codes)
- **R3. Authors: what was there still works.** Add to the language; don't remove or rename what its examples, refusals and UI use. You may change the run's `state` when a port needs it; keep the UI's views working. (K, U and L codes; the rest is read by hand)
- **R4. Authors: one new example** under `examples/` that uses what you added, listed in the manifest. (K codes)
- **R5. Authors: you write for strangers.** You don't know what your package will be used with. Every port and frame has a `note` a stranger can act on. Don't name another language, package or frame. (D codes; the rest is read by hand)
- **R6. Composer: don't change either package**, not even a comment. Everything that involves both goes in `workbench.js`. If a package lacks something you need, that is a gap. (K006 if a file changed; read by hand)
- **R7. Composer: no hand conversions.** Don't multiply, add or divide to move a value from one language's frame into another's. Relate the frames with `.frame` and let the wire convert. (G codes; read by hand)
- **R8. The report.** `REPORT.md` has these sections, in order:
  1. **Difficulty**, 1 (easy) to 5 (could not do it), with one sentence why.
  2. **What you did**: authors, each port and frame you added and why a stranger would want it; composer, each part, frame and wire, and why.
  3. **Where the draft misled you**: a rule or example in `seams.md` that led you wrong, quoted.
  4. **What you guessed**: every place the draft didn't say and you chose, and what you chose.
  5. **Gaps**: what you needed that the draft doesn't have, smallest first.
  6. **Answers**: `task.md`'s questions, in prose.
  7. **Files**: every file you opened, and confirm you opened nothing else.

## Codes

| Code | Refused when |
|---|---|
| K… | the package format: the codes are in `packaging.md`'s checker; K006 is a file that changed after it was hashed |
| D… | a port, frame, edge or `inputs` declaration your Dialect states badly; the message names it |
| B…, L…, U… | the Grammar, a lambda or the UI, as before your change |
| S… | a seam: the table at the end of `seams.md` |
| G… | the composer's task: the burst is not wired from a maze event, a conversion is done by hand, or a frame fact is missing from the glue |
| LOAD | a file could not be loaded at all |
