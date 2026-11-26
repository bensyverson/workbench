# REPORT: maze author

## Difficulty

2. Ports and frames for a grid were simple to write from `seams.md`; the hard parts were choices the draft leaves open (what an Event record should hold, whether to tag time, how a stranger maps cells into their own space).

## What you did

Package `maze` 0.1.0 → 0.2.0 (it only adds). Everything new is in `maze.dialect.js`, plus `examples/02.js`.

**Types and state.** I added `types: { cell2: vector(2, "f64") }`. To the run's state I added `player.at: cell2` (next to the existing `player.x`/`player.y`, which `text()` still reads), and three event lists: `picked` (max 8), `bumped` (max 8) and `cleared` (max 1). Each is a `list(struct({ at: "cell2" }))`. Comments at `state` say how the host fills each one and that it empties them at the start of every tick.

**Frames**
- `cell` (dims 2): grid cells, x right, y down, (0, 0) at the center of the top-left cell. It has an `extent` from the built grid, so a composer can write `"fit"` against any frame that has an extent. This is the frame a stranger needs to place anything (a light, a sound pan, a camera target) where something happened in the maze.
- `sec` (dims 1): seconds of run time, so the time output says its unit and can be related to someone else's time unit.

**Outputs**
- `picked`: `Event<{ at: point2@cell }>`, one record per coin picked up this tick, at the coin's cell. It's the main thing to react to (a chime, a burst, a score pop).
- `bumped`: `Event<{ at: point2@cell }>`, one record when the player walks into a wall, at the wall's cell (a thud, a screen shake, a spark on the wall).
- `cleared`: `Event<{ at: point2@cell }>`, once per run, when the last coin goes (a fanfare, a "level done" banner).
- `player`: `point2@cell`, the player's cell after each tick (a camera to follow, a light that moves with the player).
- `score`, `coinsLeft`: `f64`, untagged counts (a scoreboard).
- `t`: `f64@sec`, run time (to sync a timeline or a sound).

**Example.** `examples/02.js` is a corridor with a coin at each end and walls on both sides, so walking it exercises `picked`, `bumped` and `cleared`.

## Where the draft misled you

- The outputs example uses `player: struct({ at: "cell2" })` and `from: (s) => s.player.at`. My state had `player: struct({ x: "f64", y: "f64" })`, two scalars with no vector, and nothing showed me how to turn those into a `point2@cell`. "a lambda `(s) => …` written as a UI value lambda is" doesn't say whether a lambda can *construct* a vector (for example `[s.player.x, s.player.y]`). So I added a redundant `player.at` to state and used a path. Two fields now hold the same numbers, and the host must keep them in step.
- `extent: (record) => … record.grid …` takes for granted that "record" is the built Program and that its `grid` field is named after the Grammar's slot. My Grammar's slot is also called `grid`, so I copied the example as written. Nothing defines "record".

## What you guessed

- **Lambda vs path for `player`**: I used a path to a new state field. I didn't trust a lambda to build a vector.
- **What an Event's `at` is**: for `picked`, the coin's cell. For `bumped`, the wall's cell, not the player's. For `cleared`, the last coin's cell. I had to have a field: I didn't know whether `Event<{}>` (an empty record) is allowed, and `cleared` has no natural payload.
- **List maxima**: 8 for `picked`/`bumped`, because a tick walks at most `steps` cells and the example's dash is at most 4. Nothing in the Grammar bounds `steps` itself, so a Program could in principle pick up more than 8 in one tick. I didn't say what the host does then (drop the extras?). The draft says the max "bounds one step's events" but not what happens on overflow.
- **"step" = my "tick"**: the draft's step is the maze's tick. I said "tick" in the notes, because that's what the maze's own docs and Grammar (`.tick`) say.
- **Tagging time**: I declared a `sec` frame and tagged `t` as `f64@sec`. Left untagged, it could only feed untagged inputs. The cost is that a composer must now write a `.frame` to send it to anyone else's seconds. No shared "seconds" exists.
- **Counts untagged**: `score` and `coinsLeft` are plain `f64`. They are counts, not measurements in a frame.
- **Notes on untagged ports**: they aren't required, but I wrote them anyway.
- **Frame names**: `cell` and `sec`. My own choice, local to the package.
- **No edges**: the maze has no pixel or world space of its own (its stage is a text view), so I declared no `edges`.
- **Where `types` goes**: I put it at the top level of `defineDialect`, as in the `seams.md` snippet. The original Dialect had no `types` key.

