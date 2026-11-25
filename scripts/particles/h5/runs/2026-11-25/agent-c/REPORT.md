# Particles: report

## Difficulty

**4 / 5.** The data definitions took minutes and the sheet's Program checked clean on the first run, but the kit's checks let through enough of the sheet's refusals that I had to write a parser and type walk (about 600 lines) inside the Dialect, and a few cases still cannot be expressed.

## Refusals

`B011 (n)` means my own checker refused the lambda through its slot convention, with a message starting `refusal n:`. `L…` and `B…` without that are the kit's own. `R…` are my Grammar checks.

| # | Code | Notes |
|---|---|---|
| 1 | L013 (assignments), L004 | |
| 2 | L013; L018 (`const q = p`); B015 (`$.n = 4` in build code) | The B015 text talks about "a property descriptor", not a write. |
| 3 | L004; B011 (3) for `p.pos.x`, `p.size.x` | |
| 4 | L013 | |
| 5 | B011 (5) | The message gives the whole-field fix. |
| 6 | L004 (spawn, force, used helper); L002 (on a number in rate); B011 (6) with arguments or as an expression body | **A kill in an uncalled helper is not refused** (gap 1). |
| 7 | B011 (7); B013 (`rng` read outside spawn when a spawn declares it); L018 (passed or stored) | **Not refused in an uncalled helper.** |
| 8 | L004, L013 (assigns); L007 (recursion) | **Not refused in an uncalled helper.** |
| 9 | L002; B011 (9) (kill as a value, `p.kill;`, `p.speed.x = 1`); L015 (`p.kill(1)` in update); L003; R009 (field named `pos`, `kill`, …) | |
| 10 | L003 | |
| 11 | L003 (wrong type, returned value); B011 (11) (missing return, expression body) | A spawn written `(p) => p.kill()` reports 6, as the priority list says. |
| 12 | L003, L002, L015; B011 (12) (vector × vector, non-boolean condition or `! && \|\|` operand, helper return faults) | **Not refused in an uncalled helper.** |
| 13 | B004 | |
| 14 | B004 (maxRate, bounds); R014 (outside the bounds) | |
| 15 | B002 | |
| 16 | B003 (unknown); R016 (twice) | |
| 17 | B005, B006 | |
| 18 | L002 (lambda); B003 (build code) | |
| 19 | B011 (19) (`Math.random`, non-number constant); L002 (`Math.tan`); B008 (`Infinity`, `NaN`, imports); B013 (build locals) | **A top-level `let` holding a number is not refused** (gap 3). |
| 20 | B009 (builder); B011 (20) (particle or helper) | |
| 21 | B011 (21); B007 (`switch`, `try`, labels, rest, nested `function`, …) | **Not refused in an uncalled helper.** |
| 22 | B004, B001, B007, B016, B017; R022 (`_a`, `$a`, value outside `min..max`) | **A lambda slot given a named arrow (`.spawn(h)`) is not refused** (gap 4). |
| 23 | L017; B011 (23) (`++counters.c`) | |
| 24 | L004; L017 (`=` in rate) | Not refused in an uncalled helper. |
| 25 | L002 (unknown name); L018; B011 (25); B002 (two counters) | |

**Extra diagnostics.** When my checker refuses every lambda that calls a helper, the kit also reports `L014 The type of 'a' cannot be inferred` on that helper. So some single mistakes (mixed helper returns, `rng` in a helper) print two lines. The real one is the B011.

**Position.** A B011 points at the builder call's line, not at the expression. The message adds the line within the lambda or helper and the offending text. For a fault in a helper, the location reported is the first calling lambda.

**Priority.** The sheet's "which number" order is applied among my checker's own findings. If one lambda holds two mistakes and only the kit would see the higher-ranked one, my refusal hides it until the first is fixed.

## Where the documents misled you

