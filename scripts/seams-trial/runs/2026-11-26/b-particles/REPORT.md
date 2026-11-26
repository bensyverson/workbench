# REPORT: particles author

## 1. Difficulty

4 of 5. The seams part was easy to write; the runtime was hard because `state` is static and a Program's per-particle fields are not, so I had to choose a state encoding the docs do not give.

## 2. What you did

**Dialect (`particles.dialect.js`)**
- `frames.box`: 2-D, pixels, origin top-left, y down. `extent` is `0..bounds.width` by `0..bounds.height`, so a composer can write `"fit"`. Its `note` says the axis directions and the origin.
- `ports.in.burst`: `Event<{ pos: point2@box }>`, reliable. One record is one position. A stranger can wire any position source into it, and the record needs no other field. I left out a `count` field, so the record stays a position only, and the spawn count is an emitter option.
- `ports.in.wind`: `vec2@box/s`, default `[0, 0]`. A velocity, not a force, so the stranger does not need to know the particles' mass or drag.
- `globals.inp` and `inputs: { object: "In", name: "inp" }`, with `objects.In` declared empty as `seams.md` says. The kit fills the members.
- `state`: each particle keeps `x, y, vx, vy, age, life, size, emitter` and `fields: list(struct({ name, value }), 8)`. Each emitter keeps `carry` (the unspawned fraction of its rate). These are additions only; `x`, `y`, `name`, `live`, `value` are unchanged.

**Grammar (`particles.grammar.js`)**
- The emitter's options gain `"on?": ref("in", { kind: "event" })` and `"burst?": "number"`. An emitter names the input that drives it, and says how many particles each record spawns. Nothing else changed.

**Runtime (`particles.runtime.js`)**, per step:
1. Each particle ages, is pushed by the forces its emitter lists, moves by `vel * dt`, runs `update`, and dies if `kill()` was called or `age >= life`.
2. Each emitter adds `rate` (capped at `maxRate`) times `dt` to `carry`, and spawns `floor(carry)` particles at its `x, y`. If it names an input with `on`, each record spawns `burst` particles (default 10) at the record's `pos`.
3. The state is rebuilt from the living particles, the emitter counts, and the counters the lambdas bumped through `globals.counters`.

**Manifest:** version `0.2.0`, `entry.runtime`, example `07` listed, all files rehashed with `hash.sh`.

**Example `examples/07.js` ("tent")**: a `drip` emitter with `on: "burst"` and a `fall` force, plus a `wind` force that reads `inp.wind`. It is the example that uses the new seams.

## 3. Where the docs misled you

- `runtime.md` says: "A slot … has one lambda per call, and its id adds the call's place among **all** that instance's calls." It also says the root's lambdas "are also there by slot name alone (`kernels.glow`, `kernels.accent`)". That second sentence is true for `update`, but a force is not reachable by its name: the id was `fountain.force#7`, not `gravity` or `fountain.force`. I found this from the checker's N004 message, not from the docs. The docs' rule is correct, but "by slot name alone" made me look for the name first.
- `seams.md` says `slots` on a record field lists "slot conventions", but no list of conventions for particles is given. I could not tell what a `slots` entry could be for `spawn` or `force`, so I did not use `record`.

## 4. What you guessed

