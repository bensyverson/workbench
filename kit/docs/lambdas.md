# What a lambda may use

Read this when a lambda or a top-level helper is refused for a name or a construct you expected to work, or when your spec limits what a lambda may write.

## Free names

A lambda sees only:

- its own parameters and locals,
- the Dialect's globals, intrinsics and library,
- the Program's `.fn` and `.const` units, and `$`,
- the file's top-level `const` arrows and plain data.

Nothing else is free, not even `Math` or `NaN` unless the Dialect declares it (B008).

**A handle** is a parameter or global of object type (`p`, `$`). It is used only as `h.member`, `h.method(…)`, `h(…)` when callable, or passed whole as any call's argument. A callable one is only called. Anything else (`const q = p`) is L018. There is no option to forbid passing a handle whole.

## The Runtime Subset

Allowed: `const`/`let` (destructuring too), numbers, strings, booleans, `null`, array and object literals (an array may spread lists: `[x, ...a, ...b]` is a list whose max is the sum of the parts' maxes), arithmetic (`**` too), comparisons, `&& || !`, bitwise operators, `if`, ternaries, `for…of` over a list, counted loops `for (let i = 0; i < n; i++)`, and calls to the free names above. A counted loop starts at an integer (`0.5` is L007), and `n` is a constant, a list's length or a size (a member `{ value: "f64", size: true }`).

Not allowed: `while`, `new`, `this`, `async`, template literals, `?.`, spread outside an array literal (inside one, `[...a, ...b]` concatenates lists), and closures that escape.

The subset is wider than many specs want, and no option narrows it. A local or parameter may shadow a Dialect name (`const Math = 1` inside a lambda passes). If your spec refuses any of these, report it as a gap.

`==` is not refused; it prints an `S…` line that is advice, not an error.

## Top-level helpers and constants

A Program file may declare, at the top level:

- **a helper**: an arrow its own `const` writes, or a `function name(a) {…}`, which is the same thing. Lambdas may call it.
- **a constant**: plain data. Lambdas may read it.

Rules:

- **Intrinsics exist only inside lambdas.** `const START = dayOf(2026, 1, 1)` fails when the file loads.
- A helper made by another function (`const f = make(3)`) is B012.
- A name declared only inside build-time code, another lambda's parameter, or both at the top level and again below it (in build-time code or a helper; never a lambda's own parameter), is B013 when a lambda reads it.
- **A name may mean one thing only:** a top-level binding named like a Dialect name, a library entry or a `.fn` is B002.

## How helpers are typed

Library entries and helpers have no declared types. **Each parameter takes the one type every call passes;** two types (`id(1)` beside `id(p.vel)`) is L014. A Library entry called with the wrong type is reported inside the entry, at your Dialect file. An operation that must check its arguments belongs in `intrinsics`.

A helper nobody calls is skipped unless the Dialect says `helpers: { check: "all" }`. That checks an uncalled helper's effects, recursion and syntax, but **not what it does through its untyped parameters**: `(p) => { p.kill(); }` passes when nothing calls it, because `p` has no type.

## A lambda slot takes more than an arrow

`lambda(convention)` accepts an arrow written in place, the name of a top-level helper, or the arrow's source as a string. The record holds the source text in every case. There is no option to require an arrow written in place.
