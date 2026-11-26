# Composer's report

**State of the hand-in: `check.sh` reports 1 violation, W024. I believe the checker is looking in the wrong place (evidence under Answers, 2). I have not proved the cause, and I did not bend the frames to make it pass.**

## 1. Difficulty

**2.** The two pictures, the root and the wiring worked on the first run; the time went on a W024 that disagrees with the kit's own frame conversion.

## 2. What you did

**Root package `arcade/` (0.1.0)**

| Added | Why |
|---|---|
| frame `screen` (2-D, extent from `.screen({ width, height })`) | the space both pictures and the HUD share |
| input `board`: `Draw<1025>@screen` | the maze's picture; 1025 is its max |
| input `effects`: `Draw<10000>@screen` | the particles' picture; 10000 is its max |
| inputs `score`, `coinsLeft`: `f64`, default 0 | the HUD's numbers |
| output `view`: `Draw<11029>@screen` | 1 backdrop + 1025 + 10000 + 3 texts |
| builder (whole list, `from`) | backdrop, board, effects, title, score, coins left |
| colors `backdrop`, `ink` | the HUD strips and the text |
| state `title`, `width`, `height`, `score`, `coinsLeft` | what the builder and `text(state)` read |
| objects `Wired`, `inputs`, global `wired` | the declarations value inputs need |
| space `screen`, `slots: {}` | required keys; no Program lambdas |
| Grammar: `screen`, `title` (once, required) | all a Program has to say |
| runtime: `{ frame: true }`, copies the two numbers into state, `events: {}` | builders can't read value inputs |
| example `examples/01.js` | a 160 by 144 cabinet |

There is no UI.

**`workbench.js`**

- **Parts:**
  - `dungeon`: a 20 by 16 maze with coins, tick 1/8, one cell per step in the held direction (one direction at a time).
  - `sparks`: a 160 by 144 box, max 400, tick 1/30. One emitter triggered by `burst`, 60 per record, with gravity, shrinking over 0.6 to 1.1 s.
  - `screen`: the root, 160 by 144, titled "MAZE".
- **Frames:** `dungeon.frame.pixel` to `screen.frame.screen` and `sparks.frame.px` to `screen.frame.screen`, both `"fit"`.
- **Wires:**
  - `dungeon.out.coin` to `sparks.in.burst`, renaming `cell` to `at`.
  - Both `view` outputs to `board` and `effects`.
  - `score` and `coinsLeft` to the root.
- **Show:** `screen`.

I changed nothing in `maze/` or `particles/`.

## 3. Where the docs misled you

Nothing in the docs led me to write something that was refused. One sentence is unclear:

- `draw.md`: "a `Draw<<max>>` shown on a renderer whose limit is lower is refused when the workbench is composed". The only count limits in the table are in sprites (40, and 10 per row), but `<max>` counts ops. The checker compared them directly: "the shown list is Draw<11029>, and the Game Boy draws at most 40 sprites". `text` and `tiles` ops are not sprites, so I did not expect that comparison.

## 4. What you guessed

- **Number to text.** `"SCORE " + s.score` is accepted in a builder. No doc says how to turn a number into a `str`, or how it is formatted.
- **Root clock.** No doc says whether a new `Draw` input wakes a `{ demand: true }` part, so I used `{ frame: true }`.
- **`Draw` inputs in the runtime.** No doc says whether they appear in `ctx.inputs`. My runtime does not read them.
- **No lambdas.** `slots: {}` and `events: {}` are accepted when there are none.
- **Importing the root.** The glue can import my own package by name from its folder beside the others.
- **Version and kit.** `0.1.0` and `"0.4"`.
- **Alignment.** I gave the particles a box the size of my screen, so their fit is the identity. I gave the maze a size that fit centres with 8 units free above and below for the HUD.

## 5. Gaps

Smallest first.

1. **Number formatting for HUD text.** There is no documented way to pad, round or format a number. Concatenation was enough here.
2. **Reserving room in a fit.** `"fit"` always centres in the whole extent. There is no "fit into this region", so I chose the maze's size to leave HUD strips. An explicit `{ scale, offset }` would also work, but means working out the numbers by hand.
3. **`Draw` inputs and scheduling.** The docs don't say how a changing `Draw` input interacts with clocks and `ctx.inputs`.
4. **A max that follows the Program.** The particles' port says `Draw<10000>` whatever `maxParticles` is (400 here). My input must take 10000, my output must declare 11029, and a limited renderer refuses on that number although the largest list shown was 226.
5. **A picture for a constrained renderer.** Neither package offers a sprite or tile picture, and a composer can't restyle or convert another package's ops. A `Draw` seam also says nothing about which ops it holds.

Separately, a likely **checker defect**: see Answers, 2.

## 6. Answers

### 1. The layering

The root uses one whole-list builder, in painter's order:

1. An opaque backdrop rect.
2. `...layers.board` (the maze).
3. `...layers.effects` (the particles).
4. Three `text` ops (the HUD).

