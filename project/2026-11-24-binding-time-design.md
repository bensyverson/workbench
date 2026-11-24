# Binding-time parameters: a design for this kit

*2026-11-24. Leaf `bqYGEM` (agent `bindtime`). Designs [the architecture synthesis](2026-11-24-architecture-synthesis.md) §3.1 for the kit as built. Nothing here is ruled; the dogfood run (criterion `vv2`) comes after Ben picks an option. Phase 2 (building it) was not started, because the choices in "Forks" below are Ben's.*

## What §3.1 fixes, and what the kit has today

Ruled: a param read by **build-time code** is a plain value, and changing it reruns the build; the same param read **inside a Kernel** is a uniform and changes without one. The kit records which reads happened, so "live" is a derived fact, shown in the IR view ("`topN`: folded at build, read by `.limit`"). A value that exists only at run time, used at build time, is refused with a fixit. Trial 1's `.limit($.topN)` gets one form.

Today (checked at 613926f):

- There is no `live` flag anywhere in the kit; it is only in [the proposal](2026-11-23-workbench-kit-proposal.md) §8.2.
- The kit has **no notion of a param**. A param is a Dialect's slot like any other (`param: { kind: "decl", args: [name(…), data(ParamShape)], as: "params" }` in both Grammars), and a Dialect's `environment` hook turns `record.params` into members of `$` (data) or of the `Uniforms` parameter `u` (fields, which adds the built-in `u.t` and `u.aspect`).
- Build-time code cannot read a param: `$` exists only in a lambda's text. The data Grammar's `limit` takes `oneOf("number", lambda("calc"))`, so example 5 writes `.limit(() => $.topN)`, and [api-draft.md](../scripts/define-trial/docs/api-draft.md) tells agents that `$.topN` outside a lambda "means nothing".
- A Program is **evaluated once, when its module loads**. The data examples export a thunk (`export default () => program(…)`), but the define-trial checker requires `export default program(…)…` (a chain, `C001`), and the kit has no module loader. So "rerun the build" has nothing to rerun yet.
- There is no Program-level IR view: `kit/ir/print.js` lists one Kernel. `grammar.lower(record)` returns `{ environment, lambdas, helpers, diagnostics, states }`.
- fields has the one truly run-time-only value in the kit: `u.t` (time) and `u.aspect`. The data Dialect has none (it has no signals; composition is M4).

## The questions

1. How does build-time code get a param's value, and who supplies it?
2. What does the record hold?
3. How are the binding times derived, and where are they shown?
4. What does "changing it reruns the build" mean with no host?
5. How is a run-time-only value at build time refused?

## Option A: the Program is a function of its params (consult A's form, adapted)

A Program file exports a function; the kit calls it with a **recording proxy** for the params and runs it again when a build-time param changes.

```js
export default ($) => program("top-customers")
  .param("topN", { min: 5, max: 50, value: 10 })
  …
  .filter((o) => year(o.placed_at) === $.year)    // in a lambda: $.year is a Kernel read, a uniform
  .limit($.topN);                                 // at build: a plain 10, recorded; changing topN reruns
```

