# Composer report

## Difficulty

**1 of 5.** The two packages' ports met as written, one `"fit"` related the frames, and the first run of `check.sh` had no violations.

## What you did

**Parts**

- `hunt` (`maze`): an 11 × 7 grid with four coins, `tick(1/8)`, and a control that sets `dx`/`dy` from the held D-pad with `steps = 1`, so the player walks one cell per tick. Holding two directions asks for a diagonal, which the maze runtime resolves to one axis.
- `fx` (`particles`): a 400 × 300 box, `tick(1/60)`, up to 800 particles, with gravity and drag.
  - `coin` emitter, `on: "burst"`, 90 per record: fast sparks and a slower core (every third particle), thrown slightly upward, living 0.5 to 1.1 s.
  - `marker` emitter, `follow: "anchor"`: a small, short-lived cluster where the player is. Only the particles' stage is shown, so without it nothing shows the player's position.

**Frame**

- `.frame(hunt.frame.cell, fx.frame.box, "fit")`: both are 2-D, y down, with extents. The run printed ×36.36 with offset [18.18, 40.91]. I converted nothing by hand. The particle speeds, gravity and sizes are my own choices in box pixels, not derived from the cell size.

**Wires**

- `hunt.out.pickup` → `fx.in.burst`: the burst at the coin. `vel`, `score` and `left` are dropped.
- `hunt.out.player` → `fx.in.anchor`: places the marker.

**Show:** `fx`, as the task asks.

**An extra check.** The marker sits on the coin at the moment of pickup, so the checker counts its particles too: it reported 92 with the marker wired. I removed the anchor wire for one run, which reported 90 particles near the coin at the same instant and no violations, so the burst passes by itself. I then restored the wire and ran the check again (no violations).

## Where the docs misled you

Nothing in `seams.md`, `runtime.md` or `packaging.md` led me wrong.

## What you guessed

- **Who gets the D-pad.** `runtime.md` says a control reaches "the part it is addressed to", but no glue call says which part that is, and the shown stage belongs to `particles`, which has no buttons. I assumed the host addresses `controls.pad` to the maze even though the maze is not shown. The headless run did drive it; I did not try the page.
- **How the particles are drawn.** The docs and `reference.md` don't say. From `particles-field.js`, every particle is a 2 × 2 dot on a 400 × 300 canvas, so `p.size` has no visible effect there. I chose 400 × 300 bounds to match the canvas, and made the burst readable through count and motion. I did not view it on a page, so "a burst you would want to watch" is judged from the code only.

## Gaps

Smallest first. None stopped the task's requirement.

1. **No way to size the effect to a cell.** The maze offers `cellSize` (`f64@cell`) for this, but `particles` has no length input to take it. Spark speed and spread therefore don't follow the maze if its grid size, and so the fit scale, changes.
2. **A burst can't use more than the position.** `pickup` carries `vel`, `score` and `left`, but `burst` takes only `pos`, so sparks can't be thrown along the player's direction or grow with the score. (`velocity` → `wind` would type-check, but it is a continuous air velocity, not a property of one burst, so I did not use it.)
3. **No way for the glue to say where a control goes** (see the first guess).
4. **The maze can't be seen with the particles.** `.show` takes one part and one stage can't be drawn over another, so "a burst where the player picks up a coin" plays on a blank box: no walls, no coins. A person playing would be steering blind. The marker shows where the player is and nothing else. This is the largest gap. It needs an overlay of two stages in one frame relation, or a way to pass the grid across, and neither exists.

An observation about the checker, not tested further: because G013 counted my marker's particles as part of the burst, a particle system with a follow emitter and a poor or absent burst emitter might pass it.

## Answers

**1. The seam.** I wired `hunt.out.pickup` to `fx.in.burst`, and related `maze.cell` to `particles.box` with `"fit"`. `pickup` was the obvious choice of the maze's Event outputs: `move` fires on every step, `bump` on walls, and `finish` only once. I also wired `hunt.out.player` to `fx.in.anchor` over the same frame relation. No check or run caught a mistake; the first run was clean. The wire lines `check.sh` prints (the scale, offset and dropped fields) were useful for confirming the conversion was what I meant.

**2. What did not fit.** For the required seam, nothing stood in the way. The field is called `pos` on both sides, both are `point2`, the frames have the same orientation and both have extents, and the extra record fields are dropped. The queue is safe: `pickup` pushes at most 4 per tick, the particles step more often than the maze, so one particles step sees at most one maze step's records, and `burst` takes 256. I used neither `rename` nor `delay`, since there is no loop. What was missing is listed under Gaps, chiefly seeing the maze.

**3. Time.** Yes, `runtime.md` is enough, given both tick lengths. A record pushed at T reaches the consumer at its first step at or after T, and the producer goes first when both step at T. The maze steps every 1/8 s, which is 7.5 particle steps of 1/60 s. So:

- a pickup at an even multiple of 1/8 (0.25, 0.5, …) bursts at the same instant;
- a pickup at an odd multiple (0.125, 0.375, …) falls between particle steps and bursts 1/120 s (about 8 ms) later.

The run matched: the coin was picked at T = 0.375 and the burst appeared at T = 0.383 (23/60). From the particles runtime, new particles are made after the existing ones are moved, so in that first state they sit exactly at the converted position with age 0. `runtime.md` does not say when that state reaches the screen, and I did not test it.

## Files

Opened, all under `/private/tmp/WnmLua-relay/a-compose`:

- `seams.md`, `runtime.md`, `rules.md`, `task.md`, `packaging.md`, `reference.md`, `check.sh`
- `maze/`: `wb-package.json`, `maze.dialect.js`, `maze.grammar.js`, `maze.runtime.js`, `maze.ui.js`, `examples/01.js`, `examples/02.js`
- `particles/`: `wb-package.json`, `particles.dialect.js`, `particles.grammar.js`, `particles.runtime.js`, `particles.ui.js`, `particles-field.js`, `examples/01.js` to `07.js`, `refusals/r01.js` to `r06.js`

Written: `workbench.js` and `REPORT.md`. `maze/` and `particles/` are unchanged.

I opened nothing else. My first command listed the folder, which showed the names `stderr.txt` and `transcript.jsonl`; I did not open either. I ran `check.sh`, which calls a script outside this folder and writes a log; I did not open the script or the log. The first command's output was too long to display in full and the tool saved a copy outside the folder; I did not open it, and re-read the documents from their originals.
