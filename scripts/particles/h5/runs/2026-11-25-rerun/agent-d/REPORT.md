# Particles: report

## Difficulty

**3 of 5.** The Dialect and Grammar passed the dream-code example on the first run, but closing the gaps between the kit's Runtime Subset and the sheet's smaller language meant writing a tokenizer, parser, effect walker and small type inference inside the grammar file.

## Refusals

`X0NN` is my own code, where NN is the refusal number. All other codes are the kit's. Each row was confirmed with a Program that was then deleted.

| # | Code | Notes |
|---|---|---|
| 1 | L013, L004 | `$.rate = 0`, `t = 0`, `GRAVITY = 0` give L013; a counter bump in rate gives L004. The message does not say "rate is pure". |
| 2 | L013, L018, B015 | L018 for `const q = p`. Writing `$` in build code gives B015, whose message talks about a "property descriptor" and not about writing. |
| 3 | L004, X003 | X003 for `p.pos.x = 0`. |
| 4 | L013, X004 | X004 for `p.age.x = 0`. |
| 5 | X005 | The fix writes the whole field. |
| 6 | X006 | Covers uncalled helpers too. |
| 7 | X007, L018 | L018 for spawn's `rng` passed or stored. A force or helper calling `rng()` also gets a second diagnostic, B013, when a spawn names its parameter `rng`. **Not refused:** a spawn that names a local, or its particle parameter, `rng`. |
| 8 | X008, L007 | L007 for recursion. |
| 9 | L002, L003, L015, X009 | L002 unknown field or verb; L003 `p.kill` not called; X009 `kill(1)` or its value used in update, a reserved field name, or an unknown field in an uncalled helper. |
| 10 | L003 | |
| 11 | L003, L012 | |
| 12 | L003, L002, L014, L015, X012 | X012 is for number/boolean mixing in ternary arms or helper returns, which the kit accepts. A helper parameter given two types can raise a second L003 next to L014. |
| 13 | B004 | |
| 14 | B004, X014 | X014 for an emitter outside the bounds. |
| 15 | B002 | |
| 16 | B003, X016 | |
| 17 | B005, B006 | |
| 18 | L002, B003 | A build-time `$.wnd` says "before the Program declares it", even if it is never declared. |
| 19 | L002, B008, B013, X019 | X019 for a top-level `let` or non-number constant that a lambda reads. **Not refused:** a constant whose expression is not "literals and earlier constants" but yields a number (see Gaps). |
| 20 | B009, L002, X020 | |
| 21 | X021, S1xx, L007, L010, L012, L018, B007 | The kit covers `while`, `==`, closures and so on; X021 covers strings, arrays, objects, `**`, bitwise operators, destructuring, `for…of`, reserved names, computed access and loop shape. |
| 22 | B001, B004, B007, B016, B017, X022 | **Partly not refused:** a lambda slot given source text as a string (`.update("(p) => {}")`), or a function defined in build code and passed by name. A top-level function passed by name is caught by matching its text (X022). |
| 23 | L017, X023 | |
| 24 | L004, X024 | |
| 25 | L002, B002, X025 | |

## Where the documents misled you

- API.md: "`lambda(convention)` is a Runtime Lambda". It does not say that a string of source, or a function passed by name, is accepted. The only hint is in a fix line ("pass an arrow function, (x) => …, or its source text").
- API.md: "**Strictness.** Optional: `conditions: "bool"`…" and "a local or ternary arm whose type differs" is what I needed. With `numberType: "f64"`, `c ? 1 : true` and a helper returning `1` or `true` are accepted as an `f64 | bool` union, and only fail if the value is later used. Unions appear in the docs only as a declared type, `union(a, b)`.
- API.md: "A helper nobody calls is skipped unless `helpers: { check: "all" }`, which checks its effects, recursion and syntax, not what it does through its untyped parameters." This is accurate, but "effects" suggests more than you get: `(p) => { p.age = 0; }` and `(p) => { p.kill(); }` in an uncalled helper pass.
- API.md: "`name(ns)` declares a name in namespace `ns`: a JavaScript identifier". Accurate, but there is no option to narrow it.
- API.md: "**Slot options:** `once`, `required`, `as` (the record key), `check(call, ctx)`." It does not say that a slot's `check` also runs when the arguments failed their shape. My `forces?.find` crashed (C005) on `forces: "f"`.
- API.md: "`units: [{ name, kind, src, keyword? }]`". It does not say that all helpers are listed but only the constants that are read, that a constant's `src` is its value and not its expression, or that a `function` declaration's `src` is rewritten as an arrow.

