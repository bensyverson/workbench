# Report: swarm author

## 1. Difficulty

3 of 5: the docs covered the ports, the runtime shape and the state extension, but the vector type declaration was not documented, and a gather check looked broken until I worked out how the checker reports it.

## 2. What you did

**Package changes** (`swarm` 0.1.0 → 0.2.0; `./hash.sh swarm` run after each change; `./check.sh` reports no violations).

- **Frame `ground`** (2-D): x runs right from the left edge, y down from the top, one unit is one ground unit, extent `[0,0]`–`[ground.width, ground.height]`. A composer can use `"fit"` against it, and a `bounce` box can be fitted onto it.
- **Event input `lure`**: `Event<{ at: point2@ground, strength: f64 = 1 }>`, `delivery` reliable (default), `record: { name: "lure", slots: ["answer"] }`. A call draws every agent toward `at`; `strength` says how hard. `strength` has a default so that a producer that only sends a position still works.
- **Value input `wind`**: `vec2@ground/s`, default `[0, 0]`. A steady push, read by steers as `input.wind.x` / `input.wind.y`. It is a rate, so a composer's frame edge scales it correctly.
- **New slot `answer`** (Dialect slot, Grammar `answer` decl, `once`): a lambda per agent, run once per lure record, reads the record as `lure`. This is how a Program decides how its agents answer a call.
- **State**: each agent item gained `vx, vy, hx, hy, age, speed` (its group's speed) and `traits`, an extensible struct. `environment(program)` now returns a `state` field per trait, so each trait lives at `agents[i].traits.<name>`.
- **Types**: `types: { vec2: vector(2, "f64") }` (see Gaps).
- **Runtime** `swarm.runtime.js`: `clock` is `record.tick`; `init` scatters each group's agents uniformly in a disc of radius `spread` around its home, at rest, traits at declared values; `step` applies lure records in order (before the steers), then runs every steer and update on each agent, then caps velocity at the group speed, moves each agent by its velocity, reflects it off the ground edges and advances `age`. `t` is `T + dt`. `events.in.lure` is 16.
- **Example `examples/03.js`** (`lure`): a crowd of 30 that a lure draws in. The answer lambda stores the target and pull in traits (`aimx`, `aimy`, `pull`), and the steers `aim`, `drag` and `fade` use them. Traits carry the call from one step to the next. The `wind` steer reads the value input.

**Why a stranger would want it:** a game, physics toy or sequencer can drive agents with a position and a strength, and a rate of wind, without knowing anything about the swarm's internals. A lambda can decide how agents answer a call.

## 3. Where the docs misled you

- `seams.md`, "Pairing with your own types": "`point2@frame`, `vec2@frame`, `vec2`, `vec2@frame/s` | a `vector(2, "f64")` type". The table says what the type must look like but not where it is declared. The phrase "your one `vector` type of its dims" in the Inputs section implies a declaration exists, and none of the Dialect examples show one. The checker's D027 message gave `types: { vec2: vector(2, "f64") }` as the fix.
- `seams.md`, "Frames": the `extent` example uses `record.<slot>`, which is a scalar slot. For a data-valued `ground` I wrote `record.ground.width`. It passed the checker, but the docs don't say a data slot's fields are reached this way.

## 4. What you guessed

- **Where the vector type is declared**: `types: { vec2: vector(2, "f64") }`, the key from the D027 message. Not in the docs (see Gaps).
- **Kernel ids for steers**: `kernels[`${part}.steer.${name}`]`, with names from `Object.keys(record.steers)`, taken as the declaration order. `runtime.md` says ids are `<instance>.<slot>.<name>`, but the root's instance is not spelled out. The checker's run confirmed the steers are found.
- **Answer and update ids**: I looked them up as `kernels[`${part}.answer`]` and `kernels[`${part}.update`]`, not as the `kernels.answer` alias, which the docs only give for once-slots. I did not test whether the alias also works.
- **Trait read-back**: only `vx`, `vy` and the traits come back from a lambda; `x`, `y`, `hx`, `hy` and `age` are read-only to lambdas (declared so in the Dialect), so the runtime keeps them.
- **Order within a step**: lure records first (each record over all agents), then steer and update per agent, then cap, move, reflect. The docs fix steer-before-update but not where records go.
- **When answer runs**: only when a record arrives. With no record the runtime never calls it, so `lure` is never null inside a call. I set `globals.lure = null` after the records.
- **`clock`**: `record.tick ?? 1 / 30`. Example 03 sets `tick(1 / 20)`; I did not confirm that `record.tick` holds the number, because the probe I ran was not conclusive.
- **Ground**: an agent that crosses an edge is clamped to it and its velocity component is negated. The docs don't prescribe a rule.
- **Gather tuning** in example 03: aim gain 20, drag 6 per second, pull fade 0.5 per second. With these, agents enter the 30-unit radius around (120, 90) from about T=1.4 and all are near by T=2.0. A quick scratch simulation outside the package matched the checker's behaviour, and I deleted it afterwards.
- **Event max**: `events.in.lure` = 16 records per step.

## 5. Gaps

1. **Where a Dialect declares its vector type is not documented.** The seam table requires a `vector(2, "f64")` type, but `seams.md` never says how to declare one. I used `types: { vec2: ... }` from the checker's message. Smallest fix: one line in `seams.md` naming the key, with an example.
2. **The root construct's kernel ids are not spelled out** (`runtime.md`, "Calling the Program's lambdas"). The steers were findable only by trial. Smallest fix: state the root's instance name for `kernels` ids.
3. **`record.tick` shape is not stated** for a `decl` with `once`. I guessed it is a number and used the `?? 1 / 30` fallback.
4. **Field names a stranger should send to an Event input are not stated anywhere a stranger reads**, only in the Dialect note. The checker's test record had to be inferred. A standard "point field" name, or a sample record in the reference, would help.
5. **No way to read a value input's default in a lambda without the object**: not a blocker, but the `inputs` object is only described as "filled by the kit"; I relied on that without a test.

## 6. Answers

1. **What you accepted.** An Event input `lure` with fields `at` (a point2 in `ground`, the position called toward) and `strength` (a number, default 1, how hard). A value input `wind`, a rate in `ground`, default zero. I considered an output port (not asked for), a second Event input for a "stop" call (a `strength` of 0 already stops pulling), and a `tick` input (not needed). I named the position `at` because it is the place the agents are called to, and `strength` because it is the one knob. `strength` is the only field with a default.
2. **The Program's own data.** Traits live in each agent's `traits` struct inside `state.agents`, one number per `.trait`. I found it from `seams.md`'s extensible-struct section and the matching part of `runtime.md`, "A Program's own data, in the state". `runtime.md` was enough, except for the question of which struct holds the traits (answered by `seams.md`, not `runtime.md`).
3. **Records and lambdas.** The answer lambda reads `lure` (the record) through the global; the steers do not, and the kit rejects any other lambda that does. Because the answer runs only when a record arrives, the `if (lure != null)` guard is always true when it runs, and it is still needed to pass the check. `record: { name, slots }` let me read `lure.at.x` and `lure.strength` in the lambda. I called the steers with `kernels[`${part}.steer.${name}`]`, looked up from the record's names.
4. **Time.** A record arrives at the first step at or after its instant, and I apply it before that step's steers. I did not use `$T`. The `wind` value is a rate, so a frame edge scales it. `s` is used only for `t`. `delivery` is the default (reliable) with a max of 16 per step.
5. **The runtime.** `runtime.md` left open where the tick comes from when `record.tick` is absent, the kernel ids for root steers, and the record-to-step ordering. The checker's run caught nothing in the runtime itself. Its G016 output reports the first instant at which the count with the record rises above the count without it, not the largest, so "1 more agent at T=1.25" is a pass, not a failing gather. My first reading of it as a failure cost time before I checked the dynamics.

## 7. Files

Opened and read: `seams.md`, `runtime.md`, `rules.md`, `task.md`, `packaging.md`, `swarm/swarm.dialect.js`, `swarm/swarm.grammar.js`, `swarm/wb-package.json`, `swarm/examples/01.js`, `swarm/examples/02.js`, `swarm/swarm.ui.js`.

Written: `swarm/swarm.dialect.js`, `swarm/swarm.grammar.js`, `swarm/swarm.runtime.js` (new), `swarm/examples/03.js` (new), `swarm/wb-package.json`, `REPORT.md`.

Run but not opened: `check.sh`, `hash.sh`. Scratch files written in `/tmp` during debugging were removed. I opened nothing else on this machine. The `check.sh` run logs and the `log.jsonl`, `transcript.jsonl` and `stderr.txt` files in the working folder were not opened.
