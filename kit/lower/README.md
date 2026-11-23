# kit/lower: from syntax tree to IR

Lowers a runtime lambda, parsed by [kit/parse](../parse/README.md), to an [IR](../ir/README.md) kernel. Every identifier and member is resolved, and every expression typed, against a **dialect description**; whatever cannot be lowered comes back as a coded diagnostic with a one-line `tip`. No Node built-ins.

```js
import { lowerLambda, lowerProgram } from "./kit/lower/index.js";
import { dmgDialect } from "./kit/dialects/dmg/index.js";

const dialect = dmgDialect(declarations);              // what one program declares
const r = lowerLambda(dialect, src, { id: "Mole.onFrame#0", kind: "onFrame", on: "Mole" });
// r.ok, r.kernel (null on any error), r.diagnostics (parser, subset and lowering, in source order)

const { results, sigs } = lowerProgram(dialect, lambdas); // a whole program: infers payloads and method signatures
```

- **The dialect** ([`dialect.d.ts`](dialect.d.ts)) names the objects a lambda can reach (entity kinds, the world, input, …) with their members' types, store rules and effects; the list operations that take callbacks; the free globals (`Math`); and each slot's calling convention, domain, and the effects it forbids. A dialect is data plus one `slot()` lookup.
- **The DMG dialect** ([`../dialects/dmg/`](../dialects/dmg/index.js)) is built from a program's declarations ([`decls.d.ts`](../dialects/dmg/decls.d.ts)): attributes with their types, baked constants, methods, params, pools, the board, aliases and sounds. `scripts/dmg-oracle/declarations.js` reads them from a built spec. It describes `self`, `w` (`frame`, `param`, `rand`, `rng`, `board`, `pool`, `spawn`, `emit`, `sfx`, `toast`, `input`, `grid`, `all`, `one`, `log`, `end`, `overlap`), the HUD's `at(c, r).text(fmt, …)` and `Math`. `w.bg` is not described yet.
- **Whole-program inference.** DMG events and methods are untyped, so `lowerProgram` takes an event's payload type from its emit sites, a method's parameter types from its call sites, and its result and effects from its body, repeating until nothing changes. A method call's effects include the callee's.
- **Queries** (`filter`, `find`, `some`, `every`, `reduce`) take a callback with an expression body, which lowering inlines as an `each` loop over the list. The callback may read the enclosing lambda's locals and must be pure.
- **Narrowing.** A possibly-empty reference (`w.rng.pick(…)`, `w.spawn(…)`) must be checked before use: `if (m) …`, `if (!m) return;`, `m && m.up`. Only `const` locals narrow.
- **Not lowered yet** (L012): destructuring, `for…of`, array literals, `??` and logical assignment, `let` without a value, list indexing. String methods are unknown members (L002).

## Codes

| Code | Meaning |
|---|---|
| L001 | A free identifier the dialect does not declare, such as a top-level helper of the preset |
| L002 | An unknown member, with a suggestion |
| L003 | A type mismatch |
| L004 | An effect the slot forbids, such as a write in `draw` or `hud` |
| L005 | A callback that is not the argument of a declared query |
| L006 | A query callback with an effect |
| L007 | A loop whose bound is not a constant, a param or a list's length, or whose counter the body changes |
| L008 | A possibly-empty value used without a check |
| L009 | A dynamic property name (`self[k]`) |
| L010 | More parameters than the slot passes |
| L011 | A name argument (param, pool, sound, event) that is not a literal, or names nothing declared |
| L012 | A subset construct lowering does not handle yet |
| L013 | A store to a read-only place: a baked constant, a built-in, a `const` |
| L014 | A signature lowering cannot infer (no call site, no emit site), or emit sites that disagree |
| L015 | The wrong number of arguments |

Each has a test that reads its tip, in [`test/diagnostics.test.js`](test/diagnostics.test.js).
