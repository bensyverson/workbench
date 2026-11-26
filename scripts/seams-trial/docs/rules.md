# Trial rules: one leg of a relay

*You are one leg of a relay of three sessions. Two language authors each make their own package usable by strangers, without knowing about each other; then a composer, who never met either author, uses both packages together. Your leg is in `task.md`. You also have `seams.md` (ports, frames and glue programs), `runtime.md` (how a package runs), `packaging.md` (the package format), and the tools `check.sh` and, for authors, `hash.sh`.*

## What you hand in

| Role | Hand in |
|---|---|
| maze author | `maze/`, the package, changed in place, and `REPORT.md` |
| particles author | `particles/`, the package, changed in place, and `REPORT.md` |
| composer | `workbench.js` and `REPORT.md`; `maze/` and `particles/` exactly as you got them |

If the tool you write files with refuses to write `REPORT.md`, write it from the shell with a heredoc (`cat > REPORT.md <<'EOF'` … `EOF`). Don't return the report as text in place of the file.

## The rules

`check.sh` checks your hand-in on the real kit, and runs it. It prints each problem as `<file>:<line>: <code> <message>` with a `fix:` line. Run it as often as you like; it logs each run.

- **R1. Only what the docs give.** Don't invent a Dialect key, a port option, a seam type, a glue call, a runtime key or a convention. Where you needed one, write it under **Gaps**. A workaround hides a finding; a gap you report is one.
- **R2. Authors: your package is still a package.** Every file listed and hashed (`./hash.sh maze` or `./hash.sh particles` after each change), its examples build, and its minor version is raised: `0.1.0` becomes `0.2.0`. (K codes; G002)
- **R3. Authors: what was there still works.** Add to the language; don't remove or rename what its examples, refusals and UI use. You may add to the run's `state` when your runtime needs it. Keep what the checker reads: the maze's `state.player.x`, `state.player.y` and `state.grid` (one string per row, `c` a coin), and each particle's `x` and `y` in `state.particles`. (K, U, L codes; G005)
- **R4. Authors: one new example** under `examples/` that uses what you added, listed in the manifest. (K codes; G003)
- **R5. Authors: you write for strangers.** You don't know what your package will be used with. Every port and frame has a `note` a stranger can act on. Don't name another language, package or frame. (D codes; the rest is read by hand)
- **R6. Authors: your package runs.** Add a runtime module named in the manifest's `entry.runtime` (`runtime.md`). The checker runs every example headless for a few seconds in a development run (G001, N codes). The maze checker presses the D-pad (`controls.pad`) to walk the player to a coin, and expects an Event output to push a record at the step the coin is picked up (G006, G007). The particles checker sends one record to your Event input and expects new particles to appear near the record's position in at least one example (G008). "Near" and "new" are defined under **Near and new** below.
- **R7. Composer: don't change either package**, not even a comment. Everything that involves both goes in `workbench.js`. If a package lacks something you need, that is a gap. (K006 if a file changed; read by hand)
- **R8. Composer: no hand conversions.** Don't multiply, add or divide to move a value from one package's frame into another's. Relate the frames with `.frame` and let the wire convert. (S251 when a position crosses with no frame path; a hand conversion is read by hand)
- **R9. Composer: it runs.** The checker runs `workbench.js` headless: it holds the D-pad toward the nearest coin until the player picks one up, then expects new particles near that coin's position, converted into the particles' frame, within half a second (**Near and new** below). It replays the run and expects the same states (G010 to G013, N codes).
- **R10. The report.** `REPORT.md` has these sections, in order:
  1. **Difficulty**, 1 (easy) to 5 (could not do it), with one sentence why.
  2. **What you did**: authors, each port, frame and runtime choice you made and why a stranger would want it; composer, each part, frame and wire, and why.
  3. **Where the docs misled you**: a rule or example in `seams.md`, `runtime.md` or `packaging.md` that led you wrong, quoted.
  4. **What you guessed**: every place the docs didn't say and you chose, and what you chose.
  5. **Gaps**: what you needed that the kit doesn't have, smallest first.
  6. **Answers**: `task.md`'s questions, in prose.
  7. **Files**: every file you opened, and confirm you opened nothing else.

## Near and new

For G008 and G013, **near** is within one converted cell of the position: the radius is the wire's scale (the frame edge's scale for the point field), so with a maze cell worth 32 pixels it is 32 pixels. G008, which has no wire, uses a tenth of the frame's diagonal. **New** means the record made them: the checker runs the same part twice, once with the record delivered and once without, and counts the particles near the position that exist only in the first run, and only while that run also has more particles in all. A particle that merely moves to the record's position (a marker that follows it) is not new; a burst is.

## Codes

| Code | Refused when |
|---|---|
| K… | the package format: the codes are in `packaging.md`'s loader; K006 is a file that changed after it was hashed |
| D… | a port, frame, edge, `inputs` or runtime declaration your package states badly; the message names it |
| B…, L…, U… | the Grammar, a lambda or the UI |
| S… | a seam: the table at the end of `seams.md` |
| N… | a run: the table at the end of `runtime.md` |
| G001 | the package has no runtime (`entry.runtime`) |
| G002 | the version's minor is not raised |
| G003 | no new example |
| G004 | a port the task asks for is missing (the message says which) |
| G005 | the run's state lacks what the checker reads (R3) |
| G006 | the checker's D-pad did not reach a coin |
| G007 | a coin was picked up and no Event output pushed a record at that step |
| G008 | a record sent to the particles' Event input made no new particles appear near its position, in any example |
| G010 | the glue does not wire a maze Event output into a particles Event input |
| G011 | the particles part is not shown |
| G012 | in the glue's run, the D-pad did not reach a coin |
| G013 | in the glue's run, no new particles appeared near the converted pickup within half a second |
| LOAD | a file could not be loaded at all |