## What you guessed

- A spawn-local or particle parameter called `rng` is left alone.
- Assignments and `++` used as values (`const b = a++`) are allowed, except for counter bumps. `p.kill()` inside `? :` or `&&` is not "a statement on its own" and is refused.
- `++k` in a for update is refused: only `k++` and `k += 1` are listed.
- A negative literal (`-2`) counts as a "number literal" loop bound.
- A top-level `let` or non-number constant that no lambda reads is fine.
- A field may be called `collide`, `x` or `rng`: only the six listed names are refused.
- The kit's `S…`, `L…` and `B…` messages are good enough "diagnostics that name the mistake", so I did not replace them with sheet-numbered ones.
- Text view: `state` is `{ t, maxParticles, bounds, emitters: [name], counters: [[name, value]], particles: [{ emitter, pos }] }`. The counter line separates entries with spaces. This was not run: `check.sh` has no way to exercise it.
- The tick semantics (spawn order, clamping, removal, seeded `rng`) have nowhere to live in the two files. The API says "Your runner implements verbs, `rng()` and totals", and no runner was asked for.
- `length` is the only intrinsic. `Math.*` are object members without a `ref` or spelling, on the assumption that the host supplies them.

## Gaps

- **Lambda written in place.** The grammar cannot tell an inline arrow from a string or a named function. Smallest change: `lambda("force", { inline: true })`. My text-matching stand-in has a false positive: an inline lambda identical to an **uncalled** top-level helper (`const one = () => 1;` plus `.rate(() => 1)`) is refused.
- **Narrower language.** There is no way to turn off strings, arrays, objects, `**`, bitwise operators, destructuring or `for…of`. Smallest change: `defineDialect({ syntax: { deny: [...] } })`.
- **No parsed form of lambdas** for custom checks, so I wrote my own reader. Where it cannot parse something it stays silent and relies on the kit. Checks that see only source text also cannot point inside the lambda: X diagnostics give the builder call's line, and cross-Program ones the export's line.
- **Ordering.** My checks run at the builder stage, so they pre-empt every kit lambda error, and cannot rank themselves against `L…` diagnostics.
- **Mixed-type unions.** Needs a strictness switch that refuses them. My X012 inference is shallow and skips any type it cannot work out.
- **Uncalled helpers** are only partly checked. Type errors through their parameters go unnoticed.
- **Constant expressions.** The record gives a constant's value, not its source, so "a number expression of literals and earlier constants" cannot be enforced (`const G = Math.sqrt(4)` passes).
- **Loop bounds.** The kit requires an integer start (L007), so `for (let k = 0.5; …)`, which the sheet's wording allows, is refused.
- **Name shape.** `name()` has no pattern option; I check the letter-first rule by hand.

## Files

Opened: `START.md`, `API.md`, `dream-code.md` and `check.sh` (I printed its contents once, though the task listed only the first three to read), plus files I wrote myself: `particles.dialect.js`, `particles.grammar.js`, `examples/*.js`, and temporary probe scripts and their output in `probe/`, since deleted. I ran `check.sh` many times; it runs the kit and writes `log.jsonl`, neither of which I opened.

A directory listing also showed `stderr.txt` and `transcript.jsonl`; I did not open them. I opened no other file and did not search the web.
