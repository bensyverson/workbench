# Report: particles

## Difficulty

3. The Dialect and Grammar checked clean on the first run and the kit refuses most of the 25 cases itself. The hard part was the rules the API cannot state: strings, arrays, `**`, bitwise operators, names that shadow the language's own, `rng` declared outside spawn, uncalled helpers, and passing `$` or `counters` whole. I had to refuse those with my own checks, which read the lambda source text with regexes in `particles.grammar.js`.

## Refusals

I proved each case with a throwaway Program in `examples/`, ran `check.sh`, then deleted the Program. Codes starting with X are my own checks.

1. Rate assigns something other than its own let locals: **L013** (`$.rate = 0`, `t = 0`, `GRAVITY = 0`).
2. Bad write targets: **L013** for a parameter (`dt = 0`, `p = 0`), a const local or its component, or a top-level constant. **L018** at the alias for `const q = p`. In build code, `$.a = 3` gives **B015**: refused, but the message is about reading params.
3. A force writing `p.size`: **L004**.
4. A write to `age`: **L013** (read-only member).
5. `p.vel.x = 0`: **L013** ("component of a vector value").
6. `p.kill()` in spawn or a force: **L004**. In a helper that some lambda calls: **L004** at the helper. In a helper nobody calls: **X008**. A rate has no particle, so it can't call kill.
7. `rng` used freely in rate, a force, update or a helper: **B013**. Spawn's rng stored or passed: **L018**. `rng` declared as a parameter or local outside spawn, including `(t, live, rng) => rng()`: **X007**. A helper parameter or local named `rng`: **X007**.
8. A helper writing a particle field when a lambda calls it with a particle: **L004**. The same write in an uncalled helper: **X009**. A helper assigning its own parameter: **L013**. Recursion, direct or indirect: **L007**.
9. Unknown field or verb (`p.speed`, `p.die()`, `p.speed.x = 1`): **L002**. `p.kill` not called: **L003**. `p.kill(1)`: **L015**. Kill used as a value (`const k = p.kill()`): **X010**. A `.field` named like a built-in field or `kill`: **X003**. **Not refused:** an unknown field read through a parameter of a helper nobody calls. The kit leaves untyped parameters unchecked, and from the text alone I can't tell that the parameter is a particle.
10. A field written with the wrong type: **L003**.
11. A rate giving a bool, or missing a return on some path: **L003**. An expression body on spawn, a force or update: **L012**. A value returned from a void lambda: **L003**.
12. Wrong-type operations, vector compare, bool arithmetic, ternary arm mismatch, local type change, helper paths returning different types: **L003**. A vector member other than `x` or `y`: **L002**. A built-in called with the wrong number of arguments: **L015** (wrong types: L003). A helper parameter given two types: **L014**, but it arrives together with an L003 (two diagnostics where the sheet wants one).
13. `maxParticles`, `seed` or `tick` out of range or not whole: **B004**.
14. A negative `maxRate`, or bounds out of range: **B004**. An emitter outside the bounds: **X005**. This also works when `.bounds` comes after the emitter.
15. Two declarations with one name, for each kind including counters: **B002**. Kinds may share a name, and that checks clean.
16. An unknown force name: **B003**, with did-you-mean. A force listed twice: **X006**.
17. Missing `bounds`, `maxParticles`, emitter, or emitter `rate`/`spawn`: **B005**. A once-only slot called twice, including `.rate` and `.spawn`: **B006**.
18. `$.wnd` in a lambda: **L002**. An undeclared param, or a read before `.param`, in build code: **B003**.
19. `Math.random`: **L002**, with my message saying randomness comes from spawn's `rng()`, kept in a field if needed later. `Math.tan` and `Math.E`: **L002**. `Infinity`, `NaN`, `undefined`: **B008**. A build-time loop's `k`: **B013**. A top-level `let` read by a lambda: **X004**. A non-number top-level constant (a string, `true`, an array) read by a lambda: **X011**.
20. `.collide(…)` on the Program or an emitter: **B009**. `p.collide(…)`: **L002**. Both say particles never see each other.
21. Code the language doesn't have:
    - The kit refuses `while` and `do` (**S101**), `==` and `!=` (**S116**), template literals (**S104**), `typeof` (**S106**), the comma operator (**S108**), `var` (**S110**), nested functions (**S111**), defaults (**S114**), `switch` and rest parameters (**B007**, parse error), `p["vel"]` and `counters["x"]` (**L009**), unfixed loop counts (**L007**), extra parameters (**L010**), destructuring and `let` with no initializer (**L012**), and `$` or `Math` stored (**L018**).
    - My **X010** refuses strings, arrays, object literals, `**`, `null`, bitwise operators, unary `+`, a loop starting at `$.x`, locals or parameters named `vec2`, `length`, `Math`, `counters` or `$`, and `$`, `counters` or `Math` passed whole to a call.
    - A top-level helper named `vec2`: **B002**. A function stored (`const g = h`): **L003**.
