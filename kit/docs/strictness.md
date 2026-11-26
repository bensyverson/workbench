# Strictness: what the kit can refuse, and what it cannot

Read this when your spec refuses something in a lambda, to find out whether a Dialect option says it or whether it is a gap to report.

## Options you turn on

None of these is on by default.

| Option | Where | Refuses |
|---|---|---|
| `{ multiply: "scalar" }` | `vector(2, "f64", { multiply: "scalar" })` | vector × vector (L003) |
| `body: "block"` | a slot convention | an expression body (L012) |
| `rejected: { random: { message, tip, fix } }` (tip and fix optional) | an object | a use of that member, with your message (L002) |
| `helpers: { check: "all" }` | the Dialect | errors in a helper nobody calls (otherwise it is skipped) |
| `rejected: { sql: { message, fix } }` | a construct | a builder method, with your message (B009) |

**Always on:** a lambda or helper that returns a value must return on every path (L003). A `for` may finish, so a return inside one does not count.

## What the kit cannot refuse

If your spec refuses one of these, the API has no way to say it. Report it as a gap; do not parse lambda source yourself.

- **Narrower syntax.** Strings, arrays and object literals, `**`, bitwise operators, `null` and `for…of` are all in the Runtime Subset, and no option removes them ([lambdas.md](lambdas.md)).
- **Reserved local names.** A local or parameter may shadow `Math`, a vector type or a global.
- **A lambda written in place.** A lambda slot also accepts a helper's name or source text.
- **A handle passed whole** (`h($)`).
- **What an uncalled helper does through its parameters.** `helpers: { check: "all" }` checks its effects, recursion and syntax, but its parameters have no type, so `(p) => { p.kill(); }` passes when nothing calls it.
- **Mixed types that are never used.** Since conditions are bool only, `const v = c ? 1 : true` is an `f64 | bool` union and is refused only where the value is used as one type.
- **A narrower name shape.** `name()` takes any JavaScript identifier (`_x`, `h$t`). A slot or construct check can refuse more with your own code.
- **A constant's source.** `units` gives a constant's value, not its expression ([record.md](record.md)).
- **Which code a mistake gets, or in what order.** Your builder checks always report before the kit's lambda checks ([codes.md](codes.md)).
