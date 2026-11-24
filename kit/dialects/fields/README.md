# The fields Dialect

The second Dialect: a small language for per-pixel color, and H2's test of whether the neutral core covers shaders. A fields Program is a `pixel` Runtime Lambda from a position to a color, a few `param`s, and the helpers beside it. Its Runtime Lambdas are lowered to Kernels and never run as plain JavaScript: operators take their meaning from types (D1), so `uv * 2 + vec2(u.t, 0)` is vector arithmetic. Since M3 it is declared through the [Definition API](../../define/README.md): `defineDialect` for what it means, and the builder is the one `defineGrammar` generates (leaf iJtvVE, H4's test).

```js
import { field, lowerField } from "./index.js";

const program = field("ripple")
  .param("k", { value: 4, min: 0, max: 8 })
  .pixel((uv, u) => {
    const d = length(uv - vec2(0.5, 0.5));
    return mix(color(0, 0, 0), color(1, 1, 1), sin(d * u.k * 6.28));
  })
  .build();                                             // a lambda is its source text; a string works too
const { kernel, diagnostics } = lowerField(program);   // kernel is null when anything failed
```

## Files

- `index.js`: what to import: `fields` (the Dialect value), `field`, `lowerField`, `fieldsEnvironment`, `INTRINSICS`, `LIBRARY`, `libraryFor`, the vector types (`VECTORS`, `VEC2` … `COLOR`, `ALIASES`), and `FIELDS_DIALECT` (what the backends and the harness read: `name`, `numberType`, `types`, `intrinsics`, `library`, `targets`). `targets` says what each target accepts and how its output is compared with the interpreter: `js` is `{ kind: "exact" }`, `glsl` is `{ kind: "tolerance", figure: 1e-3 }` (the harness reads the figure from here; see [kit/harness](../../harness/README.md)). Every one of these is read from the Dialect value; `FIELDS_DIALECT.targets` writes what a target accepts in the GLSL backend's shape (`{ domains: ["pixel"] }`, where the Dialect value has `["pixel"]`).
- `dialect.js`: the `defineDialect` call: the types (`vec3` and `color` have one shape and are different types; `color` reads `r`, `g`, `b` as aliases), the pixel space, the uniforms, the targets, the pixel convention, and the `environment` hook that turns each param into a uniform. `fieldsEnvironment(params)` is `fields.environment({ params })`, the [Environment](../../lower/environment.d.ts) lowering resolves against.
- `intrinsics.js`: each intrinsic as the Definition API declares it: its signature, its JS and GLSL spellings and a reference implementation.
- `library.js`: Library functions written in the Runtime Subset (`pmod`, `vnoise`, `fbm`).
- `calls.js`: `vadd`, `vsub`, `vmul`, `vdiv`, `vscale`, `vneg`, the operators as intrinsics for H3's call style ([the comparison](../../../project/2026-11-23-h3-styles-comparison.md)); `programs/*-calls.js` are the sketches written with them.
- `grammar.js`: the `defineGrammar` call; `field(name)` is the builder it generates. An unknown method throws `B001` at once; every other refusal (`B002` a name taken, a Library name included; `B004` a param of the wrong shape; `B005` no pixel; `B006` two; `B007` a lambda that is not an arrow function or does not parse; `B008` a name the lambda cannot see; `F001` a value outside its range, `F002` a param named `t` or `aspect`, `F003` a param named like a helper or a Library entry) is collected with its call site and thrown by `.build()`. `program.js`: `lowerField`, the grammar's `lower` read back as `{ environment, kernel, diagnostics, helpers, pixel }`.
- `programs/`: the two H3 sketches. `decls.d.ts`: the shapes (`FieldProgram`, `ParamDecl`, `Intrinsic`). `test/golden/hand-built.json`: what the hand-written builder this replaced built, which `test/grammar.test.js` holds the generated one to.

## The language

**Numbers are f32.** The Environment declares `numberType: "f32"`, so a bare literal is an f32: `const h = 0.5` and `let i = 0` are f32 locals, and `u.k * 2` needs no conversion. A literal that meets a typed value takes its type; one past f32's range is L016. There are no f64 values in a Lambda, so no conversions are declared and f32 and f64 cannot meet. There are no integer types: `ihash` (below) takes whole f32s, and a `for` counter is an f32.

