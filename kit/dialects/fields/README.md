# The fields Dialect

The second Dialect: a small language for per-pixel color, and H2's test of whether the neutral core covers shaders. A fields Program is a `pixel` Runtime Lambda from a position to a color, a few `param`s, and the helpers beside it. Its Runtime Lambdas are lowered to Kernels and never run as plain JavaScript: operators take their meaning from types (D1), so `uv * 2 + vec2(u.t, 0)` is vector arithmetic.

```js
import { field, lowerField } from "./index.js";

const program = field("ripple")
  .param("k", { value: 4, min: 0, max: 8 })
  .pixel(`(uv, u) => {
    const d = length(uv - vec2(0.5, 0.5));
    return mix(color(0, 0, 0), color(1, 1, 1), sin(d * u.k * 6.28));
  }`)
  .build();
const { kernel, diagnostics } = lowerField(program);   // kernel is null when anything failed
```

## Files

- `index.js`: what to import: `field`, `lowerField`, `fieldsEnvironment`, `INTRINSICS`, `LIBRARY`, the types, and `FIELDS_DIALECT` (the Dialect as data: `numberType`, types, domains, intrinsics, library, targets).
- `types.js`: `vec2`, `vec3`, `vec4`, `color` and the color aliases. `vec3` and `color` have one shape and are different types.
- `environment.js`: `fieldsEnvironment(params)`, the [Environment](../../lower/environment.d.ts) lowering resolves against.
- `intrinsics.js`: each intrinsic's signature, its JS and GLSL spellings and a reference implementation.
- `library.js`: Library functions written in the Runtime Subset (`pmod`, `vnoise`, `fbm`).
- `grammar.js`: the `field(name)` builder (hand-written; the generic `.construct()` is M3's). `program.js`: `lowerField`.
- `programs/`: the two H3 sketches. `decls.d.ts`: the shapes (`FieldProgram`, `ParamDecl`, `Intrinsic`).

## The language

**Numbers are f32.** The Environment declares `numberType: "f32"`, so a bare literal is an f32: `const h = 0.5` and `let i = 0` are f32 locals, and `u.k * 2` needs no conversion. A literal that meets a typed value takes its type; one past f32's range is L016. There are no f64 values in a Lambda, so no conversions are declared and f32 and f64 cannot meet. There are no integer types: `ihash` (below) takes whole f32s, and a `for` counter is an f32.

**Types and operators.** `vec2(x, y)`, `vec3(…)`, `vec4(…)` and `color(r, g, b)` build vectors, one f32 per component (no splat, no conversion between vector types: write `vec3(c.x, c.y, c.z)`). `.x` `.y` `.z` `.w` read components, and `.r` `.g` `.b` also on a color; no swizzles. Arithmetic is componentwise on two of one vector type; a scalar may multiply a vector either way and divide it, nothing else mixes (`uv + 1` is L003 with the tip `uv + vec2(1, 1)`). Vectors are not compared, ordered or used as a condition. Every error names both types and writes the fix. A component of a `let` vector may be assigned (`p.x = 1`; the IR rebuilds the vector).

**The pixel.** `(uv, u) => color`. `uv` is a `vec2`, `u` the uniforms: each `param` as `u.name` (a number is an f32, `{ value, options }` an enum, `{ value: true }` a bool), plus `u.t` (seconds) and `u.aspect` (width over height). Params are uniforms: loads of read-only places, constant across a frame and free to change between frames. A pixel has no state and no effect except calls to its own helpers.

**Intrinsics** are called by bare name, typed by signature: `floor` `fract` `abs` `min` `max` `clamp` `mix` over an f32 or any vector (applied per component); `sin` `cos` `sqrt` `pow` `atan2` `smoothstep` on f32; `length` on a vector; `ihash(ix, iy, seed) -> f32`. `Math` is not here (L001). Each has a JS and a GLSL spelling and a reference implementation (`INTRINSICS`). `ihash` is the integer hash of the Uncommon Math book's `domain-warp`, an intrinsic because the core has no integer value type (the 2026-11-23 ruling): its JS spelling is the book's code, its GLSL spelling `uint` arithmetic, and a test compares both with the reference and with the book itself.

**The Library** is intrinsics written in the Runtime Subset. A Program gets the ones it names, lowered like its own helpers, so they reach every target with no spelling: `pmod(x, n)`, `vnoise(p, s)` and `fbm(p, s)` (five octaves, the book's constants, baked as constants `OCTAVE_COS` and `OCTAVE_SIN`). Their parameter types come from call sites.

## The two sketches

`programs/uv-remaps.js` (`swirl`, `bulge`: the book's `13-filters/uv-remaps`, in its 150-pixel panel, with the lens center as params) and `programs/domain-warp.js` (`04-noise/domain-warp`, all three palettes). `test/sketches.test.js` lowers both and verifies every Kernel, helpers included, without `partial`. Port notes: the book's array returns and destructuring become vector values; its palette tables become branches; its pixel inputs become `uv` (y up) and `u.aspect`.

## What this Dialect found in the core

Recorded for H2; the full list of changes to M1 code is in job gmyAFW's notes. A helper call is a `call helper` effect, so "a pixel is pure" means "no effect but calls to helpers". Typing generic intrinsics needed one new idea in a signature (`numeric` on a type variable). The default number type is an Environment field, not a lowering constant.
