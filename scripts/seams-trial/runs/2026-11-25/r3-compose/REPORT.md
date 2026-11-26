# Composer's report

`check.sh` says `no violations` for `workbench.js`. **One part of the task is not met:** the burst is not drawn over the maze. The page shows the particles' stage only, and `seams.md` has no way to draw one part over another (see Gaps). I also have not seen the workbench run. The checker printed the wire and its conversion, but I observed no frames, bursts or input.

## Difficulty

2. The wiring took three lines and passed on the first run, but "drawn over the maze" cannot be expressed, and timing and D-pad behaviour had to be assumed.

## What you did

**Parts**

- `level` (maze): a 12 × 9 maze with a border, inner walls and five coins (four near the corners, one in the middle). The player starts at (1, 4). The tick is 1/8 s. `steer` follows the D-pad, A walks two cells and B stands still.
- `fx` (particles): a 384 × 288 box, 4:3 like the grid, with `maxParticles` 2000 and a 1/60 s tick. It has two forces, `gravity` and `drag`, and two emitters, both with `trigger: "burst"`, so nothing emits between pickups:
  - `ring`: 48 particles evenly around a circle, fast and gone in 0.35 s, for the flash.
  - `shower`: `$.sparks` (default 90) particles with random speed, thrown upward and falling back, living 0.5 to 1.2 s.
- The emitters' `x`, `y` are the box centre. They are required, but a triggered burst replaces them with the record's position.

**Frames:** `.frame(level.frame.cell, fx.frame.px, "fit")`. Both frames declare `extent` and their notes agree on x right, y down. `fit` handles the half-cell offset between maze's origin (centre of the first cell) and particles' origin (corner of the box). The checker reports `×32 +16`.

**Wire:** `level.out.picked` to `fx.in.burst`.

**Show:** `fx`, as the task asks.

I left `fx.in.level` and `fx.in.target` unwired. The task does not need them.

## Where the draft misled you

Nothing led me to write something wrong. One line could mislead a reader about what is possible:

> `.show(part)` | the part whose stage the page shows; the others still run

It reads as complete, and it is, but "the others still run" does not say whether a hidden part can still be played. For a maze steered by a person, that decides whether the composition works at all.

## What you guessed

- **The D-pad still works while `fx` is shown.** The maze's UI declares the pad, and `seams.md` says nothing about the inputs, tiles or controls of a part that is not shown. If they go with the stage, no one can move the player and no burst ever plays.
- **Both parts run on one real-time clock, each at its own `tick`.** See Answers, 3.
- **Records are not lost or repeated between the two rates.** The particles run about 7.5 steps per maze step. I assumed each `picked` record is delivered exactly once, although the maze's list stays in its state until its next tick.
- **`i` in `spawn`:** neither the package files nor `seams.md` say whether it counts within one burst or over the whole run. I used it for even angles over `i / 48`, which closes the ring either way if each burst gets 48 consecutive values. If particles are dropped at `maxParticles`, the ring is only partial.
- **`p.life` ends a particle.** The examples imply it, but I saw no statement of it.
- **The burst's real behaviour comes from a source comment.** The port's `note` says the rate gives the particles per record. The comment above `ports` adds that it is rounded down, capped at `maxRate`, and that triggered emitters stay quiet otherwise. I set `maxRate` as a per-record cap on that basis.
- **Sizes and speeds in px** were chosen by eye against a cell of about 32 px. No value is converted by hand, but if the maze's size changed, `fit` would move the bursts correctly while their spread stayed the same in px.
- **The particles UI's `rate` sweep and `rate` annotation:** my Program has no `rate` param. The checker did not object. I don't know what the page shows in that tile.

## Gaps

Smallest first.

