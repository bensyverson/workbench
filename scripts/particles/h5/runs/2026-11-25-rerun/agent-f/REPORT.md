# REPORT: particles language

## Difficulty

**3 of 5.** The Dialect and the builder mapped onto the API without much friction, but three things needed workarounds: name rules, the cross-checks that need the whole Program, and the uncalled-helper gap.

## Refusals

Diagnostic codes: where the kit gives a code, I list it. Codes beginning `Q` are mine, written as `Q` plus the sheet's number. Each of the 25 entries says whether I tested it and what happened. I did not implement the sheet's "Which number" precedence, so when one mistake fits two numbers, the kit's code is what you get.

Refusal Programs were written in batches of 25 and 10, checked with `check.sh` in one run per batch, then deleted. Only `examples/00.js`, `01.js` and `02.js` remain.

1. **L013** (tested: `t = 0` in rate). Also L013 for `$` and top-level constants written in a lambda.
2. **L013** (tested: `GRAVITY = 0` in spawn). A parameter write is also L013. Alias `const q = p` is **L018** (tested). Writing `$` in build code is not tested.
3. **L004** (tested: `p.size = 2` in a force).
4. **L013** (tested: `p.age = 0` in update). The sheet says "from any lambda"; I did not test age in a force.
5. **L013** (tested: `p.vel.x = 0` in a force). The message says a component of a vector cannot be changed in place.
6. **L004** (tested: `p.kill()` in spawn). In a *helper* this is **not refused** when the helper is never called: see Gaps. A helper that *is* called with a particle should give L004 (not tested).
7. `rng` in rate: **B013** (tested). The kit says "rng is a parameter of another lambda", which is not the sheet's wording. `rng` passed to a helper: **L018** (tested, in spawn). `rng()` used inside a helper and `rng` as a helper parameter: not tested.
8. Helper writing a particle field: **L004** (tested). Recursion: **L007** (tested, `loop` calls itself). A helper assigning `age`: not tested, but it should be L004 by the same rule.
9. Unknown field `p.speed`: **L002** (tested, read and write). Unknown verb `p.die()`, `p.speed.x = 1`: not tested. `.field("kill")` or `.field("vel")`: **Q009** (my check; not tested).
10. Number into a vec2 field: **L003** (tested, `p.vel = 0`). A vector into a number field: not tested.
11. Rate returning a boolean: **L003** (tested). Spawn with an expression body: **L012** (tested, `.spawn((p, rng) => p.size = 1)`). Rate missing a return on some path: not tested.
12. `p.pos + 1`: **L003** (tested). The other operand cases are not tested.
13. `.maxParticles(250.5)`: **B004** (tested). `.seed(-1)`: **B004** (tested). `.tick` out of 0.001..1: B004 expected from the data bounds, not tested.
14. Emitter outside the bounds: **Q014** (my check, tested). Negative `maxRate`, or bounds outside 1..4096: B004 expected from the data bounds, not tested.
15. Two params with one name: **B002** (tested). Two fields, emitters or forces with one name: not tested, but the same kit mechanism.
16. `forces: ["gravty"]`: **B003** (tested, with a did-you-mean). A force named twice in `forces`: **Q016** (my check; not tested).
17. No `.bounds`: **B005** (tested). The other sub-cases (no maxParticles, bounds twice, no emitter, missing spawn, `tick` twice) are not tested; I expect B005/B006 from the `once`/`required` flags.
18. `$.wnd` in rate: **L002** (tested). Build-time read before `.param`: **B003** (tested).
19. `Math.random()`: **L002** (tested), with the sheet's message through `rejected` ("randomness comes from spawn's rng…"). `Math.tan`: unknown member, not tested. `Infinity`: **B008** (tested) with a generic message, not the sheet's wording. Build-time locals (a loop's `k`) in a lambda: not tested.
20. `.collide()` on the builder: **B009** (tested) with the sheet's message through `rejected`. `.collide()` on a particle: `rejected` is set on Particle, not tested.
21. `while` in spawn: **S101** (tested). `for (let k = 0; k < $.rate; k++)`: **L007** (tested, "not declared a size"). Strings, `==`, `p["vel"]`, nested functions, default parameters, a local named `vec2`: not tested.
22. Name `_x` on `.param`: **Q022** (my check, tested). Param value outside min..max: **Q022** (tested). Missing option, extra argument, `.rate` with no emitter, export calling `particles` twice: not tested.
23. `if (counters.burnedOut > 3)` in spawn: **L017** (tested). `x = counters.burnedOut++`: **L017** (tested). Assigning a counter with `= 0`: not tested.
24. `counters.burnedOut++` in rate: **L004** (tested). Counters in a force or helper: not tested.
25. `counters.burntOut++`: **L002** (tested, with a did-you-mean). Two counters with one name: **B002** (tested).

