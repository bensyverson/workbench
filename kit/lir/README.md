# kit/lir: the first LIR stage

The lower IR the [glossary](../glossary.md) plans for backends with no host to lean on, in its first form: what [GLSL ES 3.00](../emit/glsl/README.md) cannot leave implicit, made explicit. It sits below the [core IR](../ir/README.md) and above target text; the backlog's "IR stages below the core" entry is this stage. A later wasm backend takes the same LIR (it will add the integer-store rules this stage does not need). No Node built-ins.

```js
import { lowerToLir, verifyLir } from "./kit/lir/index.js";

const { program, diagnostics } = lowerToLir(
  { name, main: pixelKernel, helpers: [kernels…], uniforms: { Uniforms: { angle: "f32", … } } },
  { spell: (fn) => ({ call: "sin($0)" }) },   // how the target spells each intrinsic, or null
);
verifyLir(program);   // [] when every invariant below holds; never throws
```

`lowerToLir` returns a verified `LProgram` or `program: null` with diagnostics. It runs [`verifyLir`](verify.js) on what it made, so what a backend reads has kept every invariant; a failure there is a kit bug. Types are in [`lir.d.ts`](lir.d.ts).

## What the LIR is

An `LProgram` is one entry kernel, the helpers it calls (**callee first**, so a target that declares before use can emit them as listed), the uniforms, and the preludes its intrinsics need (each once). Compared with the core IR:

| The core IR | The LIR |
|---|---|
| `f32`, `f64`, vectors named by a Dialect (`vec2`, `color`) | `f32`, `i32`, `bool`, and `vec2`..`vec4` of f32 (a Dialect's `color` is a `vec3`). **No f64.** |
| Reads of a place (`u.angle`) | `uniform` nodes naming the program's uniform (`u_angle`); the entry kernel's uniforms parameter is dropped |
| A declared choice (`u.palette`), compared with `"grey"` | An `i32` uniform holding an index into its `options`; the comparison is of two i32s. Two choices compare only when their options are identical and in the same order (else R002): the indices would be of different lists |
| `call` of a Dialect intrinsic by name | `call` carrying its **spelling** (`clamp($0, $1, $2)`) and a prelude when it needs one |
| `pow`, `truthy` (of an f32) | Written out: `pow(…)`, and `wb_truthy(x)` (`x != 0.0 && !isnan(x)`, so NaN is false as in JavaScript; best effort, since GLSL ES 3.00 leaves NaN to the driver, though it holds on the Apple GPU it was checked on) |
| `rem` (`%`) on f32 | Refused, **R006**: JavaScript's `%` truncates, GLSL's `mod` floors, and `x - y * trunc(x / y)` rounds differently for a non-integer divisor (`31550 % 0.1f` is 0.0995 in JavaScript and 0 there; on a GPU `x % 0.1` was -7e-9, the wrong sign). Use the Library's `pmod(x, n)` (which floors) or `fract` |
| Names as the author wrote them | Legal identifiers: `domain-warp.pixel` is `domain_warp_pixel`, a local `float` is `float_` |
| Statements with `effects`, stores, `each` | Only `let`, `set`, `do`, `if`, `for`, `return`, `break`, `continue` |

**f64 is narrowed explicitly, or the kernel is refused.** The only f64 a lowered kernel may hold is a literal, or a read of a uniform the host supplies as an f64, that an `f32` conversion narrows on the spot. A literal is rounded at lowering (and one outside f32's range is refused); a uniform is declared `f32` with `host: "f64"`, so the host rounds it at upload. Any other f64 (arithmetic, a local, a parameter, a return) is **R001**: its meaning is in its precision, and GLSL has no f64, so narrowing it silently would change what the program computes.

**Conversions.** `conv` goes between `f32` and `i32` (`int(x)` truncates toward zero). Nothing in the fields Dialect needs one (its integers live inside `ihash`'s prelude), so only the verifier's and the emitter's tests exercise it; it is here because the first integer a Program computes needs it. `i32` has comparisons and nothing else: its division would differ from the core's, and nothing asks for more.

## Diagnostics

Lowering's codes (**R**) are the author's: why this kernel cannot be a shader. Each message reads after "Target `glsl` cannot take `<kernel>`:", which the backend adds.

| Code | Meaning |
|---|---|
| R001 | The kernel's meaning depends on f64 precision (above) |
| R002 | A value or statement with no form in the LIR: a string, list, struct, optional, entity, a nominal scalar (an f64 underneath), a store, a loop over a list, a read of state that is not a uniform |
| R003 | An intrinsic the target has no spelling for |
| R004 | A helper that was not given, or that recurses (GLSL has no recursion) |
| R005 | A read of a uniform the program does not declare |
| R006 | An operator whose JavaScript result GLSL cannot reproduce: `%` on f32 |

The verifier's codes (**W**) are kit bugs, in [`verify.js`](verify.js) (`LIR_CODES`): **W001** unknown node or missing field; **W002** type disagreement (operator operands, result, return, assignment, condition); **W003** a type or literal the LIR cannot hold (f64, an f32 not already rounded, an i32 not whole); **W004** a name unbound or bound twice, or a local missing from the kernel's list; **W005** an assignment to a parameter or of another type; **W006** `break` outside a loop, or a loop with no bound; **W007** a helper, uniform or spelling that does not match its use; **W008** a helper declared after its caller, or recursion; **W009** a node without a span inside the kernel's source; **W010** a name that is not a legal identifier (keyword, built-in, `__`, a prefix the emitter owns); **W011** a prelude missing for an intrinsic, or listed and unused.

Every node keeps the core node's `span`, indexing the core kernel's `src`, so a backend's line map points at the author's lambda.

## Files

[`lower.js`](lower.js) (statements, kernels, uniforms, helper order), [`lower-expr.js`](lower-expr.js) (expressions), [`state.js`](state.js) (what one lowering carries), [`verify.js`](verify.js) and [`verify-rules.js`](verify-rules.js) (the verifier and its operator table), [`names.js`](names.js) (identifiers), [`types.js`](types.js).

## Tests

`test/verify.test.js` builds a broken program by hand for each W code (and the operators that must still verify); `test/lower.test.js` lowers hand-built core kernels for each explicit rule and each R code. The two survey sketches lower and verify in [`../emit/glsl/test/sketches.test.js`](../emit/glsl/test/sketches.test.js).
