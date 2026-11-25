# REPORT: particles

## Difficulty

3. The core language came out of the documented API with no workarounds and checked clean on the first run. But several refusals the sheet requires (uncalled helpers, a number used as a condition, a rate with a path that never returns, vector times vector, a top-level `let`, a lambda that is not written in place) are things the kit lets through, and the API gives me nothing to catch them with.

## Refusals

Each was written as a Program with that one mistake, run through `check.sh`, then deleted. The codes are what the check printed. Codes starting with `E` come from my own checks.

1. Refused. `$.rate = 0` gives L013 ("'rate' is read-only at run time"), `t = 0` gives L013 ("'t' is a parameter"), `GRAVITY = 0` gives L013 ("a top-level constant").
2. Mostly refused. `dt = 0`, `p = 0` and writing a `const` local or its component all give L013. `$ = 1` in a lambda gives L013. `const q = p` gives L018 at the alias. `$.rate = 0` in build code gives B015. **Not refused: `$ = 1` in build code.** It is plain JavaScript that reassigns the export's parameter, and the kit never sees it.
3. Refused. `p.size = 2` in a force gives L004 ("A force may not 'write Particle.size'"). `p.pos.x = 0` in a force gives L013 (component write). That is the right case, but the code is a generic one.
4. Refused. `p.age = …` in any lambda or a called helper gives L013 ("'age' is read-only"). `p.age.x = 0` gives L002 ("f64 has no member 'x'").
5. Refused. L013: "'x' is a component of a vector value, which cannot be changed in place".
6. Refused. In spawn or a force: L004 "may not 'destroy Particle'". In a helper that `update` calls: L004 at the helper. In rate: no `p` exists. **Partly wrong: `p.kill(1)` in spawn gives L015 (argument count), not the effect error the sheet ranks first.** A kill inside a helper that nothing calls is not refused (see 8).
7. Mostly refused. `(t, live, rng) => rng()` gives L010 and L001: two diagnostics for one mistake. `rng()` in update gives B013. Spawn's `rng` passed or stored (`h(rng)`, `const r = rng`, `Math.abs(rng)`) gives L018. A helper whose parameter is named `rng` and which calls it gives L003. **Not refused: a helper that nothing calls, with a parameter named `rng`, or that uses `rng`.** The kit does not check uncalled helpers.
8. Refused for helpers that something calls. A field write gives L004, `p.age = 0` gives L013, calling itself directly or through another helper gives L007. **Not refused when nothing calls the helper**, although the sheet says helpers are "checked whether or not anything calls it".
9. Refused. `p.speed`, `p.helth`, `p.die()` and `p.speed.x = 1` give L002. `const k = p.kill` gives L003. `const z = p.kill()` and `p.kill(1)` in update give E105 (my check). A field named `size` or `kill` gives E003. A field named `pos`, `vel`, `age` or `life` would hit the same E003 check, but I did not run those four.
10. Refused. L003: "This is f64, but Particle.vel needs vec2", and the same for vec2 or bool into `life`.
11. Partly refused. `(t) => t > 2` gives L003. A spawn, force or update that returns a value gives L003. An expression body gives E104 (my check). **Not refused: a rate with a path that has no `return`** (`if (t > 1) { return 1; }` and nothing after).
12. Mostly refused, all as L003 (or L002, L015). Refused: `v + 1` and `p.vel += 1`, a number divided by a vector, vectors compared, `.z`, a vector as a condition, `&&` on a number in a value, `!true`-style arithmetic and `-true`, a local whose type changes, ternary arms of different types, `Math.max(1)`, `length(1)`, helper paths returning different types. `p.life = p.pos + 1` gives L003 once, as the sheet asks. **Not refused: `p.vel * p.vel`** (the kit multiplies vectors component by component), **and a number as a condition (`if (p.heat)`, `!p.heat`).** The kit refuses only vectors there ("A vector is always true as a condition").
13. Refused. B004: not whole, below min, above max, for maxParticles, seed and tick.
14. Refused. Negative maxRate gives B004. An emitter outside the bounds gives E004 (my program check). Width or height outside 1..4096 gives B004.
15. Refused. B002 for params, forces, fields and emitters.
16. Refused. An unknown force gives B003 with did-you-mean. A force named twice gives E005 (my check).
17. Refused. Missing bounds, maxParticles or emitter gives B005. A second bounds, maxParticles, tick, seed or update gives B006. An emitter missing rate or spawn gives B005. Rate or spawn twice gives B006.
18. Refused. `$.wnd` in a lambda gives L002. In build code, or read before its `.param`, it gives B003.
19. Refused. `Math.random` and `Math.tan` give L002 ("Math has no member 'random'"). `Infinity`, `NaN` and `undefined` give B008. A loop's `k` gives B013. **The `Math.random` message cannot say that randomness comes from spawn's `rng`**: there is no way to attach a message to a missing member. A top-level `let` read in a lambda is **not refused**.
20. `.collide(…)` on the builder (Program or emitter) gives B009 with my message, "particles never see each other in this language". **`p.collide()` gives a generic L002 ("a particle (p) has no member 'collide'")** with no custom message.
21. Mostly refused. `while` gives S101, `==` gives S116, `p["vel"]` and `$["rate"]` give L009, a nested function gives S111, `k < $.rate` gives L007, a loop that assigns `k` gives L007, a default gives S114, a rest parameter gives B007, `var` gives S110, `const q = $` gives L018, an extra parameter gives L010, destructuring gives B013. A string gives E101 and `**` gives E102 (my checks). A local or parameter named `vec2`, `length`, `Math`, `counters` or `$` gives E103 (my check). A top-level helper named `vec2` or `length` gives B002. An array gives L003. **Not refused: a top-level helper's parameter named like a reserved name**, because I cannot see helper source. A function stored or passed: `rng` is covered (L018). I did not test passing a helper by name.
22. Mostly refused. A missing or unknown option gives B004. A non-finite option gives B004. A bad name gives B004 ("not a name: a name is an identifier"), or E001 from my check for `_x`, `a$b` and `2jet`. A value outside min..max gives E002. An extra argument gives B004. A non-lambda gives B007. `.rate` with no emitter before it gives B001. Opening twice gives B016. Returning something else gives B017. **Not refused: a lambda slot given a top-level arrow by name (`.rate(rf)`) or a string of source (`.rate("(t, live) => 1")`).** The kit takes both, and a slot check sees only the source text, so both look like an arrow written in place.
23. Refused. A read gives L017 ("a total this spawn may bump, so it may not read it"), `= 0` and `-= 1` give L017, a bump used as a value gives L017.
24. Refused. A bump in rate gives L004. A read or bump in a force gives L004. In a called helper, L004. **Not refused in a helper that nothing calls.**
25. Refused. `counters.burntOut` gives L002, a bare `counters` gives L018, two counters with one name give B002.

