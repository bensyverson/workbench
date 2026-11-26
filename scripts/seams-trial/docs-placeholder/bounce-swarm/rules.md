# Trial rules: one leg of a relay

*You are one leg of a relay of three sessions. Two language authors each make their own package usable by strangers, without knowing about each other; then a composer, who never met either author, uses both packages together. Your leg is in `task.md`. You also have `seams.md` (ports, frames and glue programs), `runtime.md` (how a package runs), `packaging.md` (the package format), and the tools `check.sh` and, for authors, `hash.sh`.*

## What you hand in

| Role | Hand in |
|---|---|
| bounce author | `bounce/`, the package, changed in place, and `REPORT.md` |
| swarm author | `swarm/`, the package, changed in place, and `REPORT.md` |
| composer | `workbench.js` and `REPORT.md`; `bounce/` and `swarm/` exactly as you got them |

If the tool you write files with refuses to write `REPORT.md`, write it from the shell with a heredoc (`cat > REPORT.md <<'EOF'` … `EOF`). Don't return the report as text in place of the file.

## The rules

`check.sh` checks your hand-in on the real kit, and runs it. It prints each problem as `<file>:<line>: <code> <message>` with a `fix:` line. Run it as often as you like; it logs each run.

- **R1. Only what the docs give.** Don't invent a Dialect key, a port option, a seam type, a glue call, a runtime key or a convention. Where you needed one, write it under **Gaps**. A workaround hides a finding; a gap you report is one.
- **R2. Authors: your package is still a package.** Every file listed and hashed (`./hash.sh bounce` or `./hash.sh swarm` after each change), its examples build, and its minor version is raised: `0.1.0` becomes `0.2.0`. (K codes; G002)
- **R3. Authors: what was there still works.** Add to the language; don't remove or rename what its examples and UI use. You may add to the run's `state` when your runtime needs it. Keep what the checker reads: each ball's `x` and `y` in `state.balls`, each agent's `x` and `y` in `state.agents`, and, for the swarm, each trait a Program declares as a number on every agent in `state.agents`, under its own name (on the agent, or in one struct of the agent's). (K, U, L codes; G005, G017)
- **R4. Authors: one new example** under `examples/` that uses what you added, listed in the manifest. (K codes; G003)
- **R5. Authors: you write for strangers.** You don't know what your package will be used with. Every port and frame has a `note` a stranger can act on. Don't name another language, package or frame. (D codes; the rest is read by hand)
- **R6. Authors: your package runs.** Add a runtime module named in the manifest's `entry.runtime` (`runtime.md`). The checker runs every example headless for a few seconds in a development run (G001, N codes). The bounce checker expects an Event output to push a record when a ball meets a wall, with the point where it met it (G014, G015). The swarm checker sends one record to your Event input and expects agents to gather near the record's position in at least one example (G016). Each Program's traits must last from step to step in the state (G017). "Near" and "gather" are defined under **Near and gather** below.
- **R7. Composer: don't change either package**, not even a comment. Everything that involves both goes in `workbench.js`. If a package lacks something you need, that is a gap. (K006 if a file changed; read by hand)
- **R8. Composer: no hand conversions.** Don't multiply, add or divide to move a value from one package's frame into another's. Relate the frames with `.frame` and let the wire convert. (S251 when a position crosses with no frame path; a hand conversion is read by hand)
- **R9. Composer: it runs.** The checker runs `workbench.js` headless for a few seconds: it expects the balls to meet the walls and push records, and the swarm's agents to gather near one of those points, converted into the swarm's frame, within two seconds of it (**Near and gather** below). It replays the run and expects the same states (G020 to G023, N codes).
- **R10. The report.** `REPORT.md` has these sections, in order:
  1. **Difficulty**, 1 (easy) to 5 (could not do it), with one sentence why.
  2. **What you did**: authors, each port, frame, state and runtime choice you made and why a stranger would want it; composer, each part, frame and wire, and why.
  3. **Where the docs misled you**: a rule or example in `seams.md`, `runtime.md` or `packaging.md` that led you wrong, quoted.
  4. **What you guessed**: every place the docs didn't say and you chose, and what you chose.
  5. **Gaps**: what you needed that the kit doesn't have, smallest first.
  6. **Answers**: `task.md`'s questions, in prose.
  7. **Files**: every file you opened, and confirm you opened nothing else.

## Near and gather

**Near** a position is within a tenth of the diagonal of the swarm frame's extent (the frame the record's point arrives in). **Gather** means the record drew them: the checker runs the same part twice, once with the record delivered and once without, and compares, at the same instant, how many agents are near the position. Agents gather when the first run has more near it than the second. For G016 the checker sends the record at T = 0.5, at the middle of the frame's extent, and watches until T = 2.5. For G023 it watches each record for two seconds after it was pushed.

**At a wall** (G015) is within a tenth of the frame's extent, on one axis, of one side of the extent.

## Codes

| Code | Refused when |
|---|---|
| K… | the package format: the codes are in `packaging.md`'s loader; K006 is a file that changed after it was hashed |
| D… | a port, frame, edge, `inputs`, state or runtime declaration your package states badly; the message names it |
| B…, L…, U… | the Grammar, a lambda or the UI |
| S… | a seam: the table at the end of `seams.md` |
| N… | a run: the table at the end of `runtime.md` |
| G001 | the package has no runtime (`entry.runtime`) |
| G002 | the version's minor is not raised |
| G003 | no new example |
| G004 | a port the task asks for is missing (the message says which) |
| G005 | the run's state lacks what the checker reads (R3) |
| G014 | in no example did an Event output push a record, in a few seconds of balls meeting walls |
| G015 | a pushed record has no point, or its point is not at a wall of its frame's extent |
| G016 | a record sent to the swarm's Event input drew no agents near its position, in any example |
| G017 | an agent in the state does not carry a trait its Program declares (R3) |
| G020 | the glue does not wire a bounce Event output into a swarm Event input |
| G021 | the swarm part is not shown |
| G022 | in the glue's run, the bounce part pushed no record |
| G023 | in the glue's run, no agents gathered near a converted record within two seconds of it |
| LOAD | a file could not be loaded at all |
