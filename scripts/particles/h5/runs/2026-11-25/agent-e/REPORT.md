# REPORT: particles, built from dream-code.md and API.md

## Difficulty

4. The kit did most of the work (definitions, builder, lambda type checks, effects per slot), but about five sheet refusals either pass silently or have no hook in the API to express them, and the API gives no way to customise lambda-level messages.

## Refusals

Codes are the kit's own (L, B, D, S, plus my Q codes), not the sheet's numbers. "Not refused" entries were probed and accepted by `check.sh`. Probes were written to `examples/`, checked, then deleted; more than 100 were run.

1. **Refused.** `$.rate = 0` in rate: L013 (`'rate' is read-only`). `GRAVITY = 0` in rate: L013 (top-level constant).
2. **Refused.** `dt = 0` in force: L013. `$ = 1` in update: L013. `GRAVITY = 0` in update: L013. `const v = p.vel; v.x = 0`: L013 (`'v' is const`). `const q = p`: L018 (handle used as a value). `$.rate = 0` at build time: B015.
3. **Refused.** `p.size = 2` in force: L004 (`A force may not 'write Particle.size'`). `p.pos.x = 0` in force: L013.
4. **Refused.** `p.age = 0` in update: L013 (read-only). `p.age.x = 0`: L002 (`f64 has no member x`).
5. **Refused.** `p.vel.x = 0` in force: L013 (component of a vector cannot change in place). A `let v = p.vel; v.x = 0;` is accepted (positive case in `examples/01.js`).
6. **Refused.** `p.kill()` in spawn or force: L004 (`may not 'destroy Particle'`). `p.kill()` in a helper: L004. `p.kill(1)` in update: L015 (argument count). `const k = p.kill;`: L003.
7. **Refused.** `rng()` in update or rate: B013 (`"rng" is a parameter of another lambda`). `pick(rng)` passing it to a helper: L018 (callable handle only called). `const r = rng`: L018. A helper using `rng` is not probed directly; it has no `rng` in scope, so I expect B013 as for update.
8. **Refused.** A helper assigning `p.size`: L004 (helper may only read). A self-recursive helper: L007. Mutual recursion: L007 on both helpers.
9. **Refused.** `p.speed` in force or update: L002 (no member). `p.helth`: L002. `p.speed.x = 1`: L002. `p.die()`: L002. `.field("kill", …)` and `.field("age", …)`: Q006 (built-in name). A bare `p.kill` value: L003 (`'kill' is a function`).
10. **Refused.** `p.vel = 0` in spawn: L003. `p.size = vec2(1, 1)`: L003. `p.size = true`: L003.
11. **Partly refused.** `(t) => t > 2` as rate: L003 (bool, needs f64). Spawn, force or update returning a value: L003 (`A force returns nothing`). **Not refused:** a rate with a missing return on one path, `(t, live) => { if (t > 1) { return 2; } }`. **Not refused:** an update with an expression body, `(p, dt) => p.kill()`.
12. **Partly refused.** `p.pos + 1` or `p.vel += 1`: L003. `2 / p.vel`: L003. `p.vel === vec2(0, 0)`: L003. `p.vel.z`: L002. `p.vel && true`: L003. `true + 1`: L003. A local retyped (`let a = 1; a = vec2(0, 0)`): L003. Built-ins with the wrong count (`length(a, 1)`, `Math.min(1)`, `vec2(1)`): L015. A helper returning f64 on one path and vec2 on another: L003. **Not refused:** `p.vel * p.vel` (vector times vector is accepted as componentwise). **Not refused:** `if (p.heat)` with a number as condition.
13. **Refused.** `maxParticles(250.5)` and `maxParticles(10001)`: B004. `seed(-1)` and `seed(1.5)`: B004. `tick(0)` and `tick(2)`: B004.
14. **Refused.** `maxRate: -1`: B004. Emitter at `x: 500` on width 400: Q010. `bounds({ width: 0, … })`: B004. An emitter on the edge (`400, 300`) is accepted, as the sheet says.
15. **Refused.** Two params named `wind`: B002. Two emitters `jet`: B002. Two forces `g`: B002. Two fields `a`: B002. Two counters `n`: B002.
16. **Refused.** `forces: ["gravty"]`: B003 with did-you-mean. `forces: ["g", "g"]`: Q004.
17. **Refused.** No `bounds`: B005. No `maxParticles`: B005. Two `bounds`, `maxParticles`, `tick` or `update`: B006. No emitter: B005. Emitter without `spawn`: B005. Two `spawn` or two `rate` on one emitter: B006. (Two `seed` calls are not probed, but use the same `once` mechanism.)
18. **Refused.** `$.wnd` in force: L002 with did-you-mean. `$.cap` before its `.param`: B003. Undeclared param in build code: B003.
19. **Refused, message incomplete.** `Math.random()`: L002 (`Math has no member 'random'`); it does not say that randomness comes from spawn's `rng`. `Math.tan`: L002. `Infinity`, `NaN`, `undefined`: B008. A build-time loop local `k` in a lambda: B013.
20. **Refused.** `.collide(3)` on the builder: B009 with the sheet's message ("particles never see each other"). `p.collide()` in update: L002 (generic `has no member 'collide'`), so the sheet's wording is missing.
21. **Partly refused.** `while`: S101. `==`: S116. Template literal: S104. A nested closure: S111. Default parameter: S114. `var`: S110. `p["size"]`: L009. `k < $.n`: L007. Destructured parameter: L012. An extra lambda parameter: L010. A stored function (`const f = Math.max`): L003. **Not refused:** `let Math = 1` and `let vec2 = 1` (shadowing reserved names). **Not refused:** `**`. **Not refused:** a string literal in a `let` (`let s = "a"`). **Not refused:** `$` passed whole, `h($)`.
22. **Refused.** `.tick(0.1, 2)`: B004 (takes at most 1 argument). Emitter with no `maxRate`: B004. Extra key in emitter options: B004. `y: Infinity`: B004. Bad name `1abc`: B004. Name `_x`: Q005. Param value outside `min..max`: Q001. `.rate(5)`: B007. `.rate` before any emitter: B009 (with my message). A second `particles(…)` call in the export: B016. Export returning a non-chain: B017.
23. **Refused.** `if (counters.n > 3)` in update: L017. `counters.n = 0`: L017. `counters.n -= 1`: L017. `x = counters.n++`: L017 (bump used as a value).
24. **Refused.** `counters.n++` in rate: L004. `counters.n` read in force: L004. Bump or read in a helper: L004.
25. **Partly refused.** `counters.burntOut`: L002 with did-you-mean. `counters` used as a value in rate: L018. Two counters with one name: B002. **Not refused:** `counters` passed whole to a helper, `h(counters)`.

