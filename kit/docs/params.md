# Params and binding time

Read this when your language has params (`$`), or when build-time code branches or loops.

## The two halves

Params need both:

- the Grammar's `params: { slot: "param" }`, naming the root slot that declares them, and
- the Dialect's `params: { object: "Params", name: "$" }`, plus a `$` global of that object, whose members `environment(program)` fills (one per declared param).

## One `$`, two times

The host calls `run(programFn, { values })`. It hands the function a `$` that answers each declared param and records the read.

- **At build time** (outside lambdas), `$.topN` is the plain number: `.limit($.topN)` passes `10`. Changing a param read at build time reruns the function.
- **At run time** (inside a lambda), `$.topN` is read when the lambda runs, so it changes without a rebuild.

A value from a param has one form: `.limit($.topN)`. `.limit(() => $.topN)` is B004.

## Build-time code

The exported function may branch and loop on params, and a block body may return the chain.

- Build-time code reads a param only after its `.param` call, and only by name. `in`, spread or `Object.keys` on `$` is B015.
- Opening the root twice is B016. Returning anything else once the root is open is B017.

## A param that bounds a loop

A counted loop in a lambda needs a bound the kit can trust. A member `{ value: "f64", size: true }` promises it stays small (say, a param with a small `max`, added by `environment`), so it may bound a `for` loop.
