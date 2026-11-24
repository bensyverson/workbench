# kit/query: read-only queries over Kernels

Questions asked of [IR](../ir/README.md) Kernels without changing them: who writes a place, what a region reads, which helpers it reaches, and whether it is pure. No dependencies and no Node built-ins, so it runs in the page. Types are in [`query.d.ts`](query.d.ts).

```js
import { walk, reads, writers, reachableHelpers, impurities, isPure } from "./kit/query/index.js";

reads(kernel, { helpers });          // { loads, calls, helpers }: every load and call, helpers looked through
reads(loop.body, { kernel: k.name }); // the same for a region: a statement list, one statement, one expression
writers(kernels, "Mole.lit");        // [{ place, via: "store" | "call" | "method" | "helper", kernel, span, node }]
reachableHelpers(main, helpers);     // the helper Kernels main reaches, in the order first reached
impurities(main, helpers, allow);    // [{ kernel, effects }]: main, then each reached helper, with what keeps it impure
walk(region, (node) => { … });       // every statement and expression, each before its children, in evaluation order
```

- **A region** is a whole Kernel (its body), a list of statements (a loop's or a branch's body), one statement or one expression. A region that is not a Kernel takes `kernel` in the options, so its sites can name it.
- **`walk`** is the one traversal the queries share. Children are listed per node kind ([`walk.js`](walk.js)), in the order they run: a store's receiver before its value, a `for`'s start and test before its body and the body before its update, a call's receiver before its arguments. It does not enter types or a place's store rule. `isStmt(node)` tells a statement from an expression.
- **`reads`** walks loads, not effects. A load of a read-only place records no effect (the IR's verifier leaves such reads to the Dialect), so a fields pixel's uniforms (`u.k`, a load of `Uniforms.k`) and DMG's `w.board` appear only as loads; each load says whether its place is `state` (has a store rule, so its load is also a `read` effect). Calls are listed with their recorded effects, which is where a read made by an intrinsic shows: DMG's `w.param("pace")` is a call with `read param pace`. A `helper` call whose Kernel is in `helpers` is followed into that body once, when first reached (before the call's arguments), and its sites name the helper as their `kernel`. A **method** is reported as a call and not looked through: no client has needed it, and a method's Kernel is a slot found by owner and name, which a caller would pass the way `helpers` is passed.
- **`writers`** finds, Kernel by Kernel, each `store` to the place and each call whose recorded effects include `write <place>`. A method's or helper's effects include its callee's, so a call that writes through its callee is a site (`via: "method"`), and the store inside the callee is another when that Kernel is in the list. A place is named as an effect names it: `Owner.name` (`World.pos`), or an effect's own target (`bg.scroll`).
- **`impurities`** reads each Kernel's *recorded* effects, which the verifier holds to cover its body (V007, V008), rather than re-deriving them. It drops a `call` of any helper given (that helper is judged by its own entry, so an effectful helper is named) and whatever `allow` admits; an entry with no effects is pure. `isPure` is every entry empty.

## Clients

- **The GLSL backend's capability check** ([`../emit/glsl/capabilities.js`](../emit/glsl/capabilities.js)): `impurities` with an `allow` that admits a `read` effect on a declared uniform object, and `reachableHelpers` for the helpers it hands the LIR. The goldens and tests did not change when it moved here.

**A finding behind that client.** A fields Program's uniform reads are loads of read-only places and record no effect, so the capability check's "reads only declared uniforms" admits nothing in practice: a load of an undeclared uniform object is refused later by the LIR (R005). The check keeps the `read` allowance for a Dialect that records one, and `reads` is the query for the loads themselves.

## Tests

`test/query.test.js` runs every query on DMG Kernels (presets 04 and 14, through `scripts/dmg-lower/pipeline.js`; 14 has the top-level helper `nth`), on fields Kernels (`swirl` and `domain-warp`, whose helpers call other helpers), and on small hand-built Kernels for the cases neither has (a method or intrinsic that writes, a helper given twice or not at all, an effectful helper).

**Extending.** A new IR node kind adds its children to `stmtChildren` or `exprChildren` in `walk.js`; the type checker flags the switch until it does.