## Where the documents misled you

- **START.md:** "Read this page, then [API.md]. Together they are everything you need." They are not. Several things were needed and absent: how vectors are represented at run time (I assumed `{x, y}` for `length`), how a top-level helper's parameter types are inferred, how to customise a lambda-level message, and what a helper's effects are when it is called.
- **API.md, handles:** "A **handle** … is used only as `h.member`, `h.method(…)`, `h(…)` when callable, or passed whole as any call's argument." This is why `h($)` and `h(counters)` are accepted, although dream-code.md refuses both (items 21 and 25). The rule as written contradicts the sheet.
- **API.md, pitfall 9:** "A lambda is checked only once its Program builds." dream-code.md says "Every top-level function … is a helper, checked whether or not anything calls it." Uncalled helpers are not checked. A helper `() => 1 + true` that nothing calls passes `check.sh`.
- **API.md, `ctx.error`:** "`fix` the text to write instead." The kit prints `fix: write <text>`, so a description such as "put .rate(...) right after…" reads as "write put …". I reworded my own fix text to fit.
- **API.md, Diagnostics:** "Every diagnostic carries a tip or a fix: read it before guessing." The B008 fix for `Infinity` says "make it a parameter and read $.Infinity", which is wrong. L013 says "Baked values are ROM constants … declare an .attr", which does not fit this Dialect at all.
- **API.md, Runtime Subset:** "bounded for loops" does not say what counts as a bound. The kit's L007 message refers to "a member its Dialect declares a size", a concept the API never defines for loops.

## What you guessed

