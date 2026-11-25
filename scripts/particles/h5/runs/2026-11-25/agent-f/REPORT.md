# Particles: report

## Difficulty

3 of 5: the builder, the slots, the effects and the record mapped onto the kit with little trouble, but about a dozen of the spec's refusals are not enforced by the kit as it stands (see Refusals and Gaps).

## Refusals

Codes are the kit's unless marked Q (my own, from `ctx.error` in `particles.grammar.js`). Each row was checked with a one-file Program that had that single mistake; each file was deleted after its check.

1. Rate assigns (`$.rate = 0`, `t = 0`): refused, L013 ("'rate' is read-only", and "'t' is a parameter"). Its fix text ("declare an .attr") is wrong for this language.
2. Write to a non-writable thing: `const q = p` → L018; top-level constant `LIMIT = 0` → L013; `dt = 0` / `p = 1` / `$ = 1` → L013; `const v`, then `v.x = 3` → L013. Writes to `$` in build code were not tested (`$` at load time fails with C001 first).
3. Force writes `p.size` → L004 ("A force may not 'write Particle.size'").
4. `p.age = 0` in update → L013 ("'age' is read-only at run time").
5. `p.vel.x = 0` → L013 ("'x' is a component of a vector value, which cannot be changed in place here").
6. `p.kill()` in spawn → L004; in force → L004; in a called helper → L004; in rate → B013 (`p` is not visible there). Kill in a helper no lambda calls: not refused (gap 2).
7. `rng` in rate → B013. `helper(rng)` in spawn → L018 (handle passed as value). `(t, live, rng) => rng()` in rate → L010 and L001, two codes, not 7 (gap 9).
8. Helper writes a particle field, called from update → L004 (helper may only read). Recursive helper, called → L007. Uncalled helper that writes or recurses → **not refused** (gap 2).
9. `p.speed`, `p.speed = 1`, `p.die()` → L002 (with a member list). `const k = p.kill` → L003. `.field("pos"|"vel"|"age"|"life"|"size"|"kill")` → Q006.
10. `p.vel = 0` → L003. `p.life = vec2(1, 1)` → L003. `p.size = p.life > 1` → L003.
11. Rate `(t) => t > 2` → L003. Spawn returning a value (`return 2;`) → L003. `(p) => p.kill()` as expression body → L004 (the kill effect, not the body). Rate block with no return, or a return on one path only → **not refused** (gap 3). Spawn expression body `(p, rng) => p.size` → **not refused** (gap 3).
12. `p.pos + 1` → L003; `p.vel += 1` → L003; `1 / p.vel` → L003; `p.vel === vec2(0, 0)` → L003; `p.vel.z` → L002; `true + 1` → L003; `%` on a vector → L003; `&&` on f64 → L003; a ternary with arms f64 and vec2 → L003; `Math.min(1)` → L015; a helper returning f64 on one path → L003. **Not refused:** `if (p.life)` and `!p.life` (numbers as conditions); `p.pos * p.vel` and `p.pos / p.vel` (vector by vector) (gap 4, 5).
13. `maxParticles(250.5)`, `maxParticles(10001)`, `seed(-1)`, `seed(1.5)`, `tick(0)`, `tick(2)` → B004. `tick(NaN)` → B004.
14. `maxRate: -1` → B004. Emitter at `x: 900` outside a 400-wide box → Q003. `bounds({ width: 0 })` → B004.
15. Two params, two forces, two fields, two counters, two emitters with one name → B002 each.
16. `forces: ["gravty"]` → B003 with "Did you mean 'gravity'?". `forces: ["gravity", "gravity"]` → Q004.
17. No `bounds` → B005; no `maxParticles` → B005; `maxParticles` twice → B006; `tick` twice → B006; `seed` twice → B006; `update` twice → B006; no emitter → B005; emitter with no `rate` → B005; no `spawn` → B005; `rate` twice → B006; `spawn` twice → B006.
18. `$.wnd` in rate → L002 (the params have no member 'wnd'). `$.rate` in build code before `.param("rate")` → B003. `$.nope` in build code → B003.
19. `Math.random()` → L002 ("Math has no member 'random'"). The message does not say that randomness comes from spawn's `rng` (gap 8). `Math.tan` → L002. `Infinity` → B008 ("reads Infinity, which it cannot see"). `NaN` → B008. A build-time loop variable `k` in a lambda → B008.
20. `p.collide()` in a lambda → L002 (no custom message). `.collide(1)` on the builder → B009 with my message ("particles never see each other in this language").
21. `while` → S101. `do … while` → S101. `==` → S116. Template literal → S104. Nested function (closure) → S111. `p["vel"]` → L009. `for (…; k < $.rate; …)` → L007. `$` as a value → L018. Default parameter → S114. Extra parameter → L010. Destructured parameter → B013 (the message is about a parameter of another lambda, not destructuring). `let vec2 = 1` after a use of `vec2` in the same lambda → L001 (refused, but only as a read-before-declaration). **Not refused:** `let length = 1; p.life = length;` (a local named like a built-in, when the built-in is not used earlier in the scope) (gap 6).
22. Missing option (`{ x: 200, y: 290 }`) → B004. Extra key → B004. `forces: "gravity"` (not a list) → B004. `.counter("x", 0)` → B004. `.spawn(function (p, rng) {…})` → B007. A second argument to `.spawn(fn, 3)` → B004. `.param` value outside `min..max` → Q002. Name `"9jet"` as an emitter → Q005 (my own check; the kit accepted it, gap 10). Name `"1bad"` as a param → B004 (kit). `.rate` with no emitter before it → B001. Export that builds two Programs is not tested.
23. Counter read in spawn (`if (counters.burnedOut > 3)`) → L017. Counter assigned (`= 0`) → L017. `-=` → L017. Bump used as a value (`x = counters.burnedOut++`) → L017. Read in update → L017.
24. Bump in rate (`counters.burnedOut++`) → L004. Assign in rate → L017. Read in a force → L004. Bump in a force → L004.
25. `counters.burntOut` → L002 with "Did you mean 'burnedOut'?". Two counters with one name → B002. `counters` used as a value (`let c = counters`) → L018.

