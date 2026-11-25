# REPORT: particles

## Difficulty

**3 out of 5.** The Dialect and Grammar covered about 80% of the sheet and checked clean on the first run. The rest (reserved names, strings, arrays and object literals, `**`, helpers nobody calls, bool-vs-number types) can't be said in the API, so I wrote a token-level lint inside the Grammar's `check` functions to refuse them.

## Refusals

Codes `T0nn` are mine; `nn` is the refusal's number on the sheet. Every case below was written as a one-mistake Program, run through `check.sh`, and deleted.

1. **T001**: a rate lambda that assigns anything but its own `let` (`$.rate = 0`, `t = 0`, `GRAVITY = 0`). Counter assignments in a rate go to 24 instead.
2. **L013**: a parameter (`dt = 0`, `p = 0`, `i = 2`), a `const` local, or a `const` vector's component. **L018**: `const q = p`, refused at the alias whether or not it is written through. **B015**: `$.a = 3` in build code. The message for that one is unclear ("reads the params through a property descriptor").
3. **L004**: `p.size = 2` in a force ("A force may not 'write Particle.size'"). **T003**: a partial write of another field in a force (`p.pos.x = 0`), which the kit would otherwise report as a vector-component write (5).
4. **L013**: "'age' is read-only" from any lambda, including `p.age++`. **T004**: `p.age.x = 0`.
5. **L013**: "'x' is a component of a vector value, which cannot be changed in place". `p.vel.y += 1` in spawn gives the same.
6. **T006**: in spawn, in a force (including `p.kill(1)`), or in a helper, whether or not anything calls it. A rate has no particle, so `p.kill()` there is **B013**.
7. **T007**: `rng` as a parameter of a rate, force, update or helper, or as a local outside spawn. **B013**: a bare `rng` outside spawn, in a lambda or a helper. **L018**: spawn's `rng` passed (`h(rng)`) or stored (`const r = rng`).
8. **T008**: a helper that assigns anything but its own `let` (`p.size`, `p.age`, `p.vel.y`, a parameter, `GRAVITY`). **L007**: a helper that calls itself, directly or through another helper.
9. **L002**: an unknown field or verb (`p.speed`, `p.helth` with "Did you mean 'heat'?", `p.speed.x = 1`, `p.die()`, and `p.speed = 1` in a force). **L003**: `p.kill` not called. **T009**: kill used as a value (`let a = p.kill()`), and a `.field` named `pos`, `vel`, `age`, `life`, `size` or `kill`.
10. **L003**: "This is f64, but Particle.vel needs vec2", and the same for vec2 or bool into a number field.
11. **L003**: a rate that gives a bool or misses a return on some path; a spawn, force or update that returns a value. **L012**: an expression body on spawn, force or update.
12. **L003**: vector ± number, vector × vector, number / vector, `===` on vectors, a number or vector as a condition or as an operand of `&& || !`, arithmetic on a bool, a local's type changing, vector-vs-number ternary arms, vector-vs-number helper returns. **L002**: `.z`. **L015**: a built-in's argument count. **L014**: a helper parameter given two types. **T012**: bool-vs-number ternary arms and bool-vs-number helper returns, which the kit lets through.
13. **B004**: maxParticles `250.5`, `0` or `10001`; seed `1.5` or `-1`; tick `0` or `2`.
14. **B004**: a negative `maxRate`; bounds outside 1..4096. **T014**: an emitter outside the bounds. It is skipped when the bounds are themselves out of range, so that mistake raises one diagnostic.
15. **B002**: two params, emitters, forces, fields or counters with one name. Different kinds may share a name.
16. **B003**: an unknown force, with did-you-mean. **T016**: a force listed twice.
17. **B005**: bounds or maxParticles missing, no emitter, rate or spawn missing. **B006**: any `once` slot called twice, including `.rate` and `.spawn`.
18. **L002**: `$.wnd` in a lambda. **B003**: an undeclared param read in build code, or a read before its `.param` call.
19. **L002** with my message: `Math.random` ("randomness comes only from spawn's rng(), kept in a field…"), `Math.tan`, and `Math.random` passed. **B008**: `Infinity`, `NaN`, `undefined`, `Date`. **B013**: a build-time local such as a loop's `k`. **T019**: a lambda reading a top-level `let` or a constant that is not a number. **C001**: another import fails to load (the file can't be found).
20. **B009**: `.collide(…)` on the builder or on an emitter. **L002**: `p.collide()`. Both say "particles never see each other in this language".
21. Kit codes: **S101** `while`/`do`, **S116** `==`/`!=`, **S111** a nested arrow, **S110** `var`, **S114** a default, **S106** `delete`, **B007** `switch`, function declarations and rest params (as parse errors), **L007** a loop count that isn't fixed or a body that assigns `k`, **L010** extra parameters, **L012** a destructured parameter or `let a;`, **L003** a function stored or passed, **L018** `$` used as a value, **B002** a top-level helper named `length` or `counters`. My lint, **T021**: strings, arrays, computed access (`p["vel"]`, `$["rate"]`), object literals, `**`, and a local or parameter named `vec2`, `length`, `Math`, `counters` or `$`.
22. **B004**: an option missing, unknown or not finite (including `Infinity`); a name that isn't an identifier (`9e`, `a-b`, `""`); an extra argument. **B007**: a lambda slot given a non-function. **B001**: `.rate` with no emitter before it. **B016**: `particles` called twice. **B017**: an export that returns something else. **T022**: a param's value outside min..max; names the kit accepts but the sheet doesn't (`_a`, `a$`, `$f`, `_e`); a lambda slot given a top-level helper by name. **Not refused:** a lambda slot given its source as a string (`.update("(p) => { … }")`). The kit takes "an arrow function or its source text", and my check sees a string either way (see Gaps).
23. **L017**: a read, `= 0`, `-= 1`, `*=`, `--`, and a bump used as a value ("a total, a bump used as a value").
24. **L004**: a bump in a rate, or any counter use in a force. **L017**: `=` in a rate. **T024**: any counter use in a helper, called or not.
25. **L002**: `counters.burntOut`, with did-you-mean. **L018**: `const c = counters`. **L013**: `counters++`. **T025**: `counters["…"]`. **B002**: two counters with one name.

