# Report: maze author

## Difficulty

**2.** The port was short and passed the first check; the work was in choosing a frame and ops, since no choice is right on both a stretched stranger's page and a Game Boy.

## What you did

- **Port `view`** (`Draw<1025>@pixel`), two layers:
  - a `from` layer: one opaque floor rect over the whole maze (1 op);
  - an `each: "things"` layer (up to 1024 ops): a `rect` per wall, a small `ellipse` per coin, a larger `ellipse` for the player.
- **State `things`**: `list(struct({ kind: "str", x, y }), 1024)`, holding walls and coins row by row, then the player. `each` needs one list item per op, and each item needs its own position.
- **Runtime**: `thingsOf(grid, player)`, called in `init` and `step`, derives `things` from `grid` and `player`. `grid` stays the only truth; movement and pickup logic are unchanged.
- **Colors**: `floor`, `wall`, `coin`, `player`.
- **Frame `pixel`**, with an `extent`, and an **edge** `cell -> pixel` (`scale: 8, offset: 4`). In `cell`, one unit is a whole cell, so shown alone the example would be a 9 by 5 pixel picture.
- **Constants** `CELL = 8`, `THINGS_MAX = 1024`.
- **Images:** none.
- Version `0.2.0` to `0.3.0`, and rehashed.

`check.sh` was run twice (the second time after writing this report, with the package unchanged): no violations both times.

**One behavior change to flag (R3).** `grid` allows 64 rows of any width, but `things` holds at most 1024 records. A maze with more than 1023 walls and coins would now stop with N002, where it ran before. I did not test this. Both examples are far below the limit.

## Where the docs misled you

- `draw.md`, Renderers: "It draws the list in the shown part's frame, taking one unit of that frame as one pixel, and the frame's `extent` as the screen." The checker's Game Boy profile did not do that. It printed `gameboy (pixel fit into 160 by 144, ×2.222)`. The Canvas line matched the doc. The scale matters here, because an image "drawn at another `size`" is refused on a Game Boy.
- `draw.md`: "a `Draw<<max>>` shown on a renderer whose limit is lower is refused", next to a table whose Game Boy limits are "40 sprites, 10 on any one row". I did not expect the whole seam max to be compared with the sprite count, whatever ops the list holds. The checker says: "the shown list is Draw<1025>, and the Game Boy draws at most 40 sprites ... the composition is refused". `tiles` ops and `text` would count against it too, as far as that message says.

Neither led to a wrong hand-in.

## What you guessed

- A `from` layer that returns one op counts as 1 toward the seam's max. The docs give the max of `each` and `pen` layers, not of `from` layers. The checker accepted 1025.
- A new frame with an edge counts as adding to the language, and "in one of its own frames" allows it.
- A `str` is acceptable for `kind` (I did not try `enumOf` in state).
- Builders, `extent` and `edges` may all read the same top-level constant. The docs say this for builders; it worked for the other two.
- All grid rows are as wide as the first (the existing `cell` extent assumes this too).
- The port name `view`, so that it is the one shown if the part ever has several.
- The floor should be opaque. A stranger layering it must put it underneath their own things; the `note` says it is opaque.
- 1024 as the list max. A larger one would force every taker to declare an input at least that large.

## Gaps

Smallest first.

1. **`each` has no index, and cannot walk inside a string.** The maze's walls and coins live in `grid`'s characters, so I had to keep a second copy of them in state.
2. **No definition of a flipping edge for `rect`.** An edge may have a negative scale, and `size` converts by scale. The docs don't say what a negative `size` or `r` draws, or whether `at` stays the top-left corner.
3. **A max cannot follow the built Program.** `Draw<1025>` and the state list's 1024 are fixed, though the record knows this maze needs 33. It also caps the maze's size.
4. **No static layer.** The walls never change but are rebuilt, sent and converted after every step.
5. **No op that is both stretchable and drawable on a Game Boy for a background.** `tiles` converts `at` only, so a stranger who stretches the frame moves the layer but does not scale it.
6. **No way for one `Draw` output to serve different renderers.** A package "doesn't target a renderer", yet shapes are refused by one, and tiles don't stretch.
7. **No pixel data for images** (already listed in `draw.md`). An image-based maze would be plain boxes, so walls, coins and player could not be told apart by their art.

