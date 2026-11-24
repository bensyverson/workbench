# Trial rules: compose three dialects into one game

*2026-11-24, composition trial. You have five documents: these rules, `composition-draft.md` (how dialects are composed, a draft), and one reference per dialect: `cave.md`, `tiles.md`, `glow.md`. Read nothing else in the repository.*

## The task

Write **one** program, `program.js`, that builds the game below from three parts: a `cave` part makes each level, a `tiles` part runs the game, and a `glow` part lights the screen. Put the helper the game shares between parts in `lib/`. Then write `REPORT.md` about the experience.

Nothing here has been built yet: the checker stands in for the kit. The point of the trial is to find where the draft fails a real author. A gap you report honestly is worth as much as a program that checks.

### The game: *Glowworm Deep*

A miner climbs down through a cave, one level per depth. Every level is generated: its layout comes from a base **seed** (a parameter) plus the current **depth**, so going down makes a new cave, and the same seed and depth always make the same cave. Rock is placed with a noise function, so the walls look natural rather than speckled.

Each level has a start point where the miner appears, a few **glowworm jars** to collect, some sleeping **cave crickets**, and an **exit**. Stepping onto the exit takes the miner one level deeper (depth goes up by one) and a new cave appears.

The miner carries a **lamp** whose oil burns down a little every tick. Picking up a jar refills some oil and removes the jar. A cricket sleeps until the miner comes within the lamp's **reach**, then hops toward the miner; a cricket that touches the miner drinks some oil and is removed. When the oil runs out, the game ends.

On screen, everything outside the lamp's light is nearly dark. The light is centered on the miner, its radius grows and shrinks with the oil left, and its edge flickers. The flicker uses the same noise function that places the rock. The exit glows faintly even in the dark, so the player can find it.

The player can tune three **parameters**: the base seed; the rock density; and the lamp's reach, in cells. The reach does two jobs. When a cave is built, it sets how many crickets the cave holds (a longer reach means fewer crickets, so the game stays fair). While playing, it sets how far the light reaches on screen and how close the miner must be to wake a cricket.

### What your program must contain

The checker looks for each of these (codes G001–G005):

1. **A cave → tiles value seam with a frame conversion:** the game's map comes from the cave's cells, and somewhere a cave position (a `vec2i@cell`) is converted to pixels with the tiles conversion. (G001)
2. **A tiles → glow per-frame signal:** the light lights the game's image and reads at least one value the game exports (such as the miner's position or the oil left). (G002)
3. **A cross-part cycle:** the cave's seed depends on an output of the game (the depth), written as a signal-dependent argument, while the game's map depends on the cave. (G003)
4. **One shared `lib/` helper used on CPU and GPU:** the same helper is called from a cave or tiles lambda and from the glow lambda. (G004)
5. **A parameter used at build time and in a kernel:** the same parameter is read by build-time code and as `$.name` inside a runtime lambda. (G005)

## What you hand in

Your directory holds exactly these files:

| File | What |
|---|---|
| `program.js` | the composed program: `export default program(...)` |
| `lib/*.js` | at least one file of shared kernel helpers |
| `REPORT.md` | your report (rule R12) |

`program.js` may import only from `"kit"`, `"cave"`, `"tiles"`, `"glow"` and your own `./lib/` files. The checker supplies the four modules: stand-ins that record your calls and check them against the references. They do not run the game.

If the tool you write files with refuses to write `REPORT.md`, write it from the shell with a heredoc instead: `cat > REPORT.md <<'EOF'`, then the report, then `EOF` on its own line. Do not return the report as text in place of the file.

## The rules

Each rule names the codes that enforce it. Run the checker as often as you like. It loads your `program.js` with the stand-in dialects, then reads the source of every runtime lambda and `lib/` helper, and prints each problem as `<file>:<line>: <code> <message>` with a `fix:` line.

