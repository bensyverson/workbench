# Report: maze author

## 1. Difficulty

**2 of 5.** `seams.md` and `runtime.md` covered ports, the frame and the runtime well enough to pass the checker on its first run; the thought went into things they leave open, mainly a fixed Event max against a walking distance the Program chooses at run time.

## 2. What you did

Version 0.1.0 became 0.2.0. Nothing was removed or renamed.

**Frame `cell`** (2-D): x right, y down, one unit per cell, integer coordinates at cell centers. `extent` is the grid's box, from `-0.5` to width/height `- 0.5` (width is the longest row). Integer centers mean the run's `state.player` is already a position in the frame.

**Event outputs** (a stranger reacts to these):

| Port | Record | Max per tick |
|---|---|---|
| `pickup` | `pos: point2@cell, vel: vec2@cell/s, score: f64, left: f64` | 4 |
| `move` | `pos, from: point2@cell, vel: vec2@cell/s` | 4 |
| `bump` | `pos, wall: point2@cell` | 1 |
| `finish` | `pos: point2@cell, score: f64` | 1 |

**Signals:** `player` (point2@cell, for a camera or light to follow), `velocity` (vec2@cell/s), `score`, `coinsLeft` (for a scoreboard), `done` (bool, for gating something), `cellSize` (f64@cell, always 1, so a stranger can size an effect to a cell without converting by hand).

**Runtime** (`maze.runtime.js`):
- Ticks every `.tick()` seconds.
- Reads `controls.pad`, calls `control`, and walks one cell at a time up to the intent.
- Stops at walls and the grid's edge, turns each `c` it enters into `.`, and pushes the records.

**State:** I added `velocity`, which the `velocity` output reads.

**Other:** `examples/02.js` is a small loop that can be cleared, with a dash of 3. I added a comment on `Player.steps` saying at most 4.

**Tested:** `check.sh` passes. It exercises only walking to a coin, so I also ran the step function with a stubbed `defineRuntime` in a scratch folder (since deleted). That covered bump, a diagonal, a dash into a wall, a non-numeric `steps`, finish and the grid's edge, all as intended. It did not test the real kit's handling of `bump` or `finish`, the frame's `extent`, any signal output, or any wire.

## 3. Where the docs misled you

Nothing led me to a wrong result. One passage made me expect extra work: "At each port the kit checks that your Dialect's own type has the seam type's shape". I read it as possibly requiring declared `vector` and `struct` types for `point2` ports and Event records. My Dialect declares no vector type and no record struct for them, and it was accepted. The text does not say whether "your own type" must exist when nothing in the Dialect's lambdas uses the value.

## 4. What you guessed

