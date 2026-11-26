# REPORT: maze author

## 1. Difficulty

3 of 5. The docs were enough to write a working runtime and pass the checker, but several things about Event records and what a runtime is handed had to be guessed, and the Event timing question is only half-answered by the design (see Gaps).

## 2. What you did

**Package:** `maze/`, version `0.1.0` → `0.2.0`, `entry.runtime` set to `maze.runtime.js`, `examples` lists `examples/01.js` and the new `examples/02.js`. Hashed with `./hash.sh maze`. `./check.sh` reports no violations for `maze/`.

**Frame `cell`** (dims 2). Note: x counts columns from the left, y rows from the top, one unit is one cell, cell centers are whole numbers, (0, 0) is the top-left cell. `extent` is `min [-0.5, -0.5]`, `max [columns - 0.5, rows - 0.5]`, computed from `record.grid`. A stranger can use `.frame(..., "fit")` against a box, or a negative-scale edge if their y points up. Why: a stranger's pickup or player position has to say which cell it means, and a y-down grid is the thing most likely to be misread.

**Outputs added:**
- `pickup`: `Event<{ at: point2@cell, left: f64, when: point1@s }>`. One record per coin the player walks onto. `at` is the coin's cell, `left` the coins still on the grid after it, `when` the instant of the step that took it. Pushed from the runtime. Why these names: `at` says where something happened, `left` lets a consumer detect the last coin without counting, and `when` is the instant (a stranger's Event consumer needs it, see Gaps).
- `where`: `point2@cell`, `from: (s) => [s.player.x, s.player.y]`. The player's cell after each step. Why: a stranger can place a sprite or a light on the player.
- `coinsLeft`: `f64`, `from: "coinsLeft"`. Why: a signal a stranger can react to (e.g. "all coins" lights) without listening for events.

**Considered and left out:** a per-step "walked" event (too chatty, and a stranger would need the same instant detail); a bump event on walls (no clear use for a stranger); score as an output (it is `count of pickups`, derivable from `pickup`); the grid itself (the seam kit has no way to pass a grid, so this is a gap, not a choice).

**Runtime** (`maze.runtime.js`):
- `clock`: `{ tick: record.tick ?? 1/8 }`.
- `init`: `t 0`, `score 0`, `coinsLeft` counted from the grid's `c`s, `player` from `record.start`, `grid` copied.
- `step`: builds a fresh `{x, y, dx, dy, steps}` for `control`, calls `kernels.control(pl, pad)`, then walks `min(4, floor(steps))` cells one at a time with `Math.sign` of `dx`/`dy`. It stops at `#`, at the grid's edge, or at an undefined row/column. Each `c` entered becomes `.`, decrements `coinsLeft`, increments `score`, and pushes `pickup` with `when: T`. Returns a new state.
- `events: { out: { pickup: 4 } }`. The 4 is the dash param's max; `steps` is clamped to 4, so one step can take at most 4 coins.

**Example `02.js`:** a longer corridor with coins down side passages, `dash` param, `tick 1/10`. Uses the same control shape as `01.js`.

## 3. Where the docs misled you

- `seams.md`, the Dialect's `ports` example: `pickup` (my Event) has `seam` only, and `seams.md` says the Dialect's own type must match a seam type, but never says what the Dialect type of an **Event record** is or whether `at: point2@cell` needs a `vector(2, "f64")` type declared anywhere. I wrote no such type and the checker accepted it. I read the Event's shape from the seam string alone, so this is not checked by me. I tried importing `vector` and removed it because nothing used it.
- `runtime.md`'s `clock` example uses `{ tick: 1 / record.tempo }`, which reads as if `record.<key>` is always there. The maze's `tick` is optional in its Grammar, and `runtime.md` gives no default. I had to pick one.
- `runtime.md`: "a record pushed at instant T reaches the input's part at its first step at or after T". This is the rule, but it does not say whether the consumer can see T. Read literally, it cannot.

## 4. What you guessed

