# REPORT: particles

## Difficulty

**3 / 5.** The kit's dialect and grammar covered most of the sheet the first time I ran it. But about a fifth of the refusals depend on facts the kit never checks. These are uncalled helpers, number-typed conditions, vector × vector, rate return paths, an arrow written in place, and top-level `let`. Some of these I could only enforce by reading the lambda's source text in my own slot checks, and some I could not enforce at all.

## Refusals

Codes are what `check.sh` printed when I wrote each Program. `R…` codes are mine (R + the refusal number). Each must-refuse Program was written, refused, then deleted.

1. **L013**: `t = 0` ("'t' is a parameter"), `$.rate = 0` ("read-only at run time"), `GRAVITY = 0` ("a top-level constant").
2. **L013** for `dt = 0`, `p = 1`, a `const` local or its component (`v.x = 1`), `GRAVITY = 0` and `$ = 1`. **L018** for `const q = p` (refused at the alias). `$.n = 3` in build code gives **B015**.
3. **L004** ("A force may not 'write Particle.size'"). `p.pos.x = 0` in a force gives L013 (vector component), not 3.
4. **L013** ("'age' is read-only") from spawn, update and a called helper. In a force, `p.age.x = 0` gives L002 ("f64 has no member 'x'").
5. **L013** ("'x' is a component of a vector value…").
6. **L004** ("may not 'destroy Particle'") in spawn, a force, and a helper that only `update` calls. **Not refused** in a helper nobody calls, because the kit checks a helper only at its calls.
7. **R007** (my source check) for the name `rng` in rate, a force or update; this also covers `(t, live, rng) => rng()`. In update the kit also adds B013, so that case gets two diagnostics. Spawn's `rng` passed or stored gives **L018**. A called helper that calls an `rng` parameter gives **L003** ("'rng' is not a function"). **Not refused** in a helper nobody calls.
8. **L004** for a write in a helper and **L007** for recursion, direct or mutual (mutual recursion gives one L007 per helper). **Not refused** when the helper is never called.
9. **L002** for an unknown field or verb (`p.speed`, `p.die()`, `p.speed.x = 1`, `p.speed = 1` in a force). **R009** for a `.field` named `pos`, `vel`, `age`, `life`, `size` or `kill`. Bare `p.kill` gives **L003**, `p.kill(1)` gives **L015**, and `p.kill()` used as a value in update gives **R009** (my source check).
10. **L003** ("This is f64, but Particle.vel needs vec2", and the same for vec2 or bool into a number field).
11. **L003** for a rate giving a bool and for update returning a value. **R011** (my source check) for a rate block that can reach its end without `return`, and for an expression body in spawn, force or update.
12. Mostly **L003**: vector ± number, `p.vel += 1`, number / vector, `===` on vectors, a vector as a condition, `p.heat && 1`, arithmetic on a bool, a `let` changing type, ternary arms of different types, and a called helper with mixed return types (refused at the caller as `f64 | bool`). **L002** for a vector member other than `x`/`y`. **L015** for a built-in with the wrong argument count. **Not refused:** vector × vector (`p.vel * p.vel`), and a number used as a condition (`if (p.heat)`, `!p.heat`, `p.size ? 1 : 0`). Mixed returns in a helper nobody calls are also not refused.
13. **B004** (not whole, below min, above max).
14. **B004** for a negative `maxRate` and for bounds outside 1 to 4096. **R014** for an emitter outside the bounds.
15. **B002**.
16. **B003** with did-you-mean for an unknown force; a forward reference is fine. **R016** for a force named twice.
17. **B005** (missing `bounds`, `maxParticles`, emitter, `rate` or `spawn`). **B006** (a once-only call made twice, including `.rate` and `.spawn`).
18. **L002** in a lambda (`$.wnd`). **B003** in build code, for an undeclared param or a read before its `.param`.
19. **R019** for `Math.random`, including when passed; the message names spawn's `rng()` and storing the number in a field. **L002** for `Math.tan`. **B008** for `Infinity`, `NaN` and `undefined`. **B013** for a build-time local (`k`).
20. **B009** on the builder ("particles never see each other…"). **R020** on a particle in a lambda. In a helper, `p.collide()` gets only the generic L002.
21. **S101** (`while`, `do`), **S116** (`==`), **S111** (nested function), **S110** (`var`), **S114** (default), **S102** (`new`), **S103** (`this`). **B007** "does not parse" (rest parameter, `switch`). **L009** (computed access, when no string is involved). **L007** (`k < $.n`, assigning `k`). **L018** (`$` as a value). **L003** (storing `Math.max`). **L010** (extra parameter). **L012** (destructuring, `let` with no initializer). **C001** for `delete` (JS refuses the file). **R021** (my source check) for strings (which also catches `p["vel"]`), `**`, and a local or parameter named `vec2`, `length`, `Math`, `counters` or `$`. **Not refused:** a lambda reading a top-level `let` number, and a helper parameter named `Math` and so on, because helpers are invisible to my checks.
22. **B004** for an option missing, unknown, not a number or not finite, a non-identifier name, and an extra argument. **R022** for names the kit accepts but the sheet does not (`_hot`, `h$t`) and for a param `value` outside `min..max`. **B007** for a function expression. **B001** for `.rate` with no emitter. **B016** for opening `particles` twice. **B017** for returning something else. **Not refused:** a lambda slot given a named arrow (`.force("f", fn)` with `const fn = (p) => {}`).
23. **L017** (a read, `=`, `-=`, and a bump used as a value).
24. **L004** for a bump in rate and for a read or bump in a force or a called helper. **L017** for `=` in rate. A counter in a helper nobody calls is **not refused**.
25. **L002** for an unknown counter. **L018** for `counters` as a value. **B002** for a duplicate counter.

