# REPORT: particles author

## 1. Difficulty

4 of 5. The inputs, frame, Grammar change and the runtime for emitters, forces, update and Event bursts all went in, but the runtime cannot run any Program that declares a `.field()`, because the Dialect's fixed `state` has no place to keep per-particle fields between steps. Four of the six shipped examples are affected.

## 2. What you did

**Inputs (`particles.dialect.js`, `ports.in`)**

- `pickup`: `Event<{ at: point2@box }>`, delivery reliable (the default), `record: { name: "pickup", slots: ["spawn"] }`. Each record makes a burst of every emitter that names this input with `from`, at `at`. I named the field `at` because a stranger wiring a position gets a position, named for what it is. Considered and left out: a `count` field (the burst size lives on the emitter as `burst`, so the record stays the position alone) and a direction field (the spawn lambda sets velocity).
- `wind`: `vec2@box/s`, `default: [0, 0]`. A push velocity in pixels per second. A force reads it as `inputs.wind`. Considered and left out: a scalar strength, since a vector wind is what the value is.

**Frame (`box`)**

- `dims: 2`, a note saying x grows right, y grows down, 0 is top-left, one unit is one pixel, and the box spans 0 to the bounds.
- `extent: (record) => ({ min: [0, 0], max: [record.bounds.width, record.bounds.height] })`, so a composer can write `"fit"`.
- No edges, because there is only one frame. I did not add a normalized frame.

**Grammar (`particles.grammar.js`)**

- An emitter's options gain `from?: ref("in", { kind: "event" })`, so a Program says which Event input drives it, and `burst?: "number"` (a whole number of 0 or more, checked as R001).
- An emitter with `from` is still required to have `rate` and `spawn`, which keeps the Grammar unchanged for existing Programs.

**State (`particles.dialect.js`, `state`)**

- `particles` gains `vx, vy, age, life, size, em`. `x` and `y` stay, since the checker reads them. R3 allows additions.
- `emitters` gains `acc`, a fractional spawn accumulator.

**Runtime (`particles.runtime.js`)**

- `clock`: `record.tick ?? 1/30`.
- `init`: refuses Programs with `.field()`s (see Gaps). Otherwise it builds state from the record.
- `step`: rate emitters spawn `min(max(0, rate), maxRate) * dt` per step through an accumulator. Event emitters spawn `burst` particles per record. Forces run in the order of the emitter's `forces` list. `update` runs once per particle. Then each particle moves by `vel * dt`. A particle dies when `kill()` was called or `life > 0` and `age >= life`.
- `events: { in: { pickup: 8 } }`.

**Example `examples/07.js`** uses both inputs: `pickup` drives an emitter that bursts 12 particles at `pickup.at`, and a `breeze` force reads `inputs.wind`. Listed in the manifest. The checker accepts it and reports 12 particles within 50 pixels of the record at T = 0.5.

**Manifest**: version `0.2.0`, `entry.runtime` added, `examples/07.js` listed, `./hash.sh particles` run after the last edit.

## 3. Where the docs misled you

Nothing in `seams.md`, `runtime.md` or `packaging.md` led me to a wrong result. The one place the docs are silent rather than misleading: `runtime.md`'s state rules say the state "fits your Dialect's `state`", and `environment(program)` can return objects and members, but nothing says whether it can change `state`. I read that as no, and the N004 result is consistent with that reading.

## 4. What you guessed

- **Rate units.** `rate` returns particles per second. The docs say "rate runs once per emitter per tick" but not its unit.
- **`live` in `rate(t, live)`.** I passed the emitter's own live count, not the package's total. The docs don't say which.
- **`life`.** A particle with `life` 0 (never set) does not expire by age. The docs don't say what an unset `life` means.
- **Default `pos`.** A new particle starts at its emitter's `x, y` before `spawn` runs.
- **Kernel ids.** I found the root's `force` kernels by the `<instance>.force#n` prefix, sorted by `n`, and matched them to `record.forces` keys in order. The docs say to do this; I could not confirm the `#n` numbering against a real build.
- **`globals.pickup` for rate-driven spawns.** The docs say a runtime "must set the name to a record of your own first". I set `{ at: [emitter x, emitter y] }`. This is a placeholder choice, not a documented rule.
- **Seed.** `.seed(n)` is not read by the kit, so I passed `ctx.rng` through a wrapper that adds a salt derived from the seed (`(ctx.rng() + frac(seed * φ)) % 1`). The docs say the runtime "has to apply it itself", but not how. This is my choice.
- **Record type in the Dialect.** I did not declare `pickup` in the Dialect's `objects` or `globals`. Example 07 still reads `pickup.at`, so the kit appears to derive it from `record`. This is untested beyond that one example.
- **Event timing.** I rely on the tick clock: a record arriving before a step is handed to that step, so a burst appears at the next tick.