- API.md, `defineGrammar`: "Your checks report with `ctx.error(...)`" and Pitfall 4 suggest checks are where own rules go. Checks cannot see helpers, constants or `units`. The useful hook turned out to be the slot convention, whose `program` argument carries every lambda's source and `units`. API.md describes `(ref, program, state) => convention` and says a string refuses, but not that `program` holds `units`.
- API.md, "The record": the example shows `units: [ … ]` as part of what "`.build()` returns, and what `environment`, `init` and checks see". In a construct's `check`, the record had no `units`.
- API.md, "The record": "A decl slot whose first argument is a `name()` becomes an object by name (`{ param: { topN: … } }`)", and the built example shows `params:`. With `as: "params"` it is `params`; without `as` it would be `param`. The grammar excerpt and the sentence disagree at first reading.
- API.md, free-name rule: "**The Runtime Subset:** `const`/`let`, arithmetic, comparisons, `if`, ternaries, bounded `for` loops and calls". The kit accepts much more: strings, `null`, array and object literals, `**`, bitwise operators, unary `+`, bare expression statements.
- API.md: "**A handle** … is used only as `h.member`, … or passed whole as any call's argument". This is accurate, but it means `h($)`, `h(counters)` and `h(Math)` pass the kit.
- START.md, step 3: it "type-checks every lambda". Helpers that no lambda reaches are not checked, and neither document says so.

## What you guessed

- A counter bump is only `counters.n++` or `counters.n += x`; prefix `++counters.n` is refused (23).
- In a `for`, the step is `k++` or `k += 1` only (not `++k`). `A` and `B` may be negated literals or constants.
- A bare expression statement that is not a call, assignment or `++`/`--` (`p.size;`) is refused (21).
- Chained assignment (`a = b = 1`) and inner-block shadowing are allowed.
- "Returns on every path" is judged by shape: a `for` loop is assumed able to finish, and `if (true) return 1;` alone misses a return.
- A helper returning a particle is refused (12).
- `await`, `yield` and `async` are not treated as reserved words in my parser.
- Text view: `t.toFixed(2)`; positions clamped into columns 0 to 39 and rows 0 to 19.
- The shape of `text(state)` (the host's contract is mine to define): `{ t, maxParticles, bounds, emitters: [{name, live}], counters: [{name, value}], particles: [{x, y}] }`. The check does not exercise it, and I did not run it.
- Force lambdas: a convention gets no force name (`ref` has only a call position), so I map them by counting calls in lowering order, keyed on the `program` object. This is undocumented behaviour. I confirmed it with a probe holding several forces, but it is the most fragile part.
- `length` is `Math.hypot`; `vec2` uses `f64`; comparison is `exact()`.

## Gaps

1. **Uncalled helpers are invisible.** `units` lists only what lambdas reach, so the sheet's "uncalled helpers are checked too" cannot be met. Smallest change: put every top-level function in `units` and lower it, or give a check access to them.
2. **Helpers are monomorphic.** `id(1)` and `id(p.vel)` give L014, "one parameter has one type". The sheet says a helper "is checked for each set of argument types it is called with", so **some valid Programs are refused**. I found no way round it. Smallest change: a Dialect option to specialise helpers per argument types.
3. **`let` and `const` look alike** in `units` (both `kind: "const"`), so a top-level `let` cannot be refused. Smallest change: record the declaration keyword.
4. **A named arrow is indistinguishable from an inline one**: `.spawn(h)` arrives as source text. Smallest change: a `lambda(..., { inline: true })` option.
5. **No lambda-level check hook.** Language rules over the source (conditions must be boolean, no vector × vector, no literals, reserved local names, missing return) needed my own parser. Smallest change: `check(ast, types, ctx)` per slot, with `ctx.error` at a node, or Dialect switches for strict conditions, no componentwise `*`, and the allowed syntax.
6. **The kit accepts, and the language must not:** `if (number)`, `vec2 * vec2`, `const x = p.kill()`, a rate missing a `return` on a path, helpers with mixed or partial returns, passing `$`, `counters` or `Math` to a helper, locals named `vec2` or `length`, `rng` as a local in a force.
7. `environment` that declares a member twice crashes with C005, so a field named `pos` had to be guarded and refused separately.

## Files

Read: `START.md`, `API.md`, `dream-code.md`. I also printed `check.sh` (`cat`) at the start, which goes beyond the three files named for reading; it showed the path of the kit's check script, which I did not open.

Written and read back by me: `particles.dialect.js`, `particles.grammar.js`, `examples/00.js`, `examples/01-sparks.js`, `examples/02-smoke.js`, `REPORT.md`, and temporary probe scripts, outputs and Programs (in `probe/` and `examples/zz_*`), all deleted.

Seen in a directory listing but not opened: `log.jsonl`, `stderr.txt`, `transcript.jsonl`. I opened no file outside this directory and did not search the web.
