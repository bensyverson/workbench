# Particles: Dream Code

A small language for particle systems: sparks, fountains, smoke. You define it; this page says what its Programs look like and which ones it must refuse. Nothing here is implemented.

## A Program

```js
import { particles } from "../particles.grammar.js";

// Top-level helpers and plain-data constants: lambdas may use them.
const GRAVITY = 300;
const spread = (r, width) => (r - 0.5) * width;

export default ($) => particles("fountain")
  .param("rate", { value: 60, min: 0, max: 400 })           // read inside lambdas: changes without a rebuild
  .param("wind", { value: 0, min: -100, max: 100 })
  .bounds({ width: 400, height: 300 })                      // the box particles live in
  .maxParticles(500)                                        // at most this many alive at once
  .tick(1 / 30)                                             // seconds per tick
  .field("heat", { value: 1 })                              // a number every particle carries
  .force("gravity", (p, dt) => { p.vel = p.vel + vec2($.wind, GRAVITY) * dt; })
  .force("drag", (p, dt) => { p.vel = p.vel * (1 - 0.5 * dt); })
  .update((p, dt) => {
    p.heat = Math.max(0, p.heat - dt);
    p.size = 1 + p.heat * 2;
    if (p.heat === 0) { p.kill(); }
  })
  .emitter("jet", { x: 200, y: 290, maxRate: 400, forces: ["gravity", "drag"] })
    .rate((t, live) => $.rate)
    .spawn((p, rng, i) => {
      p.vel = vec2(spread(rng(), 80), -250 - rng() * 50);
      p.life = 1.5 + rng();
    })
  .emitter("mist", { x: 200, y: 150, maxRate: 20 })
    .rate((t, live) => (live < 50 ? 20 : 0))
    .spawn((p, rng) => { p.pos = p.pos + vec2(spread(rng(), 300), 0); p.size = 3; });
```

## What each part means

- The exported function may be a single chain, as above, or have a block body that builds the chain with ordinary JavaScript (a loop or an `if` that adds emitters or forces) and returns it.
- `particles(name)` opens a Program, one particle system. Its calls: `param` (any number), `bounds` (once, required), `maxParticles` (once, required), `tick` (once, optional), `seed` (once, optional), `field`, `force` (any number each), `update` (once, optional) and one or more `emitter`s. An emitter's own calls follow it; any system call after them ends that emitter.
- `.param(name, { value, min, max })` declares a number param; `value` lies within `min..max`. Lambdas read it as `$.name`, and may read any declared param. Build-time code may read it too, but only after its `.param` call. Param names are separate from all other names.
- `.bounds({ width, height })`: the box from `(0, 0)` to `(width, height)`, each 1 to 4096. `y` grows downward, so a positive `y` force pulls down.
- `.maxParticles(n)`: n a whole number, 1 to 10000. `.tick(seconds)`: 0.001 to 1, default `1 / 60`. `.seed(n)`: a whole number, at least 0, default 0; the same seed gives the same run.
- `.field(name, { value })` adds a number field every particle carries, starting at `value`. Field names are unique, and none may be a built-in field's name or `kill`.
- `.force(name, lambda)` declares a force. Force names are unique in a Program.
- `.emitter(name, { x, y, maxRate, forces })` opens an emitter at `(x, y)`, which must lie inside the bounds (edges included). `maxRate` (particles per second) is a number, at least 0. `forces` is optional: a list of force names, each declared somewhere in the Program, none twice; without it, every force acts on this emitter's particles. Emitter names are unique in a Program. Each emitter has `.rate(lambda)` and `.spawn(lambda)`, each exactly once.
- **Numbers and vectors.** Every number is one number type; there are no integers. `vec2` is the language's vector type: build one with `vec2(x, y)` and read `.x` and `.y`. Two `vec2`s add and subtract; a `vec2` multiplies by a number on either side and divides by one. Nothing else mixes (`v + 1` is wrong; write `v + vec2(1, 1)`), and vectors are never compared or used as a condition. `length(v)` gives a number.
- Lambdas may use `vec2`, `length`, `Math.min`, `Math.max`, `Math.abs`, `Math.sqrt`, `Math.floor`, `Math.sin`, `Math.cos` and `Math.PI`, and nothing else from `Math`. A top-level helper follows the same rules as a lambda and may call other helpers, but it is **pure**: it may take a particle and read it, but never writes, kills or uses `rng`.
- Lambda bodies use `const` and `let`, arithmetic, comparisons, `if`, ternaries and `for` loops with a fixed count. A lambda may declare fewer parameters than its slot gives, never more.

## The particle

| Field | Type | Starts as | Who writes it |
|---|---|---|---|
| `pos` | `vec2` | the emitter's `(x, y)` | spawn, update; the host moves it each tick |
| `vel` | `vec2` | `vec2(0, 0)` | spawn, force, update |
| `age` | number | 0 | only the host (seconds since spawn); lambdas read it |
| `life` | number | 1 | spawn, update (seconds; the host removes the particle at `age >= life`) |
| `size` | number | 1 | spawn, update (what the host draws) |
| each `.field` | number | its `value` | spawn, update |

