# kit/emit/js: the JavaScript backend

Turns an [IR](../../ir/README.md) kernel into the source of a plain JS function whose parameters are the lambda's own, so it drops into the slot the lambda filled: `(self, w)`, `(w, e)`, `(w, at)`. No Node built-ins.

```js
import { emitKernel, instantiate } from "./kit/emit/js/index.js";

const e = emitKernel(kernel);  // { name, params, source, prelude, lines }; a second argument { intrinsics } spells a Dialect's intrinsics
const fn = instantiate(e);     // a callable function, via the Function constructor
e.lines[i];                    // { span, start }: the source span line i + 1 came from

// A program's top-level helpers are separate kernels; make them callable and hand them to each caller:
const scope = emitHelpers(helperKernels.map(emitKernel));   // { name: fn }, able to call one another
const caller = instantiate(emitKernel(k), scope);            // the helpers are in scope by name
```

- **Numbers** are JS doubles, as the IR's `f64`. **A store is a plain assignment**: the DMG host's entity and world proxies apply each attribute's coercion and log its warnings, which the oracle trace compares, so the backend does not coerce a second time. A `bump` is `recv.name += value;` on the host's object. Why the IR keeps the rule on the store: [the M1 plan](../../../project/2026-11-23-m1-game-slice-plan.md), "Integer semantics in the IR".
- **f32 and vectors** are emitted, and agree bit for bit with the [reference interpreter](../../interp/README.md). An f32 is a double that `Math.fround` has rounded after every operation, so an f32 operation is the double operation rounded once; the emitter rounds the result of each op, call, helper, method, `index`, load and global of an f32 type, and rounds each f32 (or f32-vector) parameter on the way in. A literal, a local and a vector's component are already f32 and are not rounded again. The `f32` op rounds, `f64` widens, and `pow` on f32 is `Math.pow` (never `**`).
- **A vector is a plain JS array of its components**, as in the interpreter. Chosen over scalarized locals (every expression's shape would have to be tracked through `let`, `cond`, helper calls and returns, and a vector crossing a helper boundary has to be a value anyway) and over `Float32Array` (an allocation as costly as an array, and rounding by assignment would hide where rounding happens, so the two backends could not be compared node by node). Vectors are never mutated: a component assignment is a rebuilt `vec`. `.x` is `v[0]`. A vector operator calls a small runtime (`$vadd`, `$vsub`, `$vmul`, `$vdiv`, `$vneg`, `$vpos`, `$fv`, `$cw`) that does the double operation componentwise; the emitter then rounds with `$fv`. The runtime is emitted source, not an import, so a generated file stays self-contained.
- **Preludes.** `Emitted.prelude` lists the source the function needs defined before it (the vector runtime it uses, and each intrinsic's own `prelude`); it is empty for a DMG lambda. `instantiate` and `emitHelpers` put it ahead of the function.
- **Intrinsics.** `emitKernel(k, { intrinsics })` takes a Dialect's intrinsics (the fields Dialect's `INTRINSICS` has the shape: `js.call`, `js.prelude`, `componentwise`); a call whose name is in the table is spelled from its template (`$0`, `$1` for the arguments, each used once unless it is a local or literal). A `componentwise` intrinsic given a vector runs per component through `$cw`, as the interpreter applies its reference; any other gets the vector whole (`length`). A call not in the table is emitted as before.
- **A fields pixel Kernel** emits to `function name(uv, u)`, called per pixel; `u` is the uniforms object and `u.t` a place load. Its Library helpers (`fbm`, `vnoise`, `pmod`, and the Program's own) are separate kernels: `emitHelpers(kernels.map((k) => emitKernel(k, { intrinsics })))` makes them callable and hands them to `instantiate(emitKernel(pixel, { intrinsics }), scope)`. `test/fields-agree.test.js` runs both H3 sketches through the interpreter and the emitted JS over a grid of pixels, asserting identical results.
- **A nominal scalar** (a Dialect's `date`, backed by f64) is emitted as a plain number, with no rounding and no runtime: its compares are JavaScript's operators.
- **`array`** emits an array literal, `[a, b]`.
- **Names the emitted code owns.** An author's local or parameter named `Math`, `Infinity`, `NaN`, beginning with `$` (the vector runtime's names) or called like a Dialect intrinsic (its prelude may define it) is emitted under a fresh name (`Math_1`, `fv`), so `const Math = 3` no longer breaks `Math.fround`; `Emitted.params` has the emitted names. Any other name is as the author wrote it, so DMG output is unchanged. A `pow` whose left operand is a negative literal is parenthesized: `((-2) ** 2)`.
- **`index`** emits `list[i]` (undefined out of range, as the IR says) and a **`helper`** call emits `name(args)`.
- **No closures at run time.** Query callbacks were inlined by lowering; they come out as `for…of` loops over the list.
- **Every compound expression is parenthesized**, so precedence is never at risk; a statement's own expression drops its outer pair.
- **The line map** has one entry per emitted line. Statement lines point at their statement's span; the function's first and last lines point at the whole lambda.

`scripts/dmg-lower/test/emit-oracle.test.js` swaps each emitted lambda of presets 04–07 into the DMG runtime and compares a seeded run with the original's.