## 5. Gaps

Smallest first.

1. **Per-particle fields have no place in the state.** A Program's `.field("heat", …)` gives each particle a value the lambdas read and write. The Dialect's `state` is fixed, and `environment(program)` cannot add to it, so the runtime cannot keep a field's value between steps. `init` refuses such Programs with a message. Four shipped examples fail the checker with N004: `examples/01.js`, `02.js`, `03.js` and `04.js`. Examples 05 and 06 have no fields and run. The smallest thing the kit would need is a way for a Dialect's `state` to take per-Program struct fields, or a per-particle record the kit stores for the runtime.
2. **Seed is not applied by the kit.** `.seed()` exists in the Grammar. The runtime has to apply it itself, and the docs don't say how the kit expects it to be mixed. A documented rule for how a runtime should derive a stream from a seed would help.
3. **A placeholder for a record the runtime has no event for.** A spawn lambda that reads the Event's record name must have something set before it runs, even when the emitter isn't event-driven. The docs say "a record of your own" without giving a shape or a rule.
4. **Counter and field shape in `record`.** `record.counters` and `record.forces` are objects keyed by name. The docs say so for named repeatable declarations, but I could not confirm what each value holds. I used only the keys.
5. **Which kernel id is which.** For a root-level repeatable call, a runtime must count every call of the instance in Grammar order to find the `#n`. The docs describe this, but it is easy to get wrong, and nothing in the kit lists the mapping for a runtime to read.

## 6. Answers

**1. What you accepted.** An Event input `pickup` with the record `{ at: point2@box }`, and a value input `wind` of `vec2@box/s`. I considered a `count` field and a scalar strength, and left both out: the burst size is a property of the emitter, and wind is a velocity. The record field is named `at` because it is the position where the record happens.

**2. Frames.** A stranger reads the `box` frame's note for the axis directions, the origin and the unit, and reads the `extent` for the box's size, which `"fit"` uses. This is enough to relate a box to another box of a different size. It is not enough to relate a normalized 0 to 1 frame, because I did not declare one. I did not need one for the checker.

**3. Records and lambdas.** The spawn lambda reads `pickup.at`, because the Dialect puts `spawn` in the record's `slots`. The runtime sets the global before each call. The lambda could not read the record unless the Dialect listed the slot, so `record: { name, slots }` is what let the Program's own spawn read it. It did not let a rate lambda read it, and it needed my placeholder for rate-driven spawns.

**4. Time and rates.** I used the tick clock (1/30 by default), a rate (`vec2@box/s` for `wind`), and `delivery` at its default. I did not use `s` directly, since the box has no time-based field. `runtime.md` tells me a record arrives at the first step at or after its instant, so a record sent at step T is handed to the consumer at T if the producer goes first, otherwise at the consumer's next step. That was enough to answer the timing question, though the producer's rate matters for `events.in` and I set it to 8 without a measurement.

**5. The runtime.** The docs left open: the rate unit, which particles count as "live" for `rate`, what an unset `life` means, the default `pos`, the seed mix, the placeholder record for rate-driven spawns, and the Event max, which I set to 8 as a guess. The checker caught the `.field()` gap: it reported N004 on examples 01 to 04, from `init`. The new example passed the near-the-record check (G008).

## 7. Files

Opened and read:

- `seams.md`, `runtime.md`, `rules.md`, `task.md`, `packaging.md`
- `particles/particles.dialect.js`, `particles/particles.grammar.js`, `particles/particles.ui.js`, `particles/particles-field.js`, `particles/wb-package.json`
- `particles/examples/01.js` to `06.js`
- `particles/refusals/r01.js` to `r06.js`

Written:

- `particles/particles.dialect.js`, `particles/particles.grammar.js` and `particles/wb-package.json` (edited)
- `particles/particles.runtime.js` and `particles/examples/07.js` (new)
- `particles/wb-package.json` hashes (rewritten by `./hash.sh particles`)
- `REPORT.md`

Ran: `check.sh` (several times), `hash.sh particles`.

Opened nothing else. I listed the top folder with `ls`, which showed the names `check.sh`, `hash.sh`, `stderr.txt` and `transcript.jsonl`. I did not open `check.sh`, `hash.sh`, `stderr.txt` or `transcript.jsonl`.