`p.kill()` is a verb, not a field: it takes no arguments and gives no value.

## The lambdas

| Lambda | Receives | Gives | May write | `p.kill()` | `rng()` |
|---|---|---|---|---|---|
| `rate` | `t` (seconds since start), `live` (this emitter's particles alive before this tick's spawns) | a number: particles per second | nothing (it is pure) | no | no |
| `spawn` | `p` (the newborn), `rng`, `i` (0, 1, … among this emitter's newborns this tick) | nothing | `p`'s fields, except `age` | no | yes |
| force | `p`, `dt` (the tick) | nothing | `p.vel` only | no | no |
| `update` | `p`, `dt` | nothing | `p`'s fields, except `age` | yes | no |

- "Write" means an assignment (`=`, or `+=` `-=` `*=` `/=` on a number field) whose target is exactly `<particle parameter>.<field>`, with the whole field replaced: `p.vel = vec2(0, p.vel.y)`, never `p.vel.y = 0`. A lambda may also assign its own `let` locals, a local vector's components included. Nothing else is writable: not `$`, not a top-level constant, not a parameter itself, not another name for the particle.
- `rng()` gives a number in `[0, 1)`. It is called only directly in a spawn lambda's body; it cannot be passed on. So randomness is chosen at spawn and kept in a field if `update` needs it later.
- Spawn, force and update lambdas have a block body `{ … }` and return no value. A rate lambda returns a number. Particles never see each other, and there is no way to spawn from a lambda: particles come only from emitters.

## One tick

The host runs this; the language describes it. Each tick of `dt` seconds, at time `t` (0 on the first tick):

1. **Spawn.** For each emitter in declaration order: its rate is `rate(t, live)`, clamped to `0..maxRate`; `rate * dt` adds to the emitter's running fraction, and its whole part is spawned now (the fraction carries over). Each newborn gets the starting values above, then `spawn` runs on it. Once `maxParticles` are alive, the rest of this tick's newborns are dropped. Newborns first move on the next tick.
2. **Forces.** For each particle, oldest first, each force that acts on it runs, in the order the forces were declared.
3. **Move.** The host sets `pos = pos + vel * dt` and `age = age + dt`.
4. **Update.** `update(p, dt)` runs on each particle, oldest first. `p.kill()` marks the particle; the lambda runs to its end.
5. **Remove.** A particle that was killed, has `age >= life`, or has left the bounds is removed. Then `t` grows by `dt`.

The text view prints the state the host has computed: a header line `t=2.00 live=143/500 jet=120 mist=23` (time, live over `maxParticles`, live per emitter), then the bounds as 40 columns by 20 rows, each cell `.` when empty, `1` to `9` for that many particles, `#` for ten or more.

## What it must refuse

Each of these must fail to build or to check, with a diagnostic that names the mistake:

1. A rate lambda that assigns anything but its own `let` locals: rate is pure.
2. A write to anything but `p.<field>` and a lambda's own locals: `$.rate = 0`, a top-level constant (`GRAVITY = 0`), a parameter (`dt = 0`, `p = …`), or the particle under another name (`const q = p; q.vel = …`).
3. A force lambda that writes any field but `vel` (`p.size = 2` in a force).
4. A write to `age`, from any lambda.
5. A write to part of a vector field (`p.vel.x = 0`); the fix writes the whole field, `p.vel = vec2(0, p.vel.y)`.
6. `p.kill()` anywhere but `update`: in spawn, a force or a helper. Spawn may not kill.
7. `rng()` anywhere but directly in a spawn lambda: in rate, a force, update or a helper, or `rng` passed to a helper as an argument.
8. A top-level helper that writes a particle's field.
9. A read or write of a field the particle does not have (`p.speed`, `p.helth`), or a `.field` named like a built-in field (`pos`) or `kill`.
10. A field written with the wrong type: a number into a `vec2` field (`p.vel = 0`) or a `vec2` into a number field (`p.life = vec2(1, 1)`).
11. A rate lambda that gives something other than a number (`(t) => t > 2`), or a spawn, force or update lambda that returns a value.
12. A vector mixed with a number by `+` or `-` (`p.pos + 1`), vectors compared (`p.vel === vec2(0, 0)`), or a vector used as a condition.
13. `maxParticles` that is not whole (`250.5`) or outside 1 to 10000; `seed` that is not whole or below 0; `tick` outside 0.001 to 1.
14. An emitter with a negative `maxRate`, or placed outside the bounds; `bounds` with a width or height outside 1 to 4096.
15. Two emitters with one name, two forces with one name, or two fields with one name.
16. An emitter's `forces` list naming a force that does not exist (`"gravty"`), or naming one force twice.
17. `bounds` or `maxParticles` missing or called twice; `update` called twice; a Program with no emitter; an emitter missing its `rate` or its `spawn`, or calling either twice.
18. A lambda that reads a param that is not declared (`$.wnd`).
19. `Math.random`, `Math.tan`, or any other name the language does not give a lambda; the diagnostic for `Math.random` should point to `rng` in spawn.
20. `.collide(…)`, with any arguments: particles never see each other in this language. The diagnostic should say so.
