# Report: particles author

## 1. Difficulty

**2**: the ports, frame and runtime passed the checker on the first full run, and the work was mostly deciding behaviour that neither the docs nor the existing language fixes.

## 2. What you did

The version is now 0.2.0. There is a new `particles.runtime.js`, a new `examples/07.js`, and nothing removed or renamed.

**Frame `box`** (2-D): the Program's bounds, in pixels, x right, y down, (0, 0) at the top left. `extent` is `[0,0]` to `[width,height]`, so a composer can write `"fit"`.

**Inputs**

| Input | Seam | Why a stranger would want it |
|---|---|---|
| `burst` | `Event<{ pos: point2@box }>`, reliable | "Something happened here": hits, pickups, notes. It has one field, so almost any event with a position can feed it. |
| `intensity` | `f64`, default 1 | One untagged dial for how busy things are. Lambdas read `inp.intensity`. |
| `wind` | `vec2@box/s`, default [0, 0] | A velocity from elsewhere that forces can push particles toward. It converts by the frame's scale. |
| `anchor` | `point2@box`, default [-1, -1] | Lets continuous emitters follow something that moves. |

**Grammar** (new optional emitter keys)

- `on: "burst"`: the emitter makes particles for each record. It is a `ref("in", { kind: "event" })`.
- `count`: particles per record, default 20. Refused without `on` (R011) or outside whole 1..10000 (R002).
- `follow: "anchor"`: the emitter sits at the anchor. It is a `ref("in", { kind: "value" })`, and any other value input is refused (R012).
- `intensity` and `wind` have no key. The Program chooses which emitters they affect through its `rate` and `force` lambdas.
- More than 64 `.field`s is now refused (R010), because the run's state needs a list max. This narrows the language slightly.

**Runtime**

- **Clock:** `{ tick: record.tick ?? 1/60 }`.
- **Order in a step:**
  1. Live particles age, run their forces, move, run `update`, then die if killed or `age >= life`.
  2. Burst records spawn, in order.
  3. Emitters spawn by rate, carrying the fraction in state.
- New particles are not moved until the next step, so a burst appears exactly at `pos`.
- **State:** each particle now keeps velocity, age, life, size, its emitter and its field values beside `x` and `y`. Each emitter keeps `carry` and `born` beside `name` and `live`.
- **Event max:** `burst: 256`, reliable. A dropped effect is a visible bug, and the high max leaves room for slow ticks and busy producers.

I ran temporary Programs for R011, R002, R012, B003 (`on` naming a value input), a field named `dead`, and `follow` with `on`. All were accepted or refused as intended, and I then removed them. `follow` and `intensity` have not been run with a real wire, only with their defaults.

## 3. Where the docs misled you

Nothing led me wrong. One passage is easy to misapply:

- `seams.md`: "A value input … has a `default`, read when nothing is wired". For a point input, no default means "nothing there", and nothing says whether the runtime can tell a wired input from an unwired one. I had to use an out-of-box sentinel.

## 4. What you guessed

- **Particle defaults:** `pos` = the emitter's position (or the record's), `vel` = 0, `life` = 1 s, `size` = 1, fields = their declared values.
- **Omitted `forces`:** all forces, in declaration order. `forces: []` means none. A listed set runs in the listed order.
- **`rate(t, live)`:** `t` is the step's instant `T`; `live` is that emitter's own count after deaths and bursts.
- **`rate` result:** clamped to 0..`maxRate`. `maxRate` does not limit bursts.
- **`spawn`'s `i`:** the number of particles that emitter has made before this one.
- **Cap:** at `maxParticles`, further spawns are discarded, not queued.
- **Leaving the box:** does not kill a particle.
- **`age`:** increases before forces and `update`.
- **`state.t`:** `T + dt` after a step.
- **Burst emitters:** they still need `rate` (usually returning 0) and also emit by it. A record outside the box still bursts there.
- **Absolute positions:** a `spawn` that sets `p.pos` outright (as `examples/04.js` does) overrides the burst position. Burst and follow emitters should offset it (`p.pos = p.pos + …`).
- **`anchor`:** "outside the box" means none, so a real target that leaves the box also sends the emitter home.
- **Slot permissions:** no `may` entry was needed to read `inp`, including in the `pure` `rate` slot. I found this by running it.
- **Seed:** I use `ctx.rng` and assume the kit seeds it from the Program's `.seed`. See Gaps.

## 5. Gaps

Smallest first.