## Where the documents misled you

- **API.md, on names:** "a JavaScript identifier (`_x` passes; `9jet` and `a-b` are B004)". **dream-code.md** says: "**Names** are strings … a letter, then letters, digits or `_`", and refusal 22 says "a name that is not a letter followed by letters, digits or `_`". The kit accepts `_x`, so the sheet's rule needed my own check. The two documents disagree, and a reader of API.md would not expect the extra check.
- **API.md, on helpers:** "`helpers: { check: "all" }`, which checks its effects, recursion and syntax, not what it does through its untyped parameters." **dream-code.md** says every top-level function is "checked whether or not anything calls it", and refusal 6 says `p.kill()` is refused "even one only update calls". Taken together, these say an uncalled helper's `q.kill()` is refused. The kit does not refuse it. The API page does say this gap exists, but it is not connected to the sheet's rule.
- **API.md, on `environment`:** "`environment(program)` may add writable members and totals." It does not say whether the returned `members` merge with or replace the Dialect's declared members. I first returned the whole `Particle` member set, and the first run failed with `D007 environment(program) declares Particle.pos twice`. The kit merges and forbids repeating a declared member; the page does not say so.
- **API.md, on instance objects in helpers:** the page says "nothing else in the Dialect may hold or return an `Obj` (D022)". Read literally, that forbids a helper parameter of type `Particle`, but the sheet requires helpers that take a particle (`dying(p)`, `reset(p)`). The kit accepted a helper parameter of type `Particle` without complaint, so I followed the sheet. The page does not say whether that is intended.
- **dream-code.md, "Which number":** the precedence rules ("7 (so `(t, live, rng) => rng()` is 7, not 21)") assume the diagnostics can be ordered and numbered by the language. The kit's codes are fixed (B/D/L/S), and no API lets a Dialect pick which one a mistake gets. This is less a misleading statement than a demand the API cannot meet; see Gaps.

## What you guessed

- **Diagnostic codes.** I used `Q` (not in the banned letters B, C, D, L, P, S, V) plus the sheet's number, for the checks I wrote: `Q009` (field name), `Q014` (emitter outside bounds), `Q016` (repeated force name), `Q021` (top-level `let` or non-number const, my own choice of number), `Q022` (name shape and param range).
- **Particle object.** One object `Particle`. The base members are `pos`, `vel`, `age`, `life`, `size` (`age` read-only) and `kill` as a verb with effect `destroy Particle`. Fields come through `environment` as writable `f64` members. I did not repeat the base in `environment`, because that caused D007.
- **Spaces.** `pure` for rate. A single instance space `particle` for spawn, force and update, with a separate `may` per slot:
  - spawn: `write Particle`, `rng`, `bump Counters`
  - force: `write Particle.vel`
  - update: `write Particle`, `destroy Particle`, `bump Counters`
