# REPORT: bounce author

## 1. Difficulty

3 of 5. The package now checks clean and runs headless, but the Program's own props (`.prop`) needed three coordinated pieces (an extensible struct in `state`, `environment` returning state fields, and `init`/`step` copying them in and out), and I had to infer some record shapes.

## 2. What you did

**Ports (Dialect `ports.out`)**

- `wallHit`: `Event<{ at: point2@box, wall: str, ball: str, t: point1@s }>`. One record each time a ball meets a wall, pushed by the runtime during the step. `at` is the point on that wall where the ball touched it, in the `box` frame. A stranger would want it to react to a wall meeting with a position, and a time, and a name for the ball.
  - `wall` is `str` (`'left' | 'right' | 'top' | 'bottom'`), not an enum. The seam table allows enums in records, but I had no Dialect type to pair with an output, so I kept it a string and wrote the four values in the note.
  - `ball` is the name the Program gave the ball. A stranger can tell balls apart without knowing their index.
  - `t` is the box's time in seconds, as a `point1@s`. A stranger's lambda sees only record fields it is given. The consumer's `$T` is not a Dialect field, so I carried the time as a field too.
- `rebounds`: `f64` from `rebounds` (the running count of wall meetings). Untagged, since it is a count.
- `now`: `point1@s` from `t` (the box's time). A stranger can line up its own instants with the box's.

**Considered and left out**

- An Event input for the box (for example, to kick a ball from outside). Not asked for, and adding it would have meant inventing how an Event input drives the Program's lambdas.
- Per-ball positions as an output (`list<point2@box, 64>`). The seam table allows list types, but the value output's `from` only documents dotted paths, not list indices, so I could not write one without guessing. Left out; see Gaps.
- A value output for a Program's props. A value output's `from` reads only the Dialect's own fields (`runtime.md`, "A Program's own data, in the state"), so there is no way to address a prop. See Gaps.

**Frame**

- `box`, 2-D, in the box's own units. Origin at the top-left, x grows right, y grows down. `extent` is `{ min: [0, 0], max: [record.box.width, record.box.height] }`, so a composer can use `"fit"`.

**State** (Dialect `state`)

- `t` (f64), `box` (struct), `rebounds` (f64), unchanged.
- `balls` is now `list(struct({ name: str, x, y, vx, vy, r, props: struct({}, { extensible: true }) }), 64)`. I added `name`, `vx`, `vy`, `r` so a stranger's record and a state reader have the whole ball. `x` and `y` are kept.
- `environment(program)` returns, beside `objects`, a `state` field per non-builtin `.prop`, so each prop lives at `balls[i].props.<name>`.

**Runtime** (`bounce.runtime.js`)

- `clock`: `{ tick: record.tick ?? 1/30 }`, the same default as the example.
- `init`: `t: 0`, the box, one ball per entry in `record.balls` (by name), each with its props taken from `record.props[n].value`, `rebounds: 0`.
- `step`: for each ball, build one Ball object (built-ins plus props), run `kernels.drift?.(o, dt)`, move by `v * dt`, then for each wall the ball has passed, reflect the center back inside, turn the velocity off that wall (`abs` toward the box for left/top, `-abs` for right/bottom), push `wallHit` at the contact point, and run `kernels.rebound?.(o)`. Then copy the props back out. State time becomes `T + dt`.
- `events.out.wallHit = 256` (64 balls × 4 walls per step).

**Package**

- Version 0.2.0. `entry.runtime` added. `examples/02.js` added, a single ball in a corner, with no tick, using a prop named `hits` and a `g` param. Both examples are listed in the manifest. Hashed with `./hash.sh bounce`.

**Checker result**

- `./check.sh`: no violations (exit 0). Example 01 pushed 7 wallHit records in 4 s, the first at T = 0.7 (blue, bottom). Example 02 pushed 7, the first at T = 0.033 (ember, right).

## 3. Where the docs misled you

Nothing I can quote as wrong. `runtime.md`'s "A Program's own data" section and its `environment(program)` example matched what I needed, including `struct({}, { extensible: true })` inside a `list(...)`. The "Calling the Program's lambdas" section made `kernels.drift` and `kernels.rebound` (once-slots, so aliased by slot name) easy to call.

One place I had to read carefully: `seams.md` says a value output's `from` is "a path (`<path>`, `<path>.<path>`)". That does not say how to reach into a list, which is why I did not try an output of per-ball positions.

## 4. What you guessed

- **Record shapes.** `record.balls` is an object by name, each entry `{ x, y, vx, vy, r }`. `record.props[n]` is `{ value }`. `record.box` is `{ width, height }`. `record.tick` is the number. The checker passing (no N002, moving balls, pushed records) is the only evidence; I did not print `ctx.record`.
- **Kernel calls.** `kernels.drift?.(o, dt)` and `kernels.rebound?.(o)`, using `?.` because both slots are optional in the Grammar. Globals `$` is set by the kit, so I did not set it.
- **Meaning of `state.t`.** I made it the box's time at the end of the step (`T + dt`), so `now` starts at 0 and rises by the tick. A consumer's `$T` on a wallHit is the step's start `T`. These differ by `dt`. A stranger who lines up records by `$T` against `now` will be off by one tick. I did not find a doc rule that picks one, so I chose and documented it in `now`'s note.
- **Contact point.** `at` is the point on the wall the ball touched (`x = 0`, `x = width`, `y = 0`, or `y = height`), with the other coordinate at the ball's center. I did not use the ball's center at impact.
- **Reflection.** A ball's center is mirrored back across the wall's inner line (`2r - x` and the like). If a ball moves more than the box in one step, it can still end outside. I did not add a clamp.
- **Event max.** 256, reasoned from 64 balls and at most four walls each in one step.
- **Name `wallHit`** for the port, to avoid clashing with the state name `rebounds` and the output port `rebounds`.

## 5. Gaps

1. **A Program's props cannot reach the wire.** A value output's `from` reads only the Dialect's own fields (`runtime.md`, "A Program's own data, in the state"), and the props live in `balls[i].props.<name>` inside an extensible struct. A stranger cannot read them at all. The fix would be a way to address a prop by name from the Dialect, which the kit does not give me, so I did not invent one.
2. **No way to output a list of positions.** `seams.md` gives `list<T, max>` as a seam type, but says nothing about addressing an element of a state list from `from`. A per-ball position output (`list<point2@box, 64>`) would need that. I could not write it from the docs.
3. **No way for an example to exercise a port.** A Program has no wiring, so an example cannot show `wallHit` being used. I added `examples/02.js` that uses the Program's own features (a prop, a param, no tick), but no example shows an output.
4. **Time convention in the docs.** `runtime.md` gives `ctx.T` and `$T` but not how a state's time should relate to them. I had to choose `T + dt` for state and say so in the note.
5. **No `reference.md` in my view.** `packaging.md` says the kit generates a reference of ports and frames for a composer. I could not check the Event max or port listing as a composer would see it.

## 6. Answers

**1. What you offered.** I added `wallHit` (an Event, one record per wall meeting, with the contact point in `box`, the wall name, the ball's name, and the box time), `rebounds` (a running count), and `now` (the box time), with one frame, `box`. I left out an Event input, positions as a list output, and a prop output. The reasons are in section 2 and Gaps. The `wallHit` fields are named after what they carry: `at` is where, `wall` is which side, `ball` is who, `t` is when.

**2. The Program's own data.** A ball's props live in `state.balls[i].props.<name>`, a field of the extensible struct `props`. `environment(program)` adds a state field for each `.prop` and a `Ball` member for the lambdas. `init` fills each ball's props from `record.props`, and `step` copies them into the Ball object, runs the lambdas, and copies them back out. I worked this out from `runtime.md`'s "A Program's own data, in the state" section, and that section was enough. A stranger can read them in the run's state, but not through any port (see Gaps 1).

**3. Frames and time.** A stranger finds where a point in my box is by reading the `box` frame's note (origin top-left, x right, y down, box units) and its extent (`0..width`, `0..height`), then relating it to its own frame with `.frame(..., "fit")` or an explicit edge. A stranger's language sees a rebound at the first step at or after the push instant. The push instant is the step's start `T`, and the record's `t` field is `T + dt`, the box's time at the end of that step. A consumer that steps at the same instant (a shared tick) sees the record at that instant; a consumer on another tick sees it at its next step.

**4. The runtime.** `runtime.md` left me to guess: the exact shape of `record.balls`, `record.props` and `record.box` (I inferred from the Grammar and the checker's acceptance); the `?.` on optional kernels; the state's time convention; the contact point of a wall meeting; the Event max; and whether reflection needs a clamp (I did not add one). The checker's run caught nothing: the first run after hashing returned no violations, and both examples pushed records. I did not see any N-code, so I cannot report a catch.

## 7. Files

Opened and read:

- `/private/tmp/UTdvE6-relay/f-bounce/seams.md`
- `/private/tmp/UTdvE6-relay/f-bounce/runtime.md`
- `/private/tmp/UTdvE6-relay/f-bounce/rules.md`
- `/private/tmp/UTdvE6-relay/f-bounce/task.md`
- `/private/tmp/UTdvE6-relay/f-bounce/packaging.md`
- `/private/tmp/UTdvE6-relay/f-bounce/bounce/wb-package.json`
- `/private/tmp/UTdvE6-relay/f-bounce/bounce/bounce.dialect.js`
- `/private/tmp/UTdvE6-relay/f-bounce/bounce/bounce.grammar.js`
- `/private/tmp/UTdvE6-relay/f-bounce/bounce/bounce.ui.js`
- `/private/tmp/UTdvE6-relay/f-bounce/bounce/examples/01.js`

Written: `bounce/bounce.dialect.js`, `bounce/bounce.runtime.js` (new), `bounce/examples/02.js` (new), `bounce/wb-package.json` (hash tool), and `REPORT.md`.

Ran: `./check.sh` and `./hash.sh bounce`. Neither was opened.

The folder listing (`ls`) showed the names `transcript.jsonl` and `stderr.txt` at the top level. I did not open them. I did not open anything outside `/private/tmp/UTdvE6-relay/f-bounce`, and did not search the web.