- **Record key names:** `record.grid`, `record.start`, `record.tick`, from the Grammar's slot names. The checker ran them, so they work here.
- **`tick` absent:** 1/8 (the period of the example I was given).
- **`ctx.controls.pad`:** merged over an all-false pad object (`{ ...NO_PAD, ...controls.pad }`), so the first steps before any press are safe.
- **Vector fields in pushed records:** arrays (`at: [x, y]`), matching the kernel convention. Not stated for records.
- **Walls and the edge:** only `#` is a wall. Anything outside the grid stops the walk.
- **Diagonals:** allowed if `control` sets both `dx` and `dy`; the docs don't forbid it.
- **Start cell:** a coin under the start is not taken (no step has entered it). No example has one.
- **Event max:** 4, the dash max. The docs say a whole number ≥ 1 but not how to choose it.
- **`when`:** I used `T` from `ctx` as the instant. `state.t` (my own accumulator) would give the same value here.
- **State `t`:** kept as untagged `f64`. Not in any seam, so a stranger never sees it.

## 5. Gaps

Smallest first.

1. **Event records carry no instant.** A consumer receives records "before each of your steps" with no time. I had to add `when: point1@s` to `pickup` myself, and set it from `T`. That is a workaround for a gap in the kit: a stranger can't tell when a record happened unless the producer writes it into the record.
2. **Event record types are not described.** Nothing in the docs says how an Event record's fields are checked against the Dialect, or what runtime form a vector field takes in a pushed record. I used arrays.
3. **No default for an optional Grammar `tick`.** The runtime clock needs a number; the docs give no default for a missing one. I invented 1/8.
4. **No way to output a grid or board.** `seams.md` says grids and images don't exist. A stranger wanting the maze's layout can only get it cell by cell, through `pickup`, which covers only coins. The board's walls never leave the package.
5. **`ctx.controls` is undocumented when absent.** `runtime.md` says `controls.<name>` is "absent until the first one arrives", but not whether `ctx.controls` itself is always an object. I wrote `controls.pad` without a guard on `controls`.
6. **Lambda style is "as a UI value lambda is".** `seams.md` says `from` lambdas are written "as a UI value lambda is", but the UI doc is not in my kit. I wrote `(s) => [s.player.x, s.player.y]`, which the checker accepted.

## 6. Answers

**1. What you offered.** The `pickup` Event, plus `where` and `coinsLeft` as signals. I considered and left out a per-step walk event, a wall-bump event, score (derivable from `pickup`) and the grid (a gap). The field names are `at`, `left` and `when`, because they say what a stranger reads them for: where, how many remain, and when.

**2. Frames.** A stranger can tell where a cell is from the frame's note alone: which way x and y point, where the origin is, and what a unit is. The `extent` tells them the box. What the seam language says is enough to pair my frame with their own, through a `"fit"` or an edge. Not enough: the kit can't say the frame is a discrete grid, so a stranger can't tell from the frame whether `2.5` is a cell or a half-cell. Only the note says it.

**3. Time.** A stranger's language sees a coin I picked up in the same instant T, if their part steps at T after the maze in wire order; otherwise at their own next step at or after T. That is in `runtime.md`, so yes, it can be worked out. But the record itself doesn't say T, so a consumer that gets it later can't recover the step. I did not use the kit's `s` at first. I now do, in `when: point1@s`, set from `T`. The coin-taking step is the one that sets `when`, so the `when` on each record is the instant of the step that took the coin, not of its delivery.

**4. The runtime.** The docs covered the D-pad (`controls.pad`, and its six booleans), the state shape and `init`, and calling `control` as `kernels.control(pl, pad)`. They left open: the `tick` default, the Event max (I chose 4), how records carry vectors, and the record key names, which I took from the Grammar. The checker's run caught nothing: the first run passed, and both runs showed a coin picked at the expected instant (T = 0.125 in `01.js`, T = 0 in `02.js`, pickup with `left` 3 and 6). My own choice of `state.t` where `T` is provided was caught by reading, not by the checker.

## 7. Files

Opened and read: `task.md`, `seams.md`, `runtime.md`, `rules.md`, `packaging.md`, `maze/maze.dialect.js`, `maze/maze.grammar.js`, `maze/maze.ui.js`, `maze/examples/01.js`, `maze/wb-package.json`. Listed `maze/` with Glob.

Wrote: `maze/maze.runtime.js` (new), `maze/examples/02.js` (new), `REPORT.md`.

Changed: `maze/maze.dialect.js`, `maze/wb-package.json` (version, `entry.runtime`, `examples`, hashes via `./hash.sh maze`; the manifest was edited with a short inline script that only rewrote that file).

Ran `./check.sh` and `./hash.sh` (did not open either). I opened nothing else on this machine.