1. **Seeding.** `runtime.md` calls `ctx.rng` "the part's seeded random stream" but not what seeds it. This language has `.seed(n)`, and the runtime has no documented way to apply it.
2. **Wired or not.** A runtime or lambda cannot ask whether a value input is wired, and a point input has no "none" value.
3. **Optional record fields.** Every field an input declares must come from the producer. A `count`, `strength` or `vel` on `burst` would shut out producers that only know a position, so I left them out.
4. **Ports from the Program.** Ports are fixed by the Dialect, and one wire feeds one input. A Program cannot declare `burst` channels named for its own needs, so a composer with two kinds of happening can drive only one set of emitters. Declaring a fixed `burst2` would only move the limit.
5. **Acceleration.** Rates are per second only, so gravity or a push cannot be a tagged input that converts with the frame. `wind` is therefore a velocity.

## 6. Answers

**1. What you accepted.** `burst`, `intensity`, `wind` and `anchor`, as above. I considered and left out:
- `count`, `strength`, `color` or `vel` fields on `burst`, because record fields cannot be optional.
- A second burst channel, because it is arbitrary.
- A gravity input, because there is no acceleration rate.
- A pause or `enabled` bool, because `intensity` at 0 covers it for emitters that read it.

I added no outputs, since the task did not ask for any.

The one record field is `pos`. It matches the particle's own `p.pos`, which is where the value ends up, and it is a likely name on the other side. A wire can rename it if not.

**2. Frames.** A stranger gets the note (axes, origin, unit, relation to bounds) and the extent. That is enough for scale-and-offset mappings, including `"fit"` and flipping y. It cannot express rotation. The note also has to carry things that are not geometry, such as whether positions outside the extent mean anything.

**3. Records and lambdas.** Only the runtime reads the record. Its one field becomes the new particle's `p.pos`, so `spawn` already has it. `record: { name, slots }` would let lambdas read it, but slots are per slot convention, not per emitter. Every `spawn`, including rate-only ones, could then read it, and the runtime would have to supply a dummy record for those. With one field there was nothing to gain, so I did not declare it and have not tested it.

**4. Time and rates.** I used a rate (`vec2@box/s` for `wind`). The kit's `s` is not on any port. `delivery` is left at its default, reliable. `runtime.md` was clear on timing: a record pushed at T reaches the consumer at its first step at or after T, the same instant when both step then. With a slow `.tick`, a burst can therefore show up one tick late and several records arrive together. The input's max has to be chosen without knowing the producer, and since `.tick` is up to the Program, no fixed number is right for every composition; S116 would report a mismatch to the composer.

**5. The runtime.**
- **Calling lambdas:** the ids were as documented. The root's forces are `<root name>.force#<call place>`, and matching them to `record.forces` means sorting by that place and zipping with the names. A temporary probe confirmed the order. A lookup by declared name would remove this step.
- **Particle object:** a plain object with array vectors worked. `kill` is a function I supply. It records the death outside the object, so a `.field` name cannot collide with a flag.
- **Counters:** I set `globals.counters` to a copy each step and write it back to state.
- **Event max:** the docs explain what it means but give no way to choose it for an unknown producer.
- **Record shapes:** the shapes of `record.fields`, `record.counters` and `record.forces` come from the Grammar, and I confirmed them with the probe.
- **What the checker caught:** on the untouched package, only the missing pieces (G001 to G004). After the work it reported no violations on the first run. It did not catch the `dead` field-name collision in my first version, which I found by rereading. Its only G008 afterwards came from my own probe throwing on purpose.

## 7. Files

Opened, all under `/private/tmp/WnmLua-relay/a-particles`:
- `seams.md`, `runtime.md`, `rules.md`, `task.md`, `packaging.md`
- `check.sh`, `hash.sh`
- in `particles/`: `wb-package.json`, `particles.dialect.js`, `particles.grammar.js`, `particles.ui.js`, `particles-field.js`, `examples/01.js` to `06.js`, `refusals/r01.js` to `r06.js`, and the files I wrote

I opened nothing else and did not search the web.
- Directory listings showed `log.jsonl`, `stderr.txt` and `transcript.jsonl`; I did not open them.
- `check.sh` and `hash.sh` run scripts outside this folder; I ran them without opening those scripts.
- My first command's output was too long and the harness saved a copy under `~/.claude/`. I did not open that copy; I reread the originals.
- I made temporary files (a copy of the package, a runtime backup, a manifest backup, probe examples and refusals) and removed them all.