- **Counters.** A `Counters` object whose members are totals, added by `environment` from the declared counter names. Rate may read them, and spawn and update may bump them.
- **Math.** `min` and `max` are `rest` functions. `abs`, `sqrt`, `floor`, `sin`, `cos` take one `f64`. `PI` is read-only. `random` is `rejected`.
- **`length`.** An intrinsic on `vec2`: `ref` is `Math.hypot`, and the js spelling is `Math.hypot(...$0)`.
- **Emitters.** A child construct `emitter` under `program`, with `required: true`. Opening arguments are the name (namespace `emitter`) and an options object with `as: "at"`. The `forces` list is `listOf(ref("force"))`. `rate` and `spawn` are `once` and `required`.
- **Cross-checks in the root `check`.** Emitter inside the bounds (edges included) and repeated force names. Both need the whole Program, because `bounds` and `forces` may come after the emitter.
- **Top-level bindings.** Root `check` reads `units`: any `let` is refused, and any `const` that is not an arrow or `function` and contains a string, array, object or boolean literal is refused. I assumed `units` lists the top-level names the lambdas read. The unused string constant I tried was not flagged, so I assumed unused names are not listed.
- **`text(state)`.** I chose the state shape `{ t, live, maxParticles, bounds, emitters, counters, particles }`, which the Dialect header comment documents. I did not execute `text`, because I have no way to run it through the kit from these pages.
- **`bounds` shape.** `data({ width: data("number", {min: 1, max: 4096}), height: … })`. The API says `data("number", {...})` works inside a shape, and it did.
- **Dialect export name.** `particlesDialect` (grammar imports it from `./particles.dialect.js`). The grammar exports `particles`, as the sheet requires.
- **`helpers: { check: "all" }`**, because the sheet says every top-level function is checked.
- **`conditions: "bool"`**, for the sheet's "every condition is a boolean".
- **`tick` and `seed` defaults.** The grammar has no way to give a default, so when they are not called the record has no key, and the host must supply 1/60 and 0. I did not verify that the host does.

## Gaps

- **Uncalled helper with a particle parameter.** `const kill1 = (q) => { q.kill(); return 0; };` is not refused (tested). `helpers: { check: "all" }` does not type an uncalled helper's untyped parameters, so the particle's verbs and writes are not checked there. The smallest change: type a helper's particle parameter as `Particle` when the Dialect declares it, or check helpers as the particle type even when uncalled.
- **Defaults for optional slots.** The sheet gives `tick` a default of `1 / 60` and `seed` a default of 0. The grammar cannot state a default on an optional `once` slot. The smallest change: an optional `default` on a decl slot, which would put the value into the record.
- **Precedence among diagnostics.** The sheet orders refusals ("Which number"). The API has no way to give a Dialect's check a priority. The smallest change: an optional `priority` on a `ctx.error` call, or a rule that the kit sorts its own codes by the Dialect's order.
- **Top-level non-number constants that lambdas do not read.** The kit's `units` seems to list only names lambdas read, so an unused `const S = "fire"` is not refused. The sheet's rule is about constants lambdas may read, so this is probably fine, but it is not verified.
- **Free-name messages.** `Infinity` gives `B008 the spawn lambda reads "Infinity", which it cannot see`. The sheet asks for a message that names the mistake. There is no way to add a `rejected`-style message to a free name in `globals`. The smallest change: `rejected` on the Dialect's free names.
- **The sheet's `rng` diagnostic.** The sheet says a use of `rng` in rate gives 7. The kit gives B013, which talks about a parameter of another lambda. Same as the precedence point.
- **Text view.** I could not run `text(state)` with the kit, so its output is unverified. The API says the host runs `run(programFn, { values })` and that I decide what `state` is, but it gives no example of the state the host has.

## Files

Files opened and read:
- `START.md`
- `API.md`
- `dream-code.md`

Files run, not opened:
- `check.sh`: run many times with `./check.sh`. I did not read it.

Files I listed but did not open:
- The directory listing (`ls -la`) showed `stderr.txt` and `transcript.jsonl`. I did not open either.

Files I wrote:
- `particles.dialect.js`
- `particles.grammar.js`
- `examples/00.js` (verbatim from `dream-code.md`), `examples/01.js`, `examples/02.js`
- `REPORT.md`

Files I created and deleted: the must-refuse Programs (`r01`–`r25`, `x01`–`x10`, `y01`–`y03`, `z01`–`z02`), all removed before the final check.

Nothing else was opened: no other files on the machine, no kit source, no web.

One mistake in my own shell command: a stray line in a batch command printed `sed: … No such file or directory`. The file it was meant to create (`r13.js`) was still produced by the following pipeline, and the check reported its B004 error as expected. Nothing else was affected.
