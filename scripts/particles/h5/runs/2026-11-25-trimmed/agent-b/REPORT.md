# Particles: report

## Difficulty

**2** (easy to fairly easy): the definitions passed the sheet's example on the first run, but a number of the sheet's refusals cannot be said with this API.

## Refusals

Codes are what `check.sh` printed for probe Programs (all deleted afterwards). `Q0nn` is my own check for refusal nn. "Partly" means the named cases are **not refused**.

| # | Result | Code and what is missing |
|---|---|---|
| 1 | refused | L013 |
| 2 | refused | L013; L018 for `const q = p`; B015 for `$.n = 3` in build code (its message talks about a "property descriptor read", not a write) |
| 3 | refused | L004. `p.pos.x = 0` in a force is refused as L013 with the vector-component message, not "a force writes only vel" |
| 4 | refused | L013; `p.age.x = 0` is L002 ("f64 has no member 'x'"), which does not name the `age` rule |
| 5 | refused, wrong fix | L013. The kit's fix proposes a `let` local; the sheet's fix (`p.vel = vec2(0, p.vel.y)`) cannot be given |
| 6 | partly | L004; `p.kill(1)` in a force is L015 (arity, not placement). **Not refused:** `p.kill()` in a helper nobody calls (an uncalled helper's parameters have no type) |
| 7 | partly | B013 (`rng` elsewhere), L010 (a third rate parameter), L018 (passed or stored). **Not refused:** a local or a helper parameter named `rng` (no reserved local names) |
| 8 | partly | L004, L013, L007 (recursion). **Not refused:** an uncalled helper that assigns a particle's field |
| 9 | refused | L002, L003, L013, L015, Q009 |
| 10 | refused | L003 |
| 11 | refused | L003, L012. A force `(p) => p.kill()` gets two diagnostics (L012 and L004) |
| 12 | partly | L002, L003, L014, L015. **Not refused:** vector `/` vector (`p.vel / p.vel`); a ternary with differing arms, or a helper with differing return types, when the value is never used |
| 13 | refused | B004 |
| 14 | refused | B004 (negative `maxRate`, bounds size), Q014 (outside the box) |
| 15 | refused | B002 |
| 16 | refused | B003 (unknown force), Q016 (twice) |
| 17 | refused | B005, B006 |
| 18 | refused | B003 (build code), L002 (lambda or helper) |
| 19 | partly | L002 (`Math.random`, `Math.tan`, `Math.pow`), B008 (`Infinity`, `NaN`, `undefined`), B013 (build local), B012 (`const X = Infinity`), Q019 (top-level `let` or non-number constant). **Not refused:** a constant whose expression uses something besides literals and earlier constants (`const T = Math.PI * 2`), since the record holds only its value |
| 20 | refused | B009 (builder), L002 (particle) |
| 21 | partly | Refused: `while`, `do`, `switch`, nested functions, `p["vel"]`, `new`, `this`, `var`, `delete`, `typeof`, comma, template, `?.`, bad `for` loops (including `k < $.n`), stored functions, `const a = $`, extra, default, rest and destructured parameters (S1xx, L003, L007, L009, L010, L012, L018, B007). **Not refused:** `==` and `!=` (S116 prints but the check passes), strings, array and object literals, `**`, `**=`, bitwise operators, `null`, `for…of`, unary `+`, `h($)`, locals or parameters named `vec2`, `length`, `Math`, `counters` or `$` |
| 22 | partly | B004, Q022, B001 (`.rate` with no emitter), B016, B017. **Not refused:** a lambda slot given a helper's name (`.force("g", h)`) or source text |
| 23 | partly | L017, L003. **Accepted:** prefix `++counters.c` (the sheet names only `counters.name++`) |
| 24 | refused | L004, L017 |
| 25 | partly | L002, L009, L018, L013, B002. **Not refused:** `counters` passed whole to a helper (`h(counters)`) |

**"Which number" precedence** is followed only where the kit happens to agree. The kit chooses its own codes and messages for lambda errors, and builder errors (including my checks) always hide lambda errors.

## Where the documents misled you

Little misled me. These cost a probe or could mislead:

- API.md: "It is unique across the **whole Program** (B002)". This reads as one shared set of names. It is per namespace: a param and a force may both be `born`. names.md ("A namespace spans the whole Program") is clearer.
- API.md: "`vector(…, { multiply: "scalar" })` (vector × vector is L003)", and strictness.md's table. Neither says what `/` does. With the option on, vector `/` vector is still accepted, and strictness.md's "What the kit cannot refuse" does not list it.
- record.md: "`units: [{ name, kind, src, keyword? }]`". The values of `kind` are never given. I dumped them with a temporary check (`"fn"`, `"const"`).
- codes.md: "`S…`, `P…` | the subset parser's syntax lines; an `S…` line may be a warning". Most `S1xx` lines are refusals and `S116` is not. Nothing says how to tell, or how to make `==` an error.

## What you guessed

- **Codes:** `Q0nn`, numbered after the refusal.
- **`ctx.program` in a construct's `check`:** the docs describe it for slot checks. I used it in the emitter's check to read `bounds`, and it worked.
- **Emitter options:** recorded under `options` via `data(shape, { as: "options" })`.
- **A wrong box:** the outside-the-box check stays quiet when `bounds` is itself invalid, so one mistake gives one diagnostic.
- **Top-level constants:** the root check reads `units` and refuses `keyword: "let"` or a non-numeric `src`. It reads only the value the record gives, never lambda text. The error lands on the export line.
- **A field named `collide`:** the sheet allows it, but `collide` is a rejected member of the particle. `environment` does not add it, so such a field can be declared but not used. Reading it gives the collide message.
- **Reserved field names:** `environment` skips them, to avoid D007 next to Q009.
- **Helpers:** `helpers: { check: "all", may: ["read Particle"] }`.
- **Math:** only the listed members; `random` and `tan` are `rejected` with tips.
- **Booleans:** `===` between booleans is accepted; the sheet does not forbid it.
- **`text(state)`:** I defined `state` as `{ t, maxParticles, bounds, emitters: [{name, live}], counters: [{name, value}], particles: [{x, y}] }`. `live` in the header is the sum over emitters; counters are space-separated on one line. `check.sh` did not report running it, so treat it as untested.
- **`length`:** an intrinsic spelled `Math.hypot($0[0], $0[1])`.

## Gaps

What I needed, and the smallest change that would say it:

1. **Vector division:** an option to refuse vector `/` vector (for example `divide: "scalar"` on `vector`).
2. **Narrower syntax:** a Dialect option listing allowed constructs, or switches for strings, array and object literals, `**`, bitwise operators, `null`, `for…of`, unary `+`, prefix `++` on a total.
3. **`==` / `!=` as errors:** a switch to promote S116.
4. **Reserved names:** a list of names no local, parameter or helper may take (`rng`, `vec2`, `length`, `Math`, `counters`, `$`).
5. **Uncalled helpers:** declared or inferable parameter types, so their bodies are checked fully.
6. **Unused mismatches:** a strict-union option for ternary arms and helper returns.
7. **Arrow in place:** `lambda(convention, { inline: true })`.
8. **Handles passed whole:** a per-object option forbidding it (`$`, `counters`).
9. **Constant expressions:** the constant's source in `units`, or a restriction on what a constant may be. Also a way to refuse a non-number constant at its own line.
10. **Custom diagnostics for kit rules:** a way to attach a message or fix to a write of a vector component, a read-only member (`age`) or an L004 (so refusals 3, 4, 5 and 6 can say what the sheet asks).
11. **Precedence:** no control over which code wins, or over builder errors hiding lambda errors.
12. **Empty Program name:** `particles("")` is B004 ("an empty name"), but the sheet says any string.
13. **Run-time semantics:** I found no way in the two files to say the tick (spawn fractions, clamping the rate, force order, removal, counter snapshot, seeded `rng`, `kill`), the `tick`/`seed` defaults, or the clamping of a moved param. The docs say "Your runner implements verbs, `rng()` and totals" but describe no runner. None of "One tick" is implemented.

## Files

Opened and read:

- `START.md`, `API.md`, `dream-code.md`, `check.sh`
- `docs/codes.md`, `docs/effects.md`, `docs/intrinsics.md`, `docs/lambdas.md`, `docs/names.md`, `docs/params.md`, `docs/record.md`, `docs/state.md`, `docs/strictness.md`

I also wrote and read back my own files (the two definitions, `examples/`, and temporary probes, generator scripts, a backup and an output file, all since deleted). A directory listing showed `log.jsonl`, `stderr.txt` and `transcript.jsonl`; I did not open them. I opened nothing else, did not read the kit's source and did not search the web. `check.sh` runs a script outside this folder; I ran it but did not open that script.
