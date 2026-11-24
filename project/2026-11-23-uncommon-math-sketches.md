# The Uncommon Math sketches, and the two for H3

Written 2026-11-23 for the M2 plan's survey leaf ([plan](2026-11-23-m2-shader-slice-plan.md)). H3 is "typed operators make shader code pleasant without confusing authors"; it ports two of the book's fragment sketches both ways. This note lists what the book has, says which sketches fit the Runtime Subset as it stands, and picks two.

Every figure comes from `scripts/um-survey/` ([README](../scripts/um-survey/README.md)) run against `/Users/ben/git/workbench/local/uncommon-math-0.1.0.html`; the command is named where the figure appears. `survey.js` below means `node scripts/um-survey/survey.js`. Counts of "clean" functions are heuristic in the ways the README's Limits section lists.

## What the book is

- **Sketches are JavaScript, not GLSL.** `survey.js` (no flags): 113 sketches in 27 chapters. Each is a CommonJS source string that exports `meta` (title, size, `params`), and either `draw(ctx, env)` or `frag(px, py, env)`, plus optional `setup`. The book's own bench (lines 556-620 of the page, read with `sed -n 556,620p /Users/ben/git/workbench/local/uncommon-math-0.1.0.html`) loads a sketch with `new Function`, builds `env = { w, h, t, frame, dt, params, state, mouse }`, and for a `frag` sketch calls `frag(x + 0.5, y + 0.5, env)` for every pixel and writes the returned `[r, g, b]` (0..1).
- **The sketches have no vector types.** Vectors are scalar pairs and triples passed as separate arguments (`fbm(x, y, s)`) or returned as arrays (`[r, g, b]`). There are no swizzles to find: the typed-operator form of any sketch is something H3 writes, not something the book contains.
- **The real GLSL is in the chapter text.** `survey.js` prints 51 ```` ```glsl ```` listings in chapter bodies. They are excerpts of other projects' shaders (Cobe, Paper, three.js), not sketches; nothing runs them. They are a reference for how a vector version reads (see Risks).
- **The 195 demos carry no code.** Each demo entry holds only metadata (`lib`, `title`, `tagline`, `section`, `fw`, `tags`, `install`, `links`, `license`, `url`, `primary`, `chapters`), from `node -e 'import("./scripts/um-survey/book.js").then(m=>console.log(Object.keys(Object.values(m.loadBook(m.DEFAULT_BOOK).demos)[0]).join(",")))'`. The book's code lives in the 113 sketches.

## How "fragment-style" is judged

A fragment-style sketch evaluates a function once per pixel (or per point) with no memory shared between evaluations. `survey.js` sorts the 113 by `classify` in `scripts/um-survey/analyze.js`:

| kind | what it is | count (`survey.js`) |
|---|---|---|
| frag | exports `frag(px, py, env)`; the book calls it per pixel | 2 |
| pixel-loop | `draw` fills an `ImageData` in its own pixel loop, calling pure helper functions per pixel | 41 |
| canvas | `draw` issues canvas calls (paths, text, rects); no pixel buffer | 70 |

Only the 2 `frag` sketches are per-pixel functions as written. The 41 pixel-loop sketches have a per-pixel kernel, but it is spread across `draw` (camera setup, panel layout, mode switches) and helper functions; porting one means choosing a boundary. The 70 canvas sketches are not fragment-style: they draw geometry (curves, graphs, text, particles) and are listed in the last section only for completeness.

**Subset fit.** For each function, `scripts/um-survey/units.js` rewrites the top-level function as one arrow function and `kit/parse`'s `parseLambda` and `checkSubset` run on it (`survey.js`, last block). Over all 113 sketches: 548 candidate functions (every top-level function except `draw`, `setup` and `meta`), 379 clean. The rest, by code: S111 closure 93, S102 `new` 51, S109 spread 21, S101 `while` 17, S114 default value 11, S104 template literal 9, P004 unsupported syntax 8 (function expressions, `switch`), S112 `for` without condition 5, S108 comma 1. In the rows I read, the S102 and S109 hits sit in `setup` and frame-stepping code (typed arrays, `[...a]`), not in per-pixel kernels. A `clean` function parses and passes the subset's syntax checks; free identifiers (helpers called, `Math`), types and loop bounds are lowering's job, so "clean" is necessary, not sufficient.

## The two `frag` sketches

Both are `04-noise`, chapter 4 "Noise and procedural fields". `survey.js --kind frag --detail`.

**`04-noise/domain-warp`** (Domain-warped marble). Draws a 440×300 noise field, `f(p + k·fbm(p + k·fbm(p)))`, coloured through a three-colour ramp or Perlin's marble stripe.
- Inputs: `px, py` (pixel centre, y down), `w`, `h`, `t`, params `k` (4), `levels` (2), `scale` (3), `palette` ('fog', 'grey' or 'marble'), `seed` (1). No state, no texture.
- Functions: `ihash`, `vnoise`, `fbm`, `mix3`, `cl`, `frag`; 6 of 6 clean.
- Operations: a hash from `Math.imul`, `^`, `>>>` and a divide by 2^32; value noise with floor, a cubic fade and bilinear mix; `fbm` is a loop `for (i < 5)` (literal bound) that accumulates `a * vnoise(x, y, s)` and rotates and scales the coordinates (`2.02 * (C*x - S*y) + 100`, with `C`, `S` module constants from `Math.cos(0.5)`); `frag` calls `fbm` five times at the default `levels = 2`, adds `t` offsets, branches on `levels` and `palette`, and returns `[r, g, b]` from a vec3 `mix3` ramp with `Math.pow`, `Math.sin`, `Math.abs`, `Math.hypot`, min and max. One lookup `PAL[P.palette]` selects a table of four vec3 constants.
- Subset: all six pass. No closures, no `new`, no `while`.

**`04-noise/worley`** (Worley F1, F2 and borders). Draws cellular noise in five modes.
- Inputs: `px, py`, `w`, `t`, params `mode`, `cells`, `distortion`, `gap`, `seed`. No state, no texture.
- Functions: `hash2`, `frag`; 1 of 2 clean. `frag` fails S111 because it defines `point` as an inner arrow that closes over `ix, iy, fx, fy`.
- Operations: the same integer hash returning a pair; a 3×3 neighbor loop (`for j <= 1`, `for i <= 1`) tracking F1, F2 and the nearest offset in mutable `let` variables, then a 5×5 second pass; `Math.hypot`, `Math.sin`, min, max, floor; array literals of vec2s and a table of five colors.
- Subset: needs `point` inlined or lifted (a mechanical rewrite), and it initializes `r1`/`g1` to `null` and assigns arrays later, which lowering must type as vec2 not nullable.

## The pixel-loop sketches

41 sketches (`survey.js --kind pixel-loop`). "Fit" is clean/total non-hosted functions and the blocking codes. "Ops" names what the per-pixel work uses; `lit` loops have literal bounds, `dyn` bounds come from params or array sizes. State means the sketch keeps data across frames (`setup`, `state`). The Draws column paraphrases the sketch's `about`.

| Sketch | Draws | Inputs (params) | Ops | State | Fit |
|---|---|---|---|---|---|
| 01-spaces/fit-uv | image placed in a canvas by contain/cover, Paper's sizing | 7: fit, aspects, scale, rotation, offsets | vec2 mad, rotation, min/max, `&`, analytic "texture" | none | 2/2 |
| 04-noise/noise-compare | value, Perlin, simplex noise and fBm modes | 5 | hash (imul), fade, lerp; octave loop dyn | none | 7/9, S111 |
| 05-sdf/glyph-distance-transform | exact SDF of a rasterized glyph (two 1D passes) | 4 | parabola envelope loops, `while`, reads a rasterized canvas | buffers per frame | 2/5, S101 S102 S104 |
| 05-sdf/metaballs-three-ways | metaballs by sum, smin, blur-threshold | 4 | exp, smin, blur over an image | none | 3/4, S102 |
| 05-sdf/sdf-playground | round box and circle, min/smin/max/subtract, contour bands | 4 | hypot, abs, smin variants, `switch` | none | 5/6, P004 |
| 05-sdf/sphere-tracer | raymarched smooth-min metaballs, shadow, AO | 4 | vec3 math as scalars, march loop lit 160, shadow loop 48, AO loop 5, tan, pow | module-level arrays and an eval counter | 5/5 |
| 06-diffgeo/curl-advection | particles in gradient vs curl flow | 5 | noise potential, midpoint step | particles | 2/5, S111 S102 |
| 06-diffgeo/displaced-normals | height field with exact and finite-difference normals | 4 | noise, acos, pow | none | 3/5, S111 |
| 07-spheres/dotted-globe | per-pixel port of Cobe's globe shader | 8 | ray-sphere, atan2, asin, inverse Fibonacci lattice, 4-neighbor loop lit | land mask | 6/7, S102 |
| 07-spheres/ortho-globe | per-pixel orthographic globe with land lookup | 5 | ray-sphere, rotation matrix, atan2, mask read | land mask | 4/5, S102 |
| 09-curves/tiny-slug | glyph by per-pixel quadratic root solve vs bitmap | 3 | quadratic roots, sqrt, loop over 20 curves | texture data | 2/2 |
| 10-color/blend-modes | sixteen blend modes | 2 | pow/exp color-space transforms, vec3 | none | 8/10, S109 |
| 10-color/duotone-map | duotone, cosine palette, Oklab ramp over a warped source | 2 | Oklab (cbrt, pow), noise, `while` in ramp | none | 9/11, S101 S104 |
| 10-color/focal-radial | Paper's focal radial gradient with grain | 7 | rotate, hash, value noise, pow, sqrt | grain cache | 6/7, S114 |
| 11-dither/cmyk-screens | four rotated dot screens | 7 | rotation, atan2, hypot | image | 1/3, S111 P004 |
| 11-dither/dither-lab | threshold/Bayer/blue-noise/error diffusion | 4 | Bayer matrix, diffusion loops | matrices | 2/6, S111 S101 S102 S112 |
| 11-dither/palette-dither | ramp dithered to four colors | 4 | Bayer, index | none | 2/3, S101 |
| 13-filters/bloom-chain | threshold, mip chain, tent upsample | 6 | multi-pass texture reads, smoothstep | buffers | 7/9, S102 S114 |
| 13-filters/blur-families | Gaussian, box, Kawase, linear taps | 2 | separable texture passes | buffers | 6/11, S111 S102 S104 |
| 13-filters/glitch-slices | row-hash glitch and layer stack on a test card | 6 | hash, step, hue rotate, time steps | none | 6/8, S111 |
| 13-filters/transition-gallery | six transitions as `mix(A, B, m(uv, p))` | 2 | uv, smoothstep, mix, sin-hash value noise, rotation | none | 9/9 |
| 13-filters/uv-remaps | swirl, bulge, pinch, kaleidoscope as uv to uv maps | 3 | vec2 sub/mul/add, hypot, branch, sin/cos, smoothstep, mix, atan2, mod, floor | none | 4/4 |
| 14-crt/barrel-inverse | barrel distortion and Newton inverse | 3 | polynomial map, Newton loop lit 6 | none | 3/3 |
| 14-crt/phosphor-decay | beam into a decaying feedback buffer | 5 | exp, pow, per-frame simulation | feedback buffer | 0/1, S102 |
| 14-crt/scanline-beam | Gaussian beams, phosphor mask | 6 | exp, pow, mask lookup | cached mean | 3/3 |
| 15-shading/brdf-spheres | Lambert, Blinn-Phong, GGX, Fresnel on a sphere | 5 | vec3, pow, sqrt | none | 4/5, S109 |
| 15-shading/gaussian-splats | 900 projected Gaussians composited | 6 | covariance projection, sort, exp | splats | 2/4, S111 S109 |
| 15-shading/liquid-metal | SDF to height to normal to stripe reflection | 8 | Poisson relax, normals, smoothstep | height buffer | 6/7, S102 |
| 15-shading/stylized-blob | raymarched blob, toon/matcap/normal/rim | 5 | vec3, smin, march loops lit 64/120, pow | none | 7/7 |
| 16-optics/bevel-refraction | Snell refraction through a rounded pane | 6 | asin, tan, sdf, vec2 | none | 4/4 |
| 16-optics/holo-foil | diffraction-grating foil vs CSS gradient | 3 | 3x3 rotation, spectrum, exp | none | 10/11, S109 |
| 16-optics/lens-distortion | Brown-Conrady distortion and fixed-point undistort | 5 | polynomial, iteration lit 8/30 | none | 2/2 |
| 16-optics/radial-godrays | occlusion mask, radial accumulation | 6 | radial march, texture reads | mask buffer | 3/5, S102 |
| 16-optics/thin-film | spectral thin-film interference | 5 | Airy sum, loop lit 780, exp | precomputed table | 12/12 |
| 18-particles/physarum | agents on a trail map | 4 | sense/turn/move, blur | trail map | 2/3, S111 |
| 19-fluids/feedback-map | zoom/rotate/decay feedback | 6 | bilinear sample | feedback buffer | 4/5, S102 |
| 19-fluids/flowmap-warp | pointer-stamped flowmap warps a poster | 5 | smoothstep, uv offset | flowmap | 4/6, S102 S109 |
| 19-fluids/stable-fluids | CPU stable-fluids solver | 7 | Jacobi loops, advection | fields | 6/9, S111 S102 |
| 19-fluids/wave-ripples | wave-equation height field refracts a card | 4 | 4-neighbor stencil | height fields | 3/5, S111 S102 |
| 22-synthesis/bytebeat-tplot | bytebeat formulas plotted | 2 | integer ops, `>>` | none | 0/0 |
| 25-css/truchet-tiles | quarter-circle bands, cells rotated by a seeded pick | 5 | hypot, smoothstep, HSL | cell picks | 1/4, S111 |

`survey.js --sketch <id>` prints the same detail, function by function, for any row. Two groups stand out for H3. Stateless, texture-free kernels with an all-clean fit: `01-spaces/fit-uv`, `13-filters/transition-gallery`, `13-filters/uv-remaps`, `14-crt/barrel-inverse`, `16-optics/bevel-refraction`, `16-optics/lens-distortion`, `16-optics/thin-film` (state is a precomputed table). Stateful buffer sketches (fluids, filters, particles, dither) need pixel reads of earlier results or whole-image passes, which is beyond a per-pixel function and belongs to the fields Dialect's later Iteration Spaces if at all.

## The canvas sketches (not fragment-style)

70 sketches (`survey.js --kind canvas`): geometry and graphs drawn with canvas calls. Chapters 1-3 (projection, PRNG scatter plots, easing, rolling digits), 6 (curve frames), 7 (globe point sets), 8 (Voronoi, Delaunay, polygons), 9 (Bezier, splines), 12 (text-mode), 17 (springs), 18 (particles, boids), 20 (strokes), 21 (typesetting), 22-23 (synthesis, audio analysis), 24 (automata, emulators), 25 (CSS geometry). A few have pure per-point helpers (`04-noise/mesh-gradient`, 6/6 clean, a snoise; `02-randomness/shader-hashes`, 6/6 clean, four hashes drawn over a grid; `10-color/gradient-spaces`, 8/8; `10-color/hue-rotate`, 9/9; `02-randomness/name-avatar`, 12/12), but each draws through canvas calls and none is evaluated per pixel. They are out of scope for H3.

## Recommendation

**Simple: `13-filters/uv-remaps`, restricted to the swirl and bulge maps plus the `grid` image.**
- A uv to uv map is the smallest fragment kernel that is all vector arithmetic: `swirl` is four lines (subtract the center, `hypot`, a branch on the radius, a rotation by `θ = ((R-d)/R)^2 · angle`, add the center back); `bulge` is four more (a radial scale from `mix` of `1` and a smoothstep). Written with typed operators they read as `c + rot(θ) * (p - c)` and `c + (p - c) * k`, which is the case H3 is about.
- No loop, no noise, no state, no texture, no integers. All four functions parse clean (`survey.js --sketch 13-filters/uv-remaps`: 4/4; the `maps` arrows live in an object literal the survey does not open, so I pasted `swirl`, `bulge` and `kaleido` into `parseLambda`/`checkSubset` in a throwaway script, not kept: all three clean; the survey should learn to open object-literal arrows if H3 needs this as a command).
- Plain-JS side: `sub(p, c)`, `mul(rot(θ), …)` calls replace the operators, so the contrast with typed operators is unmistakable and small enough for a fresh agent to port in one prompt.
- Caveat: it is not a `frag`. The per-pixel call is `grid(maps[k](x + 0.5, y + 0.5, c, R, params))` inside `draw`, with panel layout and the lens center chosen from `mouse` and `t`. The port writes a `frag(px, py, env)` wrapper and fixes `c` and `R` as parameters.

**Vectors and a bounded loop: `04-noise/domain-warp`.**
- It is one of two real `frag` sketches, so the book's own bench is the oracle: calling its `frag` from Node over a pixel grid gives reference colors with no harness to write (the DMG oracle's role, for free). `survey.js` shows 6/6 functions clean, the best of any sketch with a loop and noise.
- It exercises vec2 offsets (`p + k * q`), a 2x2 rotation-and-scale per octave, vec3 colors through `mix`, a bounded loop with a literal bound (`for i < 5` in `fbm`), nested calls to `fbm`, branches on uniforms, and `pow`/`sin`/`hypot`. The typed-operator form compresses the scalar `x, y` pairs (`fbm(p + k * q + a2)`), which is where operators help most.
- It is stateless, texture-free, reads `t` only to offset the sample point, and its parameters are all uniforms.
- Why not `04-noise/worley`: its `frag` has a closure (`point`), a 5×5 second pass with mutable nullable vec2 state (`r1`, `g1`) and `<=` loop bounds, so it needs more lowering work for less to say about operators. Why not `05-sdf/sphere-tracer`: the vec3 march is a stronger operator case (`o + d * t`), but its functions use module-level mutable arrays and an evaluation counter, early returns from the loop, and the per-pixel ray setup lives inside `draw`; it is the better third sketch if H3 wants true 3D vectors.

### The one open choice: the hash

`domain-warp`'s `ihash` is integer arithmetic (`Math.imul`, `^`, `>>>`, `| 0`) on 32-bit unsigned values. The fields Dialect must either provide `u32` with wrapping multiply, xor and shift, or the port replaces the hash with a float one (the book's `shader-hashes` sketch says the Hoskins hash uses only `fract` and multiply-add). Replacing it changes the output, so the seeded comparison against the book's own `frag` would no longer be exact. I did not choose; this is a call for the Dialect leaf and Ben.

### What the two sketches need

The union, for the Dialect leaf to implement (not designed here).

**Types**
- `float` (all arithmetic), `vec2` (uv, offsets, centers), `vec3` (colors), a `bool` condition type for the branches.
- A `u32` (or `int`) type with wrapping `*`, `^`, `>>>`, `|` and a conversion to float, if the integer hash stays. `ihash(ix, iy, seed)` takes integers from `Math.floor`, so `int` from float needs a defined conversion.
- `mat2` is optional: both sketches write rotation out as `x * c - y * s`; typed operators would read better with it.
- An environment record: `px, py` (pixel center), `w`, `h`, `t`, and params, with their types fixed: `float` (k, scale, angle, strength), `int` (levels, seed, segments), and an enum for `palette`, which selects between constant tables.
- Constant tables of `vec3` (the palettes) indexed by an enum, and destructuring of a four-element table (`const [B, L, M, H] = PAL[P.palette]`).

**Intrinsics** (scalar unless noted; JS name, then GLSL)
- `floor`, `abs`, `min`, `max`, `pow`, `sin`, `cos`, `hypot` (= `length` of a `vec2`), `mix` (float, `vec2` and `vec3`, written inline as `a + (b - a) * t` in the book), `smoothstep` (written as clamp-then-cubic), `clamp`, `fract` (`x - floor(x)`), a positive modulo (`((x % n) + n) % n`, used by `grid`).
- From `domain-warp` only: `Math.imul`, xor and the shifts (the hash above).
- Add only if the kaleidoscope map is ported: `atan2`.
- Nothing else: no texture reads, no derivatives, no `dot`/`normalize`/`cross`/`reflect`, no matrix constructors beyond the optional `mat2`.

**Language features the lowering must accept** (checked against the subset)
- A loop with literal bounds (`for (let i = 0; i < 5; i++)`), already in the subset.
- Reassigning a parameter (`x = nx` in `fbm`) and `let f;` assigned on both branches of an `if`.
- Array literals of three floats as the return value, array-destructuring assignment `[x, y] = [...]` (swirl), early `return` of a vec3 from several branches.
- Reading `env` through an object pattern in the parameter list (`{ w, h, t, params: P }`): the subset parser accepts it; lowering gives it the typed record above.

## Risks

- **Almost nothing is a fragment function as written.** 2 of 113 sketches are; 41 are pixel loops inside `draw`; 70 draw through canvas calls. The pick of `uv-remaps` as the simple sketch needs a hand-written `frag` wrapper (a few lines) around functions that are already pure. If H3 insists on an unmodified `frag`, the only choices are `domain-warp` and `worley`, which are both noise.
- **The book's code is scalar JS, so the typed-operator form must be written, not extracted.** H3's two ports (typed operators and `add(mul(…))` calls) are both derived by us from the book's scalar source. The comparison is of two rewrites; the book's scalar version is the oracle for both. The risk is that the rewrite, not the notation, drives the findings; a fresh-agent run that ports from the scalar original, as the plan's H3 leaf does, avoids this.
- **The integer hash** (above) decides whether the seeded comparison with the book's output can be exact.
- **The survey is heuristic.** `classify` reads text, not behavior: a `pixel-loop` can be mostly canvas drawing; the texture flag counts the words `sample`, `texel`, `drawImage` and `getImageData`; arrows inside object or array literals and nested closures are not analyzed separately (`uv-remaps`' `maps` and `transition-gallery`'s `T` are the examples I met). The sketches were not run.
- **Book version.** The page is version 0.1.0 and gitignored; line numbers and counts will move if it is replaced. Re-run `survey.js` after any change.
- **Subset fit is syntax only.** `kit/parse` does not check free identifiers or types, so "clean" for `domain-warp` means the six functions are inside the subset's syntax; the mechanical check does not show that they lower.
