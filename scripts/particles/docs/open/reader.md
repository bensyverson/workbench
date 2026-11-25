I couldn't save `OPEN.md`. The write was refused because the path counts as sensitive (it sits under `.claude/`), and I didn't try to get around that with a shell command. The full text is below. To get the file, approve the write or point me to a directory outside `.claude/`. I read only `dream-code.md` (after listing this directory) and wrote no implementation.

---

# Open questions: Particles dream code

Quoted blocks are from `dream-code.md`. "Pick" is what I would do unless told otherwise. R1 to R20 are the numbered refusals.

**Settle these first, because they change the design:** 1, 2, 3, 4, 5, 20, 62.

## A. Architecture and scope

**1. How can lambdas be checked without parsing them?**
> Each of these must fail to build or to check, with a diagnostic that names the mistake:

Your request asks for a "parser-free builder library" plus lambda checks. A write in an untaken branch, a write through an alias, `===` on vectors and a vector used as a condition can't be caught without reading source.
Options: (a) run lambdas against recording proxies, which misses all of those; (b) parse `fn.toString()` and the module source with an off-the-shelf JS parser, so "parser-free" means no hand-written grammar; (c) hand-write a parser, which contradicts the request.
**Pick:** (b), with a pinned parser such as acorn. If no parsing dependency is allowed, much of R1–R12, R18 and R19 can't be met, so please confirm.

**2. Vector operators don't work in plain JavaScript.**
> Two `vec2`s add and subtract; a `vec2` multiplies by a number on either side and divides by one.

JavaScript has no operator overloading, so `p.vel + vec2(0, 1) * dt` on objects gives a string or `NaN`. The example's lambdas can't run as written.
Options: (a) only build and check, leaving compilation to a host; (b) rewrite the operators and recompile; (c) require `.add()`, which contradicts the sheet.
**Pick:** (a), keeping each checked, typed syntax tree in the built Program.

**3. Is the host part of the work?**
> The host runs this; the language describes it.

> Nothing here is implemented.

Options: (a) builder and checks only; (b) also a simulator and text view.
**Pick:** (a). Questions 71–81 then matter only when a host is written.

**4. How does the library see top-level helpers and constants?**
> // Top-level helpers and plain-data constants: lambdas may use them.

A function object doesn't give access to `GRAVITY` or `spread`, and R6–R8 need helper source.
Options: (a) `check(path)` reads the module source, then imports it; (b) register helpers with the builder, which contradicts the example; (c) accept unknown names, which breaks R19.
**Pick:** (a). An in-memory Program is reported as not fully checkable.

**5. May a lambda capture a local of a block-body export?**
> The exported function may be a single chain, as above, or have a block body that builds the chain with ordinary JavaScript (a loop or an `if` that adds emitters or forces) and returns it.

> // Top-level helpers and plain-data constants: lambdas may use them.

A lambda added in a loop will naturally want the loop variable.
Options: (a) refuse it under R19; (b) add an explicit binding call; (c) allow it unchecked.
**Pick:** (a), saying only top-level names are visible. Per-iteration differences can then go only into names and options.

**6. What do "build" and "check" mean?**
> Each of these must fail to build or to check, with a diagnostic that names the mistake:

Stages, API, throw or return, one or all diagnostics, and their shape are unstated.
**Pick:** the builder records calls and throws only when it can't continue. `check` returns all diagnostics as `{ code, message, where }`, with stable codes.

**7. Where is the library and what does it export?**
> import { particles } from "../particles.grammar.js";

**Pick:** an ES module `particles.grammar.js` exporting `particles` and `check`, with example Programs one directory below. `vec2` and `length` are never imported, so they are only names the checker knows.

**8. Do checks cover unreachable code and unused code?**
> A top-level helper that writes a particle's field.

**Pick:** all checks are static and include dead branches and unused forces. For helpers see question 20.

## B. Builder shape and calls

