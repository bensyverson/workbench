# kit/parse: the subset parser

Parses one runtime lambda from its source text (`String(fn)`), checks it against the runtime subset, and offers fixits. It has no dependencies and no Node built-ins, so it runs in the page.

```js
import { parseLambda, checkSubset, applyEdits } from "./kit/parse/index.js";

const r = parseLambda(String(fn));           // { ok, ast, diagnostics }: never throws on bad input
if (r.ok) {
  const ds = checkSubset(r.ast, src);        // every subset violation, in source order
  const fixed = applyEdits(src, ds.flatMap((d) => d.edits ?? []));
}
```

- **The tree** is an ESTree subset ([`ast.d.ts`](ast.d.ts)). Every node has `loc` (line from 1, column from 0, relative to the lambda) and `range` (offsets).
- **A diagnostic** has `code`, `severity`, `message`, a one-line `tip`, `loc` and `range`. Where the rewrite is mechanical it also has `edits`, which `applyEdits` applies.
- **Parse broadly, check separately.** The parser reads more than the subset allows, so the check can report everything at once. A dialect narrows the subset by passing extra rules to `checkSubset`; it never removes these. The rulings are in [the M1 plan](../../project/2026-11-23-m1-game-slice-plan.md), "Parser rulings".
- **Not checked here:** free identifiers, whether a callback's callee is a declared query, loop bounds, and types. Lowering does those.

## Codes

| Code | Meaning | Fixit |
|---|---|---|
| P001 | Unexpected token or character | |
| P002 | Unterminated string, template or comment | |
| P003 | The source is not exactly one arrow function | |
| P004 | Unsupported syntax: switch, class, function, try, throw, async/await, regex, labels, getters, object methods, for…in, rest elements | |
| P005 | Invalid assignment or update target | |
| S101 | `while` / `do…while`: no checkable bound | |
| S102 | `new` | |
| S103 | `this` | |
| S104 | Template literal | to `+` concatenation |
| S105 | Optional chaining `?.` | |
| S106 | `typeof`, `void`, `delete` | |
| S107 | `in`, `instanceof` | |
| S108 | Comma operator | |
| S109 | Spread `...` | |
| S110 | `var` | to `let` |
| S111 | An arrow that is not a call argument (a closure) | |
| S112 | A `for` loop with no condition | |
| S113 | Computed object key | |
| S114 | Default value in a parameter or pattern | |
| S116 | Loose `==` / `!=` (a warning) | to `===` / `!==` |

`node scripts/parse-corpus.js` runs the parser and check over every DMG runtime lambda.