22. Malformed builder calls:
    - **B004**: a missing, unknown or non-finite option, a bad name per the kit's rule, or an extra argument.
    - **X015**: a name the kit accepts but the sheet doesn't (`_x`, `a$b`).
    - **X002**: a param `value` outside `min..max`. **X001**: `min` above `max`.
    - **B007**: a `function` expression or a non-function in a lambda slot.
    - **X012**: a top-level helper passed as a lambda.
    - **B001**: `.rate` with no emitter before it.
    - **B016**: the export opens `particles` twice. **B017**: it returns something other than its Program.
    - **Not refused:** a lambda slot given its source as a string (`.update("(p, dt) => { }")`). The kit accepts "an arrow function or its source text", and a check only sees the text.
23. A counter read in spawn or update: **L017**. Assigned with `=`, `-=` or `--`: **L017**. A bump used as a value: **L017**.
24. A counter bumped in rate: **L004**. Assigned in rate: **L017**. Any use in a force or helper: **L004**.
25. An unknown counter: **L002**, with did-you-mean. `counters` as a value: **L018**. `counters` passed whole: **X010**. Two counters with one name: **B002**.

Also not refused: a lambda inside a build-time branch that never runs (for example `if (s === 1) { s.force("f", (p, dt) => { p.size = 2; }); }`). The sheet says "dead branches … are checked too", but the kit only sees lambdas that reach the builder.

## Where the documents misled you

- API.md: "**A handle** … is used only as `h.member`, `h.method(…)`, `h(…)` when callable, or passed whole as any call's argument". The sheet says "`$` appears only as `$.name` and `counters` only as `counters.name`". The kit allows `h($)`, so I had to refuse it myself.
- API.md: "A helper nobody calls is skipped unless `helpers: { check: "all" }`, which checks its effects, recursion and syntax". I took "checks its effects" to mean an uncalled `(p) => { p.kill(); }` would be refused. It isn't, because the effect goes through an untyped parameter (the next clause hints at this). Writes and kills in uncalled helpers needed my own check.
- API.md: "`name(ns)` declares a name … a JavaScript identifier (`_x` passes …)". This is correct, but it means the sheet's stricter "a letter, then letters, digits or `_`" needs its own check.
- API.md: "`lambda(convention)` is a Runtime Lambda". Elsewhere the kit accepts "an arrow function, (x) => …, or its source text" (from a diagnostic). Nothing in the documents warned me that a string or a top-level helper would be accepted as a lambda, which matters for "an arrow written in place".
- API.md's Runtime Subset lists "strings, … array and object literals, … bitwise operators" and the "free-name rule" allows "top-level … plain data". The sheet allows none of these, and API.md has no switch to turn them off. This isn't wrong, but nothing says you must refuse them yourself.
- API.md, Pitfall 4 says "a slot's `check` runs at the call". A construct's `check` also got `ctx.program` with the full record. I relied on that for the emitter-in-bounds check without the documents saying so.

