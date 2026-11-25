# Report: particles on the Definition API with per-slot effects (agent-c)

## 1. Difficulty

3 of 5. The core language fit the API well: every example builds and lowers, and every refusal fails with the mistake its sheet number names, apart from r04. The effects addition worked as written. Ranges, whole numbers and the identifier rule needed my own checks, and one pattern (the `params` record key) was not documented clearly enough and cost time.

## 2. Per example

- 01.js: fits. The sheet's example, verbatim; builds and lowers clean.
- 02.js: fits. Block body, build-time loop over emitters, a boolean helper that reads a particle, a bare `return;` in update, a `sway` force that reads `p.phase`.
- 03.js: fits. `length` intrinsic, a `let` vector with a component write, `counters.landed += 1`, a helper loop with `break`, a rate that reads a counter inside a loop, `Math.floor` in build code.
- 04.js: fits. Uses `Math.max`, `Math.min`, `Math.cos`, `Math.sin`, vector arithmetic, and an uncalled helper (`radialSpeed`) that the checker accepts. No failing case shows whether an uncalled helper is really checked.
- 05.js: fits. Two counters, `else if`, `counters.rained += p.size`, a block-body rate with two returns, a spawn that takes only `p`.
- 06.js: fits. Block body that loops over emitters and returns the Program; a `let` local vector.
- r01.js (sheet 3, a force writes p.size): L004, the mistake the sheet names.
- r02.js (sheet 4, write to age): L013 ("'age' is read-only at run time"), the mistake the sheet names.
- r03.js (sheet 6, p.kill() in spawn): L004, the mistake the sheet names.
- r04.js (sheet 7, rng in update): B013, not the B008 I expected. The kit says the file declares `rng` "only inside build-time code", because the spawn lambda's parameter of that name sits in the block body. The free-name rule looks at the whole file, not the lambda. Partly fits: refused, but for a reason that is not the sheet's.
- r05.js (sheet 23, counter read in update): L017, the mistake the sheet names.
- r06.js (sheet 24, counter bumped in rate): L004 ("the rate slot may not 'bump Counters.burnedOut'"), the mistake the sheet names.

My own checks are not covered by the six refusals. I ran one probe (`maxParticles(250.5)`, file since deleted) and it gave my Q002. Q001 and Q003 to Q010 were not run.

## 3. Where the API documents misled you

- `api-draft.md`, "Params" and "environment(program)": the environment example reads `Object.entries(program.params)`, and the grammar section describes `params: { slot: "param" }` only as "the root slot that declares the Program's params". A plain `args: [name("param"), data(...)]` slot gives the record key `param`, not `params`, so `program.params` is undefined. Every Params member was missing, and the checker reported `L002 the params ($) has no member 'wind'` on every lambda that read a param. The fix is `as: "params"` on the slot, which the worked fields example has but the prose never ties to `params: { slot }`.
- `api-draft.md`, "Constructs": the `name()` opening is described as a label ("any non-empty string"), and `name("emitter")` is described as a Program namespace. Both rules are true, but they sit in different paragraphs, and I had to work out from the checker that `name("emitter")` gives the forces refs their namespace.
- Shapes: nothing says whether an object shape rejects unknown keys. I did not test it, so I did not rely on it.

## 4. What you guessed

- `numberType: "f64"` and `vec2: vector(2, "f64")`. The sheet says one number type; I used f64 to match the Math and rate values.
- `Math` as an object with methods and a `PI` member, with `globals: { Math: "Math" }`. `Math.min` and `Math.max` take exactly two numbers. Method signatures have `minArgs` but no rest, so a three-argument `Math.min` is not expressible; I did not test whether a rest is refused.
- `length` as an intrinsic with `params: ["vec2"]`, `ref: (v) => Math.hypot(...v)`, and the js prelude copied from the fields Dialect. The fields example passes `Math.hypot` straight as the `ref` on a vector, which would not work on a vector argument, so I wrote the spread form.
- `Rng` as an object with `call` and `effects: ["rng"]`, and the spawn convention `params: ["Particle", "Rng", "f64"]`. The spawn lambda's second parameter is the stream.
- Instance space `particle: { instance: "Particle" }` for spawn, force and update. Rate is `pure: true` and may `read Counters`.
- Fields: `environment(program)` adds one `{ value: "f64", write: true }` member to `Particle` per `.field`. Counters: one `{ value: "f64", bump: true }` per `.counter`. Params: one read-only `f64` per `.param`.
- Counter declarations take only a name, so I read their names with `Object.keys(program.counter ?? {})`. The docs do not say what the record holds for a name-only declaration; the reads and bumps of counters check, so the names are there.
- Options the shapes cannot express are my own `check`s under the letter `Q`: Q001 bounds, Q002 maxParticles, Q003 tick, Q004 seed, Q005 maxRate, Q006 emitter outside bounds, Q007 duplicate forces, Q008 reserved field name, Q009 identifier, Q010 no emitter.
- `rejected: { collide: … }` on the root construct, which the emitter inherits.
- The `text(state)` host state: `{ t, bounds, maxParticles, emitters: [{ name, live }], counters, particles: [{ x, y }] }`. The checker does not run it.
- The emitter's options are opened as `data(EmitterShape, { as: "at" })` beside `name("emitter")`.
- I did not use vector negation (`-v`): the API documents do not say whether it exists.

