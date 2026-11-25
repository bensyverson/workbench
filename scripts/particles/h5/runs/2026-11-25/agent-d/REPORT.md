## Difficulty

**4 of 5.** The happy path took minutes, but the kit accepts or mis-ranks much of what the sheet refuses, so I had to write my own tokenizer, parser and type checker (`particles.check.js`) and feed it to the kit through a side door, and a few rules still cannot be enforced.

## Refusals

`B011` is my checker refusing from a slot convention; its message starts `[refusal N]`. `R0NN` is the same checker, or my cross-checks, reporting from the root `check` (used when the lambda calls a helper, to avoid a second `L014`). Each of the 25 was written as a variant of `00.js`, run, and deleted.

| # | Code | Notes and holes |
|---|---|---|
| 1 | B011 / R001 | |
| 2 | B011 / R002 | `$.x = …` in build code is B015, whose message talks about a "property descriptor" and does not name the write well. |
| 3 | B011 / R003 | |
| 4 | B011 / R004 | In a called helper: kit L013. |
| 5 | B011 / R005 | |
| 6 | B011 / R006 | In a called helper: L004. In a rate that names another lambda's `p`: B013. |
| 7 | B011 / R007 | `rng` in a lambda that does not declare it, while another lambda does: B013 (B008 if none does). **Not refused in a helper nothing calls.** |
| 8 | L013, L004, L007 (kit) | Mutual recursion gives one L007 per helper. **Not refused in a helper nothing calls.** |
| 9 | B011 / R009 | R009 also for a field named like a built-in. |
| 10 | B011 / R010 | |
| 11 | B011 / R011 | |
| 12 | B011 / R012 | A helper's bad return types can add a kit L014. |
| 13 | B004 | |
| 14 | B004 (maxRate, bounds), R014 (position) | |
| 15 | B002 | |
| 16 | B003 (unknown), R016 (twice) | |
| 17 | B005, B006 | |
| 18 | B003 (build code), B011 / R018 (lambda) | |
| 19 | B011 / R019, B008, B013, B012 | A called helper with `Math.tan` also gets the kit's L002 and L014. **A top-level `let` holding a number is not refused.** |
| 20 | B009 (builder), B011 / R020 (particle) | |
| 21 | B011 / R021, B007, B002 | B007 for what the kit cannot parse (`switch`, `throw`, labels, spread, nested function declarations). **Not refused in a helper nothing calls.** |
| 22 | B004, B001, B016, B017, B007, R022 | **Not refused: a lambda passed as a variable (`.force("a", fn)`) or as a string of source.** |
| 23 | B011 / R023 | Includes prefix `++counters.x`, which the kit accepts. |
| 24 | B011 / R024 | In a called helper: L004. |
| 25 | B011 / R025, B002 | |

**Valid Programs that are wrongly refused:** a helper called with different argument types in one Program (for example `id(p.pos)` and `id(p.size)`) gets L014. The sheet allows this. I found no way to express it.

## Where the documents misled you

- API.md: "`ref` is `{ id, kind, on, index, key }`, where `on` is the instance's name and `index` the call's position." For the root slot `.force`, `key` was undefined and `index` was not the call's position: it was 4 for the first force of `00.js`, after nine calls. Nothing in `ref` says which force is being lowered.
- API.md: a convention function is "called once per lambda at lowering." It is called many times per lambda (a probe pass, then repeatedly). Counting calls gave answers that changed between calls, and the kit crashed with `C005 … cannot lower fountain.force#4`.
- API.md shows `units: [ /* top-level helpers and constants the lambdas read */ ]` in "the record (what `.build()` returns, and what `environment`, `init` and checks see)". The root construct's `check` received no `units`. The convention function's `program` did.
- START.md: the check "type-checks every lambda", and API.md calls the subset "`const`/`let`, arithmetic, comparisons, `if`, ternaries, bounded `for` loops". Neither says how loose the typing is. The kit accepted `vec * vec`, a number as an `if` condition or `!` operand, a rate or helper missing a `return` on a path, a helper returning two types (when its result was unused), and an expression-bodied update.
- API.md: "`ctx.error(code, message, { …, arg, … })`: … `arg` an argument's position or a path into it". From the root `check`, no `arg` moved the location off the export line.
- API.md: "A top-level constant must be plain data" and "the file's top-level `const` arrows and plain data". A top-level `let` is accepted and reported as `kind: "const"`.
- Kit fix texts talk about another domain: "Baked values are ROM constants and built-ins like frame belong to the runtime; declare an .attr to change it." One message ends "see api-draft.md", which I was not given.

## What you guessed

- `environment` may add members to `Particle` and `Counters`, not only to `Params` (it can).
- A `.rate` or `.spawn` after another call on an emitter (`.emitter(…).tick(…).rate(…)`) is refused as "no emitter before it". This is the kit's behaviour (B001).
- Prefix `++counters.x` is not a bump statement. `++k` is not an accepted `for` update.
- `for` bounds may be a negated literal (`-3`) but not a negated constant (`-N`).
- A bare block `{ … }`, an empty statement and an assignment used as a value (`b = (a = 2)`) are allowed.
- Booleans may be compared with `===` and `!==`.
- A `for` loop is assumed able to fall through, even if its body always returns.
- A helper called with the wrong number of arguments is refusal 12.
- Bumping a counter with a non-number is 12, not a counter mistake.
- An expression-bodied spawn, force or update reports a higher-ranked mistake inside it first, otherwise 11.
- The program name follows the same name rule as other names.
- The shape of the `text(state)` argument (documented in a comment in the dialect). No host exists to confirm it, so `text` has not been run by me against real state.
- `vec2` is `vector(2, "f64")`.

## Gaps

1. **Uncalled helpers are invisible.** Only helpers that lambdas read reach `units`. Smallest change: put every top-level binding in `units`, with a flag for unread ones.
2. **Helpers are monomorphic (L014).** Smallest change: a Dialect option to check a helper once per set of argument types.
3. **No source check hook.** Smallest change: give the root `check` the units and an AST, with a location per node. As it is, I parse source text myself and refuse through B011, so there is no custom code and the location is only the lambda.
4. **Strictness options:** boolean-only conditions, no vector times vector, all paths return, block body required.
5. **`ref.key` for named root slots**, so a convention knows which force it is lowering. I rely on forces being first asked for in declaration order.
6. **Refusing a lambda still lowers its helpers**, which can add a second diagnostic (L014 "no call passes it"). I defer writes, kill, counters and recursion in helpers to the kit to limit this.
7. **How a binding was written:** `let` versus `const`, the initializer expression of a constant (the sheet's "number expression of literals and earlier constants" cannot be checked; `units` holds the evaluated value), and whether a lambda was written in place.

## Files

Read: `START.md`, `API.md`, `dream-code.md`, and `check.sh` (all in the working directory).

Written and read back by me: `particles.dialect.js`, `particles.grammar.js`, `particles.check.js` (a third file, imported by the other two, so hand it in with them), `examples/00.js`, `01.js`, `02.js`, this report, and temporary probe scripts, outputs and backups that I deleted. `check.sh` also wrote `log.jsonl`.

I opened nothing else. In particular I did not open `transcript.jsonl`, `stderr.txt` or any kit source, and did not search the web. One debugging probe of mine printed a JavaScript stack trace from inside a convention function, which showed kit file paths and line numbers (`kit/define/dialect.js`, `kit/define/lower.js`, `kit/lower/index.js`). I saw those names but did not open the files.