- **Shape of `record`:** `record.grid` is the string array, `record.start` is `{ x, y }`, `record.tick` is a number or absent. No doc says how a slot's `data(...)` argument appears in the built record. The run bore out `grid`, `start` and `tick` (both examples write `tick`).
- **Default tick:** 1/8 s when `.tick()` is not written (not exercised).
- **Intent lifetime:** `dx`, `dy` and `steps` start at 0 each tick and are not carried over.
- **Odd intent values:** `dx` and `dy` are reduced to their sign. `steps` is floored. Anything below 1 or non-numeric means stand still.
- **Cap:** at most 4 cells per tick (the example's `dash` max), whatever `control` asks.
- **Diagonals:** each cell step goes along x if open, else along y. No corner cutting.
- **Bump:** pushed on every tick the player pushes into a wall, not only the first. A dash that ends against a wall gives moves and a bump in the same tick.
- **Starting cell:** a coin under the start is not picked up until the player leaves and comes back. An invalid start (in a wall or off the grid) is not refused.
- **`state.t`:** the instant of the last step (`T`), not `T + dt`.
- **`finish`:** a maze with no coins never pushes it, though `done` is true.
- **`velocity`:** net displacement over the tick divided by `dt`, including on the first step at T = 0, where `dt` is the period.
- **D-pad:** `controls.pad` as described, with each button read as false unless it is `true`.

## 5. Gaps

Smallest first.

1. **The D-pad's name is only a host habit.** `runtime.md` says "nothing in the kit links it to your UI's `inputs`". My runtime hard-codes `pad` because "In this workbench the page sends a D-pad as `controls.pad`".
2. **No limit on an intent member.** The Dialect cannot say `steps` is a whole number from 0 to 4, so a Program asking for more is silently cut short.
3. **Event maxes cannot depend on the record or params.** The max is one constant, and S116 makes a generous one costly for consumers. So I capped the language instead of declaring a large number.
4. **A frame cannot say which way its axes point.** "y runs down" is only prose in the `note`. A composer has to notice it and write a negative scale. `seams.md` does not say whether `"fit"` could ever flip an axis; as I read it, it cannot know to, so a y-up consumer would be mirrored.
5. **No way to offer the level itself.** Walls cannot cross ("no way to ... pass grids"). The remaining coins' positions would need a `list` with a fixed max, and a grid's coin count has no useful bound. A lighting effect or camera can't know where the walls or unpicked coins are.

## 6. Answers

**What you offered.** The outputs are in section 2. Events are for moments (coin, footstep, wall, level cleared) and signals are for things that persist (where the player is, how fast, the counts).

I considered and left out:
- walls and remaining coin positions (gap 5);
- the held buttons, which are the host's input and not something that happens in the maze;
- the tick length, which `from` can't read because it is in the record, not the state;
- a `moving` bool, which a wire couldn't derive from `velocity` but `move` events mostly cover;
- the maze's size as a signal, which the frame's `extent` already gives;
- a timestamp on records;
- any inputs, which the task did not ask for.

Field names:
- `pos` is always "where it happened", the name `seams.md`'s input example uses, and it is the same on every record so one rename habit works.
- `from` is where a move began.
- `wall` is the blocked cell.
- `vel` is a rate, short and conventional for an effect that inherits motion.
- `score` is the running total.
- `left` is the coins remaining (the signal is `coinsLeft`, after the state).

A consumer that wants other names renames on the wire, and extra fields are dropped, so carrying a few is cheap.

**Frames.** A stranger learns where a cell is from the `note` (axes, origin, unit, and that `[c, r]` is the cell's center) and from `extent`, which gives the whole grid's box. A composer then relates `cell` to another frame with `{ scale, offset }` or `"fit"`.

That is enough for a person, but not quite for the machine:
- axis direction and the center convention are prose only;
- there is no way to say cells must stay square, though `"fit"` happens to use one scale, and a per-axis edge would make `cellSize` fail with S254;
- the extent changes with each Program, so a hand-written edge that suits one maze won't suit another, while `"fit"` does.

**Time.** A record is pushed by the step at instant T that walks onto the coin. By `runtime.md`'s "Time" section, a stranger's part gets it at its first step at or after T:
- at T itself if it also steps then, since the producer goes first in wire order;
- otherwise at its next step.

For a 60 Hz frame part and a tick of 1/8, every other maze tick lands on a frame. The others wait 1/120 s. A demand part steps when the Event arrives. A value input reading `player` at T sees the position after the whole walk, so after a dash it differs from the `pos` of an earlier pickup. Use the record, not the signal, for "where".

I could tell all this from `runtime.md`. What I could not tell is what `delay: true` means for an Event wire: `seams.md` describes it in terms of what "the output held", and an Event output holds nothing.

I did use `s`, in `vel` and `velocity` (`vec2@cell/s`). I did not add a `when: point1@s` to records. Delivery is at the consumer's first step after the event, which seemed close enough, though a slow consumer receiving several ticks' records at once cannot tell them apart in time.

**The runtime.**
- **D-pad:** the doc gives the name and the six booleans, and says to use a fallback. Clear.
- **State:** the Dialect's `state` and its comments gave the shape. The meaning of `t` and the shape of `record` I had to guess.
- **Event max:** the meaning is clear. Choosing the number was the real decision, because nothing in the language bounds `steps`.
- **Calling `control`:** "a kernel takes its slot convention's params, in order" and "an instance param is a plain object you make" were enough. I passed `{ x, y, dx, dy, steps }` and a plain pad object, and `$` was set by the kit.

The checker's run caught nothing: it passed the first time and again after the `cellSize` addition. It reported a pickup with matching `pickup` and `move` records in both examples.

## 7. Files

Opened, all under `/private/tmp/WnmLua-relay/a-maze`:
- `seams.md`, `runtime.md`, `packaging.md`, `rules.md`, `task.md`
- `check.sh`, `hash.sh` (read and run)
- `maze/wb-package.json`, `maze/maze.dialect.js`, `maze/maze.grammar.js`, `maze/maze.ui.js`, `maze/examples/01.js`
- the files I wrote: `maze/maze.runtime.js`, `maze/examples/02.js`, `REPORT.md`, and a temporary `scratch/` copy of the runtime with a test script, deleted afterwards

I opened nothing else and did not search the web. A directory listing showed `stderr.txt` and `transcript.jsonl`; I did not open them. A global `CLAUDE.md` was supplied in my context by the harness; it did not bear on this task.