**9. Do builder calls mutate or return new values?**
> have a block body that builds the chain with ordinary JavaScript

With immutability, `if (x) s.force(…)` is silently lost.
**Pick:** mutate.

**10. What may follow `.emitter()`, and on which handle?**
> An emitter's own calls follow it; any system call after them ends that emitter.

**Pick:** `.emitter` is a system call and returns a view with `rate`, `spawn` and all system calls. A system view refuses `.rate` and `.spawn`. A saved emitter view is usable until another system call ends it.

**11. `tick` or `seed` called twice isn't refused.**
> `seed` (once, optional)

> `bounds` or `maxParticles` missing or called twice; `update` called twice;

**Pick:** refuse both; R17 is incomplete.

**12. Param rules with no refusal.**
> `value` lies within `min..max`.

Out-of-range value, `min > max`, missing or non-finite entries and duplicate params are all absent from R1–R20.
**Pick:** refuse all.

**13. What does name separation allow?**
> Param names are separate from all other names.

**Pick:** a param may share a name with a field, force or emitter, but params are unique among themselves.

**14. What is a legal name?**
> Field names are unique, and none may be a built-in field's name or `kill`.

Empty strings, spaces, `__proto__` and `constructor` are uncovered.
**Pick:** params and fields are identifiers, excluding `Object.prototype` names. Program, force and emitter names are non-empty, without whitespace or `=`.

**15. Unknown, missing or ill-typed options.**
> `.emitter(name, { x, y, maxRate, forces })`

**Pick:** refuse unknown keys, missing required keys, non-finite numbers and extra arguments. `maxRate` has no upper limit, `seed` is a safe integer, and a field's `value` is a finite number.

**16. When are cross-references checked?**
> each declared somewhere in the Program

**Pick:** after the chain returns, for forces, positions against bounds, params and fields. If bounds are missing, report R17 only, not R14 positions.

**17. What does `forces: []` mean?**
> without it, every force acts on this emitter's particles.

**Pick:** no forces. `undefined` counts as absent, and list order is ignored. In the example, `gravity` and `drag` therefore act on `mist`.

**18. What if a param read at build time later changes?**
> Build-time code may read it too, but only after its `.param` call.

> changes without a rebuild

**Pick:** build code gets the declared value, and the Program marks the param as build-read so a host knows to rebuild.

**19. Build-time reads of unknown or later params.**
> A lambda that reads a param that is not declared (`$.wnd`).

R18 covers only lambdas.
**Pick:** `$` throws on unknown reads and on any write at build time.

## C. Names, helpers and constants

**20. Which top-level functions are helpers?**
> A top-level helper follows the same rules as a lambda and may call other helpers, but it is **pure**

A module may have build-only functions, and the default export is itself top-level.
Options: (a) check every top-level function; (b) check only those reachable from a lambda.
**Pick:** (b). An unused writing helper then passes, which departs from a literal R8.

**21. What forms may a helper take?**
> Top-level helpers and plain-data constants

**Pick:** same-module `function` declarations and `const` arrows or function expressions. No imports.

**22. May helpers recurse?**
> may call other helpers

**Pick:** no, direct or mutual, since it defeats the fixed-count loop rule.

**23. What may a helper receive and return?**
> it may take a particle and read it, but never writes, kills or uses `rng`.

**Pick:** it receives numbers, vectors, booleans or a particle, and returns any of the first three. It can't receive `$`. It may assign its own locals.

**24. Are helpers typed per call?**
> A field written with the wrong type

**Pick:** yes, once for each combination of argument types.

**25. What is plain data?**
> Top-level helpers and plain-data constants

**Pick:** `const` bindings holding finite numbers, booleans, or objects and arrays of them, judged by evaluated value. Allow constant-property and numeric-index access. No strings, vectors, `let` or `var`.

**26. Is changing a constant's contents a refused write?**
> not `$`, not a top-level constant, not a parameter itself