## Where the documents misled you

- **START.md**: "Read this page, then API.md. Together they are everything you need." They were not: I had to guess the vector arithmetic, how a callable object is declared for `rng`, how `environment` merges into a base object, and what `as` means on a spec (see below). None of this is wrong, but the claim is too strong.
- **API.md, Types**: "`vec2: vector(2, "f32"), // built in a lambda as vec2(x, y)`". The particle's `numberType` is `"f64"`, so a copied `f32` vector would mix with f64 fields. I used `vector(2, "f64")`.
- **API.md, The record**: "a decl slot whose first argument is a `name()` becomes an object by name (`{ param: { topN: { value: 10 } } }`)", but the same page's example uses `as: "params"` on the slot. The two disagree on the key, and I had to use `as` to get `params`, `fields`, `counters` and `forces`.
- **API.md, Arguments**: "Any spec takes `{ as: "key" }` last". It is unclear whether `as` belongs to the spec (`data(shape, { as: "at" })`) or to the slot (`as:` on the slot). I used it on `data` in an opening argument and it worked; I did not confirm it against any other reading.
- **API.md, defineDialect, `helpers`**: "helpers only read instance objects" is the default. The page does not say whether a helper may take an instance as a parameter, which the spec needs. The kit accepted a helper taking a `Particle` and raised no D022, so I took that as allowed.
- **API.md, Pitfall 1**: "calling one ends the child" is correct and matches the spec's `.emitter(…).force(…)` chain.
- **API.md, `fix`**: "the text to write instead". The kit prints `fix: write <text>`, so my fix phrases read as "fix: write move it inside…" until I rephrased them to be nouns.
- **dream-code.md, "One mistake gets one diagnostic"**: `(t, live, rng) => rng()` gives two (L010 and L001), so the sheet's one-diagnostic promise does not hold for every case.
- **dream-code.md, "checked whether or not anything calls it"** (for helpers): the kit does not do this (gap 2). The sheet is clear; the kit is not.

## What you guessed

Every place the documents did not say, and what I chose:

- **Vector type**: `vec2: vector(2, "f64")`, to match `numberType`. The intrinsic `length` is declared with `ref: (v) => Math.hypot(v.x, v.y)` and spelled as a prelude function `particlesLength`.
- **Particle**: an instance object `Particle` with `pos` and `vel` as writable `vec2`, `life` and `size` as writable `f64`, `age` read-only, and `kill` as a verb with effect `destroy Particle`. Each `.field` is added per Program by `environment` as a writable `f64` member. I assumed `environment` merges into the base object (it does: `p.pos` still resolved in a Program that declares fields).
- **Spaces**: `pure` (`{ pure: true }`) for rate; `particle` (`{ instance: "Particle" }`) for spawn, force and update.
- **Rng**: a callable object `Rng` (`call: { params: [], returns: "f64" }`, `effects: ["rng"]`), passed as spawn's second parameter. Spawn's `may` lists `rng`.
- **may lists**: rate `read Counters`; spawn `rng`, `write Particle`, `bump Counters`; force `write Particle.vel`; update `write Particle`, `destroy Particle`, `bump Counters`. Helpers keep the default (read the instance). Age is refused by read-only, not by `may`.
- **Counters**: `Counters` is a total object with no members in the base; `environment` adds each counter as `{ value: "f64", bump: true }`.
- **Params**: `Params` is read-only; `environment` adds each param as `"f64"`.
- **Math**: `min` and `max` as `fn` with two params and `rest`; `abs`, `sqrt`, `floor`, `sin`, `cos` as one-param functions; `PI` as a read-only value.
- **Record keys**: `as: "params"`, `"fields"`, `"counters"`, `"forces"`. The unnamed `update` slot takes its own key `update`. Emitters are a child construct (`parent: "particles"`, `required: true`) with opening `[name("emitter"), data({ x, y, maxRate, "forces?": listOf(ref("force")) }, { as: "at" })]`, and slots `rate` and `spawn` (both `once` and `required`).
- **Optional builder slots**: `tick` and `seed` are `once` and optional. The spec's defaults (`1 / 60`, `0`) cannot be expressed; the record simply lacks them, so the host must apply them (gap 1).
- **Checks I wrote** (all in `particles.grammar.js`): Q002 param value outside `min..max`; Q003 emitter outside the bounds (in the program check, since it needs the bounds); Q004 a force listed twice; Q005 a name that is not a letter then letters, digits or `_` (on params, fields, counters, forces and emitters); Q006 a field named like a built-in field. Q001 is unused.
- **Rejected**: `collide` with a message saying particles never see each other.
- **Text view**: `text(state)` takes `{ t, maxParticles, live, bounds, emitters: [{ name, live }], counters: [{ name, value }], particles: [{ x, y }] }`. I wrote it to match the spec's layout (header, counter line, 40 by 20 grid, `1`–`9`, `#` for ten or more). It is not exercised by any check here.
- **Codes**: the kit assigns its own codes, so the spec's numbers 1–25 do not appear as codes. Refusals show the kit's code, or my Q code where I wrote the check.

