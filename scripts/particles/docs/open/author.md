# Questions dream-code.md leaves open

Each item gives the sheet line that raised it, then what I assumed or how the tests avoid it.

1. **Block-body rate lambdas.** "A rate lambda returns a number." / "Spawn, force and update lambdas have a block body". Assumed a rate may also be `(t) => { …; return n; }`. Only r01 relies on this.
2. **Refusal 1 and refusal 2 overlap.** "1. A rate lambda that assigns anything but its own `let` locals" vs "2. A write to … a parameter (`dt = 0` …)". A rate has no particle, so anything it can assign besides its locals is also a case of 2. r01 is labelled 1. An implementation that reports 2 is still refusing correctly.
3. **What counts as a "fixed count" loop.** "`for` loops with a fixed count". Assumed `for (let k = 0; k < N; k++)` with a literal N is fixed. Avoided: `k += 1`, bounds from constants, bounds from `$`, and `while`. Whether a `$`-bounded loop in a lambda is refused (params change without a rebuild) is left open.
4. **Operators not listed.** "`const` and `let`, arithmetic, comparisons, `if`, ternaries and `for` loops". `&&`, `||`, `!`, `else`, `!==` and `%` aren't mentioned, so no test uses them. I assumed unary minus counts as arithmetic (a18 uses `-$.lift`; the sheet itself writes `-250`).
5. **Value of `$.name` at build time.** "Build-time code may read it too". Assumed it is the param's `value` (a10, a11, a13).
6. **Reading a param before its `.param` call at build time.** "but only after its `.param` call". The sheet says it is wrong but gives it no refusal number, so no reject tests it.
7. **Param `value` outside `min..max`.** "`value` lies within `min..max`". No numbered refusal, so untested. Duplicate param names and a param named like a field or force ("Param names are separate from all other names") are also untested.
8. **A lambda with more parameters than its slot.** "fewer parameters than its slot gives, never more". No numbered refusal, so untested.
9. **Empty `forces: []`.** "`forces` is optional … without it, every force acts". Unclear whether `[]` means no forces or is an error. Avoided.
10. **Compound assignment on vec2 fields.** "`+=` `-=` `*=` `/=` on a number field". `p.vel += v` seems to be excluded, but no refusal covers it. Avoided. a12 uses compound assignment on number fields only.
11. **Range ends.** "0.001 to 1", "1 to 10000", "1 to 4096". Assumed inclusive. Accepts avoid every exact limit except emitter positions on the edges (a16), which the sheet says are included. Rejects use values that are clearly out of range.
12. **Order of system calls.** "An emitter's own calls follow it; any system call after them ends that emitter." There is no rule that bounds, params or forces must come before emitters. a05 puts a `.force` after an emitter. Nothing tests `.param`, `.bounds` or `.update` after an emitter.
13. **Forward references in `forces`.** "each declared somewhere in the Program". Read as allowing a force declared after the emitter (a05).
14. **Builder mutability in block bodies.** "builds the chain with ordinary JavaScript … and returns it". It isn't said whether `sys.emitter(…)` changes `sys` or returns a new builder. a10 and a11 write `sys = sys.…`, which works either way.
15. **Lambdas capturing build-time locals.** E.g. a loop variable `k` used inside a rate lambda. They are neither top-level constants nor `$`. Avoided: `k` appears only in build-time arguments.
16. **Emitter names from expressions.** a10 uses `"flame" + k`. Assumed any build-time string is fine.
17. **Build-time values checked against limits.** a13 sets `maxParticles($.cap)` and emitter `x: $.origin`. Assumed these are checked against each param's `value` and pass.
18. **What "plain-data constants" covers.** "Top-level helpers and plain-data constants". Arrays and objects might count. Tests use number constants only.
19. **Helper body form.** "A top-level helper follows the same rules as a lambda". Assumed a helper may have a block body and be called as a statement (r06c, r08). Those rejects use one only to carry the mistake.
20. **Passing `rng()`'s result versus `rng` itself.** "It is called only directly in a spawn lambda's body; it cannot be passed on." Read as: the number `rng()` returns may go to a helper (the sheet's own `spread(rng(), 80)`), but the function `rng` may not (r07e). `rng()` inside a nested arrow within spawn, and `const r = rng;`, are avoided.
21. **Local vectors and aliasing.** "A lambda may also assign its own `let` locals, a local vector's components included." Assumed `let v = p.vel / 2` gives a fresh vector, so `v.x = …` is legal (a07). `let v = p.vel; v.x = 0` (an alias or a copy?) is avoided.
22. **Helpers that are never called.** Unclear whether a helper is checked if no lambda calls it. Every reject helper is called, so the verdict doesn't depend on this.
23. **Expression-bodied spawn, force or update** (`(p) => p.size = 2`). This could count as "returns a value" or as a syntax refusal. Avoided.
24. **Diagnostic wording** for 19 ("should point to `rng`") and 20 ("should say so"). Files can't encode this. The README notes it for r19 and r20.
25. **Kill inside a helper called from update.** "`p.kill()` anywhere but `update`: in spawn, a force or a helper." Read as: forbidden even when update is the only caller (r06c).
26. **Is `rng` in scope in rate, force or update at all?** In r07, r07b and r07c it is a free name, so it could equally be refused under 19 ("any other name"). Labelled 7, following the sheet's explicit list.
27. **Shared names across kinds.** E.g. a force and a field both called `wind`. a04 uses a param and a force both named `wind`. "Param names are separate from all other names" covers that case. Force and field sharing a name is untested.