## What you guessed

- `data(shape, { as: "options" })` names a data opening argument. API.md shows `{ as }` only on `ref`. It worked.
- A decl slot with `once` and one argument records the bare value, so `record.bounds` is `{ width, height }`. I coded defensively for an array as well.
- An emitter's record key for its name is `emitter`, since the namespace is `name("emitter")`. I learned this from a wrong `'undefined'` in my own message.
- `units` hold top-level constants with `src` set to the evaluated value as JSON (`"4"` for `A * 2`, `"\"x\""` for a string). I found this by printing it from a check. So `const K = Math.PI * 2` at the top level passes as a number. I chose to allow it, since the sheet's "literals and earlier constants" can't be told apart after evaluation.
- Lambda sources and helper `src` are the text after the kit's normalisation, and a `function h(a) {…}` arrives as `(a) => {…}`. I scan them with regexes after stripping comments.
- Object methods (`Math.min` and the rest) need no `spell`. Only intrinsics do. `length` is an intrinsic spelled `Math.hypot($0[0], $0[1])`.
- The rate's `t` and `live`, and spawn's `i`, are `f64`. Spawn's `rng` is a callable object type `Rng` with effect `rng`.
- Forces use the same instance space as spawn and update, with `may: ["write Particle.vel"]`.
- `text(state)`: I defined `state` as `{ t, maxParticles, width, height, emitters: [{name, live}], counters: [{name, value}], particles: [{x, y}] }`. The check never calls it.
- My error codes use the letter X (X001 to X015).
- Where my check and the kit could both fire, I made mine stay silent (for example strings inside `[…]`, and parameter-list braces). In a few places both still fire.

## Gaps

- **Dead build-time branches.** The kit checks only lambdas that reach the builder. The smallest fix would be for the kit to type-check every arrow literal passed to a builder method in the file's source, built or not.
- **Uncalled helpers through untyped parameters.** A way to declare helper parameter types, or a "may be a particle" mode, so `check: "all"` also checks member reads, writes and verbs on such parameters.
- **Subset switches.** Dialect options to turn off strings, arrays, object literals, `**`, `null`, bitwise operators and unary `+`, and to forbid top-level non-number constants. I did all of these with source regexes, which are fragile.
- **Handles only as `h.member`.** A per-object flag such as `{ passable: false }` for `$`, `counters` and `Math`.
- **Reserved local names.** A Dialect list of names no local, parameter or helper may take.
- **`rng` meaning nothing outside spawn.** A global declared per slot (rng given only to spawn) would give a proper diagnostic. Today `rng` declared as another lambda's parameter type-checks.
- **Lambda written in place.** A `lambda(conv, { inline: true })` option that refuses source strings and references to helpers.
- **Name pattern.** A `name(ns, { pattern })` option for the stricter name rule.
- **Location of construct-check errors.** I couldn't tell how `arg` paths map in a construct `check`. My emitter errors land on the right line, but root-check errors (helpers, constants) land on the export line or the helper's line.
- **Duplicate diagnostics** from the kit, against "one mistake gets one diagnostic": a ternary arm mismatch assigned to a field gives two L003. A helper given two types gives L003 and L014. A non-lambda plus an extra argument gives B007 and B004.

## Files

Opened (read): `START.md`, `API.md`, `dream-code.md`. I wrote and read back my own files: `particles.dialect.js`, `particles.grammar.js`, `examples/00.js`, `01.js` and `02.js`, plus a throwaway test harness in `_t/` inside this folder, now deleted. I briefly put that harness in `/tmp/ptests`, created by me, before moving it here. I ran `check.sh` but didn't open it. I didn't open `transcript.jsonl`, `stderr.txt`, any kit source, or any other file on the machine, and I didn't search the web.
