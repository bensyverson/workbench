# The record

Read this before a check, `init`, `environment` or a convention function reads the record, and whenever one of them fails to fire.

The record is what `.build()` returns. `environment`, `state.init` and convention functions see it whole. Checks see it too, with `units` only in the root's check.

## Keys

- **A construct's opening arguments** go under their `as`, else a `name(ns)` goes under `ns` (a bare `name()` under `name`). Any other opening argument lands under `arg1`, `arg2` …, so give it an `as`.
- **A decl slot whose first argument is a `name()`** becomes an object keyed by the declared names, under the slot's `as`, else its slot name. `param` with `as: "params"` gives `{ params: { topN: { value: 10 } } }`. The value is the remaining arguments: one argument stands bare, so `force(name, lambda)` gives `{ forces: { gravity: "(p, dt) => …" } }`.
- **Any other decl slot** becomes a list of its calls' arguments. With `once`, it is the bare arguments of the one call: a single argument stands alone, not in an array (`title: "Top sales"`).
- **Children** are a list under the child construct's name, and **an empty list when there are none**. Test `record.table.length`, not `!record.table`.
- **A `record: "calls"` construct keeps only `calls: [{ slot, args }]`**, in order, with no key per slot.
- **A lambda appears as its source text.**
- **Unit slots and top-level bindings** go under `units: [{ name, kind, src, keyword? }]` (`keyword` is `"const"`, `"let"` or `"function"`). It lists every top-level helper, called or not, but only the constants a lambda reads. A constant's `src` is its value (`RINGS / 2 + 1` arrives as `"2.5"`), and a `function` declaration's `src` is rewritten as an arrow.

## The example Program's record

API.md's example Program builds to:

```js
{ name: "sales", params: { topN: { value: 10, min: 1, max: 50 } }, title: "Top sales",
  source: { orders: { columns: { price: "f64", units: "f64" } } },
  table: [{ name: "big", from: "orders", calls: [{ slot: "derive", args: ["value", "(r) => …"] }, …] }],
  units: [ /* top-level helpers and constants the lambdas read */ ] }
```

## While the Program is being built

A slot's `check` runs at the call, and `ctx.program` is the record so far: the instance being built is last in its list (`ctx.program.table.at(-1)`), with this call already in it. Exclude it when you look for duplicates.

A slot's own `check` does not run when its arguments fail their shape (B004 comes first). A construct's `check` still runs and sees the bad value (`tick: "fast"` where a number was declared), so guard before you index into or call methods on a value.
