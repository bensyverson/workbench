# REPORT: the particles language

## Difficulty

3. The kit carries most of the language (types, effects per slot, counters as totals, the free-name rule), but several refusals (names, option ranges, bounds, duplicate forces, top-level `let` and constants) need checks I wrote by hand, and some syntax the spec refuses (strings, object and array literals, `null`, `**`, bitwise operators, shadowing `vec2`/`Math`) is accepted by the kit with no hook to refuse it.

## Refusals

Codes are the kit's unless marked **(mine)**. My own codes: X001 bad name, X002 param outside min..max, X003 emitter outside bounds, X004 reserved field name, X005 force listed twice, X006 top-level `let`, X007 non-number top-level constant. "Not run" means I did not write a probe for that case.

1. Rate assigns anything but its own locals: `$.rate = 0` → L013; `GRAVITY = 0` → L013; `t = 0` → L013.
2. Writes to what is not a field or a local: `$ = 1` in a lambda → L013; `$.rate = 3` in build code → B015; top-level constant `GRAVITY = 0` → L013; parameter `dt = 0` / `p = p` → L013; `const` local `v.x = 2` → L013; alias `const q = p` → L018.
3. Force writes a field other than `vel` (`p.size = 2`) → L004.
4. Write to `age` → L013 (spawn, update, and helper all tested).
5. Write to a vector field's component (`p.vel.x = 0`) → L013. The kit's fix line points at a `let` copy, not at the whole-field form the spec gives. A `let` vector's component write is accepted (see `examples/03.js`).
6. `p.kill()` outside update: in spawn → L004; in a helper → L004; in a force → L004; in rate → B013 (`p` is not in scope there). Not run: a helper called only from update (it is refused the same way as any helper).
7. `rng` outside spawn: in a force → B013 (`rng` not in scope); in a helper with no parameter → B013; a helper with a parameter named `rng` → L018; spawn's `rng` passed to a helper or stored (`const r = rng`) → L018. In update and rate: not run, expected the same as force.
8. Helper assigns a particle field (`p.life = 2`) → L004; helper assigns `age` → L013; a self-calling helper → L007 (recursion, reported as "cannot be bounded").
9. Unknown particle member: `p.speed` read → L002; `p.helth = 1` → L002 with "Did you mean 'heat'?"; `p.speed.x = 1` → L002; `p.die()` → L002; `const k = p.kill` → L003 (kill as a value); `.field("size", …)` and `.field("pos", …)` → X004 (mine). `.field("kill", …)` → X004 (mine).
10. Wrong field type: `p.vel = 0` → L003; `p.life = vec2(1, 1)` → L003.
11. Rate returns a bool (`(t) => t > 2`) → L003; rate with a missing return on a path → L003; spawn returns a value → L003; spawn with an expression body → L012. Force with an expression body → L012 (checked with `(p, dt) => p.vel`).
12. Wrong types: `p.pos + 1` → L003; `p.vel += 1` → L003; `p.vel * p.vel` → L003; `1 / p.vel` → L003; `p.vel === vec2(0, 0)` → L003; `p.vel.z` → L002; `if (p.vel)` → L003; `true && 1` → L003; `bool + f64` → L003; ternary with f64 and Vec2 arms → L003; `vec2(p.vel, 1)` → L003; `length(p.vel, 1)` and `Math.min(1)` → L015; local `a` changed from f64 to Vec2 → L003; helper whose paths return f64 and Vec2 → L003; one helper parameter called with f64 and Vec2 → L014; an unused helper with a type error → L003 (the kit checks unused helpers).
13. `maxParticles(250.5)`, `(0)`, `(20000)` → B004; `seed(-1)`, `seed(1.5)` → B004; `tick(0)`, `tick(2)` → B004.
14. Negative `maxRate` → B004; emitter at `x: 500` on a 400-wide box → X003 (mine); `bounds` width 0 → B004; height 5000 → B004.
15. Two params (`wind`), two emitters (`jet`), two forces (`drag`), two fields (`heat`) with one name → B002.
16. `forces: ["gravty"]` → B003 (did-you-mean); `forces: ["drag", "drag"]` → X005 (mine).
17. Missing `bounds` → B005; missing `maxParticles` → B005; `bounds` twice → B006; `maxParticles` twice → B006; `tick` twice → B006; `seed` twice → B006; `update` twice → B006; no emitter → B005; emitter with no `spawn` → B005; emitter `rate` twice → B006. Not run: emitter with no `rate` (same rule as `spawn`, expected B005).
18. Undeclared param in a lambda (`$.wnd`) → L002; in build code (`.maxParticles($.wnd)`) → B003; build-time read before its `.param` → B003.
19. `Math.random()` → L002 with the spec's message (randomness from spawn's `rng`, kept in a field); `Math.tan` → L002 with a message; `Infinity` → B008; `NaN` → B008; a build-time loop variable `k` read in a lambda → B013.
20. `.collide(…)` on the builder → B009 with the spec's message; `p.collide()` → L002 with the same message.
21. Syntax: `while` → S101; `==` → S116; `p["life"]` → L009; nested function → S111; `for (k < $.cap)` → L007; a function stored (`const g = helper`) → L003; `$` alone → L018; `var` → S110; `this` → S103; `new Date()` → B008; `delete` → S106; a default parameter → S114; a rest parameter → B007; more parameters than the slot → L010; a destructured parameter → L012.
    **Not refused:** a local named `vec2` (`const vec2 = 3`), a local named `Math`, a string literal (`const s = "a"`), an object literal, an array literal, `null`, `**`, bitwise operators (`p.life = (rng() | 0) + 1`). The kit accepts these; the API has no way to turn a syntax form or a local name off.