## Answers

### 1. The bridge

About 40 added lines:

| Part | Lines |
|---|---|
| port `view` (both builders) | 19 |
| `pixel` frame and edge | 7 |
| constants | 3 |
| state | 2 |
| colors | 1 |
| images | 0 |
| runtime (`thingsOf`, the longer `init`; one `step` line also changed) | about 8 |

The most work was not typing but deciding on the frame and the ops: shapes versus images and tiles.

### 2. One op per item

`each` did not fit the state as it was. The only list was `grid`, whose items are row strings: one item would need many ops, and `from` gets no row number. I added `things`, one record per wall, coin and the player, each with its position and kind. With that, `each` fits well. A picked coin leaves the list, and the player comes last so it is drawn on top.

I mixed in one `from` layer for the floor, which is one rect for the whole maze rather than a thing. I needed no pen. I did not use `map` or an index in a builder; the runtime, which is plain JavaScript, uses `flatMap` to build the list. Nothing undocumented was needed.

### 3. Ops and frames

I used `rect` and `ellipse`. I considered:
- `image` with an explicit `size`: it stretches correctly and could be a sprite, but has no art in this trial.
- `tiles`: natural for walls, but needs a `list<list<f64>>` in state and does not scale on a wire.
- `line` and `text`: nothing in the maze needs them.

In `pixel`, at 8 units per cell, the picture fits its extent: 72 by 40 and 56 by 24, with 0 ops outside the stage. That is what the checker reports; I did not look at a rendered image.

A stranger who stretches the frame should see it right, because every field I use (`at`, `size`, `r`) converts, including by a different scale per axis. This is from the op table; I did not test it with a second part. A flip is the unknown case (gap 2). A stranger can relate either `cell` or `pixel`: the kit finds the path through my edge, so positions from my `player` and `coin` ports line up with the picture.

### 4. Renderers

- **Canvas:** drew everything. Example 01: 33 ops (29 rect, 4 ellipse). Example 02: 19 ops (17 rect, 2 ellipse). Nothing was outside the stage.
- **Game Boy:** refused every op, since it draws no free shapes. For example 01 it also refused at composition, because `Draw<1025>` exceeds its 40 sprites.

The maze could run on a Game Boy, but not with this list. From the docs (not tried), it would take:
- floor and walls as one `tiles` op, with rows of cell numbers kept in state and an 8 by 8 cell image declared;
- coins and player as 8 by 8 `image` cells at their native size, which makes them sprites;
- a list max of 40 or less, so at most 38 coins beside the tiles op and the player, and no more than 10 sprites on one row;
- a maze of at most 20 by 18 cells, shown at scale 1.

That version would no longer stretch properly on a stranger's page, because `tiles` does not scale and a resized image is refused on the Game Boy. It would also not be one op per item for the walls.

## Files

Opened, all in `/private/tmp/e3qYus-maze`:
- `task.md`, `rules.md`, `draw.md`, `seams.md`, `runtime.md`, `packaging.md`
- `maze/wb-package.json`, `maze/maze.dialect.js`, `maze/maze.grammar.js`, `maze/maze.ui.js`, `maze/maze.runtime.js`, `maze/examples/01.js`, `maze/examples/02.js`
- `check.sh` and `hash.sh`: I also printed these two wrapper scripts, which goes beyond the list of files to read. They name checker scripts outside this folder, which I did not open.

I also listed the two folders, which showed `stderr.txt` and `transcript.jsonl`; I did not open them. I opened no other file and did not search the web. I wrote `maze/maze.dialect.js`, `maze/maze.runtime.js`, `maze/wb-package.json` and this report.
