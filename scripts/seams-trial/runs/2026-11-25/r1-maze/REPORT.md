# Report: maze author

## Difficulty

**2.** The ports themselves were quick to write from the draft's example, which is nearly a maze; the care went into pinning down event meanings for a host that exists only as comments.

## What you did

`maze` is now 0.2.0. I added the type `cell2` (`vector(2, "f64")`), one frame, nine outputs, new run state to back them, host comments beside `state`, and `examples/02.js`. The Grammar, UI, `text()` and `examples/01.js` are unchanged. `check.sh` reports no violations. It does not run a host, so no event or state value has been exercised.

**Frame `cell`** (2-D): x right, y down, (0, 0) the center of the top-left cell, one unit per cell. Its extent covers the widest row by the number of rows, so a stranger can `"fit"` the maze onto their own space.

| Output | Seam type | Why a stranger would want it |
|---|---|---|
| `player` | `point2@cell` | follow the player: camera, light, trail |
| `move` | `vec2@cell` | direction and size of this step's motion: stretch, pan, lean |
| `entered` | `Event<{ at, from }>` | footsteps and trails, including every cell of a dash |
| `picked` | `Event<{ at }>` | a chime or burst at the coin |
| `bumped` | `Event<{ at, push }>` | a thud or shake at the wall, aimed along `push` |
| `cleared` | `Event<{ at }>` | a one-off celebration |
| `score` | `f64` | scoreboard |
| `coinsLeft` | `f64` | progress: brightness, tempo, a counter |
| `t` | `f64` | a clock |

State added: `player.at`, `player.move`, and the lists `entered`, `picked`, `bumped`, `cleared`. I kept `player.x` and `player.y` beside `player.at` so that `text()` and any host written to the old state still read the same fields. The cost is that the position is stored twice.

## Where the draft misled you

Nothing led me to something the checker refused. Two passages read as more complete than they are:

- "`extent(record)` (optional): the box your frame's content fills for a built Program". Neither `seams.md` nor `packaging.md` says what `record` is. The only clue is the example's `record.grid[0].length`.
- That same example, `max: [record.grid[0].length - 0.5, …]`, takes the first row's width. Nothing in this maze's Grammar says rows are equal, so copying it could give a wrong box. I took the widest row.

## What you guessed

- **`record`** has the Program's `grid` declaration at `record.grid`, as an array of strings. The check passing does not show that `extent` was called or that this shape is right.
- **A "step"** is one maze tick. The draft says "each step" and "before each step" without saying whose step it is, or what happens when parts tick at different rates (here `.tick` ranges from 0.01 to 1 s).
- **State before the first step:** empty lists, zero `move`, `player.at` at the start cell. The draft says outputs are read "from the state your host commits after each step" and nothing about before.
- **Overflow:** a full event list takes no more records that tick. "Any max: it bounds one step's events" does not say what happens beyond it. `pl.steps` and row length are unbounded, so 64 can in principle be exceeded.
- **Order** of records within a list is the order they happened. The draft does not say whether wires keep order.
- **`t` is in seconds.** The old files don't say; the `toFixed(2)` and `t > 60` suggest it.
- **Maze behavior the old files never stated** and that the events now depend on: the grid's edge blocks like a wall; a dash moves cell by cell and takes each coin it crosses; `push` is `(dx, dy)`. How a diagonal (`dx` and `dy` both nonzero) moves, what fractional `steps` do, and whether a coin on the start cell is taken are still unstated.
- **`score`, `coinsLeft`, `t`** are untagged `f64`: counts have no frame, and I did not add a time frame (see Gaps).

## Gaps

Smallest first.

