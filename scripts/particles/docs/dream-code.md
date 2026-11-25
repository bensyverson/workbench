# Particles: Dream Code

A small language for particle systems: sparks, fountains, smoke. You define it; this page says what its Programs look like and which ones it must refuse. Nothing here is implemented. Every rule is decided from the Program's source alone, without running it: dead branches, unused forces and uncalled helpers are checked too.

## A Program

```js
import { particles } from "../particles.grammar.js";

// Top-level number constants and helpers: lambdas may use them.
const GRAVITY = 300;
const spread = (r, width) => (r - 0.5) * width;

export default ($) => particles("fountain")
  .param("rate", { value: 60, min: 0, max: 400 })           // read inside lambdas: changes without a rebuild
  .param("wind", { value: 0, min: -100, max: 100 })
  .bounds({ width: 400, height: 300 })                      // the box particles live in
  .maxParticles(500)                                        // at most this many alive at once
  .tick(1 / 30)                                             // seconds per tick
  .field("heat", { value: 1 })                              // a number every particle carries
  .counter("burnedOut")                                     // a shared number: spawn and update bump it, rate reads it
  .force("gravity", (p, dt) => { p.vel = p.vel + vec2($.wind, GRAVITY) * dt; })
  .force("drag", (p, dt) => { p.vel = p.vel * (1 - 0.5 * dt); })
  .update((p, dt) => {
    p.heat = Math.max(0, p.heat - dt);
    p.size = 1 + p.heat * 2;
    if (p.heat === 0) { p.kill(); counters.burnedOut++; }
  })
  .emitter("jet", { x: 200, y: 290, maxRate: 400, forces: ["gravity", "drag"] })
    .rate((t, live) => $.rate)
    .spawn((p, rng, i) => {
      p.vel = vec2(spread(rng(), 80), -250 - rng() * 50);
      p.life = 1.5 + rng();
    })
  .emitter("mist", { x: 200, y: 150, maxRate: 20 })
    .rate((t, live) => (live < 50 && counters.burnedOut < 1000 ? 20 : 0))
    .spawn((p, rng) => { p.pos = p.pos + vec2(spread(rng(), 300), 0); p.size = 3; });
```

## Building a Program