## Where the documents misled you

- API.md: "**Your checks** report with `ctx.error(code, message, { tip, arg, suggest, fix })`". When I gave no `fix`, the check printed `fix: see api-draft.md`, a file neither page mentions. It looks like a placeholder default; a reader sent there would be stuck.
- API.md: "a **Runtime Lambda** … `lambda(convention)`". It does not say the kit also accepts a string of source text ("a Runtime Lambda is an arrow function or its source text", per B007). The sheet's "an arrow written in place" rule cannot be enforced on top of that.
- dream-code.md says every helper is "checked whether or not anything calls it". API.md does not say otherwise, but in practice the kit checks a helper only through its calls. Nothing in API.md warned me of that.
- API.md, the Runtime Subset: "`if`, ternaries". It does not say that a number is a legal condition (JS truthiness). I learned that only from testing.

## What you guessed

- The record key for an emitter's opening `name("emitter")`: I guessed `e.name`, and it is `e.emitter`. I found that by testing (the docs say "a `name(ns)` under `ns`").
- `data(shape, { as: "at" })` for the emitter's options as an opening argument: combining a shape and `as` like this is not shown anywhere. It worked.
- `listOf(ref("force"))` inside a data shape resolves forward references and gives B003. It works.
- Effect lists: `"write Particle.vel"` for forces, and `"rng"` in spawn's `may`. Rng is a callable object passed as spawn's second parameter type, an object type used as a slot parameter in a space whose instance is Particle. That this is allowed is my guess; no D error appeared.
- Fields and counters reach lambdas through `environment()`, which adds members to `Particle` (writable) and to `Counters` (`bump: true`). Counters are a global named `counters`.
- The record shape of `.counter(name)` (an object keyed by name) and of a `once` decl (`bounds`): I accept either the bare argument or a one-item list.
- The text view's `state` shape is my own choice (documented in a comment).
- Codes: my checks use the letter E (E001 bad name, E002 param value outside min..max, E003 reserved field name, E004 emitter outside bounds, E005 force listed twice, E101 string, E102 `**`, E103 reserved binding name, E104 an expression body where a block is required, E105 kill not as a statement).
- To refuse what the type checker lets through, I wrote slot checks that read the lambda's source text with regular expressions (after stripping comments). This is the "check with your own code" START.md allows, but it is textual and could be fooled by odd formatting.

## Gaps

1. **Uncalled helpers are never checked.** That affects refusals 6, 7, 8, 12 and 24, and top-level helpers are not visible to any check (`record.units` is undefined). Smallest change: check every top-level helper at least once (with the argument types of its calls, or alone if never called), or expose top-level helper sources in the record so a construct check can see them.
2. **A number as a condition.** Smallest change: a Dialect option such as `conditions: "bool"`.
3. **A rate that may fall off its end without a return.** Smallest change: a slot convention flag such as `returnsOnEveryPath: true`, or make that the default whenever `returns` is not `void`.
4. **Vector times vector is allowed.** Smallest change: a `vector(2, "f64", { multiply: "scalar" })` option.
5. **Custom messages for missing members** (`Math.random`, `p.collide`). Smallest change: per-object `rejected: { random: { message, fix } }`, as constructs already have.
6. **"A lambda written in place"**: the kit accepts a named top-level arrow or a source string. Smallest change: a `lambda(conv, { inline: true })` option.
7. **Top-level `let` and non-number constants** are readable from lambdas. Smallest change: a Dialect option restricting top-level data to `numberType`.
8. **Build code reassigning `$`** (`$ = 1`) is not seen.
9. **A block body and kill-only-as-a-statement** had to be checked textually. A convention option `body: "block"` and a verb flag `statement: true` would express them.
10. **One mistake, one diagnostic** is not always true: `(t, live, rng) => rng()` gives both L010 and L001, and I have no control over which code a mistake gets (for example `p.kill(1)` in spawn gives L015, not L004).

## Files

Opened (read): `START.md`, `API.md`, `dream-code.md`. I wrote `particles.dialect.js`, `particles.grammar.js`, `examples/00.js` to `02.js`, this report, and temporary test files (under `_t/` and `examples/x_*`, all deleted). I ran `check.sh` but did not open it. I did not open `transcript.jsonl`, `stderr.txt` or the `api-draft.md` a diagnostic pointed to, and I opened nothing outside `/private/tmp/3d093c96-h5/agent-b`.