## Gaps

1. **Overflow of an Event list**: nothing says what happens when a step produces more records than the list's max, or how an author should state it.
2. **Empty Event records**: the draft doesn't say whether `Event<{}>` is allowed, so a pure "it happened" signal (`cleared`) has to carry an invented field.
3. **Building a point from scalars**: there's no stated way for an output lambda to make a `point2` from two `f64` state fields. Authors with `x`/`y` state must duplicate it.
4. **A cell's size or a "rect" kind**: I can offer a cell's center as a point, but not its box. A stranger who wants to draw or light a whole cell has to know that a cell spans ±0.5. That is only in a note, and they can't get it through a wire. A quantity output like `cellSize: f64@cell` (always 1) would be a workaround, so I left it out.
5. **Shared units**: frames of different packages are always unrelated, even a plain unit like seconds. Every composer must restate "1 s = 1 s" in glue.
6. **Grids can't cross a wire** (stated in `seams.md`'s "What does not exist yet"). A minimap, a lighting effect that wants the wall layout, or a sound language that wants to know about open space can't get the maze's layout. Only events and the player's point cross.
7. **No "input" side for the maze**: nothing in this task needed one. But a stranger couldn't, for example, add a coin or open a door without the maze declaring an input, and I didn't add any (the task asks for outputs).

## Answers

**1. What I offered.** I offered three events: `picked` (a coin taken, at its cell), `bumped` (a wall hit, at the wall's cell) and `cleared` (the last coin, once). I also offered three signals: the player's cell as a point, the score and coins-left counts, and run time in seconds. These are what a sound, lighting, scoreboard or camera language would want to react to or follow. I considered several more and left them out:
- a `moved` event on every step. It's redundant with the `player` signal and noisy.
- a `pad`/intent output, the D-pad state or the player's `dx`/`dy` as an untagged `vec2`. The pad belongs to the input UI, and intent is internal to `control`.
- the player's velocity as a `vec2@cell`. The player jumps a cell at a time, so a velocity would mislead.
- the coin positions as a list. I could have offered `list<point2@cell, N>`, but "coins remaining" changes shape, and the draft has no way to pass the grid itself.
- a `cellSize` quantity (see Gaps).

**2. Frames.** A stranger learns where a cell is from the `cell` frame's note (x right, y down, origin at the top-left cell's center, one unit per cell, edges at ±0.5) and from its `extent`. With `"fit"`, the composer doesn't need to know the grid size: the kit maps the maze's box into theirs. That's enough for "put the burst where the coin was" as long as the other frame has an extent and the same axis directions. It isn't enough in some cases:
- If the other space is y-up, the composer must work out the flip by hand and write an explicit edge (with a negative scale). `"fit"` uses one positive scale, so it can't flip.
- If they want a frame that is the maze's size but not fitted, they must read the grid's size from the Program themselves.
- Only a cell's center crosses the wire, not its box.
- Directions are said only in prose notes. The kit can't check that two frames agree on which way is down.

**3. The host.** After each tick the host must now also write `player.at` (the same numbers as `player.x`/`player.y`). It must empty `picked`, `bumped` and `cleared` at the start of each tick, and append a record each time a coin is picked up, a wall is walked into, or the last coin goes, at the right cell. `seams.md` makes the general contract clear: an Event output is a state list the host refills each step and empties at the start of the next, and outputs are read from the state committed after each step. It doesn't say what to do on overflow, or whether an event is also allowed on the step the run starts. Nor does it say how a host knows its outputs are being read at all (it must fill them regardless). Since this maze's host is described only in prose, all of this is comments. Nothing checks that a host actually fills the lists.

## Files

I opened `seams.md`, `rules.md`, `task.md` and `packaging.md`. I opened `check.sh` and `hash.sh`, and ran both. In `maze/` I opened `wb-package.json`, `maze.dialect.js`, `maze.grammar.js`, `maze.ui.js` and `examples/01.js`, and wrote `examples/02.js`. I listed the folder, so I saw that `transcript.jsonl` and `stderr.txt` exist, but I didn't open them. I opened nothing else, either here or elsewhere on the machine. (`check.sh` and `hash.sh` run scripts outside this folder; I didn't open those scripts.)