22. Malformed builder call: `maxParticles`-style emitter option missing (`maxRate`) → B004; unknown key (`depth`, `extra`) → B004; a name with a space (`"bad name"`) → B004; `"1x"` → B004; `"_x"` → X001 (mine); a param outside `min..max` → X002 (mine); a force given a helper name instead of an arrow → L012 and L018 (lambda error, not builder error); an extra argument (`tick(1, 2)`) → B004; `.rate` at program level → B001; `particles(…)` opened twice in one export → B016; the export returns something other than the builder → C001.
23. Counter read in spawn (`if (counters.burnedOut > 3)`) → L017; `counters.burnedOut = 0` → L017; `counters.burnedOut -= 1` → L017; `p.life = counters.burnedOut++` → L017.
24. Counter bumped in rate → L004; counter read in a force → L004; counter read in a helper → L004.
25. `counters.burntOut` → L002 with did-you-mean; `counters` alone → L018; two counters named `burnedOut` → B002.

## Where the documents misled you

No passage contradicted what I found, but these were the places where the page was vague or where it differed from `dream-code.md`:

- API.md, the `defineDialect` example has no `helpers` key, and the only mention is in the Library paragraph: "A helper nobody calls is skipped unless `helpers: { check: "all" }`". `dream-code.md` says "Every top-level function except the export is a helper, checked whether or not anything calls it", so I needed `check: "all"` and found it only by reading that paragraph.
- API.md, `name(ns)`: "a JavaScript identifier (`_x` passes; `9jet` and `a-b` are B004)". `dream-code.md` says a name is "a letter, then letters, digits or `_`", so `_x` must be refused. The kit has no pattern option, so I added a check in every name slot.
- API.md, `environment(program)`: "what one Program adds; runs before any lambda is lowered". It does not say whether the returned `members` are merged into or replace the Dialect's own members for `Particle`. I found out by testing (see What you guessed).
- API.md, `text(state)`: "you decide what `state` is (say it in a comment)". `dream-code.md` describes the text view in detail but the host computes the state, and nothing gives the shape the host passes.
- API.md, the rule for `units`/top-level constants: the Grammar's `units` list (in `record`) is described as "top-level helpers and constants the lambdas read". It holds only the ones a lambda reads, so an unused top-level `let` or non-number constant is not seen by `check`. `dream-code.md` refuses those without the "lambda reads it" qualifier.

## What you guessed

