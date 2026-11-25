# Report: particles with per-slot effects (trial 4, agent-b)

## 1. Difficulty

2 of 5: the effects model fit the sheet's lambda table almost one-to-one (a `may` per slot, a verb, a total, a pure rate space), and the checker accepted the definitions and all 12 examples on the first full run; what cost thought was the grammar side (the emitter opening) and a handful of sheet rules the packet cannot enforce or enforces under another code.

## 2. Per example

- 01.js: fits (verbatim; only the import line is the sheet's own).
- 02.js: fits (a `length` intrinsic in a helper that takes a particle, `seed`, `forces: []`, counter bumped with `+= p.size`).
- 03.js: fits (a helper using a top-level constant, `counters.born++` in spawn, `i` used).
- 04.js: fits (block-body export, a build-time loop adding emitters, build-time read of `$.count`).
- 05.js: fits (two counters, a `for` with `continue`, a helper that reads `p.pos.y`, rate reads a counter).
- 06.js: fits (two fields, bare `return;`, `+= p.hue` bump, helper returning a vector).
- r01.js: L004 ("force slot may not 'write Particle.size'"); sheet 3 exactly.
- r02.js: L013 ("'age' is read-only at run time"); sheet 4 exactly (a write to a non-writable member, not an effect refusal).
- r03.js: L004 ("spawn slot may not 'destroy Particle'"); sheet 6 exactly. A helper that kills is also L004 (probed).
- r04.js: B008, not an effects code ("update lambda reads 'rng', which it cannot see"); the mistake of sheet 7, but caught by the free-name rule, not by effects. In a helper that takes `rng` as a parameter it is L004 "helper may not 'rng'" (probed). I declared B008 because that is what is given.
- r05.js: L017 (a total read in a slot that bumps it); sheet 23 exactly.
- r06.js: L004 ("rate slot may not 'bump Counters.hits'"); sheet 24 (rate bumps). Note the first draft used `(counters.hits++, 5)`; that gave S108 (comma operator) plus L017 (bump as a value), so I switched to a block body.

## 3. Where the API documents misled you

- `api-effects.md`, "Who implements a verb": it reads as if the host hands in an object per verb; in the end I only needed `kill` as a `fn` member with `effects`. Not wrong, just more worry than needed.
- `api-draft.md` says a helper "becomes a helper of the Program" from a top-level arrow, but the example grammar has `fn:`/`const:` unit slots; it is not stated that you can leave them out. You can: top-level helpers worked without any unit slot (the sheet's language has no `.fn`).
- `api-effects.md` says a slot in an instance space "takes an `Obj` as a parameter, exactly once"; it does not say a pure space's slot (`rate`) may still take no instance, though the example `rain` shows it. Fine in practice.
- The "free-name rule" paragraph (B013): a name that the file declares "only inside build-time code" is B013. The checker applied that to `rng` in r04 when the spawn lambda of the same file named its parameter `rng`: update's `rng()` gave B008 only after I renamed spawn's parameter `r`. So in this trial's first draft of r04 the code was B013, not B008. Nothing in the docs warns that a lambda parameter counts as "declared in build code".

## 4. What you guessed

- `numberType: "f64"` and `vector(2, "f64")`: the sheet has one number type and the bump total must be `f64`. I did not try f32 and do not know if a f32 vector times an f64 `dt` would have typed.
- `Math.min`/`Math.max` as `fn` members with `rest: "f64"` of an object `Math`. The docs show `rest` for intrinsics and methods only "as for methods"; it worked.
- `Math.PI` as a plain `"f64"` member of `Math`.
- `data(...)` as an opening argument of a child construct with `{ as: "opts" }` as the last argument; the draft says only that opening arguments may include `name()` and `ref()` and that `lambda()` is not allowed. It worked, and `listOf(ref("force"))` inside the shape resolved forward names.
- A slot `check` on `.counter` / `.field` etc. and a construct-level `check(record, ctx)` for cross-checks (emitter inside bounds, at least one emitter). Record layout guessed: `record.emitter` is the list of emitter records, each with `opts`, `name`; `record.bounds` a `once` slot's single value. These worked.
- `as: "fields"`, `"counters"`, `"params"` on decl slots so `environment(program)` can read `program.fields` and `program.counters`; I guessed a nameless-value `.counter("x")` gives a record key of an object (it did: `Object.keys` worked).
- Dialect `params: { object: "Params", name: "$" }` with `environment` adding one `f64` member per param.
- One instance space `particle` for spawn, force and update, with `rate` in its own pure space.
- Argument `i` of spawn typed `f64` (no integer type).
- Counter values and every field are `f64`; each field is added to `Particle` by `environment`, as `{ value: "f64", write: true }`.
- Extra grammar checks I wrote are my own codes `K001`..`K010` (param range, field name, bounds, maxParticles whole, tick, seed, no emitter, emitter outside bounds, negative maxRate, duplicate force in list).
- `text(state)` takes `{ t, maxParticles, width, height, counters: [{name,value}], emitters: [{name,live}], particles: [{x,y}] }`.

## 5. What you needed and did not have

Smallest first:

1. A way to say "this parameter is a function that may only be called, never stored or passed" (sheet 7: `rng` passed to a helper or stored in `const r = rng`). With `rng` as a plain `Rng` object parameter, `h(rng)` is a helper call with an object argument and was accepted by my definition for any helper taking it; only the helper's own `r()` is refused by L004 (helper may not 'rng'). Probe: `h(p, r)` gave L004 at the helper's body, which does catch it, but the call-site `const s = rng` store is not tested by me.
2. A way to refuse an alias of the particle (`const q = p`; sheet 2). Probe `const q = p; q.size = 1;` in update checked clean, so sheet 2's alias refusal is not enforced (nor the "particle only as `p.<field>`, `p.kill()`, or passed whole to a helper" rule of the particle section). Smallest fix: an object-parameter option such as `noAlias: true`, or have the checker refuse a `const` initialised with an instance.
3. Range and shape checks as declarative options (numbers whole, `min`/`max` of a number arg). I wrote each as a slot `check`; it is verbose but works.
4. A custom diagnostic for a free-name miss, so that `Math.random` can say "randomness comes from spawn's rng" (sheet 19) and `.collide` can say particles never see each other (sheet 20). `rejected` covers a builder method name only; `p.collide()` gave L002 "a particle (p) has no member 'collide'", and `Math.random` gave L002 "Math has no member 'random'", neither with the wanted message. I could declare `rejected: { collide: … }` on the builder for 20 (builder side) but not the particle side, and not for a lambda's member access.

## 6. Gaps in the kit

- No integer type: `maxParticles`, `seed` and `i` are checked by hand at build time (K004, K006); `i` is an `f64`.
- No build-time reading of the program's other declarations in a lambda check (not needed here).
- A Runtime Lambda cannot be told "this body must be an expression body" or "must return on every path" except through its slot returns type: sheet 11 (`(p) => p.kill()` as an expression body; a rate without `return`) is not something I configured; lowering gave its own L codes for a type mismatch (I did not probe `(p) => p.kill()`).
- The comma operator is not in the Runtime Subset (S108); fine, the sheet does not need it.
- Booleans in fields, floats of a loop `for (let k = A; k < B; k++)` with constants: I used loops with literal bounds only and they worked; I did not probe `k < $.n` (sheet 21).

## 7. Effects

Declared:

- `slots.rate.may = ["read Counters"]`: the sheet lets rate read counters and never bump; rate is in a pure space (`rate: { pure: true }`).
- `slots.spawn.may = ["write Particle", "rng", "bump Counters"]`: spawn writes the newborn's fields (age is not `write: true`, so it is read-only for all), draws randomness and bumps.
- `slots.force.may = ["write Particle.vel"]`: only velocity; no counters, no rng, no kill.
- `slots.update.may = ["write Particle", "destroy Particle", "bump Counters"]`: writes fields, kills, bumps; no rng.
- No `helpers` key: the default (read `Particle` only) is exactly the sheet's pure helper (no assign, no kill, no rng, no counter).
- `Particle.pos`, `vel`, `life`, `size` and each `.field` (added in `environment`): `{ value, write: true }`. `Particle.age`: read-only.
- `Particle.kill`: a verb with `effects: ["destroy Particle"]`.
- `Rng`: callable object, `call: { params: [], returns: "f64" }`, `effects: ["rng"]`; spawn's second parameter.
- `Counters`: object with no static members; `environment` adds `{ value: "f64", bump: true }` per `.counter`. Global `counters`.
- `Params` and `Math`: read-only, no effects.
- Spaces: `rate: { pure: true }`, `particle: { instance: "Particle" }`.

Where the rules fought the sheet:

- Sheet 2 alias (`const q = p`, refused at the alias): not enforced. The packet rule that an instance cannot reach a second place was designed to make aliasing harmless, and it does (a write through `q` is still checked as a write to Particle), so it is not unsafe, but sheet 2 asks for a refusal and the kit accepts it. (Probe: clean.)
- Sheet 7, `rng` in rate, force, update or a helper: in a lambda with no `rng` parameter it is B008 (free name), not an effects code; in a helper that is handed it as a parameter, L004. Two codes for one mistake.
- Sheet 7, "spawn's `rng` passed or stored": not enforced as such; `rng` is an `Rng` object value, and only calling it has the effect.
- Sheet 4 (write to `age`) is L013, not L004: the member is not writable, so it never reaches `may`. Sheet 4's "from any lambda" holds (spawn, force, update, helper all give L013 or a helper L004).
- Sheet 6 in a helper: L004 at the helper's line ("helper may not 'destroy Particle'"), as asked, and also when only `update` calls it.
- Sheet 23 vs 24 split by code: a counter read in a bumping slot is L017; a bump in rate or a read in a force or helper is L004 (the helper read also comes with an L017 at the calling update lambda, two diagnostics for one mistake, probed). A read of a counter in spawn or update is the one place the dream code and L017 agree exactly.
- Sheet 23's "`x = counters.burnedOut++`" and "`= 0`": L017 (probed for `= 0`).
- Sheet 5 (`p.vel.x = 0`): L013 (probed), but in a force sheet 3 would take priority by its "Which number" rule; I get L013 only, the sheet says 5 over 3 for `p.vel.x`, which agrees.
- Sheet 1 (rate assigns anything): not directly probed; rate is in a pure space with only `read Counters`, so a write to `$`, `t` or a constant is not an effect at all; those are the language's own assignment rules (L-codes outside effects), which I did not probe.
- Sheet 24 in a rate: `(counters.hits++, 5)` gives S108 and L017 rather than L004; a statement bump gives L004.
- Sheet 8's helper "never calls itself" and sheets 13-18, 22 are grammar checks (mine K00x, or builder B-codes), not effects.
