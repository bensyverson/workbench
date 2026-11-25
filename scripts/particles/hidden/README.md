# Particles hidden tests

One line per file. RISKY = verdict inferred, not read straight off dream-code.md (reason given).

## accept/ (all must build and check clean)

- a01.js — the sheet's own example Program, verbatim.
- a02.js — minimal Program: only bounds, maxParticles, one emitter; zero-parameter rate; spawn declaring only `p`.
- a03.js — one-parameter rate `(t)` with a ternary; explicit tick(1/60) and seed(7); update that kills.
- a04.js — three emitters: a two-force `forces` list, a one-force list, and no list (all forces act); rate reading `live`; spawn using `i`.
- a05.js — RISKY: an emitter's `forces` list names a force declared *after* the emitter, and `.force` comes after the emitter's calls. Sheet says "each declared somewhere in the Program" and "any system call after them ends that emitter", but no example shows a forward reference.
- a06.js — top-level number constants and pure helpers; a helper calling helpers; a helper reading (not writing) a particle; helpers used in rate, force, update, spawn; `rng()` result passed as a number to a helper.
- a07.js — vec2 arithmetic: `+`, `-`, number*vec, vec*number, vec/number, `.x`/`.y` reads, `length`, assigning a `let` local vector's components. RISKY (mild): `let v = p.vel / 2; v.x = …` assumes a local vector computed from a field is a fresh value, not an alias of the particle.
- a08.js — every allowed Math name: min, max, abs, sqrt, floor, sin, cos, PI.
- a09.js — `let` locals reassigned; fixed-count `for (let k = 0; k < 4; k++)` loops in update and spawn. RISKY: the sheet says "for loops with a fixed count" but never shows one; I assumed a literal bound with `k++` is the canonical fixed-count form.
- a10.js — block-body exported function: build-time `for` loop over `$.count` (read after its `.param`) adds emitters with computed names/positions; reassigns the builder; returns it. RISKY: build-time `$.count` is taken to be the param's `value` (4), and emitter names built by `"flame" + k` are assumed fine.
- a11.js — block-body exported function with a build-time `if ($.windy > 0.5)` adding a force, then returning the chain with an emitter. RISKY: same build-time `$` value assumption as a10.
- a12.js — compound assignment `+=`, `-=`, `*=`, `/=` on built-in number fields (size, life) and declared fields, in update and spawn.
- a13.js — params read at build time inside one chain (after their `.param`): `maxParticles($.cap)`, emitter `x: $.origin`, `maxRate: $.peak`; the same params read in a rate lambda. RISKY: assumes build-time reads give `value`, and that range checks (maxParticles whole, emitter inside bounds, maxRate ≥ 0) are applied to those values and pass.
- a14.js — spawn calling `rng()` several times (into a `const`, inline), using `i`, writing pos, vel, life, size and a declared field; update reads the stored random field; seed(42).
- a15.js — update calls `p.kill()` mid-body and keeps writing fields afterward; reads age, life and a param.
- a16.js — emitters exactly on the bounds' corners (0,0), (width,height), (width,0) ("edges included"); an emitter with maxRate 0 and rate 0.
- a17.js — lambdas declaring fewer parameters than their slot: force `(p)`, update `(p)`, spawn `(p)`, rate `()`.
- a18.js — several params across lambdas; unary minus on a param; force reading declared fields; number comparisons `>=`, `<=` in ternaries; seed(0); tick(1/20); two declared fields.

## reject/ (each must fail; first line names refusal number)

All reject files are the same valid base Program with one change.