- The built record's shape: `record.tick` (undefined when not written), `record.counters`, `record.fields[name].value`, `record.forces` (keyed by name, in call order), `record.emitter[i].opts`. These come from the Dialect's `environment` and the Grammar's `as:` names, not from a documented record type. The checker passes, so these shapes are at least consistent with it.
- Clock: `tick: record.tick ?? 1/60` when no `tick` is written. The Grammar does not give a default.
- Vector values at the runtime and in particle objects: I used arrays `[x, y]` (as `runtime.md` says for kernel arguments). `examples/05.js` reads `v.x` on a vector, which suggests a different representation. I could not verify which is right from the docs, and I saw no error. The `firework` example may be computing with `NaN` and the checker would not show it.
- A `point2` field in an Event record reaches `step` as `[x, y]`. Not documented.
- Particle defaults on spawn: `pos` at the emitter (or the record's `pos`), `vel [0,0]`, `life 1`, `size 1`, program fields at their declared `value`.
- `burst` default 10 and the Event's `events.in` max of 16.
- Forces are matched to names by sorting the `<part>.force#<n>` ids and zipping them with `record.forces` in order, failing if the counts differ.
- Internal particle tags use symbol keys, so a Program field named `emitter` or `dead` cannot collide with them.

## 5. Gaps

1. **Per-particle fields have no place in the static `state`.** A Program's `.field` names are chosen by the author, but `state` is declared once in the Dialect. I encoded each particle's fields as a `name`/`value` list, the same pattern the Dialect already uses for `counters` and `emitters`. The cap of 8 is my choice, not a kit rule; a Program with nine fields would fail the state check (N002) at run time. I did not check this case.
2. **The record's shape is not documented.** `runtime.md` tells me how to call a kernel, but not what `record.forces`, `record.counters`, `record.fields` or `record.tick` look like.
3. **Force kernel ids are position-based.** A stranger has to sort ids and match them to names in order. A kernel keyed by the name a `.force` call declared would remove that step.
4. **No documented representation for vectors and points** at the runtime boundary (records, particle objects, lambda reads). Arrays and `.x` access disagree in the examples.
5. **`record` slot conventions are not listed** for Event inputs on this kind of package, so a lambda cannot read the record that spawned its particle.
6. **An emitter must have a `rate` lambda** even when it is driven only by an Event. I kept the requirement and returned `0`.

## 6. Answers

1. **What you accepted.** I added the `burst` Event input (`Event<{ pos: point2@box }>`) and the `wind` value input (`vec2@box/s`). I considered a `count` field on the record and a `burst` input for each emitter; I left the count as an emitter option, so the record is a position only. The field is named `pos` because a position is what every stranger will have, and the input is named `burst` for what it does.
2. **Frames.** A stranger reads the `box` frame's `note` for the axes and origin, and `extent` for the size, then uses `"fit"` or an edge. That is enough to map positions. It does not say whether the box is fixed or scalable, and nothing clips particles that leave it.
3. **Records and lambdas.** Only the runtime reads the `burst` record. The spawn lambda receives a particle, not the record, and I did not find a documented slot convention for passing the record in. `record: { name, slots }` would have been the mechanism if one existed for particles.
4. **Time and rates.** I used seconds (`tick`, `age`, `life`) and a rate (`wind` as `vec2@box/s`). `delivery` is `"reliable"`, which I wrote out. `runtime.md` tells me a record arrives at the consumer's first step at or after its instant, and that is what the checker's probe showed: 12 particles at 0.5 s, the step that carried the record.
5. **The runtime.** The docs left the lambda calling convention for vectors, the particle object, `kill` (I supplied a function), counters (a plain object via `globals.counters`, read back after the step), the Event max, and the record shapes to me. The checker caught `kernels.update is not a function` (example 04 has no `update`), and the force-id mismatch, which the docs' rule did not make obvious.

## 7. Files

Opened and read (in this session):
- `seams.md`, `runtime.md`, `rules.md`, `task.md`, `packaging.md`
- `particles/particles.dialect.js`, `particles/particles.grammar.js`, `particles/particles.ui.js`, `particles/particles-field.js`, `particles/wb-package.json`
- `particles/examples/01.js` to `06.js`
- `particles/refusals/r01.js` to `r06.js`

Written: `particles/particles.runtime.js`, `particles/examples/07.js`, `particles/wb-package.json`, `particles/particles.dialect.js`, `particles/particles.grammar.js`, and `REPORT.md`.

Run, not read: `check.sh` and `hash.sh` (I ran them; I did not open their contents).

A directory listing (`ls -la`) showed the names `transcript.jsonl` and `stderr.txt` in the working folder. I did not open either. No other file was opened.