- **Vector type name.** `types: { Vec2: vector(2, "f64", …) }`. The name `vec2` is taken by the intrinsic (D007 if both), so the type is `Vec2`.
- **Particle object.** `pos`, `vel`, `life`, `size` writable; `age` read-only; `kill` is a verb with effect `destroy Particle`; each `.field` is added by `environment` as a writable `f64`. The base members stay (verified: `p.pos` and `p.heat` both work).
- **Slot spaces.** `pure` for `rate` (may read `Counters`); `spawn`, `force`, `update` as instance spaces over `Particle`. `force` may `write Particle.vel` only. `spawn` may `write Particle`, `bump Counters`, `rng`. `update` may `write Particle`, `destroy Particle`, `bump Counters`. `body: "block"` on the three that return nothing.
- **Counters.** A total object `Counters` with each `.counter` added as `{ value: "f64", bump: true }`. `rate` reads it; `spawn` and `update` bump it.
- **`rng`.** A callable object `Rng` with `effects: ["rng"]`; spawn's second parameter.
- **Helpers.** `helpers: { check: "all", may: ["read Particle"] }`, so unused helpers are checked and helpers only read.
- **Math.** `min` and `max` declared `params: [f64, f64], rest: f64`; the rest are `abs sqrt floor sin cos`, and `PI` is a value. `random` and `tan` are `rejected` with messages.
- **Intrinsics.** `vec2` spelled `[$0, $1]`; `length` with `ref: Math.hypot` and spelled `Math.hypot(...$0)`.
- **Vector division.** I assumed `vector(2, "f64", { multiply: "scalar" })` gives `v / n` too; a probe `p.vel = vec2(1, 2) / 2` passes, and `1 / p.vel` is refused with L003.
- **Names.** A `check` in each name slot enforces the spec's name rule (X001). `.field` checks against `pos vel age life size kill` (X004). `.param` checks `min <= value <= max` (X002). Force names listed twice in `forces` (X005). Top-level `let` (X006) and non-number constants (X007) are checked in the root's `check`, using `record.units`.
- **Emitter position.** Checked in the root's `check`, not at `.emitter()`, so `.bounds` may come after the emitters (not tested: every probe put `.bounds` first). The emitter's options are the opening argument `data({...}, { as: "at" })`, and `forces` is `listOf(ref("force"))`.
- **Program name.** Any string (the root's `name()`).
- **`tick` default and `seed` default.** Not recorded; the host applies `1/60` and `0`.
- **Text view.** I invented the state the host passes: `{ t, maxParticles, bounds, emitters: [{name, live}], counters: [{name, value}], particles: [{x, y}] }`. I did not run it (no runner). The 40×20 grid and the header follow `dream-code.md`.
- **Parameter count.** More parameters than the slot is L010 (tested). Fewer is not tested.
- **Numbers.** `maxRate` has no upper limit. Emitter `x`/`y` may lie on the bounds' edges.

## Gaps

1. **A slot-specific message for an effect.** Calling `p.kill()` in spawn gives L004 "A spawn may not 'destroy Particle'", not "kill belongs in update". Calling `rng()` in a force gives B013 about a parameter of another lambda. The spec wants messages that name the mistake. Needed: a per-slot `rejected` or `message` for effect and free-name violations.
2. **Refusing syntax.** The Runtime Subset includes string literals, object and array literals, `null`, `**`, and bitwise operators, and these are accepted in my Dialect. Needed: a `forbid` list of syntax forms or operators in the Dialect, and a `reservedNames` list so a local named `vec2`, `Math`, `length`, `counters` or `$` is refused (currently accepted).
3. **Name pattern.** `name(ns)` accepts `_x` and `$`. Needed: `name(ns, { pattern: /…/ })`, or a shape-level check. I used a check instead.
4. **Unused top-level bindings.** The root's `record.units` lists only the bindings a lambda reads. An unused top-level `let Z` or `const S = "x"` passes `check`. Needed: `units` for every top-level binding, not only those read.
5. **Top-level constant source.** `units[].src` holds the *value* for a constant (`const Q = Math.PI` gives `src: "3.141592653589793"`), so a check cannot see that the expression used `Math.PI`. The spec refuses it. Needed: `src` as the source text.
6. **Unused helpers' parameters.** The API says a helper's parameter takes the type its calls pass, so an unused helper has no parameter type. I could not test a type error that goes through such a parameter. I did catch an error in an unused helper's body that does not depend on a parameter (`x * vec2(1, 1) * vec2(1, 1)`). Needed: a declared parameter type for helpers, so unused helpers can be fully checked as the spec requires.
7. **Host-state shape for `text`.** Nothing says what the host passes to `text(state)`. I invented one (see What you guessed).
8. **Environment merge.** The API does not say whether `environment`'s returned `members` merge with or replace the Dialect's base members. It merges (tested), but the page should say so.
9. **Optional defaults.** No way to record a default for an optional option (`tick` 1/60, `seed` 0) in the record. The host has to know it.

## Files

Opened (read):
- `START.md`
- `API.md`
- `dream-code.md`
- `particles.dialect.js` (my own file; read it once before an edit)
- `particles.grammar.js` was not read with the Read tool. I changed it with a shell `cp`/`sed` to restore a debugging line (since removed) and checked the restored file with `grep`.

Written by me: `particles.dialect.js`, `particles.grammar.js`, `examples/00.js` through `examples/03.js`, `REPORT.md`. Probe programs were written to `examples/`, checked, and deleted; only the four clean examples above are left. I also wrote and removed scratch files under `/tmp` (`chk_*.txt`, `grammar.bak.js`) and did not touch the other `/tmp` files in that folder.

Run: `check.sh` (executed many times, never opened).

Not opened: I did not open `check.sh`, `stderr.txt`, `transcript.jsonl` or `log.jsonl`. They appear in the directory listing (names only). No other file on the machine was read, and I did not search the web.
