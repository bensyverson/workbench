# Composer report: maze + particles

## 1. Difficulty

2 (easy). The one seam is a point-to-point wire with a field rename and a frame relation, and `"fit"` covers the frame relation without arithmetic; the only real care was choosing a maze layout the checker's D-pad could walk.

## 2. What you did

**Parts.**
- `maze("labyrinth")`: an 11 × 9 room with five coins (at cells (1,1), (9,1), (6,3), (1,5), (6,5)), start at (4,2). `control` sets `dx`/`dy` from the D-pad and `steps = 1`, so the player moves one cell per tick (`tick(1/8)`). Chosen because the task asks for one cell per step in the held direction.
- `particles("sparks")`: a 300 × 260 box, `maxParticles(400)`, `tick(1/60)`. One force, `fall` (a gentle downward pull of 60 units/s²), and one emitter, `burst`, with `maxRate: 0` and `rate` returning 0, so it spawns only from input. It is `on: "burst"` with `burst: 24`: each record spawns 24 particles, placed at the record's `pos`, on a ring with 30–60 units/s outward speed, `life 0.9`, `size 2`. Chosen so a burst reads as a small spray that stays within about one maze cell of the pickup.

**Frame.** `.frame(labyrinth.frame.cell, sparks.frame.box, "fit")`. Both frames are 2-D with an `extent`. The kit computed a single scale of 27.27 px per cell, centred, with a y-down orientation on both sides (the same orientation, so no flip). Chosen over a hand-written edge: `"fit"` is the one the docs offer for frames of different sizes, and I did not multiply anything by hand.

**Wire.** `.wire(labyrinth.out.pickup, sparks.in.burst, { rename: { at: "pos" } })`. The maze's `at` (the coin's cell) becomes the input's `pos`. `left` and `when` are not in the input's record, so they are dropped on the wire, as `seams.md` says. Both sides are `point2`, so no kind mismatch.

**Show.** `.show(sparks)`, so the particles' stage is the one the page shows. The maze's UI is a text view and is not needed in the glue.

Not wired: `labyrinth.out.where` and `labyrinth.out.coinsLeft`. Not needed for the burst.

**Checker result (`./check.sh`, one run, no violations):** the wire prints as `pos: maze.cell → particles.box, point, ×27.27 +[13.64, 20.91]; drops left, when`. The run picked up the coin at (6, 3) at T = 0.25 and spawned 24 particles within 27.273 of the converted point at T = 0.25. Replay produced the same state hashes.

## 3. Where the docs misled you

Nothing in `seams.md`, `runtime.md` or `packaging.md` led me wrong. The one thing I had to resolve by reading is that `runtime.md`'s "Time" section and `seams.md`'s `.wire` description are consistent with the maze's 1/8 step and the particles' 1/60 step, so the event lands on the particles' first step at or after the pickup instant. That is a reading, not a misdirection.

## 4. What you guessed

- **Layout of the room.** The checker's D-pad strategy is not documented to me, so I picked a room with mostly open lines and a few pillars, without checking which path it would take. I learned the layout works only from the checker's pass, not from the docs.
- **What "near" means.** `task.md` and `rules.md` say "near the converted position" and "within half a second" but give no distance. I kept the whole burst within one maze cell (27.27 px) of the pickup, and that passed.
- **Burst look.** Speed, life, size, count and the `fall` force are my choices, for appearance only.
- **Maze tick.** I used `1/8` (the maze's own default) rather than a value from the docs.
- **Emitter position.** `x: 150, y: 130` is the box's centre. It is not used by the burst (the burst spawns at the record's `pos`), but `R006` needs it inside the box.

## 5. Gaps

Smallest first.

1. **No way to scale a burst by the pickup's data.** The input's record has only `pos`, and a wire cannot compute a value (`seams.md`, "What does not exist"). A coin's `left` count, say, cannot change how many particles a burst spawns. If a composer wanted that, the only option would be a lambda on the wire, which the kit does not have. I did not invent one.
2. **The `"fit"` scale is not a choice.** I could only get 27.27 px per cell by making the box size fit the maze. There is no way to ask for a pixel size per cell independent of the box. This is not a blocker here.
3. **Doc cross-references point outside the kit.** `maze/maze.dialect.js` cites `docs/task.md` and `docs/ui-draft.md`, and `particles/particles-field.js` cites `docs/ui-draft.md`. Neither file is in this kit, so a stranger cannot follow those pointers. This does not affect the glue.

## 6. Answers

**The seam.** I wired the maze's `pickup` Event output into the particles' `burst` Event input, renaming `at` to `pos`. The two packages' frames are related with `.frame(maze cell, particles box, "fit")`: the maze's cell grid is scaled and centred into the particles' pixel box. No check caught a mistake, because my first run passed with no violations. The checker's wire line confirmed what the kit converted: `pos` from `maze.cell` into `particles.box`, scale 27.27 with an offset of (13.64, 20.91), dropping `left` and `when`.

**What did not fit.** The field name did not match: the maze says `at`, the particles say `pos`, so I used `rename`. The frames did not match: `cell` and `box` are different frames with different units, so I used `"fit"`. The types matched (both `point2`). The queue sizes matched: the maze can push up to 4 pickups in a step and the particles' input takes up to 16, and since the particles step more often than the maze, S116 holds. I did not use `delay`, because there is no cycle.

**Time.** The maze steps at multiples of 1/8 s and the particles at multiples of 1/60 s. A pickup pushed at instant T reaches the particles at their first step at or after T, so the burst plays at T or up to 1/60 s (about 17 ms) after the pickup. In this run the coin was taken at 0.25 s (the maze's step 2), and 0.25 s is also a particles step (frame 15), so the burst played at the same instant. That is what I expected from `runtime.md`, and the checker reported it.

## 7. Files

Opened and read (in this order of area):
- `seams.md`, `runtime.md`, `rules.md`, `task.md`, `packaging.md`, `reference.md`
- `maze/`: `wb-package.json`, `maze.dialect.js`, `maze.grammar.js`, `maze.runtime.js`, `maze.ui.js`, `examples/01.js`, `examples/02.js`
- `particles/`: `wb-package.json`, `particles.dialect.js`, `particles.grammar.js`, `particles.runtime.js`, `particles.ui.js`, `particles-field.js`, `examples/01.js` to `examples/07.js`, `refusals/r01.js` to `refusals/r06.js`
- `check.sh`: I read its text once with `cat | head`. It is in this folder but is not on the reading list, so I am noting it. It points to a script under `/Users/ben/git/workbench/`, which I did not open.

Listed but not opened: `transcript.jsonl`, `stderr.txt` (both in this folder). The checker writes `log.jsonl`; I did not open that either.

I opened nothing else. I did not modify `maze/` or `particles/`. The only file I created is `workbench.js`, plus this `REPORT.md`.