## 5. What you needed and did not have

Smallest first:

1. A lambda slot that accepts only an arrow written in place. Sheet refusal 22 (a lambda slot given a string) cannot be enforced: `lambda()` takes source text as well, and the record cannot tell the two apart. Needed by sheet 22.
2. A number shape with range and integer constraints, e.g. `{ min, max, integer }` on `data("number")`. Without it, sheet 13 and 14 need hand-written checks (Q001 to Q004). Needed by sheet 13, 14.
3. An identifier shape. `name(ns)` accepts a string the kit calls an identifier, which allows a leading `_` or `$`; the sheet needs a letter first. Needed by sheet 22. I wrote Q009.
4. Closed option objects: "options take exactly the keys shown". Untested whether the kit refuses an extra key. Needed by sheet 22.
5. A rest parameter on an object method, for `Math.min` and `Math.max` with two or more numbers. Needed by sheet 12 (a built-in called with the wrong count) and the sheet's `Math.min` contract.
6. A custom message for an unknown member inside a lambda. Sheet 19 wants `Math.random` to say randomness comes from spawn's `rng`. `rejected` exists only on constructs, so an object member cannot carry that tip. Needed by sheet 19; sheet 20 (`p.collide()` in a lambda) has the same problem. Not tested.
7. A way to refuse a helper that calls itself. Sheet rule 8 needs it. The docs do not mention recursion; not tested.
8. A way to refuse an expression body on a void lambda, `(p) => p.kill()` (sheet 11). The docs do not say; not tested.

## 6. Gaps in the kit

- No integer type. Counts (maxParticles, seed, whole-number options) are plain numbers with my own checks.
- The free-name rule looks at the whole file, not the lambda's scope: a name that is a lambda parameter in build-time code (`rng` in r04) is reported as declared "only inside build-time code" in an unrelated lambda. The result was B013 where the sheet's mistake is about rng's use inside update.
- Shapes cannot express "none twice" for a list (the emitter's `forces`); own check Q007.
- No way to express "at least one emitter" in a shape; own check Q010 on the root construct.
- The sheet's counter snapshot rule (every rate reads the counters as they stood when the tick began) is host semantics; the API has nothing to say about it, and I did not try to express it.

## 7. Effects

Declared:

- `Particle` (instance object): `pos`, `vel`: `{ value: "vec2", write: true }`. `life`, `size`: `{ value: "f64", write: true }`. `age`: `"f64"` (read-only). `kill`: a `fn` with `effects: ["destroy Particle"]`. Why: sheet 1 to 6 and 9 to 10.
- `Particle` fields per `.field`: added by `environment` as `{ value: "f64", write: true }`. Why: each field is written by spawn and update.
- `Rng`: `call` with `effects: ["rng"]`. Why: sheet rule 7, rng only in spawn.
- `Counters`: one total `{ value: "f64", bump: true }` per `.counter`, added by `environment`. Why: sheet 23 to 25.
- `Params`: a read-only `f64` per `.param`. Why: `$` is not writable (sheet 2).
- `Math`: pure methods and `PI`; no effects.
- `rate` slot (pure space `rate`): `may: ["read Counters"]`. Why: sheet 1 (pure) and 24 (no bump in rate).
- `spawn` slot (instance space `particle`): `may: ["write Particle", "rng", "bump Counters"]`. Why: sheet 2, 5, 7, 23 (spawn bumps, never reads).
- `force` slot: `may: ["write Particle.vel"]`. Why: sheet 3 (a force writes vel only).
- `update` slot: `may: ["write Particle", "destroy Particle", "bump Counters"]`. Why: sheet 4, 6, 23.
- Helpers: no `helpers.may` declared, so the default applies (helpers read `Particle` only). Why: sheets 6 to 8 and 24. Not tested by a refusal.

Where `api-effects.md` fought the sheet, or differs from it:

- Sheet 4 (write to age) gives L013, the read-only-member code, not an effect code. Sheet 2 (writes to `$` and constants) is not tested.
- Sheet 3 (a force writes `p.size`) gives L004, since `size` is writable and the force's `may` names only `Particle.vel`. The sheet's rule is met, under the effect code.
- `write Particle` in spawn and update allows writes to every writable member, so the sheet's "except age" depends on `age` being read-only (L013), not on the slot's `may`.
- Sheet 23 (a counter read in update) gives L017 by the docs' rule ("a total read in a slot that may bump it"). It fits.
- Sheet 24 (a counter bumped in rate) gives L004 (the rate's `may` has no bump). It fits.
- Sheet 22 (a lambda slot given a string) has no effect code, and the API accepts text; see section 5, item 1.
- Sheet 19 (`Math.random` with an rng hint) gets the kit's own unknown-member message, which cannot carry the hint; see section 5, item 6.
