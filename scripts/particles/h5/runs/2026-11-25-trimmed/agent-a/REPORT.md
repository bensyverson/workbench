# Particles on the Workbench Kit: report

## Difficulty

**2 of 5.** The language mapped almost directly onto the API and the dream-code example checked clean on the first run; the work was finding out, by probing, which of the 25 refusals actually happen.

## Refusals

Each result below comes from a throwaway Program run through `check.sh` (then deleted). "Partly" means some forms are not refused. Every unrefused form listed here was seen to check clean, except where it says "not tested".

| # | Result | Code(s) | What is not refused, or differs, and why |
|---|---|---|---|
| 1 | refused | L013, L017 (counter `=`) | |
| 2 | refused | L013; L018 (`const q = p`); B015 (`$.k = 0` in build code) | The B015 message says build code "reads the params through a property descriptor", which does not describe a write. |
| 3 | refused | L004 | `p.pos.x = 0` in a force gives L013 (component write), not the L004 the sheet's precedence implies. |
| 4 | refused | L013 | `p.age.x = 0` gives L002 "f64 has no member 'x'", which does not name the mistake. An uncalled helper writing `p.age` is under 8. |
| 5 | refused | L013 | The fix text is generic ("build a new vector from the old one's components"); it does not write `p.vel = vec2(0, p.vel.y)`. No way to set a fix on a kit lambda error. |
| 6 | **partly** | L004; L015 for `p.kill(1)` | An uncalled helper `(p) => { p.kill(); }` passes (untyped parameter). `p.kill(1)` in the wrong lambda gets L015, not the 6 diagnostic (L015 seen in `update`; the misplaced form was not tested). |
| 7 | **partly** | B013 or B008 (name not visible), L018 (passed or stored), L010 (`(t, live, rng)`) | `rng` as a name is accepted: `rate: (rng) => rng`, `force: (p, rng) => {}`, `const rng = 1`, a helper parameter `rng`, a top-level helper named `rng` that rate calls. No reserved names. |
| 8 | **partly** | L004, L013, L007 | An uncalled helper that writes through a parameter passes (`(p) => { p.age = 0 }`, `(v) => { v.x = 0 }`): it has no type. |
| 9 | **partly** | L002, L013, L003, L015; R009 (field name) | `const k = p.kill();` and `dt > 0 ? p.kill() : p.kill();` pass: a verb cannot be restricted to statement position. |
| 10 | refused | L003 | |
| 11 | refused | L003, L012 | |
| 12 | **partly** | L003, L002, L014, L015 | Accepted: `p.vel / p.vel` (vector ÷ vector); `const a = c ? 1 : true` never used as one type; an uncalled helper returning a number on one path and a boolean on another (number and vector *is* refused); `const z = h(1)` where `h` returns nothing. Anything an uncalled helper does through its parameters is unchecked. |
| 13 | refused | B004 | |
| 14 | refused | B004; R014 (outside bounds) | |
| 15 | refused | B002 | |
| 16 | refused | B003; R016 (twice) | |
| 17 | refused | B005, B006 | |
| 18 | refused | L002 (lambda, helper), B003 (build code) | |
| 19 | **partly** | L002 (`Math.random`, with the rng advice; `Math.tan`), B008, B013, B012 (`1/0`), R019 (`let`, non-number constant) | `const S = Math.PI` is accepted. The sheet allows only literals and earlier constants, but `units` gives a constant's value, not its source. |
| 20 | refused | B009 (builder, emitter), L002 (particle) | |
| 21 | **partly** | S101, S103, S104, S106, S108, S110, S111, S114, P001/P004 via B007, L003, L007, L009, L010, L012, L018, B002 | Accepted: `==` and `!=` (S116 prints but the check passes); strings, array and object literals, `null`, bitwise `&`, `**`, `**=`, `for…of`; locals or parameters named `vec2`, `length`, `Math`, `counters`; `$` passed whole (`h($)`). A top-level helper with those names *is* refused (B002). |
| 22 | **partly** | B001, B004, B007, B016, B017, R022 | A lambda slot given a top-level helper's name or a source string is accepted. The API has no "arrow written in place" option. |
| 23 | refused | L017 | |
| 24 | refused | L004, L017 | |
| 25 | **partly** | L002, L018, L009, L013, B002 | `h(counters)` passes (a handle passed whole). |

Where the sheet's "which number" order disagrees with the kit, the kit's order wins (for example, `(t, live, rng) => rng()` is reported as a parameter-count error, L010, rather than as an `rng` error; its message does name `rng`).

## Where the documents misled you

Little misled me. These are the places where the text did not match, or left out, what I saw.