## Where the documents misled you

- API.md lists `library: { half: { fn: "(x) => x / 2" } }` as "operations written as lambda source; no spelling needed". I first wrote `length` that way. A Program that calls `length(1)` then gets its errors reported in my dialect file instead of the Program, e.g. `particles.dialect.js:40: L014 the Library's 'length': The type of 'v' cannot be inferred…`. Parameter types come only from call sites. I switched to an intrinsic, which needs a spelling.
- API.md says the record has `units: [ /* top-level helpers and constants the lambdas read */ ]`, and that checks see the record. In a construct `check`, `record.units` is `undefined` (I printed `Object.keys(record)`). So no check of mine can see helpers.
- dream-code.md says "dead branches, unused forces and uncalled helpers are checked too". API.md's "A helper's effects count at every call" says nothing either way about uncalled helpers. In fact the kit does not check an uncalled helper at all: a recursive, field-writing or `rng`-calling helper nobody calls passes clean.
- API.md, pitfall 10: "a top-level constant must be plain data". This reads as if only `const` qualifies, but the kit also lets a lambda read a top-level `let`.
- API.md says `name(ns)` gives "an identifier". It means a JavaScript identifier, so `_x` and `h$t` pass. The sheet wants a letter, then letters, digits or `_`.

## What you guessed

- **Vectors in the JS target.** I spelled `length` as `Math.hypot($0.x, $0.y)`, assuming vectors compile to objects with `.x`/`.y`. Nothing says how `vector(2, "f64")` is represented.
- **`rng`.** I made it a callable object (`Rng`, effect `rng`) passed as spawn's second slot parameter.
- **Force write effect.** I wrote it as `"write Particle.vel"`, a single-member pattern.
- **Counters.** I made them totals on a `Counters` object, filled by `environment` from `program.counter`. `rate` gets `may: ["read Counters"]`.
- **Fields.** `environment` adds them to `Particle` from `program.field`, skipping built-in names (those are refused by R009).
- **Text view.** I chose the shape of the `text(state)` input: `{ t, maxParticles, width, height, emitters, counters, particles }`.
- **Emitter options.** They go under the record key `opts`. The emitter-in-bounds check and the duplicate-force check run in the Program's `check`, and the bounds check is skipped when the bounds themselves are invalid, so one mistake gives one diagnostic.
- **My error codes.** `R` plus the refusal number.
- **Source-text checks.** These run on the lambda source a slot check receives. They strip comments, then refuse `.collide`, `Math.random`, `rng` outside spawn, reserved local or parameter names, quotes, `**`, `p.kill()` used as a value in update, and expression bodies. For a rate block, a small structural check requires every path to end in `return`; it handles `if`/`else` and nested blocks, and a `for` loop never counts as returning.
- **`p.kill()` without `;`** before `}` still counts as the statement.
- **Any identifier `rng`** outside spawn is refused, including a local of that name. Property names (`p.rng`, `$.rng`) are allowed.
- **A top-level helper named `collide`** is allowed; only `.collide` is refused.

## Gaps

- **Helpers are invisible to definition-side checks.** I needed `record.units` (or helper sources) in `check`. Smallest fix: pass `units: [{ name, kind, src }]` to construct checks, or check every top-level helper once with its own parameter types even when uncalled.
- **No strict boolean conditions.** I needed a dialect switch such as `conditions: "bool"`, so that a number as `if`/`?:`/`!`/`&&` operand is an L003. Vectors are already refused.
- **No way to stop vector × vector.** I needed a `vector(2, "f64", { multiply: "scalar" })` option.
- **No "returns on every path" check** for a slot with `returns: "f64"`: a rate block with no `return` passed. The kit should report it.
- **No explanatory messages for lambda members.** I needed a per-object `rejected` (e.g. `Math.random`, `Particle.collide`) with a message and fix. I worked around it with source regexes, which miss helpers.
- **No way to require an arrow written in place.** A lambda slot accepts a reference to a top-level arrow.
- **No refusal of top-level `let`** (or of non-number plain data) as lambda-readable data. I needed a dialect option restricting top-level data to number constants.
- **No name syntax option.** I needed `name(ns, { pattern })`. JS identifiers are too wide, so I added a slot check.
- **No control over diagnostic count.** Some single mistakes give two diagnostics (e.g. `rng` read in update gives my R007 plus the kit's B013), against the sheet's "one mistake gets one diagnostic".

## Files

Opened (read): `START.md`, `API.md`, `dream-code.md`, and my own `particles.grammar.js` (one partial read back after writing it). I wrote `particles.dialect.js`, `particles.grammar.js`, `examples/00.js`–`02.js`, the temporary must-refuse Programs in `examples/` (all deleted), and this report.

I ran `check.sh` but never opened it. A directory listing showed `stderr.txt` and `transcript.jsonl`; I did not open either. Outside the folder, I wrote a small generator script for must-refuse Programs at `/tmp/pgen-a/mk.sh`, ran it, and deleted it. I read no other file on the machine and did not search the web.
