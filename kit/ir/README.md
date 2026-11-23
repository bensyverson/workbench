# kit/ir: the core IR

The typed IR that runtime lambdas lower to and backends read (proposal §5). No dependencies and no Node built-ins, so it runs in the page.

```js
import { printKernel, formatJSON, showType, assignable } from "./kit/ir/index.js";

formatJSON(kernel);   // the diffable JSON form: standard JSON, short nodes on one line
printKernel(kernel);  // a listing for people: one statement per line, effects as comments
```

- **A kernel** ([`ir.d.ts`](ir.d.ts)) is a function plus its domain (`entity Mole`, `tick`, `render`): parameters, locals, a body of statements, the effects the body has, and the lambda's source.
- **Every node has a `span`**, `[start, end]` offsets into the kernel's `src`, the parser's `range`. Every expression has a type `t`; every statement has `effects` (`read Mole.ttl`, `write World.next`, `rng`, `emit whack`, …), and the kernel sums them.
- **Types:** `f64`, `bool`, `str`, `null`, `void`, enums of strings, entity references, optionals, lists with a maximum length, structs, unions, and dialect handles (`{ obj: "World" }`). Numbers are always `f64`; a sized integer is a store rule on a place. Why, and how it matches the DMG runtime: [the M1 plan](../../project/2026-11-23-m1-game-slice-plan.md), "Integer semantics in the IR".
- **Evaluation is left to right**; `cond`, `and` and `or` are lazy. Statements that cannot sit inside an expression (stores, a query's loop) come before it, so the IR is never ambiguous about order.
- **Loops are bounded:** `for` names its bound (`param burst`, `const 4`), and `each` runs over a list of at most `max` items.

The listing of preset 04's `Mole.onFrame`:

```
kernel Mole.onFrame#0(self: Mole) -> void  ; entity Mole
  ; effects: read Mole.up, read Mole.ttl, write Mole.ttl, write Mole.up
  if self.up {                             ; read Mole.up
    let t0: f64 = sub(self.ttl, 1)         ; read Mole.ttl
    store.u16 self.ttl, t0                 ; write Mole.ttl
    if eq(t0, 0) {
      store.bool self.up, false            ; write Mole.up
    }
  }
```

Goldens for it and the spawn timer are in [`scripts/dmg-lower/test/golden/`](../../scripts/dmg-lower/test/golden/).
