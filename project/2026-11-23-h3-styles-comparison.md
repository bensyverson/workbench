# H3, part A: the two survey sketches in two styles

H3 asks whether typed operators make shader code pleasant without confusing authors. This note is the first half of the check: the two survey sketches (`13-filters/uv-remaps`, as `swirl` and `bulge`, and `04-noise/domain-warp`) written once with typed operators (D1) and once in a "call style" where no operator touches a vector. The second half, a fresh-agent trial, is built in [scripts/h3-trial](../scripts/h3-trial/README.md) and recorded elsewhere.

## What the call style is

Six intrinsics in [kit/dialects/fields/calls.js](../kit/dialects/fields/calls.js): `vadd`, `vsub`, `vmul`, `vdiv` (componentwise on two values of one type), `vscale(v, s)` and `vneg(v)`. Each is the operator it names (same JS and GLSL spelling, rounded to f32 as the operator is), so the two styles lower to Kernels that differ only in a `call` where the other has an `op`. Scalars keep their operators in both styles; the style is about vectors only. The Library (`pmod`, `vnoise`, `fbm`) is written once, with operators, and both styles call it.

## Agreement

[kit/dialects/fields/test/calls.test.js](../kit/dialects/fields/test/calls.test.js) lowers all three Programs in both styles, verifies every Kernel (helpers included), then runs the reference interpreter over the harness's recorded grids and param sets (`standardCases(0.2)`: swirl and bulge at 30 by 30 over three param sets each, domain-warp at 26 by 18 over nine) and asserts `Object.is` on every f32 component between the two styles. The call style's emitted JS is also held bit-for-bit to its own interpreter run. Command: `node --test kit/dialects/fields/test/calls.test.js`. Result: all identical. The test was written after the code; to see it fail I removed the registration (`...CALLS` in `intrinsics.js`) and all three tests failed, then restored it.

GLSL was not run for the call style (it needs `sleepy`, see [scripts/shader-diff](../scripts/shader-diff/README.md)); its spelling is `($0 + $1)` and so on, the same text the operators emit.

## Length

`node scripts/h3-styles/measure.js` (add `--json` for the raw numbers). It counts the Program's own Lambdas (the pixel lambda and its helpers; not the Library), whitespace-collapsed characters, JS tokens by a small regex, and the deepest parenthesis nesting.

| sketch | lines | chars (typed / calls) | tokens (typed / calls) | longest line | deepest parens |
|---|---|---|---|---|---|
| swirl | 23 / 23 | 643 / 665 (+3%) | 274 / 286 (+4%) | 107 / 107 | 3 / 4 |
| bulge | 20 / 20 | 592 / 621 (+5%) | 244 / 259 (+6%) | 107 / 107 | 3 / 4 |
| domain-warp | 40 / 40 | 1235 / 1303 (+6%) | 552 / 588 (+7%) | 108 / 142 | 3 / 5 |

The call style is 3 to 7 percent longer in characters and tokens, never longer in lines, because the sketches use vector arithmetic in a few places and everything else is scalar math or intrinsics. The longest line of `domain-warp` grows by a third, and its nesting by two parentheses.

## Side by side

`swirl`, the remap's first lines (the grid helper differs in one expression, `length(q - vec2(75, 75))` against `length(vsub(q, vec2(75, 75)))`):

```js
// typed                                   // calls
let d = uv * 150 - c;                      let d = vsub(vscale(uv, 150), c);
...                                        ...
return grid(d + c);                        return grid(vadd(d, c));
```

`bulge`: `d = d * k;` against `d = vscale(d, k);`.

`domain-warp`, the deepest expression (level 2's `r`):

```js
// typed
r = vec2(fbm(p + k * q + vec2(1.7 + 0.15 * u.t, 9.2), s), fbm(p + k * q + vec2(8.3, 2.8 + 0.126 * u.t), s));
f = fbm(p + k * r, s);

// calls
r = vec2(fbm(vadd(vadd(p, vscale(q, k)), vec2(1.7 + 0.15 * u.t, 9.2)), s), fbm(vadd(vadd(p, vscale(q, k)), vec2(8.3, 2.8 + 0.126 * u.t)), s));
f = fbm(vadd(p, vscale(r, k)), s);
```

## Readability

My reading, which the trial may overturn.

- The typed style reads as the book's own math: `p + k * q` is Quilez's `f(p + k*r)` line for line. The call style has to be read inside out: `vadd(vadd(p, vscale(q, k)), vec2(...))` makes the reader find the innermost call to learn what is being scaled, and the sum's associativity is spelled by nesting rather than seen.
- The call style is unambiguous about types: `vscale` versus `vmul` names the difference between a number and a vector multiplier, where `k * q` and `q * q` look the same and mean different things (both are legal typed). That is the only place the calls say something the operators leave to the types.
- In the call style it is not obvious which operations are scalar: `d.x * co - d.y * s` keeps operators (scalars), `vsub(vscale(uv, 150), c)` does not. A reader has to know the split, and an author who writes `vadd(p, k)` for a number `k` gets an L003 about a number where a vector is expected, as `p + k` does in the typed style. An operator on vectors in the call style is not an error at all (the typed operators stay on in the Dialect), so the call style's rule is a convention the trial tool has to enforce; it is not something the Dialect checks.
- Neither style removes a typed-world error class: `uv + 1`, `vec3` against `color`, and comparing vectors are all errors in both.
- Cost measured here is small (+3 to +7 percent). The readability cost is concentrated in expressions with three or more vector operations; the survey's own sketches have few, which is also why the cost is small. A sketch with a vector loop body (a raymarcher, a gradient step) would widen the gap.

## What this does not say

Whether authors or models trip over the typed style is the trial's question, not this note's: two sketches written by the kit's authors, in a style they designed, say nothing about confusion. See [scripts/h3-trial](../scripts/h3-trial/README.md).

## Changes to existing files

`kit/dialects/fields/intrinsics.js` imports `CALLS` and spreads it into `INTRINSICS` (two lines), so the six calls are intrinsics of the Dialect like `mix`. Because of that, the test `kit/emit/js/test/wide.test.js` ("every fields intrinsic is tested here") needed an entry per call. Consequences: the typed style's `L001` tip (the list of names a lambda sees) now names `vadd` and the rest, which a typed-style author sees; see the trial README.
