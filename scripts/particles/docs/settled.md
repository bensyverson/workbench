# How the particles sheet was settled

*2026-11-24, leaf 6VctPg.* The one settling revision of [dream-code.md](dream-code.md) answers both blind readers' lists: [open/author.md](open/author.md) (the hidden-program author, 27 items) and [open/reader.md](open/reader.md) (an implementer, 81 items). It also adds one feature Ben ruled the same day: **counters** (`.counter(name)`), the only shared state a lambda may touch. Refusals 1 to 20 keep their numbers; 21 to 25 are new. Each item below gives the ruling in one line and where the sheet now says it ("Building", "Inside", "Particle", "Lambdas", "Tick", "Text view" are its sections; "R*n*" is refusal *n*; "Which" is the paragraph after the refusals). "Out of the language" means the item is about how an implementation is built, not about which Programs are legal, so the sheet says nothing new.

## The author's list

1. Block-body rate lambdas: allowed, returning a number on every path; a missing return is R11. Lambdas.
2. R1 against R2: any assignment in a rate lambda but its own `let` locals is R1 (counters aside, R24). Which.
3. Fixed-count loops: `for (let k = A; k < B; k++)` with A, B number literals or top-level constants; `<=` and `k += 1` fit; a `$`-bounded or `while` loop is R21. Inside ▸ Syntax.
4. Unlisted operators: `&&` `||` `!` `else` `!==` `%` and unary minus are allowed; the syntax list is now exhaustive. Inside ▸ Syntax.
5. `$.name` at build time: gives the param's `value`. Building ▸ param.
6. Build-time read before its `.param` call: R18. R18.
7. Param `value` outside `min..max`: R22; duplicate params: R15; a param sharing a name with a field or force: allowed. R15, R22, Building ▸ Names.
8. More lambda parameters than the slot gives: R21. Inside ▸ Parameters, R21.
9. `forces: []`: legal; no force acts. Building ▸ emitter.
10. Compound assignment on vector fields: allowed when the operation is legal (`p.vel += v`); `p.vel += 1` is R12. Inside ▸ Syntax, R12.
11. Range ends: inclusive, everywhere. Building ▸ Options.
12. Order of system calls: any order, `.param`, `.bounds` and `.update` after emitters included. Building ▸ `particles(name)`.
13. Forward references in `forces`: allowed. Building ▸ `particles(name)`.
14. Builder mutability: every call changes the Program and returns it; `sys = sys.…` and bare `sys.…;` both work. Building, first bullet.
15. Lambdas capturing build-time locals: refused, R19. Inside ▸ Names, R19.
16. Emitter names from expressions: allowed, if the result fits the name rule. Building ▸ Names.
17. Build-time values against limits: checked with each param's `value`. Building ▸ param.
18. Plain-data constants: number constants only, from literals and earlier constants; a lambda reading any other top-level name is R19. Inside ▸ Names.
19. Helper body form: expression or block body; may be called as a statement. Inside ▸ Helpers.
20. `rng()`'s result versus `rng`: the number goes anywhere; the function is only called, anywhere in spawn's own body; `const r = rng` is R7; a nested arrow is R21. Lambdas ▸ rng, R7.
21. Local vectors and aliasing: vectors are values, so `let v = p.vel; v.x = 0;` is legal and leaves `p.vel` alone. Inside ▸ Values.
22. Uncalled helpers: checked anyway; every top-level function but the export is a helper. Inside ▸ Helpers; intro.
23. Expression-bodied spawn, force or update: R11. Lambdas, R11.
24. Diagnostic wording for 19 and 20: out of the language (judged by hand); R19's hint now names spawn's `rng`. R19.
25. Kill in a helper that only update calls: R6. R6.
26. `rng` outside spawn: it means nothing there, and any use of the name is R7, never R19 or R21. Lambdas ▸ rng, R7, Which.
27. A force and a field with one name: allowed; kinds have separate names. Building ▸ Names.

## The implementer's list

The file opens with session noise (a refused write); the list is its numbered items.