- The exported function `($) => …` may be a single chain, as above, or have a block body that builds the chain with ordinary JavaScript (a loop or an `if` that adds emitters or forces) and returns it. Build code is plain JavaScript; the rules below bind only what it hands the builder and the lambdas it writes. Every builder call changes the Program and returns it, so `sys.force(…);` alone is enough and `sys = sys.force(…)` also works. The export returns the one Program it built.
- `particles(name)` opens the Program. Its calls, in any order: `param`, `field`, `counter`, `force` (any number each); `bounds` and `maxParticles` (once each, required); `tick`, `seed`, `update` (at most once each); and one or more `emitter`s. `.emitter(…)` returns that emitter: `.rate` and `.spawn` on it set its lambdas, and any other call on it acts on the Program, as in the chain above. Names may refer forward (an emitter's `forces` may name a force declared after it); cross-checks run once the export returns.
- **Names** are strings, from any build-time expression (`"flame" + k`): a letter, then letters, digits or `_`. Params, fields, counters, forces and emitters each have their own names, unique within their kind; kinds may share a name (a param and a force both called `wind`).
- **Options** take exactly the keys shown, each a finite number (`forces` a list of names); no call takes extra arguments; every lambda slot takes an arrow function written in place. All ranges include their ends.
- `.param(name, { value, min, max })` declares a number param, with `min <= value <= max`. Lambdas read it as `$.name` and follow the slider without a rebuild. Build code may read `$.name` after its `.param` call and gets `value`; what it builds from that (`.maxParticles($.cap)`) is checked with that value. The host clamps a moved param to `min..max`, applies it from the next tick, and rebuilds when build code read it.
- `.bounds({ width, height })`: the box from `(0, 0)` to `(width, height)`, each 1 to 4096 (fractions allowed). `y` grows downward, so a positive `y` force pulls down.
- `.maxParticles(n)`: n whole, 1 to 10000. `.tick(seconds)`: 0.001 to 1, default `1 / 60`. `.seed(n)`: whole, at least 0, default 0.
- `.field(name, { value })` adds a number field every particle carries, starting at `value`. No field may be named `pos`, `vel`, `age`, `life`, `size` or `kill`.
- `.counter(name)` declares a counter: one number for the whole system, starting at 0 and never reset. Counters are the only state lambdas share (see The lambdas).
- `.force(name, lambda)` declares a force.
- `.emitter(name, { x, y, maxRate, forces })` opens an emitter at `(x, y)`, which must lie inside the bounds (edges included). `maxRate` (particles per second) is at least 0, with no upper limit. `forces` is optional: force names, none twice, in any order (forces always run in declaration order). Without it every force acts on this emitter's particles; `forces: []` means none does. Each emitter calls `.rate(lambda)` and `.spawn(lambda)` exactly once.
- Declarations nobody uses (a force no emitter lists, a param, a field, a counter) are fine.

## Inside lambdas and helpers

- Lambdas and helpers are the language's code, not plain JavaScript: the host runs them, so vector arithmetic works as written.
- **Names a lambda may use:** its own parameters and locals; `$.name` (a declared param); `counters.name` (a declared counter, where its slot allows); top-level number constants (`const NAME =` a number expression of literals and earlier constants); top-level helpers; `vec2`, `length`, `Math.min`, `Math.max`, `Math.abs`, `Math.sqrt`, `Math.floor`, `Math.sin`, `Math.cos`, `Math.PI`; `true` and `false`. Nothing else: not build code's locals (a loop's `k`), not `Infinity`, `NaN` or `undefined`, not another import, not a top-level `let` or non-number constant. `$` appears only as `$.name` and `counters` only as `counters.name`. Functions are only called, never stored or passed. No local, parameter or helper is named `vec2`, `length`, `Math`, `counters` or `$`.
- **Helpers.** Every top-level function except the export is a helper, checked whether or not anything calls it: `const name = (…) => …` or `function name(…) { … }`, with an expression or a block body. It follows a lambda's rules but is **pure**: it may read a particle passed to it, but assigns nothing but its own `let` locals, never kills, uses `rng` or touches a counter, and never calls itself, directly or through other helpers. It takes numbers, booleans, vectors or a particle, and returns a number, boolean or vector of one type on every path, or nothing on any. It is checked for each set of argument types it is called with.
- **Values.** Numbers (one type; no integers), booleans and `vec2`. Build a vector with `vec2(x, y)` and read `.x` and `.y`. Two vectors add and subtract; a vector multiplies by a number on either side, divides by one, and negates (`-v`). Nothing else mixes (`v + 1` is wrong; write `v + vec2(1, 1)`). `length(v)` gives a number. Vectors are values: `let v = p.vel; v.x = 0;` leaves `p.vel` alone. Booleans come from comparisons, `true`, `false` and `&&` `||` `!` on booleans, and live in locals and helper results, never in fields; there is no arithmetic on them. Every condition (`if`, `? :`, the operands of `&&` `||` `!`) is a boolean, so `if (p.heat)` is wrong and vectors are never compared or used as conditions.
- **Built-ins:** `vec2` takes two numbers, `length` one vector, `Math.min` and `Math.max` two or more numbers, the other `Math` functions one number each.
- **Syntax.** `const` and `let`, each with an initializer, each keeping its first value's type; `=`, and `+=` `-=` `*=` `/=` `%=`, where `a op= b` means `a = a op b` (so `p.vel += v` is fine and `p.vel += 1` is not); `++` and `--` on numbers; `+ - * / %`, unary `-`, `< <= > >= === !==`, `&& || !`, `? :` (both arms one type); `if` and `else`; `return`; and `for (let k = A; k < B; k++)`, where `A` and `B` are number literals or top-level constants (`<=` and `k += 1` also fit), the body never assigns `k`, and `break` and `continue` may appear. Nothing else: no `while`, `do`, `switch`, `==`, `!=`, `**`, strings, arrays, object literals, computed access (`p["vel"]`, `$[k]`), nested functions, `this`, `new`, `var` or `delete`.
- **Parameters.** A lambda declares its slot's parameters in order, under any names, and may stop early; never more, and no defaults, rest or destructuring.

## The particle

| Field | Type | Starts as | Who writes it |
|---|---|---|---|
| `pos` | `vec2` | the emitter's `(x, y)` | spawn, update; the host moves it each tick |
| `vel` | `vec2` | `vec2(0, 0)` | spawn, force, update |
| `age` | number | 0 | only the host (seconds since spawn); lambdas read it |
| `life` | number | 1 | spawn, update (seconds; the host removes the particle at `age >= life`) |
| `size` | number | 1 | spawn, update (what the host draws) |
| each `.field` | number | its `value` | spawn, update |

`p.kill();` is a verb, not a field: a statement on its own, with no arguments and no value. The particle parameter appears only as `p.<field>`, in `p.kill();`, or passed whole to a helper; it is never given another name (`const q = p`).

## The lambdas