**Pick:** yes, including `CONFIG.g = 0` and `push`.

**27. Shadowing the language's names.**
> Lambdas may use `vec2`, `length`

**Pick:** refuse redefining `vec2`, `length`, `Math` or `rng`. Other shadowing is ordinary JavaScript.

## D. Allowed syntax

**28. Is the construct list exhaustive?**
> Lambda bodies use `const` and `let`, arithmetic, comparisons, `if`, ternaries and `for` loops with a fixed count.

It omits `&&`, unary minus (the example uses `-250`), calls, `return` and `++`, and no refusal covers other syntax.
**Pick:** an allowlist adding `&& || !`, unary `-`, booleans, `% **`, `++ --` on number locals, permitted calls, `return`, `break` and `continue`. Refuse the rest by name.

**29. What is a fixed count?**
> `for` loops with a fixed count.

This can't be checked as written.
**Pick:** start, limit and step are literals or top-level numeric constants. The body never assigns the counter, termination is provable, and the maximum is 1000 iterations. `$.n` is refused.

**30. Special globals.**
> and nothing else from `Math`.

**Pick:** refuse `Infinity`, `NaN`, `undefined` and `Number.*` under R19.

**31. Parameter lists.**
> A lambda may declare fewer parameters than its slot gives, never more.

No numbered refusal covers this, and defaults or rest parameters distort `fn.length`.
**Pick:** refuse extras, defaults, rest and destructuring. Roles come from position.

