# Particles: report

State at hand-in: `check.sh` reports no violations on `examples/00.js` (verbatim from `dream-code.md`), `01.js` and `02.js`. The must-refuse Programs were written one at a time, checked and deleted. Known holes are listed under Refusals and Gaps.

## Difficulty

**3**: the Dialect and Grammar passed on the first full run, but the sheet's syntax and uncalled-helper rules needed a hand-written tokenizer and parser inside the grammar file.

## Refusals

`Q0nn` codes are my own checks, where nn is the refusal number. Other codes are the kit's.

| # | Code | Notes |
|---|---|---|
| 1 | L013 | A counter bump in a rate is 24. |
| 2 | L013, L018 (alias), Q008 (in a helper), B015 (build-code `$` write) | B015's message talks about "a property descriptor" and says `fix: write $.rate`, which does not describe a write. |
| 3 | L004; Q003 for `p.pos.x = 0` | |
| 4 | L013; Q004 for `p.age.x = 0` | |
| 5 | Q005 | The message gives the whole-field form, with `…` for the new component. |
| 6 | Q006 | In a rate with no particle parameter, the kit adds B008. |
| 7 | Q007 | A free `rng` also gets the kit's B008, whose advice ("read $.rng") is wrong here. |
| 8 | Q008 (assignment), L007 (recursion) | |
| 9 | L002, Q009 | The kit accepts `return p.kill()`, `const k = p.kill()` and `a && p.kill()`; Q009 covers them. |
| 10 | L003 | |
| 11 | L003, L012 | |
| 12 | L003, L015, L002, L014 | Two helper parameter types give L003 and L014. **Partly not refused:** a type error that only shows through the parameters of a helper nobody calls. |
| 13 | B004 | |
| 14 | B004, Q014 | |
| 15 | B002 | |
| 16 | B003, Q016 | |
| 17 | B006, B005 | |
| 18 | L002 (lambda or helper), B003 (build code) | |
| 19 | L002, B008, B012, B013, Q019 | **Partly not refused:** a constant written as something other than a number expression but evaluating to a number (`Math.floor(2.5)`), because `units` holds only the value. |
| 20 | B009 (builder), Q020 (lambda, helper) | |
| 21 | Q021, L007, L010, B007 | B007 covers a rest parameter, `switch` and function expressions. |
| 22 | B001, B004, B007, B016, B017, Q022 | **Not refused:** a lambda slot given a source string (`.force("g", "(p) => {}")`). A helper passed by name is caught only if nothing calls that helper (a text-equality heuristic). |
| 23 | L017, Q023 (`++counters.c`) | |
| 24 | L004, L017, Q024 | |
| 25 | L002, Q025, B002 | |

## Where the documents misled you

- "Any other decl slot becomes a list of its calls' arguments (the bare arguments when `once`)", and "A decl slot whose first argument is a `name()` becomes an object by name". For `force(name, lambda)` the value turned out to be the bare source string, and so did a `once` slot with one argument. I read "the bare arguments" as an array. My root check then indexed into the string and silently checked one character, and nothing failed until a probe passed that should not have.
- "A lambda appears as its source text", under `units: [{ name, kind, src, keyword? }]`. For a constant, `src` is the evaluated value (`RINGS / 2 + 1` arrives as `2.5`), not its source.
- "`fix` is code to write instead, printed as `fix: write <fix>`; put advice in `tip`." A tip is also printed after `fix:`, and an error with neither prints "no fix given: …". Neither is stated.
- "`for (let i = 0; i < n; i++)` (`n` a constant, …)". It does not say the start must be an integer; `for (let k = 0.5; …)` is L007.
- "**There is no `while`**, `new`, …" and the Runtime Subset: `==` produces an S116 line, yet the run still ends "no violations", so it is not a refusal. `S…` and `P…` codes are not in "Codes you will meet".
- "A name may mean one thing only: a top-level binding named like a Dialect name … is B002." This covers top-level names only; a local or parameter named `vec2` or `Math` is accepted.
- "`helpers: { check: "all" }`, which checks its effects, recursion and syntax": "syntax" means the kit's subset, and the effects exclude `p.kill()` or a write through a parameter. The second half of the sentence says so, but the first reads as stronger than it is.
- The sheet says "The exported function `($) => …`"; neither page says that a zero-parameter export is refused (C001).

