# Report: the bounce author

## Difficulty

2: ports, frames, state and runtime follow closely from the docs; the one failure was a vector type in `state`, which needs a Dialect key the docs never mention.

## What you did

Version 0.1.0 → 0.2.0, added `bounce.runtime.js` and `examples/02.js`, rehashed. `check.sh` reports no violations (7 `hit` records in 4 s for example 01, 19 for example 02). The UI, Grammar and example 01 are unchanged.

**Frames**
- `box` (2-D): origin top-left, x right, y down, box units; extent from the Program's box. For anyone placing something where things happen in the box, and it supports `"fit"`.
- `across`, `down` (1-D): each axis alone, same units, each with an extent. For a stranger with only a one-dimensional space (a position along a line, a pan, a level), who could not relate it to a 2-D frame. `down` grows downward, and its note says so.

**Outputs**
- `hit` (Event): `at` (point on the wall), `x`, `y` (the same point per axis), `wall` (enum), `impact` (speed into the wall), `velocity` (after the rebound), `radius`, `ball` (name). Position says where, `impact` how hard, `wall` and `ball` which one, `radius` how big.
- `balls` (list of up to 64 `{ ball, at, velocity, radius }`): for a stranger that follows every ball.
- `center` (point2), `centerX`, `centerY` (point1): one position to follow, for a consumer that takes a single point.
- `meanSpeed` (`f64@box/s`): a continuous "how lively" level.
- `rebounds` (`f64`): a running count to display or score.

**State.** Each ball now holds `name, x, y, vx, vy, r, own`. `marks`, `middle` and `meanSpeed` are derived after each step so the value outputs have something to read. `t`, `box`, `balls[].x/y` and `rebounds` keep their meaning.

**Runtime.** Tick is `record.tick`, else 1/30. Per ball: `drift`, move, find the walls met (touching or past, and moving into it), mirror the overshoot back inside and clamp, turn the velocity off every wall met, then for each wall run `rebound`, count it and push a record. A corner gives two rebounds and two records. `events.out.hit` is 128 (64 balls × 2).

**Example 02** ("pinger"): no gravity, four balls, a `hits` prop, a param, and `Math.sqrt`/`max`/`min` in `rebound`. A Program cannot refer to ports, so what it "uses" is the new runtime and `hit` behaviour.

No inputs were added: the task asked for outputs and frames.

## Where the docs misled you

- `seams.md`, "Pairing with your own types": "`point2@frame`, `vec2@frame`, … | a `vector(2, "f64")` type". `runtime.md`'s state snippet writes types inline (`state: { <path1>: "f64", … }`). I wrote `at: vector(2, "f64")` in a state struct and was refused: "D023 … vector() makes a vector type, which is declared in types and then named. fix: declare it in types". None of `seams.md`, `runtime.md` or `packaging.md` mentions a `types` key. The diagnostic's fix was enough to go on (`types: { vec2: vector(2, "f64") }`). Its example says `"f32"`, while this package is `f64`.
- `seams.md`, on value inputs: "if you have several, say which with `type: "<type>"`" hints that types are declared somewhere, but not where.

## What you guessed

- `types: { vec2: … }` as the Dialect key, taken from the diagnostic rather than the docs.
- That a state list of structs with a `str` field and vector fields can feed a `list<record, 64>` output through `from: "marks"`. The check accepts the declaration; no consumer has read the values.
- That a named `data({ value })` declaration appears as `record.props.<name>.value`, and `box` as `record.box.{width,height}`.
- That `Math`, a Dialect global, is mine to set (`globals.Math = Math`). `runtime.md` says the kit sets `$` and the inputs object and "You set the others".
- The default tick, 1/30. `runtime.md` says the language writes the fallback.
- What "meets a wall" means, including corners, overshoot, and the order of turning, moving and `rebound`.
- The record's point is on the wall, not the ball's center.
- `impact` is the speed along the wall's normal on arrival (after `drift`); `velocity` is after that wall's `rebound`.
- `rebound` may change the velocity however it likes, including back into the wall. I don't override it; the position stays clamped inside.
- A resting ball keeps rebounding every tick. From reading the code (I did not observe it in a run), a ball under gravity that has settled on the floor will push a small-`impact` record each step. I added no threshold, and the port's note warns of it.
- A `f64@box` quantity and a `f64@box/s` rate in a 2-D frame are fine.
- Non-finite velocities from a lambda are not guarded against.