1. **An example can't use a port.** R4 asks for "one new example that uses what you added", but ports are used only by a glue program, and a package has no place for one. `examples/02.js` only creates situations that would produce each event. Nothing checks an output, an event or `extent` against a running state.
2. **Rates can't be tagged.** A velocity in cells per second has no seam type (`vec2@cell` carries no "per second"). I offered displacement per step as `move`. A stranger can't turn it into a rate, because there are no transforms on a wire.
3. **No way to say what a "step" or `t` is across parts.** I could declare a 1-D frame for seconds, but the draft shows no shared notion of time, and tagging `t` would stop it reaching untagged inputs (S252).
4. **A tagged value can't also feed an untagged input.** `player` and `move` can't reach a stranger who takes plain numbers, such as a pan control. There is also no way to take one component (x) of a point, so "pan by the player's x" can't be wired.
5. **Normalized or whole-extent positions** need the stranger to declare a frame with an extent. A language with no spatial frame (sound, scoreboard) has no way to ask where something is across the maze, from 0 to 1.
6. **Lists need a fixed max.** I wanted a `coins` signal (positions of the remaining coins, for glows or markers). The grid bounds neither its row length nor its coin count, so any max would silently drop coins. I left it out.
7. **Grids can't cross** (the draft says so). A stranger can't learn where the walls are, so shadows, reflections or a minimap are impossible.

## Answers

**1. What you offered.** `player`, `move`, `entered`, `picked`, `bumped`, `cleared` (four of them events, each carrying a place), and `score`, `coinsLeft`, `t`. The aim was one output for each thing that happens (a step, a coin, a blocked walk, finishing) and for each thing a reaction might follow (position, motion, progress).

I considered and left out:
- `coins` as a list (Gap 6) and the walls or grid (Gap 7).
- Velocity per second (Gap 2).
- The pad's buttons: they are the player's input, not something that happens in the maze. A dash shows up as several `entered` records.
- A `bool` "all coins taken": `coinsLeft` and `cleared` cover it, though a stranger with only a `bool` input can't compare `coinsLeft` to 0.
- A constant "one cell" length (`f64@cell`) so a stranger could size an effect to a cell. It would work, but it is a constant dressed as an output, and nothing in the draft suggests that use.
- Extra fields on `picked`, such as coins left. Since an input takes one wire and wires can't merge, this is the only way to deliver data along with an event, but I could not guess what a stranger's input would name it.
- Inputs: the task asked for outputs and frames.

**2. Frames.** For space-to-space, yes. A composer reads the note, then either writes `"fit"` against a frame of theirs that has an extent, or gives a scale and offset. Saying that whole numbers are cell centers matters, because it is why the extent starts at -0.5. Limits:
- The frame depends on the built Program's grid, so a hand-written edge is only right for one level; `"fit"` follows the grid.
- There is no rotation (stated), and no relation to a 3-D space such as a floor plane seen by a camera: frames of different `dims` can't be joined (S257).
- The note is the only way to say a cell has a size of 1; nothing structured says it.
- `bumped.at` can fall outside the extent at an edge. The draft doesn't say whether that is allowed. I assumed it is and said so in the note.

**3. The host.** The maze's host must now:
- fill `player.at` and `player.move`;
- empty four event lists at the start of each tick and append to them in order;
- walk dashes cell by cell, so that it can record each cell entered;
- detect a blocked walk and the transition to zero coins;
- respect the list limits;
- provide the stated state before the first tick.

The general rule is clear from `seams.md`: refill each step, empty at the start of the next, commit after the step, and say so where the host is described. What is not clear is the step itself when composed (who drives the tick, and whether an event list is read exactly once if another part steps faster or slower), overflow, and the state before the first step. The maze's own host was only ever prose, so these comments are a specification that nothing has tested.

## Files

Opened: `seams.md`, `packaging.md`, `rules.md`, `task.md`, `check.sh`, `hash.sh`, `maze/wb-package.json`, `maze/maze.dialect.js`, `maze/maze.grammar.js`, `maze/maze.ui.js`, `maze/examples/01.js`, and my own `maze/examples/02.js`.

I opened nothing else. A directory listing of the trial folder showed the names `stderr.txt` and `transcript.jsonl`; I did not open them. I ran `check.sh` and `hash.sh` without reading the scripts they call. I wrote one temporary edit script in the trial folder and deleted it.
