# Report: maze author

## Difficulty
**2.** The docs covered ports, the frame and the runtime well enough to pass the checker on its first run; the work was in choosing behaviour that neither the docs nor the package define.

## What you did
Version 0.1.0 → 0.2.0. Added `maze.runtime.js` (named in `entry.runtime`) and `examples/02.js`, then rehashed. The Grammar, UI and example 01 are unchanged. `check.sh` reports no violations.

**Frame** `cell` (2-D): one unit per cell, x right, y down, (0, 0) at the centre of the top-left cell. A position is then the same pair of numbers as `state.player`. Its `extent` is `[-0.5, -0.5]` to `[columns-0.5, rows-0.5]`, walls included, so a composer can write `"fit"`.

**Event outputs** (`at` is always a cell centre, `point2@cell`):

| Port | Record | Why a stranger wants it | Max per step |
|---|---|---|---|
| `pickup` | `at`, `score`, `left` | a burst, a chime, a scoreboard | 4 |
| `entered` | `at`, `by: vec2@cell` | footsteps, trails | 4 |
| `bumped` | `at`, `toward: vec2@cell` | a thud, a camera shake | 1 |
| `cleared` | `at`, `score` | a fanfare | 1 |

**Signals:**
- `player` (`point2@cell`): for a camera or light to follow.
- `velocity` (`vec2@cell/s`): for look-ahead.
- `period` (`f64@s`): so a follower can glide over each jump.
- `score`, `coinsLeft` (`f64`): for a scoreboard.

**Runtime:**
- **Clock:** `tick: record.tick ?? 1/8`.
- **Control:** each step builds the pad from `controls.pad` and a fresh Player, then calls `kernels.control`.
- **Walking:** one cell at a time, picking up each coin entered. At most 4 cells per step, which bounds the Event maxes. Small maxes also make a stranger's `events.in` easier to meet (S116).
- **Bumps:** `bumped` fires when a wall first stops the player, not on every tick the button is held.
- **State added:** `period`, `motion`, `pushing`.

**Example 02** is a coin corridor with a dash of 4, so one step can push several records. A Program can't refer to output ports, so "uses what you added" can only mean it exercises them.

**Testing:** besides `check.sh`, I ran the step function and extent in a temporary folder with the `kit/define` calls stubbed out. Multi-coin dashes, `cleared`, bump suppression, the vertical fallback and the signal lambdas behaved as described. That was not the real kit, and I have since deleted the folder. No glue program was run, so frame conversion and `"fit"` on `cell` are untested.

## Where the docs misled you
I found no rule or example that led me wrong.

## What you guessed
- **Diagonal intent** (`dx` and `dy` both set): one axis per cell, horizontal first, vertical if horizontal is walled or not asked for. This never cuts a corner.
- **Intent between steps:** `dx`, `dy` and `steps` start at 0 each step, so a `control` that never sets `steps` stands still.
- **Odd values:** `dx` and `dy` are reduced to their sign; `steps` is floored and held to 0–4. A Program asking for more than 4 is silently capped. The port notes say "at most 4 per step", but nothing tells the Program's author.
- **Grid edges and characters:** outside the grid (including short rows) is a wall; any character other than `#` and `c` is floor.
- **A coin on the start cell** stays until the player leaves and comes back, since it has not been "entered". `init` can't push Events anyway.
- **A maze with no coins** never fires `cleared`.
- **`velocity`** is the step's net displacement over `dt`. It holds that value until the next step.
- **`D-pad`:** a missing `controls.pad`, or a missing button, reads as not held.
- **Tick fallback:** 1/8, taken from the example.
- **`extent`** may use ordinary JavaScript (`Math.max`, spread, `map`). It loads, but the checker did not visibly exercise it.
- **`from` forms:** a plain path for scalars and `period`, array-literal lambdas for the point and vector.