## Gaps

What I needed that the API does not have, and the smallest change that would let me say it:

1. **Defaults for optional slots.** `tick` (1/60) and `seed` (0) need a default the record carries. Smallest change: `default: 1/60` on `data` or on the slot.
2. **Unused helpers.** Top-level functions that no lambda calls are never type-checked, so a helper that writes a particle field, or recurses, is accepted if nothing calls it. The record's `units` lists only what lambdas read. Smallest change: a `checkAll` option, or `units` including unused top-level functions.
3. **Return paths and expression bodies.** A rate block with no `return` on some path is accepted, and a void slot accepts an expression body that returns a number. Smallest change: a "must return on every path" check for lambdas that return a number, and an error when a void slot's arrow has an expression body.
4. **Numbers as conditions.** `if (p.life)` and `!p.life` are accepted. Smallest change: the kit's `if` and `!` must require `bool`, as `&&` already does.
5. **Vector operators.** `p.pos * p.vel` and `p.pos / p.vel` are accepted. Smallest change: an operator table on `vector()` (for example, vector by vector not allowed).
6. **Reserved names.** `let length = 1` is accepted when the built-in is not read earlier in the same scope. Smallest change: a `reserved: [...]` list on the Dialect.
7. **Top-level constants.** A top-level `let` is accepted as data, and so is `const K = Math.sqrt(4)` (a call, not a number expression of literals and constants). Smallest change: a rule for what top-level plain data may be, or a constant-expression check.
8. **Custom messages for unknown members and free names.** `Math.random()` and `p.collide()` give "has no member" with a member list, not my message. Smallest change: `rejected` entries for members and free names, as there are for builder names.
9. **One code per mistake.** `(t, live, rng) => rng()` gives two codes (L010 and L001), so the spec's "7, not 21" precedence cannot be reproduced. Smallest change: suppress secondary codes once a parameter count is wrong, or let the Dialect set a precedence.
10. **Identifier checks.** The kit checks `name()` for a param (`"1bad"` → B004) but not for an emitter opening (`"9jet"` is accepted). I added Q005; the kit should check every `name()` the same way.
11. **Infinity in `value`.** `param("rate", { value: Infinity, min: 0, max: 400 })` reached my check (Q002) and the kit did not report B004 for it. NaN was reported as B004. The kit's finiteness check does not seem to run before slot checks. Smallest change: run shape validation before the slot's `check`.
12. **Build-time writes to `$`.** Not tested; build code is plain JavaScript, so the kit may not see it. The sheet asks for a refusal here.

## Files

Files I opened (read the contents of):

- `/private/tmp/3d093c96-h5/agent-f/START.md`
- `/private/tmp/3d093c96-h5/agent-f/API.md`
- `/private/tmp/3d093c96-h5/agent-f/dream-code.md`

Files I ran or wrote, but did not read:

- `check.sh` (run only, many times; I did not open it)

Other things I did:

- I listed the folder once with `ls -la`. That listing showed `transcript.jsonl` and `stderr.txt` by name. I did not open either.
- I did not open any file outside the folder, and I did not search the web.
- I wrote `particles.dialect.js`, `particles.grammar.js`, and `examples/00.js`, `01.js`, `02.js` (clean Programs). The must-refuse Programs were written into `examples/` one at a time, checked, and deleted; `examples/` now holds only the three clean Programs.
- I used `node -e` and `bash` only to generate the temporary refusal files and to make one text edit to the grammar. Node loaded no files other than the ones I named.
