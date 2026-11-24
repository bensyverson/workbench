# M2 findings draft: the comparison harness

*2026-11-23 · DRAFT, from job vhmS0l (the comparison harness). The M2 findings leaf (SMzv0E) finishes it: this holds only the harness's figures, each with the command that reproduces it. Every number below was produced by `scripts/shader-diff/cli.js` (library: `kit/harness/`), from the worktree of that leaf on 2026-11-23, with `sleepy` outside the sandbox.*

## What was compared, and on what

The fields sketches `swirl`, `bulge` and `domain-warp` (`kit/dialects/fields/programs/`), each lowered once and run through three evaluators: the reference interpreter (`kit/interp`), the emitted JS (`kit/emit/js`) and the emitted GLSL ES 3.00 (`kit/emit/glsl`) read back from a float framebuffer. Pairs: JS against the interpreter, held to identical bits; GLSL against the interpreter, held to a tolerance.

**Renderer.** WebGL through `sleepy` (headless WebKit) reports vendor `Apple Inc.`, renderer `Apple GPU`, `WebGL 2.0`, with `EXT_color_buffer_float`: **a real GPU, not a software renderer.** `node scripts/shader-diff/cli.js renderer` prints it. Neither sleepy nor the page can ask for another renderer, so no software-renderer figure was measured and no second GPU was available: every GLSL figure below is one GPU's. The tolerance proposed is therefore a measurement on one renderer plus headroom, not a bound across renderers.

## The grid and param sets (and why)

`node scripts/shader-diff/cli.js check` (full size; the grid is `standardCases()` in `kit/harness/cases.js`).