- r01.js — 1: rate lambda assigns its parameter `live`. RISKY: needs a block-body rate (`{ live = 0; return 30; }`), which the sheet never shows, and assigning a parameter is also refusal 2. Every non-local assignment a rate can make (it has no particle) also falls under 2, so no case is purely 1.
- r02.js — 2: update writes `$.wind = 0`.
- r02b.js — 2: update writes top-level constant `GRAVITY = 0`.
- r02c.js — 2: update writes its parameter `dt = 0`.
- r02d.js — 2: update assigns the particle parameter itself, `p = p`.
- r02e.js — 2: `const q = p; q.vel = vec2(0, 0);` (particle under another name).
- r03.js — 3: a force writes `p.size = 2`.
- r04.js — 4: update writes `p.age = 0`.
- r04b.js — 4: spawn writes `p.age = 1`.
- r04c.js — 4: update writes `p.age += dt`.
- r05.js — 5: update writes `p.vel.x = 0`.
- r05b.js — 5: spawn writes `p.pos.y = 10`.
- r06.js — 6: spawn calls `p.kill()`.
- r06b.js — 6: a force calls `p.kill()`.
- r06c.js — 6: a top-level helper `die` calls `p.kill()` (called from update). RISKY (mild): uses a block-body helper; the sheet only shows expression-bodied helpers.
- r07.js — 7: rate calls `rng()` (rng is not even in scope there).
- r07b.js — 7: a force calls `rng()`.
- r07c.js — 7: update calls `rng()`.
- r07d.js — 7: helper `jitter` calls `rng()` (called from spawn).
- r07e.js — 7: spawn passes `rng` itself to a helper as an argument.
- r08.js — 8: block-body helper `cool` writes `p.heat` (called from update).
- r09.js — 9: update reads `p.speed`.
- r09b.js — 9: spawn writes `p.helth`.
- r09c.js — 9: `.field("pos", …)`.
- r09d.js — 9: `.field("kill", …)`.
- r09e.js — 9: `.field("life", …)`.
- r10.js — 10: a force writes `p.vel = 0`.
- r10b.js — 10: spawn writes `p.life = vec2(1, 1)`.
- r11.js — 11: rate `(t) => t > 2` gives a boolean.
- r11b.js — 11: spawn ends with `return 1;`.
- r11c.js — 11: update ends with `return p.heat;`.
- r11d.js — 11: rate gives `vec2(30, 30)`.
- r12.js — 12: `p.pos + 1` in spawn.
- r12b.js — 12: `p.vel === vec2(0, 0)` in update.
- r12c.js — 12: `if (p.vel)` in update.
- r12d.js — 12: `p.vel ? 2 : 1` ternary condition in spawn.
- r12e.js — 12: `p.vel - 1` in a force.
- r13.js — 13: `maxParticles(250.5)`.
- r13b.js — 13: `maxParticles(0)`.
- r13c.js — 13: `maxParticles(10001)`.
- r13d.js — 13: `seed(1.5)`.
- r13e.js — 13: `seed(-1)`.
- r13f.js — 13: `tick(0)`.
- r13g.js — 13: `tick(2)`.
- r13h.js — 13: `tick(0.0005)`.
- r14.js — 14: emitter `maxRate: -1`.
- r14b.js — 14: emitter at x 401 with width 400.
- r14c.js — 14: emitter at y -1.
- r14d.js — 14: bounds width 5000.
- r14e.js — 14: bounds height 4097.
- r14f.js — 14: bounds width 0 (emitter moved to x 0 so it is still inside).
- r15.js — 15: two emitters named `jet`.
- r15b.js — 15: two forces named `drag`.
- r15c.js — 15: two fields named `heat`.
- r16.js — 16: forces list names `"gravty"`.
- r16b.js — 16: forces list names `"gravity"` twice.
- r17.js — 17: bounds missing.
- r17b.js — 17: bounds called twice.
- r17c.js — 17: maxParticles missing.
- r17d.js — 17: maxParticles called twice.
- r17e.js — 17: update called twice.
- r17f.js — 17: no emitter.
- r17g.js — 17: emitter missing rate.
- r17h.js — 17: emitter missing spawn.
- r17i.js — 17: emitter calls rate twice.
- r17j.js — 17: emitter calls spawn twice.
- r18.js — 18: rate reads `$.wnd`.
- r18b.js — 18: a force reads `$.wnd`.
- r19.js — 19: spawn uses `Math.random()` (diagnostic should point to `rng`).
- r19b.js — 19: a force uses `Math.tan`.
- r19c.js — 19: update uses `Math.round`.
- r19d.js — 19: rate uses `Date.now()`.
- r20.js — 20: `.collide("walls")`.
- r20b.js — 20: `.collide()` with no arguments.
- r20c.js — 20: `.collide({ radius: 2 })`.