1. **No statement of when a wired event arrives** across parts with different step rates, or of how the parts are scheduled.
2. **No statement of what happens to a hidden part's UI** (inputs, tiles, stage events). `.show` picks one stage and says only that the others run.
3. **No way to give a stage's size or aspect from a frame.** I matched the box to the grid by choosing literals. Separately, the particles element draws on a fixed 400 × 300 canvas, which is the package's matter, not the draft's; it is why I chose 4:3. It also draws every particle as a 2 × 2 square and ignores `p.size`, so size can't be used to shape the burst.
4. **No way to draw one part over another.** There is no layering call, no shared or aligned stage, and no way to say that the frame relation used on the wire also places two drawings. The maze package also has only a text view and no stage element, so there is nothing graphical to layer under the particles. The draft also cannot pass grids to the particle side ("pass grids, images or meshes" is listed as missing), so the walls cannot be sent across. What I needed was something like `.show(level, fx)`: draw `level`, then `fx` on top, aligned by their `.frame` edge, with the pad still live.

I did not imitate the maze with particles or wire `player` to `target` to fake a marker. As a result, the player on this page sees sparks in an empty box and cannot see the maze they are walking.

## Answers

**1. The seam.** I wired maze's `picked` output, an `Event<{ at: point2@cell }>`, to particles' `burst` input, an `Event<{ at: point2@px }>`. I related the frames with `.frame(level.frame.cell, fx.frame.px, "fit")`, from maze cells to particle pixels, and let the wire convert. No check caught a mistake, because the first run passed. The line the checker prints for the wire (`at: maze.cell → particles.px, point, ×32 +16`) was useful as confirmation: cell (1, 1) lands in the middle of its square and not on a corner.

**2. What did not fit.** For the data, nothing stood in the way. The field is `at` on both sides, both are points, both frames are 2-D with y down, both declare extents, and the event meaning matches (the burst note even gives "when an item is picked up" as a use). The misfit is on the display side. The two packages' ports meet, but their pictures cannot: there is no overlay, and the maze has no graphical stage. I needed layered stages aligned by the declared frame edge, with the hidden or lower part's controls kept.

**3. Time.** Only partly. `seams.md` says the kit "reads outputs from the state your host commits after each step", and that "before each step your host receives the records produced since its last step". So a burst plays on the first particle step after the maze step that picked up the coin. If both parts follow one real-time clock, that is at most about one particle step (1/60 s) after the pickup is committed. The draft does not say they do. I would want to know:

- Do parts share a clock, with each `tick` honoured in the same seconds? Or does the page step them in lockstep, which would run the particles at the wrong speed relative to the maze?
- When both are due at the same instant, which steps first? That decides whether the delay is zero or one particle step.
- Are records queued across several source steps when the receiver is slower, and is the queue bounded? The state list's max "bounds one step's events", but nothing bounds what builds up "since its last step".
- Is each record delivered exactly once when the receiver is faster?
- What do pause, single-step, reset, rewind and headless runs (such as the UI's `runs` sweep) do to events in flight and to the two parts' relative time?
- Do several coins from one dash arrive in one particle step? As I read it they do, so their bursts play together, not in the order the player passed them.

The maze moves a whole cell at a time, so there is no in-between position for the burst to lag behind.

## Files

Opened:

- `seams.md`, `rules.md`, `task.md`, `packaging.md`
- `maze/`: `wb-package.json`, `maze.dialect.js`, `maze.grammar.js`, `maze.ui.js`, `examples/01.js`, `examples/02.js`
- `particles/`: `wb-package.json`, `particles.dialect.js`, `particles.grammar.js`, `particles.ui.js`, `particles-field.js`, `examples/01.js` to `07.js`, `refusals/r01.js` to `r07.js`
- `workbench.js` and `REPORT.md`, which I wrote

I ran `check.sh` once without opening it. A directory listing showed the names `stderr.txt` and `transcript.jsonl`; I did not open them. One long command output was cut off and saved by my tool to a file outside the folder; I did not open that file and printed the package files again in smaller pieces. I opened nothing else and did not search the web. I changed nothing in `maze/` or `particles/`.
