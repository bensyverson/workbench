# REPORT: maze author

## 1. Difficulty

2. The package had a working Dialect, Grammar, UI and example, so the job was adding ports, one frame, a runtime and an example; the one real judgement call was how to bound the coin Event's max, since a walk's pickups depend on the Program.

## 2. What you did

**Outputs** (`maze.dialect.js`, `ports.out`, each with a `note`):

- `position: point2@cell`, from `(s) => [s.player.x + 0.5, s.player.y + 0.5]`. A stranger wanting to put something at the player needs a position in a frame; the lambda converts the cell index to the cell's centre.
- `elapsed: f64@s`, from `t`. The kit's `s` frame for time, so a stranger's sound or light can follow maze time.
- `score: f64` and `coinsLeft: f64`, from state. Plain numbers for a scoreboard; untagged because they are counts, not positions or lengths.
- `coin: Event<{ at: point2@cell, when: point1@s, score: f64 }>`. The event a stranger reacts to: `at` is where the coin was, `when` is the maze time of the tick that took it, `score` is the score after the pickup.

Considered and left out:
- a velocity rate: the walk is discrete (0 to `steps` cells per tick), so a per-second speed would be an average the runtime invents;
- the control's raw intent (`dx`, `dy`, `steps`): that is the Program's own choice, not something a stranger needs, and would leak Grammar internals;
- a wall-bump event: nothing in the maze needs it, and no stranger asked;
- a grid output: `seams.md` says grids don't cross the wire;
- a `cleared` event: `coinsLeft` reaching 0 gives the same fact as a signal, and a stranger can react to `coin` records.

**Frame** `cell` (`dims: 2`): x to the right (column), y down (row), origin at the top-left corner, one unit one cell, and a point at a cell's centre (`[c + 0.5, r + 0.5]`). `extent` is the grid's bounding box, so a composer can use `"fit"`. I chose the centre so that a burst placed on a coin sits in the coin's cell.

**Runtime** (`maze.runtime.js`, named in `entry.runtime`):

- `clock`: `{ tick: record.tick ?? 1 / 30 }`, the fallback the Grammar's optional `tick` calls for.
- `init`: `t: 0`, `score: 0`, `coinsLeft` counted from the grid, the player at `record.start`, and a copy of the grid.
- `step`: calls `kernels.control(player, pad)` with a fresh `Player` object (`x`, `y`, `dx: 0`, `dy: 0`, `steps: 0`) and a `Pad` built from `controls.pad` (missing buttons false). The walk takes the control's `dx`/`dy` signs and up to `steps` cells, stopping at `#`, the grid's edge or a missing row. A `c` entered becomes `.`, decrements `coinsLeft`, increments `score`, and pushes a `coin` record `{ at, when: T, score }`. It returns a new state and does not touch the one it was handed.
- `events: { out: { coin: 64 } }`.

**Example** `examples/02.js`: a one-row corridor of coins with no `tick`, so it exercises the runtime's clock fallback; left and right walk, A walks two cells.

**Manifest:** version `0.1.0` → `0.2.0`; `runtime` added; `examples/02.js` listed; `./hash.sh maze` run after the last edit. `maze.ui.js` and `maze.grammar.js` are unchanged.

## 3. Where the docs misled you

Nothing I followed led me wrong. Two places were thin:

- `seams.md`, "A value output reads your run's state": it says a lambda may build a point "from scalars as an array literal of exactly its dims" with `s.<path>.x`, but says nothing about arithmetic inside the lambda. I used `s.player.x + 0.5`; the checker accepted it. I did not find a rule against it, but I cannot say from the docs that it is intended.
- `seams.md`, the `extent` example reads `record.<slot>` for a 1-D frame. The docs don't say what a `string[]` slot looks like in the record. I assumed a plain array and used `record.grid.length`, `record.grid[i].length`.

## 4. What you guessed