- API.md: "`vector(…, { multiply: "scalar" })` (vector × vector is L003)". Nothing says that vector ÷ vector stays legal, and docs/strictness.md's "What the kit cannot refuse" does not list it. I assumed the option made vectors scale only by numbers; `p.vel / p.vel` checks clean.
- API.md: "`Infinity` and `NaN` are B004." For `.param("a", { value: NaN, min: 0, max: 2 })`, the only diagnostic printed was from my own slot check (R022), with no B004. `-Infinity` in the same shape, and `NaN` in `.field`, did give B004. This also sits oddly with docs/record.md: "A slot's own `check` does not run when its arguments fail their shape". My check now tests `Number.isFinite` itself.
- docs/codes.md: "`S…`, `P…` | the subset parser's syntax lines; an `S…` line may be a warning (`==` is S116), not a refusal". This is accurate, but only `==`/`!=` behaved that way among the S codes I tried, and the output line looks like any violation. The docs do not say which S codes are warnings.
- docs/strictness.md: "**Mixed types that are never used.** … is refused only where the value is used as one type." Accurate for ternaries. It does not say this also covers a helper's returns: f64 with vec2 is refused ("Give both one type"), f64 with bool is not.
- The B004 fix for a bad name says "use letters, digits, _ and $, not starting with a digit". In a language with a narrower rule, that advice leads straight to my R022.

## What you guessed

- **Codes for my checks:** `R` plus the refusal number (R009, R014, R016, R019, R022).
- **Shapes:** bounds inside a shape are written `data({ width: data("number", { min, max }) })`, and an opening argument's record key as `data(shape, { as: "options" })`. API.md describes both but shows neither. Both worked.
- **Spaces:** `rate` runs in a pure space `system`; spawn, force and update share the instance space `particle` and differ only in `may`.
- **`rng`** is a callable object with effect `rng`; `kill` is a verb with effect `destroy Particle`; counters are `bump` members.
- **Intrinsic `length`:** spelled `Math.hypot($0[0], $0[1])`.
- **Text view `state`:** `{ t, maxParticles, bounds, emitters: [{name, live}], counters: [{name, value}], particles: [{x, y}] }`. `live=` in the header is `particles.length`; positions are clamped into the grid. `check.sh` did not visibly exercise it; I ran the function once by hand in Node with a two-particle state.
- **Runner:** nothing said what a host must supply for verbs, `rng`, counters, `Math` members, ticking or `seed`, so I wrote none. Runtime behaviour is untested.
- **Position check against illegal bounds:** skipped, so one mistake gives one diagnostic.
- **Constants:** checked from `record.units` (`keyword`, `kind`, `src` as a value). This only sees constants a lambda reads, which is all the sheet's rule needs.
- **`collide` as a field name:** allowed (the sheet does not reserve it); it checks clean beside the rejected `collide` verb.
- **`Math.tan`:** left to the kit's "no member" message.

## Gaps

What I needed and the API lacks, with the smallest change that would let me say it.

1. **Narrower syntax** (21): an option listing allowed constructs, or switches for strings, literals, `null`, `**`, bitwise operators, `for…of` and destructuring.
2. **`==` as an error** (21): a strictness option that promotes S116.
3. **Reserved local and parameter names** (7, 21): `reserved: ["rng", "vec2", …]`, with an exception for a slot's own `rng` parameter.
4. **Handles that cannot be passed whole** (21, 25): a per-object `pass: false` for `$`, `counters`, `Math`.
5. **Arrow written in place** (22): `lambda(conv, { inline: true })`.
6. **Typed uncalled helpers** (6, 8, 12): some way to check what they do through parameters, such as writes and verbs on any parameter being refused in helpers regardless of type.
7. **Statement-only verbs** (9): `{ fn, statement: true }`.
8. **No vector ÷ vector** (12): `divide: "scalar"`, or have `multiply: "scalar"` cover it.
9. **Strict unions and void values** (12): refuse mixed-type ternaries and returns, and binding a void call to a local.
10. **A constant's source** (19): give `units[].source`, or an option limiting constant expressions.
11. **Number-only top-level constants** (19): I did it with a root check, whose errors can only land on the export line, not on the constant.
12. **Loop start** (false refusal, the reverse of the others): the sheet allows `A` to be any literal or constant, but `for (let k = 0.5; …)` or a constant `H = 0.5` as the start is L007. Programs with such loops will be refused although the sheet allows them.
13. **Empty Program name:** the sheet says `particles(name)` takes any string; `particles("")` is B004, also a false refusal.
14. **Fix text and precedence on kit errors** (5, and "which number"): no way to attach a write-the-whole-field fix, or to choose which diagnostic wins.

## Files

Read:
- `START.md`, `API.md`, `dream-code.md`, `check.sh`
- `docs/codes.md`, `docs/effects.md`, `docs/intrinsics.md`, `docs/lambdas.md`, `docs/names.md`, `docs/params.md`, `docs/record.md`, `docs/state.md`, `docs/strictness.md`

Written (and read back by my own scripts or the checker): `particles.dialect.js`, `particles.grammar.js`, `examples/00.js`, `01.js`, `02.js`, `REPORT.md`, and temporary generator scripts, test Programs and check output in this directory, all deleted.

I opened nothing else, and did not search the web or read the kit's source. `stderr.txt`, `transcript.jsonl` and `log.jsonl` appeared in directory listings; I did not open them. `check.sh` runs a script outside this directory; I ran it but did not open it.
