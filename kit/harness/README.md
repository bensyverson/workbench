# kit/harness: the comparison harness

M2's "done when": the same fields Program, through three evaluators, agreeing. It lowers a Program once, then evaluates its pixel Kernel over a grid of pixels and a set of param values through

1. the **reference interpreter** ([kit/interp](../interp/README.md)),
2. the **emitted JS** ([kit/emit/js](../emit/js/README.md)), and
3. the **emitted GLSL** ([kit/emit/glsl](../emit/glsl/README.md)), run on a WebGL2 context and read back as floats,

and reports per pair the worst difference, the pixel and param set it came from, and the source line. JS against the interpreter must match **bit for bit** (`Object.is` on every f32 component); GLSL against the interpreter must fall within the figure the GLSL target declares (proposal D5: floats within a tolerance the target declares), or within a case's own override, which must state its reason. No Node built-ins: the library runs in a page. The CLI that launches the page is [scripts/shader-diff](../../scripts/shader-diff/README.md).

```js
import { standardCases, runCase, glslFigure } from "./kit/harness/index.js";

const [swirl] = standardCases();
const r = await runCase(swirl, { render });   // `render` runs shader jobs somewhere with a GPU; omit it for JS alone
r.jsVsInterp.exact;                            // true
r.glslVsInterp.worst;                          // { diff, set, pixel: [i, j], channel, ref, got }
r.glslVsInterp.at;                             // { kernel, line, text, jsLine, glslLine }: where the worst pixel's color came from
```

## What is where

| File | What it holds |
|---|---|
| `cases.js` | the recorded grids and param sets: `standardCases(scale)`, `stressCase()`, `pixelUv` (the sampling convention) |
| `pipeline.js` | `prepare(program, plant?)`: lowering, the three evaluators, and a planted fault; `uniformValues` (a choice is a name for the host and an option index for the shader) |
| `evaluate.js`, `compare.js`, `locate.js` | a pixel function over a grid; the worst difference of two sets of buffers; the `return` that made a pixel, found again in the author's lambda and in both line maps |
| `run.js` | `runCase`, and its parts (`referencePixels`, `compareJs`, `compareGlsl`, `shaderJob`); the `Render` type |
| `gl.js`, `page.js`, `page.html` | the GLSL half: `renderJobs(gl, jobs)` compiles each shader and reads the pixels back (DOM-free, the context is handed in); `page.js` is the thin part that makes a canvas and sets `window.workbenchHarness` |
| `target.js` | `glslFigure()`, `targetFigure(dialect, target)` and `figureFor(case)`: the figure comes from the Dialect's target declaration, and a case's override is checked here |
| `faults.js`, `sensitivity.js` | planted faults and the run that plants each in each backend |

## Conventions

- **Pixels.** Column `i`, row `j` from the bottom, sampled at its center: `uv = ((i + 0.5) / width, (j + 0.5) / height)`, y up, as the GLSL backend's `gl_FragCoord.xy / wb_resolution` is; `readPixels` rows are bottom-up too, so nothing flips. `aspect` is a uniform set to width over height.
- **Why grids avoid ties.** A pixel whose input lands *exactly* on a branch threshold (`pmod(x, 10) < 1` with `x` an integer) can fall on either side on a GPU and in the interpreter, which differ by a whole color, not a tolerance. A 75-pixel `swirl` panel does it (`(i + 0.5) * 150 / 75` is an integer); the recorded 150- and 74-pixel panels do not. Other scales tie too: `check --scale 0.3` (45 px) puts pixel (22, 16) on a threshold, 0.16 off. The CLI does not warn; pick a scale from the recorded ones, or read a failure at such a pixel as a tie before blaming a backend. A grid that has ties tests the sketch's discontinuities, not the backends.
- **Color** is compared as `vec3` rgb; the shader's alpha must read back as exactly 1.
- **The reference is always the interpreter.** A fault planted in one backend leaves the interpreter untouched, so the pair that holds the faulty backend is the one expected to differ.

## What a report can and cannot say

A shader gives only its output, so the finest place a difference can be named is the **`return` statement** the interpreter took for the worst pixel (`at`: the line in the author's lambda, the emitted JS function's line, the shader's line). It does not say which operation drifted. For a closer look, run the interpreter's `onNode` hook on that pixel ([kit/interp](../interp/README.md)).

## The GLSL figure

The GLSL target declares `compare: { kind: "tolerance", figure: 1e-3 }` in `FIELDS_DIALECT.targets` ([kit/dialects/fields](../dialects/fields/README.md); the shape `defineDialect` resolves `tolerance(1e-3)` to), and JS declares `{ kind: "exact" }`. The harness reads the figure from there (`glslFigure()`) and keeps no constant of its own. The figure is per color component and measured, not derived: the renderer, its headroom and the evidence are in [the M2 findings](../../project/2026-11-23-m2-findings.md).

**One figure per target; a case may override it only with a reason** (Ben's ruling, the M2 findings' open ruling 1). A case carries `override: { figure, reason }`. `figureFor(case)` refuses an override whose reason is missing or blank, or whose figure is not a positive number, so `runCase` and `runFaults` throw. An accepted override is on the result (`CaseResult.override`, `runFaults(...).overrides`), is printed by `shader-diff` as `GLSL figure overridden to <figure> for this case: <reason>`, and is named with its reason in the problem `faultProblems` reports for a control it loosened. The one case that uses it is `stressCase()`: `domain-warp` at the edge of its ranges, held to 1e-2 with the recorded reason (worst 5.18e-3 in the findings, 4.85e-3 on a rerun; cause not established). `options.tolerance` (the CLI's `--tolerance`) is the caller's own figure for every case and wins over both; each entry of `overrides` then carries `held`, the figure the case was held to, and the reports say so. `override: null` is no override. `runFaults` keys its figures and reference pixels by case object, so two cases of one name keep their own.

## Tests

`test/`: the pairs' arithmetic (`compare.test.js`), the pipeline, the sampling convention and `locate` (`pipeline.test.js`), the fault mutators (`faults.test.js`), and the fast half of the harness (`agree.test.js`: all three sketches over every param set at a small grid, JS exactly; the JS half of the planted-fault run). The GLSL half is in [scripts/shader-diff/prerelease](../../scripts/shader-diff/prerelease/glsl.prerelease.js), because it needs `sleepy` and takes about a minute.