## Gaps

Smallest first.

1. **`types` is undocumented** (above).
2. **No way to see my own run.** The checker prints only the first `hit` per example. I could not inspect state, prop values over time or the value outputs. That props persist rests on the code and on the check raising no N002/N003.
3. **No way to relate `box` to `across`/`down`.** Edges join frames of equal dims only and cannot pick an axis, so `hit` carries the same point three ways (`at`, `x`, `y`) and the center needs three ports.
4. **Event max is one static number.** It must be 128 for the 64-ball worst case, even for a three-ball Program, which could emit at most 6. A consumer with a small max will get S116 and need `overflow`.
5. **No filtering on a wire.** A stranger cannot take only left-wall hits, or only hits above some `impact`, unless their own lambdas can read the record and ignore it.
6. **A Program's props can't be offered.** Ports are fixed in the Dialect, while props are declared per Program. `knocks` cannot appear in `hit` or `balls`.

## Answers

**1. What you offered.** `hit`, `balls`, `center`, `centerX`, `centerY`, `meanSpeed` and `rebounds`, with the reasons above. I left out:
- per-ball props (no way to declare them);
- time (seconds are the kit's);
- box size (it is the frames' extent);
- a wall normal (`wall` says it);
- per-wall Event ports (they would split one stream, and an input takes only one wire);
- ball-to-ball collisions (the language has none);
- ball count (the length of `balls`, though a stranger cannot compute that on a wire);
- total energy (there is no mass).

Field names are plain words for what the value is: `at` for a position, as distinct from the per-axis `x` and `y`; `velocity` and `radius` spelled out; `impact` rather than `speed`, because it is only the component into the wall; `ball` for the name, which reads better than `name` once it arrives in someone else's record. A wire can rename any of them.

**2. The Program's own data.** In `state.balls[i].own.<prop>`, one extensible struct per ball. `environment(program)` returns a `state` field per prop beside the lambda-visible member. `init` fills it from `record.props.<n>.value`; each step spreads `own` into the object handed to the lambdas and copies it back. `runtime.md`'s "A Program's own data, in the state" was enough for this. A stranger can see them in the raw state but cannot read them through any port, and `runtime.md` says UI paths and output `from`s read only the Dialect's own fields.

**3. Frames and time.** The frames' notes give origin, directions and unit, and all three have extents, so a composer can write `.frame(<bounce part>.frame.box, <other part>.frame.<theirs>, "fit")` or give an explicit edge (with a negative scale if their y points up). The wire then converts points, velocities and radii. A one-dimensional consumer relates `across` or `down` instead. On time: a `hit` is pushed at the instant of the step that made it, and by `runtime.md` reaches the consumer at its first step at or after that instant (the same instant if both step then, since the producer goes first), carrying `$T`. The rebound itself happened somewhere within the preceding tick; the record does not say exactly when, and its time is the tick's.

**4. The runtime.** Calling lambdas was clear: `kernels.drift` and `kernels.rebound`, `undefined` when not written, with a plain object as the ball that the kernel changes in place. Left to me: building that object (built-ins and props side by side), whether to set `Math`, the physics of meeting a wall, the order around `rebound`, and the default tick. The Event max was easy to derive but has to assume the worst case. State was clear except for vector types. The checker's run caught only the D023 `types` error, at load; no run (N) or G code appeared after that. The corner-hit ordering I fixed afterwards came from rereading my code, not from the checker.

## Files

Opened, all under `/private/tmp/UTdvE6-relay/e-bounce`: `seams.md`, `runtime.md`, `rules.md`, `task.md`, `packaging.md`, and in `bounce/`: `wb-package.json`, `bounce.dialect.js`, `bounce.grammar.js`, `bounce.ui.js`, `examples/01.js`. Written: `bounce.dialect.js`, `bounce.runtime.js`, `examples/02.js`, `wb-package.json`, `REPORT.md`, and a temporary edit script in the work folder, since deleted.

`check.sh` and `hash.sh` were run, not read. A directory listing showed `stderr.txt` and `transcript.jsonl`; I opened neither. My first command's output was too long and the harness saved a copy outside the folder; I did not open that copy and read the originals instead. I opened nothing else and did not search the web.