1. **Values.** `run(programFn, { values, scope, buildTime })` in kit/define opens a run, calls `programFn($)`, and returns `{ record, diagnostics }`. A read of `$.topN` returns `values.topN` if the host gave one, else the `value` declared by the `.param` call already made in this run (the root builder registers itself with the open run; builds are synchronous, so one module-level "current run" is safe). The `$` is the same name the lambdas use, and it means the same thing (the params), so the one-name-one-meaning ruling holds; a lambda's `$` is a Dialect global, which the free-name rule allows before it looks at `buildTime`, so the thunk's parameter is no `B013` (checked in `grammar.js`). fields would name its parameter `u`.
2. **Record.** The record holds the folded value (the table's `calls` gets `{ slot: "limit", args: [10] }`) and, beside `units` on the root, `reads: [{ param, value, by, file, loc }]`. `by` is the builder call that ran next (`top.limit#0`): arguments are evaluated just before their call, so a read in an argument lands on that call. A read in build-time control flow (`if ($.showChart) …`) lands on the next call too, and its `loc` says where the read was, so the listing can say "read at line 14, before `.chart`". `D017` would reserve the key, as it does `units`.
3. **Derivation.** `lower(record)` adds `params: { topN: { build: [{ by, loc }], kernels: [], live: false }, year: { build: [], kernels: ["top.filter#0"], live: true } }`. Kernel reads come from the lowered IR (a member read of `$`, or of the Uniforms parameter, which the Dialect names; see the forks). `live` is `build.length === 0`. A param read in both places is not live, and the listing says both. **Shown** by a new `bindingText(lowered)` in kit/define, one line per param, which a workbench page or agent tool prints beside the Kernel listings:
   ```
   topN   folded at build, read by top.limit (05-query.js:21)
   year   uniform, read by top.filter#0
   ```
4. **Rerun.** `needsRebuild(lowered, changedNames)` answers from the record (`true` if any changed name has a build read); the host then calls `run` again with the new values. No cache: our builds take milliseconds, and the content-keyed cache belongs to the Composition milestone (§3.7).
5. **Refusal.** The Dialect names its run-time-only members (fields: `t`, `aspect`). Reading one at build time throws at once, as `B001` does, since there is no value to return: **B014** "`u.t` is known only while the field runs", fix "read it inside the lambda: `(uv, u) => … u.t …`". An undeclared param at build time throws `B003` with a did-you-mean. `.limit(() => $.topN)` becomes the refused form: `limit` takes a number, and its `B004` tip says `.limit($.topN)`.

**For:** it is §3.1 as written, and consult A's design. Build-time code is plain JS and can branch, loop and do arithmetic on a param (`for (let i = 0; i < $.bands; i++)`, `$.topN * 2`). No Dialect slot changes to accept params. **Against:** every Program becomes a function, and the define-trial checker's `C001` rule flips; the kit gains a run context; `by` is attributed by order, not by data flow, so a value read early and passed late is attributed to the wrong call (the `loc` stays right).

## Option B: a param handle kept in the record (consult B's form)

At build time `$.topN` is a **handle** (`{ param: "topN" }`), not a number. A slot opts in with a kit shape, `data(param("number"))`, which takes `10` or `$.topN`; the record keeps the handle, and the host substitutes the value when it runs the structure.

- Attribution is exact (the handle sits in `.limit`'s record), the record is a pure function of the Program text, nothing reruns, and `export default program(…)` stays.
- **Against:** it contradicts §3.1 ("a plain number", "reruns the build"); it is the special form §3.1 removes. A handle cannot drive build-time control flow or arithmetic (`$.topN * 2` must throw on `Symbol.toPrimitive`), so a second kind of value has to be taught. Every Dialect has to opt slots in, and its runtime has to substitute handles, which no Dialect runtime in the kit does today.

## Option C: no build-time reads; a lambda's stage is inferred (consult B's stage rule alone)

Keep `$` out of build-time code. A lambda in a structure slot that reads only params (`.limit(() => $.topN)`) has the **param stage**; the kit evaluates it with the reference interpreter at build, and records it as "`topN`: folded per run, read by `top.limit`". `.limit($.topN)` is refused with the fixit to the lambda.

- Smallest change: no Program-shape change, no proxy, no run context, and the one form exists today.
- **Against:** it is not §3.1 (no build-time code reads a param, so "changing it reruns the build" never happens); build-time code still cannot branch on a param; and the one form is the lambda, which two of trial 1's three agents did not reach for.

## Recommendation

**Option A.** It is the only one that is §3.1 as ruled, the only one that lets build-time code use a param as ordinary JS, and it changes no Dialect's slots. Its cost is the Program shape (a function of `$`) and a small run context in kit/define. B and C are each simpler in one place and give up the point of the ruling.

## Forks for Ben (why Phase 2 was not started)

1. **The Program's shape.** A needs each Program to be a function the kit can call again (`($) => program(…)`). The alternatives: keep `export default program(…)` and let `run` re-import the module (a module loader, out of scope until M4); or declare params at the top level, `const $ = params({ … })`, as consult A wrote it (the same rerun problem, and it moves params out of the builder, which every example and the fields Grammar use). This is the shape every Program and every agent brief will be written in, so it is Ben's call. The define-trial's `C001` would flip with it.
2. **What the kit knows about params.** Today a param is only a Dialect slot. A needs the kit to know which slot declares params, where a param's default is (`value`), which name lambdas read them through (`$` as a global in data, the `Uniforms` parameter in fields), and which members are run-time-only (fields' `t`, `aspect`). Either a Grammar key (`params: { slot: "param", runtime: ["t", "aspect"] }`) or a kit-made `param` slot, as the kit makes `helper` and `const` conventions. The second is less to write per Dialect but fixes `ParamShape` for every Dialect.
3. **Whether a param-stage lambda stays legal in a structure slot.** A makes `.limit($.topN)` the one form and refuses `.limit(() => $.topN)`. Consult B's stage inference (synthesis §5: "B, if the trial shows models don't stumble") would keep both, folding the lambda per run. One form is what trial 1 asked for; keeping both is what §5 leans toward. The dogfood run can settle it if both are offered to agents.
4. **Attribution by order.** If "read by `.limit`" must be exact, A needs data-flow tracking, which a plain number cannot carry. The recommendation accepts order-plus-`loc`; Ben may prefer the listing to say only where the read was ("read at line 21").

None of these changes the rest of A. Once they are ruled, Phase 2 is: `run` and the recording proxy in kit/define (a new `params.js`, beside `scope.js`), the record's `reads`, `lower()`'s `params`, `bindingText`, `needsRebuild`, `B014`, the data Grammar's `limit` and example 5, the fields Grammar's run-time members, and the docs (kit/define/README.md, api-draft.md, kit/dialects/data/README.md), then the dogfood run (`vv2`).

> **Ruled 2026-11-24 (Ben):** Option A. A Program file exports a function of `$` (`export default ($) => program(…)…`), which the kit's `run` calls with a recording proxy; the define-trial checker's C001 flips to require that form. The lambda form in a structure slot (`.limit(() => $.topN)`) is refused, with a fix to `.limit($.topN)`: one form. The Grammar names its param slot and the Dialect lists its run-time-only members (fields' `u.t`, `u.aspect`); the kit does not own a `param` construct. The fourth fork (attribution by call order plus line) was not asked; it stands as the doc proposes until a trial says otherwise.
