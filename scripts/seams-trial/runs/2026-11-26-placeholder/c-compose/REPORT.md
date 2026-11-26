# Composer report

## Difficulty

1 (easy): the two ports met with one field rename and one `"fit"`, and the first run of the checker had no violations.

## What you did

**Maze (`hunt`).** An 11 × 7 grid with five coins and some wall blocks, so the corridors are open and a coin is straight ahead of the start. `tick(1/8)`. The control sets `dx` and `dy` from the held D-pad and `steps = 1`, which is one cell per step. It has no dash or wait buttons because the task asks for neither.

**Particles (`sparks`).** A 352 × 224 box, which has the maze's proportions at 32 pixels to a cell. `maxParticles(1000)`, `tick(1/60)`, gravity and drag. Two emitters listen to `burst` and spawn only on a record (`maxRate: 0`, rate 0):

- `ring`: 80 particles in an even circle with a little speed jitter and a life of 0.5 to 0.8 s.
- `embers`: 40 slower particles, thrown mostly upward, that fall and last 0.8 to 1.5 s.

I first wrote an `.update` that shrank `p.size`, then removed it: `particles-field.js` draws every particle as a 2 × 2 square. The checker passed before and after the removal. I judged "worth watching" from the code only and never saw it in a page.

**Frames.** `.frame(hunt.frame.cell, sparks.frame.box, "fit")`. The checker reported ×32 +16. I did no conversion on any value that crosses. I did pick the box size as 32 × the grid's cells, so that `"fit"` fills the box with no margin. That is a size I chose, not a converted value, and `"fit"` would work with another size.

**Wire.** `hunt.out.pickup → sparks.in.burst`, with `{ rename: { at: "pos" } }`.

**Show.** `.show(sparks)`.

## Where the docs misled you

Nothing led me wrong in a way that cost a run. One small slip is in `reference.md`, under both packages' frames: "the kit's `s`: seconds, the same in every package (`f64@s`, and rates such as `vec2@px/s`)". Neither package has a `px` frame; they are `cell` and `box`. A reader could look for a third frame.

## What you guessed

- That a glue program may hold top-level constants and helper functions its lambdas use (`SPARKS`, `ring`), as the package examples do. `seams.md` shows only the default export. It worked.
- That `vec2`, `Math`, and the record name `burst` work in a spawn lambda written in a glue program as they do in an example. I took `vec2` from the examples and `burst` from `reference.md`. It worked.
- That `pad.up`, `pad.down`, `pad.left` and `pad.right` are what a maze control reads. I took this from the maze's examples and Dialect.
- That an emitter that only bursts still needs `x`, `y`, `maxRate` and `.rate`. The Grammar requires them, so I used the box centre, 0 and a zero rate, as `particles/examples/07.js` does.
- Which maze, tick, counts, speeds and lifetimes to use.

## Gaps

Smallest first.

1. **Particle appearance.** The particles stage draws position only, as 2 × 2 squares in one colour. A Program can set `p.size`, but this stage ignores it, so I could not make a burst fade, shrink or take a colour.
2. **Stage aspect.** The stage stretches the box onto a 400 × 300 canvas, so my 11:7 box is drawn slightly distorted. This is read from `particles-field.js`, not seen.
3. **Seeing both parts.** `.show` takes one part and nothing draws one stage over another (`seams.md`, "What does not exist"). The task says to show the particles, so the person holding the D-pad cannot see the maze, the player or the coins. A pickup burst makes little sense without them. This is the largest hole in the result as something to play. I needed the maze drawn under the particles, or two stages side by side.
4. **A bigger finale (not required, not tried).** `pickup` and `cleared` could not both drive `burst`, because an input takes one wire. A second event input does not exist in `particles`, so the last coin looks like any other. `score` is dropped on the wire because `burst` takes only `pos`, so bursts cannot grow with the score either.

## Answers

**1. The seam.** I wired the maze's `pickup` output (`Event<{ at: point2@cell, score, left }>`) to the particles' `burst` input (`Event<{ pos: point2@box }>`). I related the frames with `"fit"` from `cell` to `box`. Both have a 2-D extent and both have y pointing down, so no flip was needed. The maze's (0, 0) is a cell's centre and the box's is its corner; the maze's extent starts at -0.5, so `"fit"` handled the half cell (offset 16). No check or run caught a mistake, because the first run was clean. The checker's line `×32 +16; drops score, left` was a useful confirmation of what the wire did. The coin at cell (4, 1) arrived at (144, 48), which is its centre.

**2. What did not fit.** Only the field name: the maze says `at`, the particles say `pos`. `rename` fixed it. Kinds (both `point2`), directions of the axes, and queue sizes (at most 4 pushed per maze step, 256 taken, with the particles stepping more often) met as written. I did not need `delay`, since nothing feeds back to the maze. The extra fields `score` and `left` were dropped, as documented. Beyond the rename I needed nothing for the task; see Gaps for what the result lacks.

**3. Time.** Yes, `runtime.md` is enough to tell. A record pushed at instant T reaches the particles at their first step at or after T, with the producer first when both step at T. The maze steps at k/8 and the particles at n/60. These coincide when k is even (every 1/4 s), and then the burst plays at the pickup's instant. When k is odd, k/8 falls halfway between two particle steps, so the burst plays 1/120 s (about 8 ms) later. This follows from the rule; the run exercised only the coinciding case.

The run's answer was what I expected: coin at (4, 1) picked at T = 0.25 (the third maze step, counting the one at 0), and 120 particles (80 + 40) within 32 of (144, 48) at T = 0.25. The replay gave the same state hashes.

## Files

Read, all inside `/private/tmp/KTrmEL-relay/c-compose`:

- `task.md`, `rules.md`, `seams.md`, `runtime.md`, `packaging.md`, `reference.md`
- `check.sh`: I printed its contents, which the instructions did not list for reading (they list it as a tool). It shows the path of the checker outside this folder. I ran the checker through `check.sh` but did not open it or anything else at that path.
- `maze/`: `wb-package.json`, `maze.dialect.js`, `maze.grammar.js`, `maze.runtime.js`, `maze.ui.js`, `examples/01.js`, `examples/02.js`
- `particles/`: `wb-package.json`, `particles.dialect.js`, `particles.grammar.js`, `particles.runtime.js`, `particles.ui.js`, `particles-field.js`, `examples/01.js` to `07.js`, `refusals/r01.js` to `r06.js`
- `workbench.js`, my own file

I listed the folder, which showed the names `stderr.txt` and `transcript.jsonl`; I did not open them, nor the checker's `log.jsonl`. I opened no other file and did not search the web. The session also supplied some context on its own (user instructions and a memory directory path); I opened nothing from it.

Written: `workbench.js` (including one small scripted edit to remove the `.update` line) and `REPORT.md`. `maze/` and `particles/` are unchanged; the checker raised no K006.