| Lambda | Receives | Gives | May write | `p.kill()` | `rng()` | Counters |
|---|---|---|---|---|---|---|
| `rate` | `t` (seconds since start), `live` (this emitter's particles alive before this tick's spawns) | a number: particles per second | its `let` locals only (it is pure) | no | no | read |
| `spawn` | `p` (the newborn), `rng`, `i` (0, 1, … among this emitter's newborns this tick) | nothing | `p`'s fields, except `age` | no | yes | bump |
| force | `p`, `dt` (the tick) | nothing | `p.vel` only | no | no | no |
| `update` | `p`, `dt` | nothing | `p`'s fields, except `age` | yes | no | bump |

- "Write" means an assignment whose target is exactly `<particle parameter>.<field>`, with the whole field replaced (`p.vel = vec2(0, p.vel.y)`, never `p.vel.y = 0`), or a lambda's own `let` local, a `let` vector's components included. Nothing else is writable: not `$` (in build code either), a top-level constant, a parameter, a `const` local or its components, or the particle under another name.
- Spawn, force and update lambdas have a block body `{ … }` and return no value; a bare `return;` ends one early. A rate lambda has an expression body or a block body that returns a number on every path.
- `rng` is spawn's second parameter, under any name. `rng()` gives a number in `[0, 1)`, and may be called anywhere in spawn's own body (in an `if`, a loop, an argument: `spread(rng(), 80)`); its number may go anywhere, but the function itself is only called, never passed or stored (`helper(rng)`, `const r = rng`). Outside spawn, the name `rng` means nothing. Randomness is chosen at spawn and kept in a field if `update` needs it later.
- **Counters.** Spawn and update may only bump a counter, with the statement `counters.name += <any number expression>` (`p.size` included) or `counters.name++`; they never read or assign it, so the order particles run in cannot change what a lambda sees. A rate lambda may read `counters.name`, getting its value at the start of the tick, and never bumps it. Forces and helpers never touch a counter.
- Particles never see each other, and there is no way to spawn from a lambda: particles come only from emitters.

## One tick

The host runs this; the language describes it. Each tick of `dt` seconds, at time `t` (ticks done times `dt`, so 0 on the first):

1. **Spawn.** For each emitter in declaration order: its rate is `rate(t, live)`, clamped to `0..maxRate` (a rate that is not a number counts as 0); `rate * dt` adds to the emitter's running fraction, and its whole part (taken with a tolerance of 1e-9, so ten ticks of 0.1 make one) is spawned now and subtracted, even if newborns are dropped. Each newborn gets the starting values above, then `spawn` runs on it. Once `maxParticles` are alive, the rest of this tick's newborns are dropped before their `spawn` runs, so earlier emitters may use up the room. Newborns skip steps 2 to 4 this tick (they neither move nor age), but step 5 applies to them.
2. **Forces.** For each particle, oldest first (earlier tick first, then emitter declaration order, then `i`), each force that acts on it runs, in the order the forces were declared.
3. **Move.** The host sets `pos = pos + vel * dt` and `age = age + dt`.
4. **Update.** `update(p, dt)` runs on each particle, oldest first. `p.kill()` marks the particle; the lambda runs to its end.
5. **Remove.** A particle is removed if it was killed, if `age >= life` (compared exactly), if it lies strictly outside the box (`x < 0`, `x > width`, `y < 0` or `y > height`; `size` does not count), or if any field is not a finite number.

Bumps from spawn and update add to their counter during the tick; every rate reads the counters as they stood when the tick began. One seeded random sequence serves the Program, drawn in the order `rng()` is called, so the same built Program, seed and param moves give the same run.

The text view prints the state the host has computed: a header line `t=2.00 live=143/500 jet=120 mist=23` (time to two decimals, live over `maxParticles`, live per emitter in declaration order); then, if the Program has counters, a line `burnedOut=41` (each counter in declaration order, printed as JavaScript prints the number); then the bounds as 40 columns by 20 rows, row 0 at the top, a particle at `(x, y)` in column `floor(x / width * 40)` and row `floor(y / height * 20)` (capped at 39 and 19), each cell `.` when empty, `1` to `9` for that many particles, `#` for ten or more.

## What it must refuse

Each of these must fail to build or to check, with a diagnostic that names the mistake. Numbers 1 to 20 keep their earlier meaning; 21 to 25 are new.

1. A rate lambda that assigns anything but its own `let` locals (`$.rate = 0`, `t = 0`, `GRAVITY = 0`): rate is pure.
2. A write to anything but `p.<field>` and a lambda's own `let` locals: `$` (in build code too), a top-level constant (`GRAVITY = 0`), a parameter (`dt = 0`, `p = …`), a `const` local or its components, or the particle under another name (`const q = p`, refused at the alias, written through or not).
3. A force lambda that writes any field but `vel` (`p.size = 2` in a force).
4. A write to `age`, from any lambda.
5. A write to part of a vector field (`p.vel.x = 0`); the fix writes the whole field, `p.vel = vec2(0, p.vel.y)`.
6. `p.kill()` anywhere but `update`: in spawn, rate, a force or a helper (even one only `update` calls).
7. Any use of `rng` but a call inside a spawn lambda: the name `rng` in rate, a force, update or a helper (as a call, an argument or a parameter), or spawn's `rng` passed or stored.
8. A top-level helper that assigns anything but its own `let` locals (a particle's field, `age` included), or that calls itself, directly or through other helpers.
9. A use of the particle it does not have: an unknown field read or written (`p.speed`, `p.helth`, `p.speed.x = 1`), an unknown verb (`p.die()`), `kill` in any form but the statement `p.kill();`, or a `.field` named like a built-in field or `kill`.
10. A field written with the wrong type: a number into a `vec2` field (`p.vel = 0`) or a `vec2` or boolean into a number field (`p.life = vec2(1, 1)`).
11. A rate lambda that gives something other than a number (`(t) => t > 2`) or misses a `return` on some path; a spawn, force or update lambda that returns a value or has an expression body (`(p) => p.kill()`).
12. An operation on the wrong types: a vector with a number by `+` or `-` (`p.pos + 1`, `p.vel += 1`), a vector times a vector, a number divided by a vector, vectors compared (`p.vel === vec2(0, 0)`), a vector member but `x` or `y`, a number or vector as a condition or as an operand of `&&` `||` `!`, arithmetic on a boolean, a local or ternary arm whose type differs, a built-in called with the wrong count or types, or a helper whose paths return different types.
13. `maxParticles` that is not whole (`250.5`) or outside 1 to 10000; `seed` that is not whole or below 0; `tick` outside 0.001 to 1.
14. An emitter with a negative `maxRate`, or placed outside the bounds; `bounds` with a width or height outside 1 to 4096.
15. Two params, two emitters, two forces or two fields with one name.
16. An emitter's `forces` list naming a force that does not exist (`"gravty"`), or naming one force twice.
17. `bounds` or `maxParticles` missing or called twice; `tick`, `seed` or `update` called twice; a Program with no emitter; an emitter missing its `rate` or its `spawn`, or calling either twice.
18. A read of a param that is not declared (`$.wnd`), in a lambda or in build code, or a build-time read before its `.param` call.
19. `Math.random`, `Math.tan`, `Infinity`, a build-time local (a loop's `k`), or any other name the language does not give a lambda; the diagnostic for `Math.random` should say randomness comes from spawn's `rng`, kept in a field if needed later.
20. `.collide(…)`, with any arguments, on the builder or on a particle: particles never see each other in this language. The diagnostic should say so.
21. Code the language does not have, in a lambda or helper: syntax outside the list above (`while`, `==`, a string, `p["vel"]`, a nested function), a `for` loop whose count is not fixed (`k < $.n`), a function stored or passed, `$` used as anything but `$.name`, a local, parameter or helper named `vec2`, `length`, `Math`, `counters` or `$`, or a lambda with more parameters than its slot, a default, a rest or a destructured one.
22. A malformed builder call: an option missing, unknown or not a finite number; a name that is not a letter followed by letters, digits or `_`; a param whose `value` is outside `min..max`; a lambda slot given anything but an arrow written in place; an extra argument; `.rate` or `.spawn` with no emitter before it; an export that calls `particles` twice or returns anything but its Program.
23. A counter in spawn or update used any way but a bump statement: read (`if (counters.burnedOut > 3)`), assigned (`= 0`, `-= 1`), or its bump used as a value (`x = counters.burnedOut++`).
24. A counter bumped or assigned in a rate lambda, or used at all in a force or a helper.
25. `counters.name` naming no declared counter (`counters.burntOut`), `counters` used as anything but `counters.name`, or two counters with one name.

**Which number.** One mistake gets one diagnostic, at the expression that makes it; a broken expression raises nothing further (`p.life = p.pos + 1` is 12 only). When a mistake fits two numbers, it takes the first that applies here: 20 (`p.collide()`); 7 (so `(t, live, rng) => rng()` is 7, not 21); 25, then 23 and 24 (any counter mistake, over 1, 2 and 12); 6 (a misplaced `p.kill(1)` is 6, not 9); 9 (`p.speed = 1` in a force is 9, not 3); in a helper, 8 for any other assignment (even `p.age = 0`); 4 (`p.age.x = 0` in a force); in a rate, 1 for any other assignment; in a force, 3 (`p.pos.x = 0` is 3, but `p.vel.x = 0` is 5); 2 over 21 (`$ = 1`); 11 for an expression body; 12 over 10; 13 and 14 over 22 for a finite number out of range; 17 over 22 (`.rate` twice is 17); 19 over 21 (`Math.random` passed is 19); otherwise the number whose wording names the case.