The builder is 8 lines including its opening and closing lines, for 6 array entries. I did not need `map` or anything undocumented: array spread did the whole job. The checker confirms the order "screen → dungeon → sparks → screen".

### 2. Frames

I related each picture's frame to my `screen` frame and nothing else. The pickup, which is in `maze.cell`, then reaches `particles.px` through the maze's own `cell` to `pixel` edge, my screen, and the particles' fit. Relating `cell` to `px` directly as well would have added a second path to keep consistent (S253). There are no hand conversions.

The kit reports:

```
wire dungeon.out.coin → sparks.in.burst: at: maze.cell → particles.px, point, ×8 +[4, 12]
wire dungeon.out.view → screen.in.board: at: maze.pixel → arcade.screen, point, ×1 +[0, 8]
wire sparks.out.view → screen.in.effects: at: particles.px → arcade.screen, point, ×1 +0
```

**Do they line up?** By these numbers, yes. The coin in cell (5, 7) maps to (5×8+4, 7×8+12) = (44, 68). The maze's builder draws that coin at pixel (44, 60), which is screen (44, 68). The particles' `px` is the screen, so the burst starts there. This is arithmetic from the printed edges: the checker prints no op positions, and I saw no rendered frame.

**Did a check catch a mistake?** No mistake of mine that I can find. The one complaint is:

```
workbench.js:1: W024 the coin at (5, 7) (at (5, 15) on your root's screen) was picked at T = 0.375, and no shown list drew a particles op within 1 of it by T = 0.875
```

(5, 15) is the cell coordinate (5, 7) plus only the `pixel` to `screen` offset [0, 8]. The `cell` to `pixel` edge (×8 + 4) is missing. My inference is that the checker takes the coin's position from the maze's state, which is in `cell`, and converts it as if it were in the frame the maze draws in, `pixel`. I did not read the checker, so this is not confirmed. "Within 1" also looks like a tolerance of one cell applied in screen units.

I tried one variant: relating `dungeon.frame.cell` instead of `pixel` to the screen, which is the same transform. The output was identical, W024 included. I then restored `pixel`.

The run otherwise shows the pickup at T = 0.375, 60 particle ops in the shown list at T = 0.4, 0 ops off stage, and a matching replay. Because W024 fails, **nothing in the checker has verified that the burst lands on the coin.**

### 3. What did not fit

Both pictures met the root as written. There were no frame, color or port problems, and neither draws images. The only adapter was the documented rename `cell` to `at`. The frictions:

- The particles' `Draw<10000>` sets the root's size, whatever the Program's own maximum.
- The maze draws an opaque floor, so it has to be the lower layer. That suited this page.
- The maze's picture is fixed at 8 units per cell, so the maze's size had to be chosen around the screen.

### 4. Renderers

**Canvas** drew the largest list, 226 ops: 154 rects, 69 ellipses and 3 texts, with none off stage.

**Game Boy** refuses it twice:

- **When the list is drawn:** all 154 rects and 69 ellipses, because it draws no free shapes.
- **At composition:** `Draw<11029>` against 40 sprites.

The page **cannot run on a Game Boy as it stands**. The screen size (160 by 144), the 8-unit grid and the HUD text already suit it. It would take:

- **Maze author:** a `tiles` picture for walls and coins (a declared image with 8 by 8 cells), and an `image` sprite for the player.
- **Particles author:** `image` sprites in place of ellipses, at their declared size. Size would be shown by choosing a cell, not by scaling.
- **Particle count:** at most 40 sprites and 10 per row. My 60-particle burst starts at a single point, so it breaks the row limit at once. It would need about 8 particles.
- **Root:** no backdrop rect.
- **Declared maxes:** low enough to pass the composition check. This needs smaller maxes on the authors' ports, or a different rule in the design.
- **Colors:** they collapse to 4 shades by brightness, so the maze and the sparks would need contrast chosen for that.

## 7. Files

Opened:

- In `/private/tmp/e3qYus-compose`: `task.md`, `rules.md`, `draw.md`, `seams.md`, `runtime.md`, `packaging.md`, `api.md`, `check.sh`, `hash.sh`.
- Every file in `maze/` and `particles/`: manifests, definition files, the stage element, examples and refusals.
- My own `arcade/` files and `workbench.js`.

**One read was outside the folder.** My command that printed the `particles/` files was too long to display, so the tool saved its output under `/Users/ben/.claude/projects/-private-tmp-e3qYus-compose/…/tool-results/`, and I read that saved copy. It held only the `particles/` files.

I opened nothing else. I saw `stderr.txt`, `transcript.jsonl` and later `log.jsonl` in directory listings and did not open them. I did not open the `docs/` or README files that `api.md` links to, or the kit scripts that `check.sh` and `hash.sh` call (I ran them). I did not search the web. I made one temporary backup of `workbench.js` for the frame variant and moved it back.