**Where my numbering is off:**
- Some broken expressions raise two kit diagnostics, against the sheet's "one mistake gets one diagnostic":
  - mixed ternary arms assigned to a field (12k);
  - `p.size = p.heat && 1` (12s);
  - a helper called with two types (12p: L003 plus L014).
- My lint is stricter than the sheet in two places:
  - it rejects a counted `for` stepping with `k = k + 1` (the kit's rule);
  - it gives T022 to an inline lambda whose text is identical to a top-level helper's (see What you guessed).

## Where the documents misled you

- API.md: "`lambda(convention)` is a Runtime Lambda" and "The kit never calls them: it reads their source". Nothing says a slot also takes a source *string*. The kit's B007 message says "an arrow function or its source text", and a slot check receives a string even for a real arrow. So the sheet's "every lambda slot takes an arrow function written in place" can't be enforced.
- API.md: "`name(ns)` declares a name in namespace `ns`: a JavaScript identifier (`_x` passes…)". The kit also accepts `$` in names. Its fix line says "use letters, digits, _ and $". The sheet allows only a letter, then letters, digits or `_`, so I added T022.
- API.md: `rejected: { random: { message, fix } }`, and "`fix` is code to write instead". For `.collide` there is no code to write, so I tried `tip` instead of `fix`. The kit accepted it and printed it on the `fix:` line. `tip` on `rejected` is not documented.
- API.md: `conditions: "bool"` reads as if bool is kept apart from numbers. In fact the kit lets `c ? true : 1` and a helper returning `true` on one path and `1` on another pass, even when the helper is called (I added T012). It does catch `bool + 1`, `-true` and bool into an f64 local.
- API.md: "`units: [ /* top-level helpers and constants the lambdas read */ ]`". In practice every top-level function was in `units`, even uncalled ones, but a `let` or string constant appeared only when a lambda read it. That was what I needed; the comment just didn't predict it.
- API.md: "A helper nobody calls is skipped unless `helpers: { check: "all" }`, which checks its effects, recursion and syntax". "Effects" sounds like `(p) => { p.size = 1; }` would be refused. It is not when uncalled, because `p` is untyped. The same sentence does say "not what it does through its untyped parameters", so this misled only on first reading.

## What you guessed

- **Codes:** `T0nn` for refusal `nn`, so a reader can find the sheet's rule.
- **Spaces:** rate runs in a pure space with `may: ["read Counters"]`. Spawn, force and update run in the instance space `Particle`:
  - force may only `write Particle.vel`;
  - spawn may `write Particle`, use `rng` and `bump Counters`;
  - update may `write Particle`, `destroy Particle` and `bump Counters`.
- **Particle members:** `age` is a read-only member, which makes writes L013. `kill` is a verb with `destroy Particle`. `rng` is a callable object `Rng` with effect `rng`. Counters are totals (`bump: true`), filled by `environment`.
- **Helpers:** `helpers: { check: "all", may: ["read Particle"] }`.
- **Top-level constants:** a non-number constant, or a `let`, is refused only when a lambda reads it. Build code may still use string constants. "A number expression" means number literals, `+ - * / % ( )` and other constants the lambdas read.
- **A local named `rng`** outside spawn is T007. A parameter named `rng` in a rate, force or update is also T007, following the sheet's precedence example.
- **Force partial-write check (T003):** it knows the built-in fields and the fields declared *before* the force. A partial write of a field declared later falls back to kit codes.
- **Lambda given a helper by name (T022):** caught by comparing the lambda's source text with each top-level helper's. An inline lambda whose text exactly matches a helper is a false positive.
- **Emitter outside bounds:** checked only when the bounds themselves are valid.
- **`text(state)`:** I chose the state shape, documented in a comment: `{ t, maxParticles, width, height, emitters: [{name, live}], counters: [{name, value}], particles: [{x, y}] }`. Particles outside the box are clamped into the edge cells.
- **`length`:** an intrinsic spelled `Math.hypot($0[0], $0[1])`. `Math.min` and `Math.max` take two numbers plus `rest`.
- **Ordinary `if` and `else`:** I did not try to refuse anything beyond the syntax list.

## Gaps

1. **An arrow written in place versus a string or a helper's name.** A lambda slot can't require an arrow written in place. Smallest change: a `lambda(conv, { inline: true })` option, or passing the original value to slot checks.
2. **Reserved local and parameter names.** No Dialect key reserves names (`vec2`, `Math`, `counters`, `$`, `rng`) for locals and parameters. Smallest change: `reservedNames: [...]` in the Dialect.
3. **Syntax subset.** The kit's subset allows strings, array and object literals, computed access and `**`, which this language forbids. Smallest change: `syntax: { strings: false, arrays: false, objects: false, pow: false }`.
4. **Helpers nobody calls.** Their writes, kills and parameter types go unchecked through untyped parameters. Smallest change: let `helpers.check: "all"` treat any `x.member = …` on a parameter as a write, or allow declaring a default parameter type.
5. **Bool vs f64.** Ternary arms and helper returns mixing bool and number pass the kit.
6. **Location for root-check errors.** A root `check` can't point at a unit's line: my helper errors print at the export line. Smallest change: `ctx.error(..., { unit: name })`.
7. **Name rule.** `name()`'s identifier rule isn't configurable (it allows `$` and a leading `_`). Smallest change: `name(ns, { pattern })`.
8. **Cascades.** Some kit errors cascade into two diagnostics for one mistake.
9. **Lint inside Grammar checks.** Everything above that the sheet requires, I wrote as a source lint inside Grammar checks. It works, but it is the "work around it" that START.md warns against. It is all visible in `particles.grammar.js`, marked by the `T0nn` codes.

## Files

- **Opened (read):** `START.md`, `API.md`, `dream-code.md`.
- **Written:** `particles.dialect.js`, `particles.grammar.js`, `examples/00.js` (the sheet's Program, verbatim), `examples/01.js`, `examples/02.js`, `REPORT.md`.
- **Scratch:** a test generator under `.tests/` (Python scripts and JSON case lists) and temporary `examples/zz_*.js` files. All are deleted.
- **Outside the folder:** one slip. I briefly wrote the generator script to `/tmp/ptest/mk.py`, then moved it into this folder and removed `/tmp/ptest`. It was my own file; I read nothing there.
- **Run but not opened:** `check.sh`.
- **Not opened:** `stderr.txt`, `transcript.jsonl` and `log.jsonl`. They are in the folder, but I only saw their names in `ls`.
- I opened no other file on this machine and did not search the web.
