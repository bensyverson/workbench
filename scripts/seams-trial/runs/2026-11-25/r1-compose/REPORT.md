# Composer report

## 1. Difficulty

**2**: the seam itself took one `.frame` and one `.wire`, but "drawn over the maze" cannot be said in the draft, so that part of the task is not met.

## 2. What you did

`workbench.js` passes `check.sh` with no violations. That is a stand-in check: I have not seen it run, so the look and timing of the bursts are untested.

**Parts**

- `level` (maze): an 11 x 7 grid with several coins, start (1, 1), 8 ticks a second, D-pad steering, A walks 3 cells per tick.
- `fx` (particles): a 440 x 330 box at 60 ticks a second, with gravity and drag.
  - `sparks` (48) and `embers` (16) both trigger on `burst`, giving a fast ring and a slow glow at each coin.
  - `finale` (400) triggers on `pulse`.
  - The box is 4:3 because `particles-field.js` has a 400 x 300 canvas and scales each axis separately. Another shape would distort the uniform scale that `"fit"` computes.

**Frame**

- `.frame(level.frame.cell, fx.frame.px, "fit")`. Both frames declare `extent`, both are 2-D with y down. The check reports scale 40, offset (20, 45).

**Wires**

- `level.out.picked` to `fx.in.burst`: the task. `at` is converted from cells to px.
- `level.out.cleared` to `fx.in.pulse`: an extra I added, a finale on the last coin. `at` is dropped, so the finale plays at the emitter's own position, the middle of the box.

**Show**

- `.show(fx)`, as the task asks. This shows only the particles' stage. **The maze is not drawn.**

## 3. Where the draft misled you

Nothing led me to write something wrong. Two places suggest more than they deliver:

- The worked example is this very pairing and ends `.show(fx)`, with "`.show(part)` | the part whose stage the page shows; the others still run". It reads as a finished game, but as far as the draft says, the player would see sparks on a blank field with no maze, player or coins.
- "Every fact that involves two languages lives in the glue program." How the two are drawn together involves both, and the glue program has no way to say it.

## 4. What you guessed

- **Input to a hidden part.** I assumed the maze still receives the D-pad (and A) when only the particles' stage is shown. The draft says the others "still run", not that their inputs, controls or tiles stay on the page. If they don't, the workbench cannot be played.
- **Params.** The draft says each part keeps its own params (`level.$.speed`) but not how `$` in the workbench's `($) =>` relates to a part's lambdas or build-time reads. I declared none.
- **Shared helpers.** I used a top-level helper (`scatter`) and a top-level `steer` in the glue program, assuming each package's lambda rules apply to them as in its own Programs. The check accepted both.
- **Placeholder positions.** Triggered-by-`burst` emitters still require `x, y`; I put them at the middle of the box.
- **Delivery.** I assumed each `picked` record reaches `fx` exactly once, although `fx` steps several times per maze step (see Answers).

## 5. Gaps

Smallest first.

1. **No way to size one part's constants in another's unit.** Burst speeds are in px, but what looks right depends on how big a cell came out under `"fit"`. A glue program cannot say "about two cells a second" without doing the conversion by hand, so I picked px values by eye. Resizing the grid or box changes the look.
2. **No statement of timing across parts** (when a wired event arrives, in what order parts step). See Answers, question 3.
3. **No statement of what a part that is not shown keeps**: its inputs, controls, readout tiles. The maze's score and "coins left" tile may be lost too.
4. **No way to draw one part over another.** There is no layering or overlay call: `.show` takes one part. This blocks "drawn over the maze". The frame relation that would be needed to align the two stages is already declared, but it only affects wires. A fix would also need a stage that can be see-through, and the maze has only a text view (no stage element), so there is no maze picture to put underneath.

I did not work around gap 4, for example by building the walls out of hand-placed emitters. Passing the grid across is also listed as not existing ("pass grids, images or meshes").

## 6. Answers

### The seam

I wired `level.out.picked` (`Event<{ at: point2@cell }>`) to `fx.in.burst` (`Event<{ at: point2@px }>`) and related the frames with `.frame(level.frame.cell, fx.frame.px, "fit")`. No check caught a mistake: the first run passed, and so did the run after I reshaped the box. I made no deliberate errors to test the diagnostics, so I can't say how good they are. The check's printed summary of each wire (`×40 +[20, 45]`, and what was dropped) was useful for confirming the conversion was the one I meant.

### What did not fit

The ports met as written: same field name `at`, same kind (point), and frames that both have `extent`. Nothing needed renaming or converting by me, and the two packages' notes were enough to wire them.

What stood between them was presentation, not data:

- No way to show the two together (gap 4).
- The particles state holds only `x` and `y`, and its stage draws every particle as a 2 x 2 dot in one color. `p.size` has no visible effect there, and there is no color, so "a burst you would want to watch" can only be shaped by count, speed and lifetime. This is a limit of that package, not of the seam draft.

### Time

Only partly. `seams.md` says an `Event` output holds what happened "during one step", and that "before each step your host receives the records produced since its last step". So a burst should play at the first particles step that runs after the maze step in which the coin was taken. The particles package says the same of its own host.

It does not say when that is in time. I would want to know:

- **Clocks.** Do all parts share one clock, with each stepping at its own `tick`? What happens when the periods don't divide evenly (1/8 s is 7.5 steps of 1/60 s)?
- **Step stamp.** Does a maze step happen at the start or end of the interval it covers? That decides whether the burst appears with the player's jump onto the coin or up to 1/8 s before or after it.
- **Ties.** When both parts are due at the same instant, which steps first? Does it follow `.part` order, wire direction, or neither? Can the burst be a whole particles step late?
- **Exactly once.** "Since its last step" implies a fast receiver gets each record once, and a slow one gets several steps' records together. Does that hold, and is anything capped or dropped on the way?
- **Signals.** For value wires, is the value read the latest committed one? This matters for a fast part following the maze player, which jumps cell to cell.
- **Replay.** Is the interleaving deterministic, given that the particles' random stream depends on the order bursts arrive?

## 7. Files

Opened (read), all inside `/private/tmp/3d093c96-seams/r1-compose`:

- `seams.md`, `rules.md`, `task.md`, `packaging.md`
- `maze/`: `wb-package.json`, `maze.dialect.js`, `maze.grammar.js`, `maze.ui.js`, `examples/01.js`, `examples/02.js`
- `particles/`: `wb-package.json`, `particles.dialect.js`, `particles.grammar.js`, `particles.ui.js`, `particles-field.js`, `examples/01.js` to `07.js`, `refusals/r01.js` to `r07.js`

Written: `workbench.js`, `REPORT.md`. Run, not read: `check.sh`. I also listed the folder, which showed `stderr.txt` and `transcript.jsonl`; I did not open them. I opened nothing else. The harness put some text in my context on its own (user instructions and a memory folder path), and saved one long command output to a file outside the folder; I did not open that file, and re-read its contents from the package files instead.

`maze/` and `particles/` are unchanged.
