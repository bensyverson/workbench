# kit/emit/js: the JavaScript backend

Turns an [IR](../../ir/README.md) kernel into the source of a plain JS function whose parameters are the lambda's own, so it drops into the slot the lambda filled: `(self, w)`, `(w, e)`, `(w, at)`. No Node built-ins.

```js
import { emitKernel, instantiate } from "./kit/emit/js/index.js";

const e = emitKernel(kernel);  // { name, params, source, lines }
const fn = instantiate(e);     // a callable function, via the Function constructor
e.lines[i];                    // { span, start }: the source span line i + 1 came from

// A program's top-level helpers are separate kernels; make them callable and hand them to each caller:
const scope = emitHelpers(helperKernels.map(emitKernel));   // { name: fn }, able to call one another
const caller = instantiate(emitKernel(k), scope);            // the helpers are in scope by name
```

- **Numbers** are JS doubles, as the IR's `f64`. **A store is a plain assignment**: the DMG host's entity and world proxies apply each attribute's coercion and log its warnings, which the oracle trace compares, so the backend does not coerce a second time. Why the IR keeps the rule on the store: [the M1 plan](../../../project/2026-11-23-m1-game-slice-plan.md), "Integer semantics in the IR".
- **f32 and vectors are refused**, not emitted: an op on an `f32` or a vector, or a `vec` node, throws (`cannot emit vec2 values yet`). JavaScript's `+` would compute them in doubles, or on objects, and give a wrong value with no error. Their emission is job ZDCBUt.
- **`array`** emits an array literal, `[a, b]`.
- **`index`** emits `list[i]` (undefined out of range, as the IR says) and a **`helper`** call emits `name(args)`.
- **No closures at run time.** Query callbacks were inlined by lowering; they come out as `for…of` loops over the list.
- **Every compound expression is parenthesized**, so precedence is never at risk; a statement's own expression drops its outer pair.
- **The line map** has one entry per emitted line. Statement lines point at their statement's span; the function's first and last lines point at the whole lambda.

`scripts/dmg-lower/test/emit-oracle.test.js` swaps each emitted lambda of presets 04–07 into the DMG runtime and compares a seeded run with the original's.