## Gaps
Smallest first.
1. **An Event max or list max that depends on the Program.** `events.out` is one number for every Program, so I had to cap walking at 4 even though `control` may ask for any number.
2. **A bounded list for an unbounded set.** I wanted to offer the remaining coin positions (for lights). The state allows 64 rows of any width, so any `list<point2@cell, N>` could silently drop coins.
3. **Passing the walls.** A lighting effect or camera needs the grid, and `seams.md` says grids can't be passed. A list of wall points has the same limit as in 2.

## Answers

**1. What I offered.** The outputs are in the tables above. I left out:
- **Walls and coin positions:** see Gaps.
- **The grid's size:** the frame's `extent` already carries it.
- **A "cleared" boolean:** `coinsLeft` and the `cleared` Event cover it.
- **A constant one-cell length** (`f64@cell`): it could give a stranger a cell's size in their units, but I saw no documented example of a constant output and did not try it.
- **Elapsed time:** the kit already gives every runtime `T`.
- **Inputs:** the task asked for none.

For names, `at` means "where it happened" in every record, so one `rename` habit works on all of them. `by` is a move that happened and `toward` one that didn't. `score` and `left` are plain counts a scoreboard can take without a frame. I expect strangers to need `rename`, and that is cheap.

**2. Frames.** A composer relates `cell` to their own frame with `.frame(..., "fit")` or an explicit edge, and the wire converts `at`. The `note` has to say that whole numbers are cell **centres**, because a stranger who assumes corners is off by half a cell and nothing would flag it. `extent` says how much space the grid fills.

For positions, what `seams.md` allows is enough. Two limits:
- A `note` is prose, so the centre convention isn't checked.
- A y-up consumer can't use `"fit"` alone if it needs the axis flipped. As I read it, `"fit"` computes one scale for every axis, so the composer must write a negative-scale edge by hand.

**3. Time.** Yes, `runtime.md` says it clearly. A record pushed at T reaches the consumer at its first step at or after T. That is the same instant if the consumer also steps then (the maze goes first by wire order), otherwise its next step. A 60 Hz frame part therefore sees a pickup at most about 1/60 s later. With `delay: true` the answer is less clear: the delayed-wire sentences describe what the producer "held", which reads as being about values, and I couldn't tell when a delayed Event arrives.

I used `s` once, for `period`, and implicitly in `velocity`'s `/s`. Event records carry no timestamp, because the consumer receives them at a known step and has its own `T`.

**4. The runtime.**
- **D-pad:** `runtime.md` gives the name and shape (`controls.pad`), so no guess was needed beyond the fallback. It also says nothing in the kit links that name to the UI's `inputs`; this is a convention of this workbench.
- **State:** the shape was clear from the Dialect and R3.
- **Event max:** the mechanism was clear, the number was mine to choose (see Gaps).
- **Calling `control`:** clear. It is a once-slot on the root, so `kernels.control`, with a plain object for each of Player and Pad. The docs don't say what the writable members should hold before the call; I used 0.
- **What the checker caught:** nothing. It passed on the first run. It showed a pickup in each example, at T = 0.125 and T = 0, with `pickup` and `entered` records. Its output showed no `bumped`, `cleared` or multi-cell step, which is why I tested those separately.

## Files
Opened:
- `seams.md`, `runtime.md`, `rules.md`, `task.md`, `packaging.md`
- `maze/wb-package.json`, `maze/maze.dialect.js`, `maze/maze.grammar.js`, `maze/maze.ui.js`, `maze/examples/01.js`
- `check.sh` and `hash.sh`: I printed both wrapper scripts. They name kit scripts outside the folder, which I ran through the wrappers but did not open.
- Files I wrote: `maze/maze.runtime.js`, `maze/examples/02.js`, this report, and temporary test files (deleted).

I also listed the folder, which showed the names `stderr.txt` and `transcript.jsonl`; I did not open them or the check log. My first command's output was too long and the harness saved a copy outside the folder; I saw only its preview and re-read the documents from the folder instead of opening that copy. I opened nothing else and did not search the web.