- Types: `vec2: vector(2, "f64")`; `numberType: "f64"`; `length` as an intrinsic with `ref: (v) => Math.hypot(v.x, v.y)` and a JS prelude.
- Spaces: `emit` (pure) for rate; `particle` (`{ instance: "Particle" }`) shared by spawn, force and update.
- Slot effects: rate `may: ["read Counters"]`; spawn `may: ["write Particle", "rng", "bump Counters"]`; force `may: ["write Particle.vel"]`; update `may: ["write Particle", "destroy Particle", "bump Counters"]`. Helpers keep the default `read Particle`.
- `Particle` members: `pos`, `vel`, `life`, `size` writable; `age` read-only; `kill` is a verb with `effects: ["destroy Particle"]`. `environment` adds writable fields (`{ value: "f64", write: true }`), params (`"f64"`, read-only) and counters (`{ value: "f64", bump: true }`).
- `Math`: `min` and `max` as two-plus-rest; `abs`, `sqrt`, `floor`, `sin`, `cos` one-argument; `PI` read-only.
- Grammar: the `params` slot uses `as: "params"`, copying the API example. Emitter options are `data({…}, { as: "options" })`. Emitter `rate` and `spawn` are `once` and `required`. The emitter's `forces` list is `listOf(ref("force"))`.
- Names: letter-then-`[A-Za-z0-9_]` is checked by my own `checkName` for params, fields, counters and forces, and by the emitter's `check` for emitters (`_jet` gives Q005). I did not apply it to the Program name, which only gets the kit's identifier check.
- Error code letter: `Q`, which the API does not forbid.
- Bounds for `bounds`, `maxParticles`, `tick`, `seed` as the sheet gives; bounds and emitter-in-box checks run at the Program's `check`, so forward declarations work.
- Forces-duplicate check (Q004) lives in the emitter's own `check`.
- `rejected` entries for `rate`, `spawn` and `collide` on the Program. These are inherited by the emitter, and the emitter's own `rate` and `spawn` slots still work (`examples/00.js` passes).
- `tick` default `1 / 60`, and `seed` default `0`, are not in the record. I assumed the host applies them.
- Text view: one header line with emitters in declaration order; counters on one line separated by spaces; grid rows from `y`, with `.` `1`–`9` and `#`.
- Which fallback to use for ambiguous refusal numbers: I used the kit's codes and did not try to match the sheet's "which number" rules.

## Gaps

1. **Uncalled helpers are not type-checked.** Needed: check every top-level helper, or let the grammar/dialect ask for it. Smallest change: check all top-level functions the Program's source declares.
2. **Lambda body form cannot be inspected.** Expression bodies on update (`(p, dt) => p.kill()`) are accepted. Needed: a per-slot option requiring a block body.
3. **No "returns on every path" check** for rate. `(t, live) => { if (t > 1) { return 2; } }` is accepted. Needed: a check that a block returning a value returns on every path.
4. **Vector times vector is accepted.** `p.vel * p.vel` type-checks. Needed: a way to say a vector operator is not allowed (for example, a dialect option that disables `*` between vectors).
5. **Number as condition is accepted.** `if (p.heat)` type-checks. Needed: a rule that conditions must be `bool`.
6. **String literals are accepted** in `let` locals. Needed: a way to refuse literal types the Dialect does not declare.
7. **Shadowing of names is accepted.** `let Math = 1` and `let vec2 = 1` type-check. Needed: refuse locals named like globals, intrinsics or types.
8. **`**` is accepted.** Needed: an operator allow-list.
9. **Handles can be passed whole.** `h($)` and `h(counters)` type-check. Needed: a handle flag saying "never passed whole" (only `h.member`, or call only).
10. **No custom message for an undeclared member or name in a lambda.** `Math.random` cannot say "randomness comes from spawn's rng", and `p.collide()` cannot say "particles never see each other". Needed: a `rejected` list for Dialect members, parallel to the one for builder methods.
11. **Free-name fix text is misleading.** B008 suggests reading `$.Infinity`. Needed: a per-Dialect fix message for reserved words and constants.
12. **Vector runtime representation is not documented.** I could not write `length`'s `ref` or any spelling with certainty.
13. **Helper parameter types are not documented.** I saw L014 (`the type of 'p' cannot be inferred: no call … passes it`) and did not learn the rule that gives helper parameters their types.
14. **Bounded-loop rule is not documented.** The sheet allows `k < K` for top-level constants and refuses `k < $.n`. The kit's rule is a different concept ("declared size"); I did not probe whether a non-constant local bound is accepted.
15. **Counter and field records with no arguments** (`.counter("n")`) have an unspecified record shape. I only used `Object.keys`.
16. **Duplicate diagnostics for one mistake.** My own Q010 cascaded with B004 on `Infinity`. I fixed it in the check, but the API gives no way to ask a check to skip non-finite values before the kit's B004 runs.

## Files

Files I opened (read or edited):
- `START.md`, `API.md`, `dream-code.md`: read at the start, as instructed.
- `particles.dialect.js`, `particles.grammar.js`: written by me. I then edited `particles.grammar.js` (a failed `sed`, two Python rewrites of my own wording, one Edit call for the Infinity guard, and one for the emitter name check), and read it back once in full.
- `examples/00.js`, `examples/01.js`, `examples/02.js`: written by me. `00.js` is the sheet's example verbatim.
- `REPORT.md`: written by me.

Other files:
- `check.sh`: run many times, never read.
- The directory listing (`ls -la`) showed `log.jsonl`, `transcript.jsonl` and `stderr.txt`. I did not open them.

Confirmation: I opened no file outside `START.md`, `API.md`, `dream-code.md` and the files I wrote, and I did not search the web.