| Sketch | Grid | Param sets | Why |
|---|---|---|---|
| `swirl` | 150 x 150 | 3: defaults (angle 2.4, center 75,75); angle -3.3 at (40.5, 99.9); angle 0.01 at (150, 0) | 150 is the book's own panel, so the 10-pixel grid lines and 1.2-pixel stripes land on the book's pixels; the sets cover the default lens, an off-center lens with a negative angle, and a lens on the panel's corner where most pixels are outside it |
| `bulge` | 150 x 150 | 3: defaults (strength 0.85); 0.2 at (60.3, 80.7); 1 at (0, 150) | the same, for the other remap and its `dist > 0` guard |
| `domain-warp` | 132 x 90 (the book's 440:300 aspect, 3x smaller) | 9: palettes fog, grey, marble crossed with levels 0, 1, 2, each with its own `t` (levels x 1.3), `seed` (1 + 7 x levels) and `k` (4 - levels) | every palette and every level is a different branch of the pixel function; the sets vary the uniforms the branches read |

Pixels are sampled at their centers, y up (`uv = ((i + 0.5) / w, (j + 0.5) / h)`), the GLSL backend's own convention. **Grids avoid ties.** At 75 x 75 `swirl` fails: a pixel center `(i + 0.5) * 150 / 75` is an integer and lands exactly on the grid's thresholds, where the GPU and the interpreter fall on different sides of `length(q - (75, 75)) < 20` (pixel (37, 27): reference white 1, GPU gray 0.84, worst difference 0.16, 27 components over, `node scripts/shader-diff/cli.js check --scale 0.5`). That is a discontinuity, not an error margin: no tolerance covers it, so the recorded grids are chosen to have no pixel on a threshold (150: half-integers; the faults' 74: `gcd(75, 74) = 1`). **A sketch with sharp edges can make any tolerance look broken**, which matters to H3's "authors accept this" question and to any later comparison of generated shaders.

## Figures

**JS against the interpreter: identical bits.** `node scripts/shader-diff/cli.js check`: swirl 202,500 components, bulge 202,500, domain-warp 320,760, all identical (`Object.is`, so -0 would differ). The same holds at every smaller grid the fast suite runs (`kit/harness/test/agree.test.js`, scale 0.2).

**GLSL against the interpreter** (`node scripts/shader-diff/cli.js check`, Apple GPU):

| Sketch | Worst difference (per color component) | Where |
|---|---|---|
| `swirl` | 0 (identical) | |
| `bulge` | 0 (identical) | |
| `domain-warp` | **2.19e-4** | marble, levels 2 (set 8), pixel (72, 45), red; the pixel came from `domain-warp.pixel` line 34 (`return mix(c, H, 0.9 * vein)`; emitted JS line 37, shader line 79); per set 1.3e-5 (fog, 0) up to 2.2e-4 |

Both remaps return a constant color per pixel, so the shader and the interpreter agree exactly unless a pixel sits on a threshold. `domain-warp` is smooth and chains five octaves of noise twice, so f32 differences in the GPU's `sin`, `cos` and arithmetic grow: the per-set worst is about 1e-5 with no warp (levels 0) and 1e-4 to 2e-4 with two (level 2).

**The edge of the ranges** (`node scripts/shader-diff/cli.js stress`): `domain-warp` at `scale` 8, `k` 8, `seed` 99, level 2, `t` 0 and 600, all palettes: JS exact; GLSL worst **5.18e-3** (marble, t 0, pixel (129, 71)); per set 9.6e-4, 1.4e-3, 1.2e-3, 1.5e-3, 5.2e-3, 4.6e-3. The cause was not isolated: fused multiply-add contraction by the shader compiler and the GPU's `sin` precision are the candidates, and neither was checked.

## The proposed tolerance

**`GLSL_TOLERANCE = 1e-3` per color component** (`kit/harness/tolerance.js`), measured on the Apple GPU through WebKit.

- Headroom: **4.6x** over the standard cases' worst (2.19e-4), and infinite over the remaps (which are exact). It is a quarter of an 8-bit step (1/255 = 3.9e-3).
- It does **not** cover the stress case (5.18e-3, about 1.3 8-bit steps; 5.2x over the tolerance). A tolerance above that would have missed more planted faults (below), so the proposal is the tighter figure, with the finding that **a sketch pushed to the corners of its declared ranges exceeds it**; the prerelease test holds the stress case to 1e-2 only to catch a blow-up. Whether the target should declare one figure for typical use and another for the corners, or a relative one, is the findings leaf's decision to make with Ben.
- The figure is one GPU's. Other renderers (software, mobile) are expected to differ, mostly in `sin`/`cos`/`pow`; the headroom is the only allowance for that.
- It belongs to the GLSL target (the fields Dialect's `targets.glsl.compare` says only `"tolerance"`). It sits in `kit/harness/tolerance.js` only because `kit/emit/glsl` was another leaf's; **it should move to the target.**

## Planted faults

`node scripts/shader-diff/cli.js faults` (28 faults, run at scale 0.49: a 74-pixel panel and a 65 x 44 warp; planted one at a time in one backend's copy of the lowered Kernels or its emitted text; the interpreter is the reference). Unplanted controls: JS exact on all three; GLSL worst 0, 0, 2.06e-4.

| Pair | Planted | Caught | Escaped |
|---|---|---|---|
| JS vs interpreter (exact) | 26 | **24** | 2 |
| GLSL vs interpreter (tolerance 1e-3) | 24 | **21** | 3 |

By kind (each fault runs in every backend it applies to): 8 operator swaps, 8 constant nudges, 4 swizzles, 4 dropped roundings (JS only) and 4 changed spellings of an intrinsic or of the shader (sin as cos and floor as ceil in both; a hash constant and `mediump` in GLSL only). Every IR fault is planted in both backends; the text faults in the backend that has the construct.

**Every escape, explained** (the CLI exits 1 on an escape with no recorded reason, so an unexplained one cannot pass):

1. `js-drop-rounding-seed` (JS): an **equivalent mutant**. `u.seed * 3` is a whole number, exactly an f32, so rounding it changes nothing.
2. `js-drop-rounding-all-swirl` (JS): every `Math.fround` removed from `swirl`'s JS, and the output is still identical. `swirl` returns one of four constant colors, so rounding noise in its coordinates changes the output only for a pixel within an ulp of a threshold, and the 74-pixel grid has none. The same fault in `domain-warp` is caught (2.2e-4). **The remap sketches cannot see a rounding fault; the smooth sketch can.**
3. `grid-red-small` (GLSL): the grid's red nudged by 5e-4, under the tolerance of 1e-3, so no GLSL comparison can tell it from rounding noise. The JS pair catches it (5.0e-4).
4. `fog-base-small` (GLSL): the fog palette's darkest red nudged by 5e-4, the same reason; the JS pair catches it (4.9e-4).
5. `glsl-mediump` (GLSL): `precision highp float` changed to `mediump`; the worst difference, 2.06e-4, is the unplanted run's. On this renderer `mediump` behaves as full 32-bit floats. A property of this GPU, not of GLSL; a GPU that halves `mediump` was not available to test.

What the table says: **faults of 1e-3 and over are caught in both backends; below it only the exact JS pair sees them.** Rounding faults live below it (dropping every rounding in `domain-warp` moved the output by 2.2e-4; dropping one by 7.9e-5), so **rounding is verified by the JS-against-interpreter pair alone**: GLSL has no rounding to drop, and the tolerance would hide one. Every fault of a smooth sketch's structure (operators, swizzles, constants of 1e-3 or more) was caught by both. A mutated shader that fails to compile counts as caught; none did.

## Cost

`check` about 25 s (domain-warp is 22 s of it, almost all of it the interpreter over 132 x 90 x 9 sets; the remaps take about 1 s each with the GPU run; the split was not timed separately), `stress` about 25 s, `faults` about 15 s including the GPU runs; the fast suite's JS half adds about 3.5 s (`kit/harness/test`). The GLSL half is the prerelease suite (`scripts/shader-diff/prerelease/glsl.prerelease.js`, about 63 s).

## Seams to report

- **The tolerance's home.** `GLSL_TOLERANCE` should move to `kit/emit/glsl` (or the fields Dialect's `targets.glsl`), and `compare: "tolerance"` should carry it.
- **Locating a difference.** A shader gives only its output, so reports name the `return` statement of the worst pixel (author's line, emitted JS line, shader line), not the operation. An interpreter-only per-node trace of that pixel is available through its `onNode` hook.
- **A page loads its modules only with `--file-root`.** A `file:` page's `<script type="module">` is blocked by CORS in sleepy unless `--file-root <dir>` is given; `scripts/shader-diff/sleepy.js` passes it.
