# REPORT: composer

## 1. Difficulty

4. The glue is short, and the frame and record-field checks passed, but the composition is refused at S116 (the event queue). The kit's fixes are all changes to a package, which R7 forbids me, so `workbench.js` does not pass `check.sh`.

## 2. What you did

- **Maze part `coins`** (`maze("coins")`): an 11 by 6 grid with walls on the border, coins at cells (2,2), (6,2) and (4,4), start at (1,1), `tick(1/8)`. The control reads `pad.left/right/up/down`, sets `dx`/`dy`, and sets `steps` to 1 while a direction is held. I did not use the dash or wait buttons.
- **Particles part `sparks`** (`particles("sparks")`): bounds 400 by 300, `maxParticles(400)`, `tick(1/30)`. One emitter `burst` at (200, 150) with `maxRate: 0`, `from: "pickup"`, `burst: 12`. Its `rate` returns 0. Its `spawn` sets `p.pos = pickup.at`, a velocity of about ±100 px/s, `life` 0.6 to 1.0 s, and `size` 2.
- **Frame**: `.frame(coins.frame.cell, sparks.frame.box, "fit")`. Both frames are 2-D and have extents: cell is the grid, 11 by 6 cells, and box is the bounds, 400 by 300 px. By the docs' description of "fit", the scale is min(400/11, 300/6) = 36.36 px per cell, with x offset 0 and y offset about 40.9 px. I worked this out by hand; the kit did not print it.
- **Wire**: `.wire(coins.out.coin, sparks.in.pickup)`, with no `rename` and no `delay`. The `at` field (point2@cell) meets `at` (point2@box) by name. `when` and `score` are dropped on the wire.
- **Show**: `.show(sparks)`.
- `workbench.js` as written is at the composer's file. `maze/` and `particles/` are unchanged.

## 3. Where the docs misled you

- `seams.md`, Events section: "The composition checks that the queue can't overflow (S116, from the maxes in `runtime.md`)" and "`delivery: { keepLast: n }` keeps the newest `n` and drops older ones". Read together, these suggest a reliable wire is fine if the producer usually pushes few records. The check uses the declared `events.out` max, not what the producer pushes. The maze declares `events: { out: { coin: MAX_WALK } }` with `MAX_WALK = 64`.
- `runtime.md`, Events: "the most records one step may push (`out`) or take (`in`)". The page does not say how a Program bounds that number. The maze runtime's own comment says: "the docs give no way to bound a step's Events from the Program, so the walk is capped here".

## 4. What you guessed

- The burst count (12), the velocity range, the life range and the size: my choice, for a visible burst.
- Maze control: one cell per tick while a direction is held. I did not use dash.
- "Centred" in the fit: the scaled extent sits in the middle of the box on each axis.
- Both origins are top-left with y down, so no flip is needed. I took this from the two frames' notes.
- The grid, start and coin positions.

## 5. Gaps (smallest first)

1. **A composer cannot satisfy S116 for this wire.** The check uses the maze's declared `events.out` max of 64 for `coin`, and the particles input `pickup` takes at most 8 per step (`events.in`, reliable). The wire options are only `rename` and `delay`, and neither changes a queue size. The tick choice cannot help: the consumer always sees at least one producer step, and 64 × 1 > 8. The check's fixes are to raise a max in a package, or to set `keepLast` on the particles Dialect's input. Both are package changes, which R7 forbids me. I did not work around this. What is needed: a way for the composition to state the bound (a per-wire queue size or delivery, or a per-step bound the producer can declare from its Program).
2. **The maxes are not in `reference.md`.** It lists ports and frames, but not each Event port's `events` max or delivery. A composer cannot see S116 before running `check.sh`.
3. **A Program cannot lower its runtime's Event bound.** The maze's cap of 64 is a constant in its runtime, not from its Program. My control keeps every tick to one cell, so at most one coin per tick, but the declared max stays 64, and the static check does not see the actual push count.
4. **No run result.** The check builds the composition before running it, so S116 stops the run. I have no runtime diagnostics or timings.

## 6. Answers

1. **The seam.** I wired `coins.out.coin` to `sparks.in.pickup` and related the frames with `.frame(coins.frame.cell, sparks.frame.box, "fit")`. Only `at` crosses the wire, from point2@cell to point2@box, through the fit edge. The check did not catch a mistake of mine: the frame, field and kind checks passed, and it stopped at S116 on the wire line. So the frame relation and the field match have only been checked by the kit's acceptance, not by a run.
2. **What did not fit.** The frames, the field name, and the kinds met as written. The event queue did not: S116, maze max 64 against particles max 8. I did not use `rename` or `delay`. I would need either a way to declare the queue bound in the glue, or a declared per-step bound from the producer, as in Gaps 1 to 3.
3. **Time.** `runtime.md` says the maze steps every 1/8 s and the sparks part every 1/30 s, so the two meet only at multiples of 1/2 s. A pickup at maze instant T reaches the sparks part at its first step at or after T. When T is not a multiple of 1/2 s, that is the next multiple of 1/30 s, so the burst plays at most about 33 ms after the pickup instant. When both step at the same instant (multiples of 1/2 s), the maze goes first and the burst plays at that same instant. The coin record's `when` is the maze instant T. I did not get a run, so I have no run answer to compare with my expectation.

## 7. Files

Opened and read:
- `task.md`, `rules.md`, `seams.md`, `runtime.md`, `packaging.md`, `reference.md`
- `maze/`: `wb-package.json`, `maze.dialect.js`, `maze.grammar.js`, `maze.runtime.js`, `maze.ui.js`, `examples/01.js`, `examples/02.js`
- `particles/`: `wb-package.json`, `particles.dialect.js`, `particles.grammar.js`, `particles.runtime.js`, `particles.ui.js`, `particles-field.js`, `examples/01.js` to `07.js`, `refusals/r01.js` to `r06.js`

Also opened, outside the list: **`check.sh`**. I ran `cat` on it to see what it runs. It is a wrapper around a checker outside this folder.

Listed but not opened: the folder's contents (`ls`/`find`), which show `transcript.jsonl` and `stderr.txt` in the relay folder. I did not open them. The checker's stack trace names paths in a workbench repository, which I did not open.

Written: `workbench.js` and `REPORT.md`. `check.sh` writes `log.jsonl`.
