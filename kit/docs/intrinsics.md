# Intrinsics, the Library and targets

Read this when you write an intrinsic's `ref` or `spell`, a Library entry, or a type variable.

## Intrinsics

A function a lambda calls by name. Keys:

- **`params`, `returns`**: types. One capital letter (`"T"`) is a type variable, bound per call.
- **`ref`** (required): the meaning, in plain JavaScript.
- **`spell`**, per target: a string with `$0 $1 …` for the arguments, or `{ call, prelude }` where `prelude` is code emitted once.
- Optional: `minArgs` (optional arguments), `rest` (the type of extra arguments), `numeric: "number" | "vector"` (what a type variable may be), `componentwise: true`.

**At run time a vector is a plain array of its components** (`[x, y]`). A spelling gets it whole. A `ref` gets its components spread (`length`'s ref is `Math.hypot`), or is called once per component when `componentwise`.

Intrinsics are pure, and exist only inside lambdas: a top-level constant cannot call one.

## The Library

`library: { half: { fn: "(x) => x / 2" } }`: operations written as lambda source. They need no spelling and no `ref`. Like helpers, they are typed by their calls: each parameter takes the one type every call passes (two types is L014). A Library entry called with the wrong type is reported inside the entry, at your Dialect file. An operation that must check its arguments belongs in `intrinsics`.

## Targets

`targets: { js: { accepts: "*", compare: exact() } }` is required. Every accepting target must spell every intrinsic. `tolerance(1e-3)` is the other comparison, for a target whose numbers may differ (fields uses it for `glsl: { accepts: ["pixel"], … }`: `accepts` may list the spaces a target runs).

## Types

A nominal scalar (`scalar("f64", { note })`) compares only with itself and has no arithmetic. It is not a constructor: a lambda gets one from a parameter, member or intrinsic. A vector (`vector(2, "f64")`) is built in a lambda as `vec2(x, y)` and read as `.x .y`; it is nominal too.
