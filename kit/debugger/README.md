# kit/debugger: the pixel debugger

Every shader Kernel also has a CPU form, so one pixel can be run and stepped through. The library runs a lowered [fields](../dialects/fields/README.md) Program's pixel Kernel in the [interpreter](../interp/README.md) with its per-node hook and keeps what it sees. No DOM, no Node built-ins; the preview page in [`page/`](page/) is a thin consumer.

```js
import { lowerField } from "./kit/dialects/fields/index.js";
import { tracePixel, uniformsFor, pixelUv, finalColor, groupByLine } from "./kit/debugger/index.js";

const lowering = lowerField(program);
const trace = tracePixel(lowering, { uv: pixelUv(57, 66, 150, 150), uniforms: uniformsFor(program, { aspect: 1 }) });
trace.steps;          // ordered Steps
finalColor(trace);    // the last top-level return's value (also trace.result)
groupByLine(trace);   // [{ kernel, line, text, steps }] in first-reached order
```

A `Step` is `{ index, kernel, span, text, line, column, kind, stmt, value, type, shown, path, depth }`. `span` indexes the source of `kernel` (`trace.sources[kernel]`: the pixel Kernel or a helper such as `fbm`), `text` is that slice, `shown` the value formatted by its IR type (an f32 as the shortest decimal that is the same single, a vector as `vec2(0.5, 1)`), `depth` how many helper calls deep it ran. A branch not taken has no steps; an `if` step's span covers the whole statement.

Other exports: `pixelUv(i, j, w, h)` and `pixelOfUv(uv, w, h)` (the GLSL backend's convention: pixel centers, y up from the lower left), `uniformsFor(program, overrides)`, `formatValue(v, type)`, `compareColor(color, rgba)` (the interpreter's float color against the bytes `readPixels` gave, in 8-bit steps) and `glslUniformValues(emitted.uniforms, u)` (what to upload).

## The preview page

`page/index.html` (+ `page.js`, `view.js`, `gl.js`): renders swirl, bulge and domain-warp with the GLSL backend on a WebGL2 canvas; click a pixel to trace it; step with Prev/Next, the slider, or the arrow keys; the source shows the current span marked and the step table the values; the GPU's byte (via `readPixels`) is compared with the interpreter's. Below are fixed sections (swirl at two pixels, domain-warp at one) for review. `gl.js` is the only GL code.

The page imports `../../...` modules by relative path, so serve the **repository root** and open the page under it (ES modules do not load from `file://`):

```
python3 -m http.server 8765        # from the repo root
# open http://127.0.0.1:8765/kit/debugger/page/index.html
```

`screenshot-trace.png` (viewport, stepped to a node) and `screenshot-full.png` (whole page) were taken with `sleepy` (`open`, real `click` on the canvas, `press ArrowLeft`, `shot`, run outside the Bash sandbox). In them the GPU and the interpreter store the same byte for all four pixels shown.

## Tests

`test/trace.test.js`: spans inside their kernel's source, values equal the interpreter's own result, `fbm` at depth above 0, a branch not taken gives no steps, line grouping, formatting, the GPU comparison and uniform data. The page itself is checked by hand in a browser, not by `npm test`.
