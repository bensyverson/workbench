# Writing a field: a per-pixel color

A **field** is a small program that gives every pixel of an image a color. You write one as a JavaScript module that builds it with `field(...)`, and a checking tool tells you whether it is valid and what colors it makes.

## A complete example

`call-example.js` (this folder) is a whole sketch. Yours has the same shape.

```js
import { field } from "fields";

// Diagonal stripes over the unit square: `count` stripes, tilted by `angle`, with soft edges.
export default field("stripes")
  .param("count", { value: 8, min: 1, max: 30, step: 1 })
  .param("angle", { value: 0.6, min: 0, max: 3.14, step: 0.05 })
  .param("softness", { value: 0.1, min: 0.01, max: 0.5, step: 0.01 })
  .fn("rotate", `(p, a) => vec2(p.x * cos(a) - p.y * sin(a), p.x * sin(a) + p.y * cos(a))`)
  .pixel(`(uv, u) => {
  const p = rotate(vsub(uv, vec2(0.5, 0.5)), u.angle);
  const band = smoothstep(0.5 - u.softness, 0.5 + u.softness, fract(p.x * u.count));
  return mix(color(0.1, 0.1, 0.3), color(0.9, 0.8, 0.4), band);
}`)
  .build();
```

The file must `import { field } from "fields";` and `export default` the built field. The code that makes the colors is **a string** (a template literal) inside `.pixel(...)` and `.fn(...)`: it is compiled to a shader, not run by Node, so only the language below is available there.

## The builder

- `field("name")` starts one.
- `.param(name, decl)`: a number you can tune, read in code as `u.name`. `decl` is `{ value, min, max, step }` for a number, `{ value: "a", options: ["a", "b"] }` for a choice (compare it with `===`: `u.mode === "a"`), or `{ value: true }` for a toggle. Declare a handful of params (about three to six).
- `.fn(name, "(a, b) => ...")`: a helper function, callable by name from `.pixel` and from other helpers. Its parameter types come from how it is called. No recursion.
- `.const(name, "expression")`: a named constant (for example `.const("TAU", "6.2831853")`), usable like a variable in any lambda. It cannot be assigned to.
- `.pixel("(uv, u) => { ... return color(r, g, b); }")`: required. It runs once for every pixel and returns that pixel's color.
- `.build()` ends the chain.

## Inside the pixel

- `uv` is the pixel's position, a `vec2` in the unit square: `uv.x` goes 0 to 1 left to right, `uv.y` goes 0 to 1 **bottom to top**. `(0.5, 0.5)` is the center.
- `u` holds the params as `u.name`, plus `u.t` (seconds, animation time) and `u.aspect` (image width divided by height).
- The pixel has no memory and does nothing but compute: no printing, no state.
- Statements: `const`, `let`, assignment (`=`, `+=`, ...), `if` / `else`, `for (let i = 0; i < 5; i++)` (the bound must be a constant or a param, counting up by one), `return`, and `a ? b : c`. Comparisons `< <= > >= === !==`, `&&`, `||`, `!` on numbers. Scalar `%` and `**` work.

## Numbers and vectors

Every number is a 32-bit float: write `0.5`, `2`, `u.k * 2`. Numbers use the usual operators `+ - * /`. There are no integers, strings or arrays here, and no `Math`: write constants out (pi is `3.14159265`).

**Vector types** are built by calling their name with one number per component, no shortcuts:
- `vec2(x, y)`, `vec3(x, y, z)`, `vec4(x, y, z, w)`, and `color(r, g, b)` (a color has three components but is its own type: it does not mix with `vec3`).
- Read components with `.x .y .z .w` (and `.r .g .b` on a color). There are no swizzles (`v.xy`).
- A component of a `let` vector can be assigned: `p.x = 1`.
- The pixel must return a `color`.

**Vector arithmetic is written with functions.** In this style no operator is applied to a vector; use these calls instead (`T` is a vector of one type; the number is a plain number):

| Call | Meaning |
|---|---|
| `vadd(a, b)` | a + b, component by component; a and b are the same vector type |
| `vsub(a, b)` | a - b, component by component |
| `vmul(a, b)` | a * b, component by component |
| `vdiv(a, b)` | a / b, component by component |
| `vscale(v, s)` | every component of v times the number s |
| `vneg(v)` | -v |

Nothing else mixes: a vector and a number cannot be added, and two different vector types cannot be combined. Vectors are not compared (`===`, `<`) and cannot be tested as a condition: compare their components.

Example: `vadd(vscale(uv, 2.0), vec2(u.t, 0))` is the vector `(2 * uv.x + t, 2 * uv.y)`.

## Built-in functions

Called by bare name. "T" means a number or any vector, applied to each component.

| Function | Meaning |
|---|---|
| `floor(x)`, `fract(x)`, `abs(x)` | T to T |
| `min(a, b)`, `max(a, b)` | T, T to T |
| `clamp(x, lo, hi)` | T, number, number to T |
| `mix(a, b, t)` | a + (b - a) * t; T, T, number to T |
| `sin(x)`, `cos(x)`, `sqrt(x)` | numbers |
| `pow(x, y)` | numbers (x must not be negative) |
| `atan2(y, x)` | angle in radians, numbers |
| `smoothstep(e0, e1, x)` | 0 below e0, 1 above e1, smooth between; numbers (e0 < e1) |
| `length(v)` | length of a vector, to a number |
| `ihash(ix, iy, seed)` | a hash of three whole numbers to a number in [0, 1) |
| `pmod(x, n)` | x modulo n that is never negative; numbers |
| `vnoise(p, seed)`, `fbm(p, seed)` | smooth noise at a `vec2` position, in [0, 1]; `seed` is a whole number |
| `vadd`, `vsub`, `vmul`, `vdiv`, `vscale`, `vneg` | vector arithmetic, above |

There is no `dot`, `normalize`, `cross`, `step`, `mod`, `tan`, `exp`, `log` or `PI`; build what you need from the above.

## Checking your sketch

From the repository root:

```
node scripts/h3-trial/check.js call path/to/your-sketch.js
```

It prints every problem (a code, what is wrong, the line, and usually a suggested fix), or, when the sketch is valid, the color it produces at six sample pixels with every param at its default. It also notes any operator you applied to a vector. Fix what it reports and run it again until it is valid and the colors are what you intend.