**Types and operators.** `vec2(x, y)`, `vec3(…)`, `vec4(…)` and `color(r, g, b)` build vectors, one f32 per component (no splat, no conversion between vector types: write `vec3(c.x, c.y, c.z)`). `.x` `.y` `.z` `.w` read components, and `.r` `.g` `.b` also on a color; no swizzles. Arithmetic is componentwise on two of one vector type; a scalar may multiply a vector either way and divide it, nothing else mixes (`uv + 1` is L003 with the tip `uv + vec2(1, 1)`). Vectors are not compared, ordered or used as a condition. Every error names both types and writes the fix. A component of a `let` vector may be assigned (`p.x = 1`; the IR rebuilds the vector).

**The pixel.** `(uv, u) => color`. `uv` is a `vec2`, `u` the uniforms: each `param` as `u.name` (a number is an f32, `{ value, options }` an enum, `{ value: true }` a bool), plus `u.t` (seconds) and `u.aspect` (width over height). Params are uniforms: loads of read-only places, constant across a frame and free to change between frames. A pixel has no state and no effect except calls to its own helpers.

**Intrinsics** are called by bare name, typed by signature: `floor` `fract` `abs` `min` `max` `clamp` `mix` over an f32 or any vector (applied per component); `sin` `cos` `sqrt` `pow` `atan2` `smoothstep` on f32; `length` on a vector; `ihash(ix, iy, seed) -> f32`. `Math` is not here: the builder refuses it when the Program is built (`B008`; a Program lowered without the builder gets L001). Each has a JS and a GLSL spelling and a reference implementation (`INTRINSICS`). `ihash` is the integer hash of the Uncommon Math book's `domain-warp`, an intrinsic because the core has no integer value type (the 2026-11-23 ruling): its JS spelling is the book's code and its GLSL spelling `uint` arithmetic. Today a test compares the JS spelling with the reference implementation and with the book's code, which is not an independent check of the hash (the reference was written from the same source). The harness runs the GLSL spelling on the GPU against the reference (`node scripts/shader-diff/cli.js check`), and a planted change to the hash constant is caught (`glsl-hash-constant`).

**The Library** is intrinsics written in the Runtime Subset. A Program gets the ones it names, lowered like its own helpers, so they reach every target with no spelling: `pmod(x, n)`, `vnoise(p, s)` and `fbm(p, s)` (five octaves, the book's constants, baked as constants `OCTAVE_COS` and `OCTAVE_SIN`). Their parameter types come from call sites.

## Limits

- **A Library name is reserved.** `field(…).fn("vnoise", …)` or `.const("OCTAVE_COS", …)` is refused (`B002`, thrown by `.build()`), naming the Library: a second definition would also replace the Library's own inside `fbm`. `lowerField` refuses a hand-built Program that does the same.
- **A param with a `max` of at most 2^24 - 1 can bound a loop** (`for (let i = 0; i < u.n; i++)`); a param with no `max`, or a larger one (the f32 counter sticks at 2^24), a default outside its min..max (refused, F001), and the built-ins `u.t` and `u.aspect` are L007, since the f32 counter would stop changing and the loop never end. The value is trusted to stay within its declared `max`. A constant bound past 2^24 - 1 is L007.
- **A constant calls nothing.** `.const("K", "g(1)")` with a helper `g` is L004: the convention the Definition API generates for a constant forbids every effect, a helper call included (the hand-written Dialect allowed it until M3). `cos(0.5)` and other intrinsics are fine.
- **GLSL leaves some calls undefined that JavaScript defines.** `pow(x, y)` with a negative `x`, `smoothstep(e0, e1, x)` with `e0 >= e1`, and `atan(0, 0)` are undefined in GLSL (a driver may return anything); the JS spelling returns NaN, a step and 0 respectively. A sketch that depends on them differs between targets.

## The two sketches

`programs/uv-remaps.js` (`swirl`, `bulge`: the book's `13-filters/uv-remaps`, in its 150-pixel panel, with the lens center as params) and `programs/domain-warp.js` (`04-noise/domain-warp`, all three palettes). `test/sketches.test.js` lowers both and verifies every Kernel, helpers included, without `partial`. Port notes: the book's array returns and destructuring become vector values; its palette tables become branches; its pixel inputs become `uv` (y up) and `u.aspect`.

## What this Dialect found in the core

Recorded for H2; the full list of changes to M1 code is in job gmyAFW's notes. A helper call is a `call helper` effect, so "a pixel is pure" means "no effect but calls to helpers". Typing generic intrinsics needed one new idea in a signature (`numeric` on a type variable). The default number type is an Environment field, not a lowering constant.