**32. Non-arrow or named lambdas.**
> .force("gravity", (p, dt) =>

**Pick:** accept arrows, function expressions and named top-level functions, checked under the slot's rules. Refuse bound or native functions, `this` and `arguments`.

## E. Writes and values

**33. Do vectors copy or share?**
> A lambda may also assign its own `let` locals, a local vector's components included.

With shared objects, `let v = p.vel; v.x = 0;` would defeat R5.
**Pick:** vectors are values, copied on assignment and when passed. Any host must honor that.

**34. Components of `const` vectors or vector parameters.**
> its own `let` locals, a local vector's components included

**Pick:** only `let` locals have assignable components.

**35. Compound assignment on vectors.**
> "Write" means an assignment (`=`, or `+=` `-=` `*=` `/=` on a number field)

`p.vel += …` matches neither R5 nor R10.
**Pick:** refuse on vector fields, suggesting `p.vel = p.vel + …`. Allow on locals when the binary operation is legal.

**36. `++`, `%=`, `||=`, `delete`, mutating calls.**
> Nothing else is writable

**Pick:** refuse them on fields, `$` and constants. For `p.heat++`, suggest `p.heat += 1`.

**37. What may be done through another name?**
> or the particle under another name (`const q = p; q.vel = …`).

Reads and kills through an alias are unstated.
**Pick:** refuse creating aliases; allow only `p.field`, `p.kill()` and passing `p` to a helper. This is stricter than R2 but much simpler than alias tracking.

**38. Other uses of `kill`.**
> `p.kill()` is a verb, not a field: it takes no arguments and gives no value.

**Pick:** allow it only as a whole statement, not inside a ternary or `&&`. Arguments, using its value, uncalled references and assignment get one "kill is a verb" code.

**39. Computed access.**
> A read or write of a field the particle does not have

**Pick:** refuse `p["vel"]`, `$[k]`, `Math["random"]` and computed vector access.

**40. Unknown vector members.**
> read `.x` and `.y`

**Pick:** refuse `v.z` and `v.add()` with "vectors have only x and y".

## F. Types

**41. Other vector operations.**
> Nothing else mixes (`v + 1` is wrong; write `v + vec2(1, 1)`)

> A vector mixed with a number by `+` or `-` (`p.pos + 1`), vectors compared

R12 omits `v * v`, `n / v` and `v % n`.
**Pick:** refuse all.

**42. Unary minus on a vector.**
> a `vec2` multiplies by a number on either side and divides by one.

**Pick:** refuse and suggest `v * -1`.

**43. Booleans.**
> a number into a `vec2` field (`p.vel = 0`) or a `vec2` into a number field

**Pick:** allow them in locals, conditions and helper results. Writing one to a field is R10, and arithmetic on them is refused.

**44. Conditions and comparisons.**
> vectors are never compared or used as a condition

**Pick:** conditions and logical operands must be boolean. Allow `=== !== < <= > >=`, not `==`. This is stricter than the sheet; say if numeric truthiness should work.

**45. Built-in signatures.**
> build one with `vec2(x, y)`

**Pick:** exact arity and types, with two or more numbers for `Math.min` and `Math.max`.

**46. May types change?**
> Every number is one number type

**Pick:** each local has one type, fixed by a required initializer. Ternary arms and returns agree, and value-returning helpers return on every path.

**47. Run-time `NaN` and `Infinity`.**
> clamped to `0..maxRate`

Static checks can't catch these, and a `NaN` position never tests as out of bounds.
**Pick:** a host removes particles with non-finite fields and treats a `NaN` rate as 0.

## G. Lambda results

**48. Expression bodies.**
> Spawn, force and update lambdas have a block body `{ … }` and return no value.

**Pick:** refuse every expression body in these slots as R11, including `(p) => p.kill()`. Allow bare `return;`.

**49. Block-bodied rate.**
> A rate lambda that gives something other than a number

**Pick:** allowed, with a number returned on every path.

**50. Locals and component writes in rate.**
> A rate lambda that assigns anything but its own `let` locals: rate is pure.

**Pick:** allowed, including components of its own `let` vectors.

## H. Overlapping refusals

General rule: one diagnostic per offending expression, the most specific, never suggesting an illegal fix.

**51. R1 and R2.**
> A write to anything but `p.<field>` and a lambda's own locals: `$.rate = 0`

`$.rate = 0` or `t = 0` in rate matches both.
**Pick:** R1, naming the target.

**52. R3 and R4: `p.age = 0` in a force.**
> A write to `age`, from any lambda.

**Pick:** R4, since it is illegal everywhere.

**53. R3 and R5: `p.pos.x = 0` in a force.**
> the fix writes the whole field, `p.vel = vec2(0, p.vel.y)`.

R5's fix would still be illegal there.
**Pick:** R3 first. Offer a whole-field fix only if legal, using the actual field and operator. `p.age.x` is R4; `p.life.x` is a type error.

**54. R7 and R19, and extra parameters.**
> `rng()` anywhere but directly in a spawn lambda

This covers `(t) => rng()` and `(t, live, rng) => rng()`.
**Pick:** report R7, not R19 or a second arity error.

**55. What does "directly" cover?**
> It is called only directly in a spawn lambda's body; it cannot be passed on.

**Pick:** any call lexically inside spawn, including in `if`, `for` or an argument. The second parameter is `rng` under any name, and any non-call use is R7.

**56. R6, R7 and R8 inside helpers.**
> `p.kill()` anywhere but `update`: in spawn, a force or a helper.

A helper's `q.vel = …` can't be known to hit a particle without its callers.
**Pick:** kill is R6 even if only `update` calls the helper; `rng` is R7. A write to anything but its own locals is R8, except `age`, which is R4. Report once, at the helper.

**57. R9 against R2 and R6.**
> A read or write of a field the particle does not have

**Pick:** `p.speed.x = 1` and `p.die()` are R9; `p.kill = 1` uses question 38's code; aliases are R2 at the alias.

**58. R10 and R12: `p.life = p.pos + 1`.**
> A field written with the wrong type

**Pick:** R12 only; the broken expression raises no follow-on R10.

**59. R19 against R9, R18 and R20.**
> or any other name the language does not give a lambda

**Pick:** R19 covers unresolved identifiers and `Math` members only. Unknown fields, params and `.collide` keep their own codes.

**60. The `Math.random` hint.**
> the diagnostic for `Math.random` should point to `rng` in spawn.

Saying "use `rng`" in `update` would lead to R7.
**Pick:** "randomness comes from `rng` in spawn; keep it in a field if needed later".

**61. Where does `.collide` apply?**
> `.collide(…)`, with any arguments

**Pick:** both builder views, including with no arguments. `p.collide()` is R9 with the same explanation.

**62. Randomness in build code.**
> the same seed gives the same run.

Ordinary build JavaScript may use `Math.random()` or the date, so this can't be enforced as written.
Options: (a) guarantee only for a given built Program; (b) check build code too.
**Pick:** (a), documented.

## I. Wording and examples

**63. Functions and constants as values.**
> `Math.floor`, `Math.sin`, `Math.cos` and `Math.PI`

**Pick:** `Math.PI` is a read-only number. Functions and helpers may only be called, not passed around.

**64. Other uses of `$`.**
> Lambdas read it as `$.name`

**Pick:** only `X.name`, where X is the export's first parameter. Aliasing, passing and destructuring are refused.

**65. Fractional bounds.**
> each 1 to 4096

**Pick:** legal.

**66. Overlap within R13.**
> `maxParticles` that is not whole (`250.5`) or outside 1 to 10000

`0.5` is both.
**Pick:** one message stating the whole rule and the value.

**67. Unused declarations.**
> one or more `emitter`s.

**Pick:** unused forces, params and fields are legal, without warnings.

**68. What must the export return?**
> `particles(name)` opens a Program, one particle system.

**Pick:** exactly one Program, through either view. Nothing or another value is refused; discarded extra Programs are ignored.

**69. Can a Program be changed after it is built?**
> builds the chain with ordinary JavaScript

**Pick:** no. Each build calls the export afresh and returns a frozen description.

**70. May a field value come from `$`?**
> starting at `value`.

**Pick:** yes; it is a build-time read (question 18).

## J. Host semantics

**71. Do newborns get forces and update on their first tick?**
> Newborns first move on the next tick.

> **Forces.** For each particle, oldest first

**Pick:** they skip steps 2–4, including aging, but step 5 applies.

**72. Ties in age.**
> oldest first

**Pick:** tick, then emitter declaration order, then `i`.

**73. Fraction carry.**
> its whole part is spawned now (the fraction carries over)

Ten additions of 0.1 give less than 1.
**Pick:** floor with a 1e-9 tolerance, and subtract the whole part even if newborns are dropped.

**74. `i`, `live` and the particle cap.**
> Once `maxParticles` are alive, the rest of this tick's newborns are dropped.

**Pick:** earlier emitters may starve later ones. `i` counts created newborns, and `live` is read before any spawn that tick.

**75. Leaving the bounds.**
> or has left the bounds is removed

**Pick:** only strictly outside; `size` is ignored.

**76. Rounding at end of life.**
> the host removes the particle at `age >= life`

**Pick:** compare exactly and document it.

**77. Random generator.**
> the same seed gives the same run.

**Pick:** one seeded generator per Program. The guarantee assumes the same JavaScript engine and param changes.

**78. Setting params at run time.**
> declares a number param

**Pick:** clamp to `min..max` and apply at the next tick.

**79. Advancing `t`.**
> `t` (seconds since start)

**Pick:** `tickCount * tick`.

**80. Text cell mapping.**
> then the bounds as 40 columns by 20 rows

**Pick:** column `min(39, floor(x / width * 40))`, row `min(19, floor(y / height * 20))`, with row 0 at the top.

**81. Header format.**
> a header line `t=2.00 live=143/500 jet=120 mist=23`

**Pick:** two decimals and declaration order. Emitters named `t` or `live` are allowed because position disambiguates them.