- **R1. The hand-in.** `program.js` exists, loads, and default-exports `program(title).show(part)`. Every `lib/` file loads and exports only arrow functions. (C001, C003, S331)
- **R2. Only these imports:** `kit`, `cave`, `tiles`, `glow`, and `./lib/…`. (C003)
- **R3. Only the documented API,** with arguments of the documented types: no method, option or field the references do not list. (D001, D002, D003, D004, D006, C004)
- **R4. Every part is bound to a top-level `const`,** such as `const level = cave("depths")…`. (C002)
- **R5. Runtime lambdas and `lib/` helpers are in the kernel subset** and read only the names it allows. (P…, S1…, S331, S332, D005, D007)
- **R6. Parts meet only through outputs,** of the right seam type. (S203, S204, S311, S312, S313)
- **R7. Binding time is respected:** no output of another part is read at build time; an argument that depends on one is a lambda. (S301, S302)
- **R8. Frames are respected:** grid shapes match, every grid value maps to a tile, and a cell position becomes a pixel position only through a conversion. (S201, S202, S251)
- **R9. Sampling, if you state it, is valid.** (S321)
- **R10. The program has all five seams the task lists.** (G001–G005)
- **R11. Nothing outside the draft.** Do not invent API, a fourth dialect, or a way around the rules (for example, computing a level yourself at build time). Where the draft cannot express part of the game, write the closest program that checks, mark the gap with a `// GAP: <what>` comment, and report it. (Read by hand.)
- **R12. The report.** `REPORT.md` has these sections, in order:
  1. **Difficulty**, 1 (easy) to 10 (could not do it), with one sentence why.
  2. **What you had to guess:** every place the documents did not say and you chose; what you chose.
  3. **Where the documents misled you:** each a quote from a document, and what it led you to do.
  4. **Checker runs:** roughly how many, and which codes you hit most.
  5. **What you would change:** in the composition draft or a dialect reference, smallest change first.

## Codes

### The checker's own (`C…`)

| Code | When |
|---|---|
| C001 | `program.js` is missing, or does not `export default` a `program(…)` with a `.show()` |
| C002 | a part that is not bound to a top-level `const` |
| C003 | `program.js` or a `lib/` file cannot be loaded (a syntax error, an exception, an import from elsewhere) |
| C004 | a parameter that is not declared in `params({…})`, or a malformed parameter |

### A dialect's (`D…`)

| Code | When |
|---|---|
| D001 | a method the part, actor or program does not have (with a "did you mean") |
| D002 | an argument of the wrong type, out of range, or missing |
| D003 | a required method not called (see each reference) |
| D004 | a method called twice that may be called once, or a kind or name declared twice |
| D005 | an unknown member of a lambda's context (`c`, `p`, `s`, `self`, `w`, `w.state`, `w.input`) |
| D006 | a player actor not spawned exactly once, or an actor kind no part uses |
| D007 | a construct the GPU does not have, in a GPU lambda (`for…of`) |

### Seams (`S2…`, `S3…`)

The table at the end of `composition-draft.md`: S201, S202, S203, S204, S251, S301, S302, S311, S312, S313, S321, S331, S332.

### The kernel subset (`P…`, `S1…`)

A runtime lambda or `lib/` helper that does not parse is `P…`; one outside the kernel subset is `S101`–`S116` (`S101` `while`, `S102` `new`, `S104` a template string, `S109` spread, `S110` `var`, `S111` a closure that is not a call argument, `S114` a parameter default, and so on). The message says which construct and what to write instead.

### The task (`G…`)

| Code | When |
|---|---|
| G001 | no tiles map connected to a cave's cells, or no `tile()` conversion of a cave cell position in a tiles lambda |
| G002 | no glow part over a tiles part's image whose `.light` reads one of that part's exported signals |
| G003 | no cave whose `.seed()` lambda reads an output of a tiles part that maps that cave |
| G004 | no `lib/` helper called both from a cave or tiles lambda and from a glow lambda |
| G005 | no parameter read both at build time and as `$.name` in a runtime lambda |

The checker cannot run the game, check your `// GAP:` comments, or judge whether the game plays as described: those are read by hand.
