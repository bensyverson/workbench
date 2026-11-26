# Trial rules: one leg of a relay

*You are one leg of a relay of three sessions. Two language authors each make their own package offer its picture as a draw list, without knowing about each other; then a composer, who never met either author, writes a root package that layers both pictures with a HUD, and a glue program that wires it all. Your leg is in `task.md`. You also have `draw.md` (draw lists), `seams.md` (ports, frames and glue programs), `runtime.md` (how a package runs), `packaging.md` (the package format), the tools `check.sh` and `hash.sh`, and, if you are the composer, `api.md` (the Definition API, for writing a package of your own).*

**This is a paper trial.** `Draw` is a design, not yet built. The checker emulates it from `draw.md`: it runs your builders on the run's states, types the lists they make against the op table, converts them on the wires, and draws them with a Canvas renderer and a Game Boy profile. Where `draw.md` is silent, that is a finding, not something to fill in.

## What you hand in

| Role | Hand in |
|---|---|
| maze author | `maze/`, the package, changed in place, and `REPORT.md` |
| particles author | `particles/`, the package, changed in place, and `REPORT.md` |
| composer | your root package (a folder of your own, named as its package), `workbench.js` and `REPORT.md`; `maze/` and `particles/` exactly as you got them |

If the tool you write files with refuses to write `REPORT.md`, write it from the shell with a heredoc (`cat > REPORT.md <<'EOF'` … `EOF`). Don't return the report as text in place of the file.

## The rules

`check.sh` checks your hand-in on the real kit, with `Draw` emulated, and runs it. It prints each problem as `<file>:<line>: <code> <message>` with a `fix:` line, and what each renderer made of your list. Run it as often as you like; it logs each run.

- **R1. Only what the docs give.** Don't invent a Dialect key, a port option, a seam type, an op, an op field, a glue call, a runtime key or a convention. Where you needed one, write it under **Gaps**. A workaround hides a finding; a gap you report is one.
- **R2. Your package is still a package.** Every file listed and hashed (`./hash.sh <folder>` after each change), its examples build, and an author raises its minor version (`0.2.0` becomes `0.3.0`). (K codes; W030)
- **R3. Authors: what was there still works.** Add to the language; don't remove or rename what its examples, refusals, UI, ports and runtime use. You may add to the run's `state` when your picture needs it, and change the runtime to fill it. Keep what the checker reads: the maze's `state.player.x`, `state.player.y` and `state.grid` (one string per row, `c` a coin), and each particle's `x` and `y` in `state.particles`. The checks of the earlier relay still run (G001, G005 to G008 below).
- **R4. Authors: you write for strangers.** You don't know what will take your picture. The `Draw` port's `note` says what is drawn and in which frame; a stranger can act on it. Don't name another language, package or frame. (W002; the rest is read by hand)
- **R5. Authors: the picture shows the run.** The checker runs every example headless and builds your list after each step: it must type (W004), stay within its max (W005), and show what the state holds (W010: the maze, something drawn over the player's cell; the particles, something drawn near each live particle it samples).
- **R6. Composer: don't change either package**, not even a comment. Everything that involves your root and the two packages goes in your root package and `workbench.js`. If a package lacks something you need, that is a gap. (K006 if a file changed; read by hand)
- **R7. Composer: no hand conversions.** Don't multiply, add or divide to move a position from one package's frame into another's, in the glue or in your root. Relate the frames with `.frame` and let the wire convert. (S251 when a position crosses with no frame path; a hand conversion is read by hand)
- **R8. Composer: it runs.** The checker runs `workbench.js` headless: it holds the D-pad toward the nearest coin until the maze's player picks one up. The page shows your root part, whose list must hold the maze's picture, the particles' picture and at least one `text` op (W020 to W023), and a burst must be drawn over the maze, near the picked coin, within half a second of the pickup (W024). Then it replays the run (N codes).
- **R9. Renderers.** Every check prints what the Canvas renderer drew and what the Game Boy profile would draw or refuse. A Game Boy refusal is not a violation: say in your report whether your picture could run there, and what it would take.
- **R10. The report.** `REPORT.md` has these sections, in order:
  1. **Difficulty**, 1 (easy) to 5 (could not do it), with one sentence why.
  2. **What you did**: each port, builder, color, image and state field you added (composer: each part, frame, wire and builder), and why.
  3. **Where the docs misled you**: a rule or snippet in `draw.md`, `seams.md`, `runtime.md`, `packaging.md` or `api.md` that led you wrong, quoted.
  4. **What you guessed**: every place the docs didn't say and you chose, and what you chose.
  5. **Gaps**: what you needed that the design doesn't have, smallest first.
  6. **Answers**: `task.md`'s questions, in prose.
  7. **Files**: every file you opened, and confirm you opened nothing else.

## Codes

| Code | Refused when |
|---|---|
| K… | the package format (`packaging.md`); K006 is a file that changed after it was hashed |
| D…, B…, L…, U… | a declaration, the Grammar, a lambda or the UI, on the real kit |
| S… | a seam or the glue (`seams.md`); a `Draw` port's seam prints as written |
| N… | a run (`runtime.md`) |
| W001 | a `Draw` port the task asks for is missing (the message says which) |
| W002 | a `Draw` port, `colors` or `images` declared badly: the seam's spelling, its frame, its builder keys, an `each` path, a layer, maxes that can't fit |
| W003 | a builder outside the Runtime Subset, calling `map`, `filter`, `forEach`, `reduce` or `push`, or reading a name it can't see |
| W004 | an op that doesn't fit the op table: its `op`, a field, a type, a color, an image or a cell |
| W005 | a list that holds more ops than its seam's max |
| W006 | a builder that threw |
| W010 | the picture doesn't show the run (R5) |
| W020 | the shown part has no `Draw` output, or the page doesn't show your root |
| W021 | a `Draw` wire is wrong: a `Draw` into a port of another type (or the reverse), or a max larger than the input's |
| W022 | the maze's or the particles' picture doesn't reach the shown list |
| W023 | the shown list has no `text` op (the HUD) |
| W024 | no particles' op was drawn over the maze near the picked coin within half a second |
| W030 | an author's minor version is not raised |
| G001 | a package has no runtime |
| G005 | the run's state lacks what the checker reads (R3) |
| G006, G012 | the checker's D-pad did not reach a coin (alone; in the glue's run) |
| G007 | a coin was picked up and no Event output pushed a record at that step |
| G008 | a record sent to the particles' Event input made no new particles appear near its position |
| LOAD | a file could not be loaded at all |