1. Checking lambdas without parsing: every rule is decided from source, without running it; how an implementation reads source is out of the language. Intro.
2. Vector operators in plain JavaScript: lambdas are the language's code, run by the host, so `p.vel + v` works as written; how it compiles is out of the language. Inside, first bullet.
3. Whether the host is part of the work: out of the language; the sheet describes the host's run order and text view so a host can be written. One tick.
4. Seeing top-level helpers and constants: they are part of the source the rules read (intro); the mechanism is out of the language. Intro, Inside ▸ Names.
5. A lambda capturing a block-body export's local: R19; per-iteration differences go into names and options. Inside ▸ Names, R19.
6. What "build" and "check" mean: out of the language; the sheet asks only that each refusal fails with a diagnostic naming the mistake, one per mistake. What it must refuse, Which.
7. Where the library is and what it exports: out of the language.
8. Unreachable and unused code: checked; uncalled helpers too. Intro, Inside ▸ Helpers.
9. Mutate or return new: mutate and return the Program. Building, first bullet.
10. What follows `.emitter()`: it returns that emitter; `.rate` and `.spawn` set its lambdas and any other call acts on the Program; `.rate` or `.spawn` with no emitter before it is R22. Building ▸ `particles(name)`, R22.
11. `tick` or `seed` twice: R17. R17.
12. Param rules: value outside `min..max` (so also `min > max`), missing or non-finite entries: R22; duplicates: R15. R15, R22.
13. Name separation: each kind has its own names; kinds may share. Building ▸ Names.
14. Legal names: a letter, then letters, digits or `_`, for every kind; anything else is R22. Building ▸ Names, R22.
15. Unknown, missing or ill-typed options and extra arguments: R22; `maxRate` has no upper limit; a field's `value` is a finite number. Building ▸ Options, emitter, R22.
16. When cross-references are checked: once the export returns; forward references are fine. Building ▸ `particles(name)`. (With `bounds` missing, an emitter's position cannot be judged, so 17 is the only refusal that applies.)
17. `forces: []`: no forces; list order is ignored. Building ▸ emitter.
18. A param read at build time that later changes: the host rebuilds. Building ▸ param.
19. Build-time reads of unknown or later params: R18; a build-time write to `$`: R2. R18, R2.
20. Which top-level functions are helpers: all but the export, checked whether called or not (stricter than the pick). Inside ▸ Helpers.
21. Helper forms: `const name = (…) => …` or `function name(…) { … }`; imported functions are not helpers, and a lambda calling one is R19. Inside ▸ Helpers, Names.
22. Recursive helpers: R8, direct or mutual. Inside ▸ Helpers, R8.
23. What a helper takes and returns: numbers, booleans, vectors or a particle; returns one type on every path or nothing; never `$` (R21), `rng` (R7) or `counters` (R24). Inside ▸ Helpers.
24. Helpers typed per call: yes, for each set of argument types. Inside ▸ Helpers.
25. Plain data: number constants only. Inside ▸ Names.
26. Changing a constant's contents: constants are numbers, so only `GRAVITY = 0` exists, R2. R2.
27. Shadowing: a local, parameter or helper named `vec2`, `length`, `Math`, `counters` or `$` is R21; other shadowing is ordinary. Inside ▸ Names, R21.
28. Is the construct list exhaustive: yes, now listed in full; anything else is R21. Inside ▸ Syntax.
29. Fixed count: start and limit are number literals or top-level constants, the body never assigns `k`; no iteration cap. Inside ▸ Syntax.
30. `Infinity`, `NaN`, `undefined`, `Number.*`: R19. Inside ▸ Names, R19.
31. Parameter lists: extras, defaults, rest and destructuring are R21. Inside ▸ Parameters.
32. Non-arrow or named lambdas: a lambda slot takes an arrow written in place; anything else is R22; `this` is R21. Building ▸ Options, R22.
33. Vectors copy or share: values, copied. Inside ▸ Values.
34. Components of `const` vectors or parameters: not writable, R2. Lambdas ▸ Write, R2.
35. Compound assignment on vectors: allowed when the operation is legal. Inside ▸ Syntax.
36. `++`, `%=`, `||=`, `delete`, mutating calls: `++` `--` `%=` allowed on numbers (fields and `let` locals); `||=` and `delete` are R21; there are no mutating calls. Inside ▸ Syntax.
37. The particle through another name: no other name at all, written through or not (R2); only `p.field`, `p.kill();` and passing `p` whole to a helper. Particle, R2.
38. Other uses of `kill`: only the statement `p.kill();`; any other form is R9. Particle, R9.
39. Computed access: R21. Inside ▸ Syntax.
40. Unknown vector members: R12. R12.
41. Other vector operations (`v * v`, `n / v`): R12; `v % n` likewise. Inside ▸ Values, R12.
42. Unary minus on a vector: allowed. Inside ▸ Values.
43. Booleans: in locals, conditions and helper results; into a field is R10; arithmetic on them is R12. Inside ▸ Values, R10.
44. Conditions: booleans only (`if (p.heat)` is R12); `== !=` are R21. Inside ▸ Values, Syntax.
45. Built-in signatures: exact; `Math.min` and `Math.max` take two or more. Inside ▸ Built-ins, R12.
46. Types fixed: each `const` and `let` has an initializer and keeps its type; ternary arms agree; a helper returns one type on every path or nothing. Inside ▸ Syntax, Helpers, R12.
47. Run-time NaN and Infinity: a rate that is not a number counts as 0; a particle with a non-finite field is removed. Tick 1 and 5.
48. Expression bodies in spawn, force, update: R11; bare `return;` allowed. Lambdas, R11.
49. Block-bodied rate: allowed, a number on every path. Lambdas.
50. Locals and components in rate: allowed for its `let` locals. Lambdas table and ▸ Write.
51. R1 and R2 in rate: R1. Which.
52. `p.age = 0` in a force: R4. Which.
53. `p.pos.x = 0` in a force: R3; `p.vel.x = 0` is R5. Which.
54. `rng` in rate, as a call or an extra parameter: R7. R7, Which.
55. "Directly": any call inside spawn's own body; the parameter under any name; any non-call use is R7. Lambdas ▸ rng.
56. R6, R7, R8 in helpers: kill R6, `rng` R7, a counter R24, an unknown field R9, any other assignment R8 (`age` included). Which.
57. R9 against R2 and R6: `p.speed.x = 1` and `p.die()` are R9; `p.kill = 1` is R9; an alias is R2; a misplaced kill in any form is R6. R9, Which.
58. `p.life = p.pos + 1`: R12 only. Which.
59. R19's scope: names the language does not give; unknown fields R9, params R18, counters R25, `.collide` R20, `rng` R7. R19, Which.
60. The `Math.random` hint: "randomness comes from spawn's `rng`, kept in a field if needed later". R19.
61. Where `.collide` applies: anywhere, the builder or a particle, any arguments: R20. R20.
62. Randomness in build code: out of the language; the guarantee is for the same built Program, seed and param moves. Tick, after step 5.
63. Functions and constants as values: `Math.PI` is a number; functions are only called (R21). Inside ▸ Names.
64. Other uses of `$`: only `$.name`; anything else is R21. Inside ▸ Names, R21.
65. Fractional bounds: allowed. Building ▸ bounds.
66. Overlap within R13: one number, one diagnostic. Which.
67. Unused declarations: legal. Building, last bullet.
68. What the export returns: its one Program; calling `particles` twice or returning anything else is R22. Building, first bullet, R22.
69. Changing a Program after it is built: out of the language (no Program code runs after the export returns; lambdas cannot name the builder, R19).
70. A field `value` from `$`: allowed, a build-time read. Building ▸ param.
71. Newborns: skip forces, move, aging and update on their birth tick; removal applies. Tick 1.
72. Ties in age: earlier tick, then emitter declaration order, then `i`. Tick 2.
73. Fraction carry: whole part taken with a 1e-9 tolerance and subtracted even when newborns are dropped. Tick 1.
74. `i`, `live` and the cap: earlier emitters may use up the room; dropped newborns never run `spawn`, so `i` counts only created ones; `live` is read before any spawn. Tick 1, Lambdas table.
75. Leaving the bounds: strictly outside; `size` does not count. Tick 5.
76. End of life: `age >= life` compared exactly. Tick 5.
77. The random generator: one seeded sequence per Program in `rng()` call order; engine portability is out of the language. Tick, after step 5.
78. Params moved at run time: clamped, applied from the next tick. Building ▸ param.
79. Advancing `t`: ticks done times `dt`. Tick, opening line.
80. Text cell mapping: `floor(x / width * 40)` and `floor(y / height * 20)`, capped at 39 and 19, row 0 at the top. Text view.
81. Header format: `t` to two decimals; emitters in declaration order; emitters named `t` or `live` are allowed. Text view.

## The counter (new, Ben 2026-11-24)

- `.counter(name)` declares a system-wide number starting at 0, never reset. Building ▸ counter.
- Spawn and update may only bump it, as the statement `counters.name += <number>` or `counters.name++`; never read, assign, `-=`, or use the bump as a value (R23). Forces may not touch counters at all: a force writes only `p.vel`, and keeping it so keeps the force rule one line (R24). Helpers are pure and never touch counters (R24).
- A rate lambda may read `counters.name`, getting its value at the start of the tick, and never bumps or assigns it (R24).
- An undeclared counter, `counters` used as anything but `counters.name`, or two counters with one name: R25 (duplicate counters are R25, not R15).
- Precedence: R25, then R23 and R24, over R1, R2 and R12. Which.
- The text view prints a counters line after the header. Text view.

## Changes that could flip a hidden program's verdict

For a reader who has seen only the earlier sheet. "Now allowed" turns a reject into an accept; "now refused" the reverse; "now R*n*" changes only the number a reject declares.

1. A rate lambda may have a block body with `return`: now allowed (it must return a number on every path, else R11).
2. Compound assignment on a vector (`p.vel += v`, `p.vel *= 0.5`): now allowed; `p.vel += 1` is R12.
3. `++` and `--` on numbers (`p.heat++`), `%` and `%=`, `&&` `||` `!`, `else`, `!==`, unary minus, `break`, `continue`, and a bare `return;` in spawn, force or update: now allowed.
4. Negating a vector (`-p.vel`): now allowed.
5. A `for` loop bounded by a top-level constant, or stepping by `k += 1`, or using `<=`: now allowed. A loop bounded by `$` (or any non-constant): now refused, R21.
6. `while`, `do`, `switch`, `==`, `!=`, `**`, strings, arrays, object literals, computed access, nested functions, `this`, `new`, `var`, `delete`, or a `let` without an initializer in a lambda or helper: now refused, R21.
7. A number as a condition (`if (p.heat)`, `p.life && …`): now refused, R12.
8. A local that changes type, ternary arms of different types, a built-in called with the wrong count or types (`Math.min(x)`), a vector member other than `x` or `y`, or a helper returning different types on different paths: now refused, R12.
9. A boolean written to a field: now refused, R10.
10. A lambda with more parameters than its slot, or a default, rest or destructured parameter: now refused, R21.
11. A lambda slot given anything but an arrow written in place (a helper's name, a `function` expression): now refused, R22.
12. A lambda that uses a local of the build code (a loop variable inside a rate): now refused, R19.
13. A lambda reading a top-level constant that is not a number built from literals and earlier constants (an array, an object, a string, a `let`): now refused, R19. `Infinity`, `NaN`, `undefined`: R19.
14. A top-level function that no lambda calls is now checked as a helper: one that writes, kills, loops unfixed or uses `Math.random` is now refused (put build-only functions inside the export).
15. A helper that calls itself, directly or through another helper: now refused, R8.
16. `p.age = 0` in a helper: now R8, not R4.
17. Aliasing the particle (`const q = p`) without writing through it: now refused, R2.
18. Assigning a component of a `const` local vector (`const v = …; v.x = 0`): now refused, R2.
19. `rng()` inside an `if`, a loop or an argument within spawn: now explicitly allowed. Spawn's second parameter under another name (`(p, r) => r()`): allowed. `const r = rng` in spawn: R7. A rate, force or update lambda that declares a parameter named `rng`: R7.
20. A spawn, force or update lambda with an expression body (`(p) => p.kill()`): now refused, R11.
21. `p.kill()` in any form but a statement on its own (in a ternary, `x = p.kill()`, `p.kill(1)` in update, uncalled `p.kill`): now refused, R9 (in a slot that may not kill, R6).
22. `p.collide()` in a lambda: R20.
23. `tick` or `seed` called twice: now refused, R17.
24. Two params with one name: now refused, R15. A param whose `value` is outside `min..max`: now refused, R22.
25. A build-time read of a param before its `.param` call, or of one never declared: now refused, R18. A write to `$` in build code: R2.
26. A missing or unknown option key, a non-finite number in an option, an extra argument, a name that is not a letter followed by letters, digits or `_` (`"my jet"`, `""`): now refused, R22.
27. `.rate` or `.spawn` before any emitter; an export calling `particles` twice or returning something other than its Program: now refused, R22.
28. `forces: []`: allowed, meaning no forces act on that emitter.
29. A force, field, emitter or counter sharing a name with another kind: allowed.
30. Values exactly at a range's end (`tick(1)`, `maxParticles(10000)`, `bounds` 4096) and fractional bounds: allowed.
31. `.param`, `.bounds`, `.update` (any system call) after an emitter: allowed.
32. Counters, new: `.counter(name)`; bumping it in spawn or update is allowed; reading it in rate is allowed; any other use is R23, R24 or R25. A program using the name `counters` without declaring the counter is R25.
33. Label changes from the precedence rules (Which): `$.rate = 0` or `t = 0` in rate is R1; `p.age = 0` in a force is R4; `p.pos.x = 0` in a force is R3; `p.speed = 1` in a force is R9; a misplaced `p.kill(1)` is R6; `p.life = p.pos + 1` is R12 only; `Math.random` passed as a value is R19; `.rate` called twice is R17.
34. Host behavior that changes a computed text view: newborns neither move nor age on their birth tick; dropped newborns never run spawn; removal is strictly outside the box and also takes non-finite fields; the counters line follows the header; cells map as `floor(x / width * 40)`, capped. No verdict changes, but an expected text view written against a different reading would.

## 2026-11-25: the Program's own name (after the H5 run)

> **Settled after the H5 run ([project/2026-11-25-h5-run.md](../../../project/2026-11-25-h5-run.md)):** the naming rule ("a letter, then letters, digits or `_`") binds the names its bullet lists, params, fields, counters, forces and emitters, and not the Program's own name in `particles(name)`, which is any string. The hidden accepts a05, a11, a20, a22, a24, a25 and a27 name their Programs with hyphens (`"late-force"`); two of six H5 agents read the rule as binding the Program's name too and refused them. The sheet now says so in its Names bullet. No hidden verdict changes.