- **Cell centre** as the point convention, and origin top-left with y down (the docs leave this to me: "which way each axis points").
- **Walk rules:** `dx`/`dy` are passed through `Math.sign`, so a control that writes a larger value still moves one cell per axis per cell; both nonzero means a diagonal step; `steps` is floored and clamped to [0, 64]; a non-number `steps` is 0; no walk when both `dx` and `dy` are 0.
- **Event max 64, and the walk cap 64 that goes with it.** The docs give `events.out` as a static number and say nothing about deriving it from the record. A straight walk within the grid can't pick up more than its own cells, but the grid has no string-length cap, so I capped the walk at 64 cells a tick. The example's `dash` param (max 4) is far below that.
- **`when`** is the instant `T` of the step that picked the coin, not `state.t` after the step (the same value for a tick part, but `T` is the documented instant).
- **`score`** in the record is the score after the pickup, not before.
- **Tick fallback** `1 / 30`, chosen to match the headless frame rate the docs mention.
- **Diagonals:** I did not forbid them. The control can set `dx` and `dy` both nonzero, and the walk moves diagonally, stopping on the first wall in that direction.
- **Port names** `position`, `elapsed`, `score`, `coinsLeft`, `coin`, and record fields `at`, `when`, `score`; I picked them as what a stranger would read.
- **`init` state**: I added `t: 0` (it was already in the Dialect's `state`).

## 5. Gaps

Smallest first:

1. **A runtime cannot bound its Event max from the Program.** `events.out` is a static number in `defineRuntime`, but the number of coins a step can pick up depends on the Program (its `steps`, its grid). I had to invent a walk cap (64) to make the max true. The docs need a way to say the max depends on the record, or a documented bound the Grammar can supply.
2. **The `controls` name is convention only.** The runtime reads `controls.pad` because `runtime.md` says the page sends the D-pad that way; nothing in the Dialect or Grammar declares it, so a stranger reading the package can't see which control the runtime needs.
3. **No machine-readable anchor for a frame's cell convention.** A frame note is prose; a composer must read "a point is at a cell's centre" and add a half-cell offset themselves through an edge. Expressible through `.frame(a, b, { scale, offset })`, but only with the composer doing the arithmetic.
4. **Not known to work: `extent` and `"fit"`.** The checker doesn't say whether it evaluates `extent`; my `extent` is unverified until the composer uses `"fit"`.

## 6. Answers

**1. What you offered.** Five outputs: `position` (point2@cell), `elapsed` (f64@s), `score`, `coinsLeft`, and the `coin` Event. Left out a velocity rate, the raw control intent, a wall-bump event, a grid, and a `cleared` event; the reasons are in section 2. The `coin` record's fields are `at` (where the coin was), `when` (maze time of the pickup) and `score` (the score after it): a stranger wants position, time and count, and these names say what each is.

**2. Frames.** A stranger knows where a cell is from the frame's note and extent: the origin is the top-left, y goes down, one unit is a cell, and a point is at a cell's centre. That is enough to relate the frame with an edge that has the right scale and offset. What `seams.md` doesn't let me say is the convention in a form the kit can check; a composer must read it and add any half-cell offset by hand, through an edge.

**3. Time.** A stranger's language sees a coin I picked up at the first step of theirs at or after the pickup instant `T`. If their part steps at `T` too, that is the same instant, because within one instant the producer steps first; otherwise it is their next step. `runtime.md` says this, so yes, I could tell from it. I used the kit's `s` in two places: `elapsed: f64@s` and `when: point1@s` on the `coin` record. I did not use `s` for the `dt` in the runtime (that's a number from the clock, not a port).

**4. The runtime.** `runtime.md` left me to guess: how the D-pad is shaped (its `{ up, down, left, right, a, b }` is stated, but whether a missing key is `undefined` or `false` is not — I used `!!`); the state shape (it says a new object, not what to copy — I spread the old one); the Event max (static, no rule for a record-dependent bound); and how to call `control` (the kernel takes the Player and Pad params in slot order; the Player is a plain object whose members I read back — the docs state this, so no guess there). The first checker run before the runtime existed reported G001, as expected. With the runtime in place the checker reported no violations on the first run, so it caught nothing in the runtime itself; it did print each example's coin pickup (`picked at T = 0.125` in `01.js`, `T = 0` in `02.js`), which confirms the pickup event is pushed at the step that takes the coin.

## 7. Files

Opened and read:
- `/private/tmp/KTrmEL-relay/d-maze/task.md`
- `/private/tmp/KTrmEL-relay/d-maze/rules.md`
- `/private/tmp/KTrmEL-relay/d-maze/seams.md`
- `/private/tmp/KTrmEL-relay/d-maze/runtime.md`
- `/private/tmp/KTrmEL-relay/d-maze/packaging.md`
- `/private/tmp/KTrmEL-relay/d-maze/check.sh` (its `cat`; it names an external checker script, which I did not open)
- `/private/tmp/KTrmEL-relay/d-maze/maze/maze.dialect.js` (edited)
- `/private/tmp/KTrmEL-relay/d-maze/maze/maze.grammar.js`
- `/private/tmp/KTrmEL-relay/d-maze/maze/maze.ui.js`
- `/private/tmp/KTrmEL-relay/d-maze/maze/wb-package.json` (edited; then rewritten by `hash.sh`)
- `/private/tmp/KTrmEL-relay/d-maze/maze/examples/01.js`

Created: `maze/maze.runtime.js`, `maze/examples/02.js`, `REPORT.md`.

Ran, not opened: `hash.sh` (`./hash.sh maze`) and `check.sh` (several runs).

Listed but not opened: the `d-maze/` and `maze/` directory listings (including `transcript.jsonl` and `stderr.txt`, which I did not open). A long tool output was saved to a file in my session storage; I did not open that file.

I opened nothing else on this machine and did not search the web.