## What you guessed

- `true === false` is allowed: the sheet lists `===` and refuses only arithmetic on booleans.
- `Math.PI` is allowed in a top-level constant. Negative literals and non-integer literals are allowed as loop bounds (the kit still refuses a non-integer start).
- `++k` is refused as a loop step (only `k++` and `k += 1` are listed). Prefix `++`/`--` is allowed on numbers elsewhere, but not on counters.
- Unary `+`, bitwise operators and `**` are refused. `let a = 1, b = 2` and parentheses around a write target are allowed.
- A non-number constant or top-level `let` is refused only when a lambda or helper reads it, so build code may use string arrays and the like.
- A particle parameter in spawn may have any name, including `rng`.
- In a helper nobody calls, a member of a parameter must be a particle field, `.x` or `.y`. A call of a parameter is refused.
- Params: `value`, `min` and `max` are all required; `min <= value <= max` is Q022.
- Name uniqueness: one namespace per kind, as the sheet says. The Program name may be empty.
- A field named `collide` is allowed (only a call to `collide` is refused).
- Rate lambdas run in a pure space. Spawn, force and update run in an instance space. `rng` is a callable object with the effect `rng`.
- Text view: I defined `state` as `{ t, maxParticles, width, height, emitters: [{name, live}], counters: [{name, value}], particles: [{x, y}] }`. It has not been exercised: I saw no sign that `check.sh` calls `text`, and I have no runner.
- Target: `js` only, with `exact()` comparison. Nothing here was run, only checked.

## Gaps

1. **No way to narrow the syntax.** The kit's subset is wider than this language (strings, arrays, objects, `**`, bitwise, `for…of`, `null`, `==`). Smallest change: a Dialect `syntax` list of forbidden forms, or give checks the lambda's parsed tree. Instead I parse the source myself, which is the largest and most fragile part of the grammar file.
2. **Uncalled helpers have untyped parameters.** Smallest change: let a Dialect declare helper parameter types, or have `check: "all"` try each candidate type. My member and write checks cover only part of this.
3. **A verb's `void` result can be returned or used in `&&` and `? :`.** The Dialect cannot say "statement only".
4. **A slot cannot require an arrow written in place.** A string and a named helper look the same as an inline arrow in the record.
5. **No reserved names for locals and parameters.**
6. **A constant's source is not visible**, only its value.
7. **A non-integer loop start cannot be allowed**, though the sheet permits any number literal.
8. **One mistake can give two diagnostics** (B008 with Q006/Q007, L003 with L014). A check cannot replace or suppress the kit's error, and I cannot customize B008 per name.
9. **A root check cannot point at a helper.** Helper errors from it are reported at another line, with the helper's name only in the message.
10. **My checks run before the kit's lambda checks**, so a Program with several mistakes shows mine first. The sheet's "which number" order holds only where I probed it.

## Files

Opened, all inside `/private/tmp/WkDS5a-h5b/agent-c`:

- `START.md`, `API.md`, `dream-code.md`.
- `check.sh`: I printed its contents once, alongside `dream-code.md`. This goes beyond the three files the task named for reading. It shows the path of the kit's check script, which I did not open.
- My own files: the dialect, the grammar, `examples/*.js`, this report, and temporary probe scripts, case files, outputs and a grammar backup, all since deleted.

`stderr.txt` and `transcript.jsonl` appeared in a directory listing and `log.jsonl` is written by `check.sh`; I opened none of the three. I opened no other file and did not search the web. I did not read the kit's source; what I know of its behaviour comes from running `check.sh`.
