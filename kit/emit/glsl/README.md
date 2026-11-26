# kit/emit/glsl: the GLSL backend

Turns a pure Kernel over a Dialect's `pixel` space into a **GLSL ES 3.00 fragment shader** (WebGL2), with a line map back to the author's lambda. It goes through the [LIR](../../lir/README.md): a capability check, then `lowerToLir` (verified), then text. No Node built-ins, and it names no Dialect: it reads the intrinsics' spellings and the target's `accepts` from the Dialect you hand it.

```js
import { emitGlsl, fromLowering, showLineMap } from "./kit/emit/glsl/index.js";
import { lowerField, FIELDS_DIALECT } from "./kit/dialects/fields/index.js";

const r = emitGlsl(fromLowering(lowerField(program)), FIELDS_DIALECT);
r.source;       // the fragment shader, or null when the target refused the Kernel
r.diagnostics;  // why it was refused (T001 and the LIR's R codes), in the capability message's words
r.lines[i];     // where line i + 1 came from
r.uniforms;     // [{ glsl: "u_k", param: "k", kind: "float", options? }]: what the host sets (an image param's kind is "sampler2D")
r.resolution;   // "wb_resolution", a vec2 the host sets to the canvas size
```

`emitGlsl(source, dialect)` takes a `ShaderSource`: `{ name, kernel, helpers, uniforms }`, where `uniforms` is the members of each object a Kernel reads as uniforms (`{ Uniforms: { angle: "f32" } }`). `fromLowering` builds one from a Dialect's lowering result. Types are in [`index.js`](index.js).

## Conventions

The comparison harness shares these; they are the part to check first when a shader and the [interpreter](../../interp/README.md) disagree.

- **`uv` is `gl_FragCoord.xy / wb_resolution`:** the unit square, **y up**, origin at the lower left, sampled at each pixel's **center** (`(i + 0.5) / width`). That is WebGL's own framebuffer convention, so there is no flip in the shader; `gl.readPixels` rows come back bottom-up. The interpreter takes any `uv`, so the harness feeds it `((i + 0.5) / w, (j + 0.5) / h)` for the pixel in column `i` and row `j` counted from the bottom. (The interpreter's book tests sample a pixel's corner, `(px / W, (H - py) / H)`, with `py` from the top; that is the same y-up square, half a pixel apart, and the book's sketches are smooth, so the shift is inside their tolerance.)
- **`aspect` is a uniform like any other** (`u_aspect`): the harness sets it to width over height. The shader does not derive it from the resolution, so the two kernels see one set of uniforms.
- **The color goes to `wb_color` as `vec4(color, 1.0)`**, with no color-space conversion: a `vec3` color, written as is. A kernel that returns a `vec4` writes it whole.
- **Uniforms** are `u_<name>`, one per member of the Dialect's uniform object, declared whether or not the kernel reads them (the driver drops unused ones, so `getUniformLocation` may be null). An f32 is a `float`; a toggle a `bool` (`uniform1i`); a choice an `int` holding the index of the option chosen (`options` in `r.uniforms`, in the Dialect's order); a param typed f64 is a `float` the host rounds at upload. Names the emitter owns begin `wb_` and no author's name can.
- **An image param is a `sampler2D` uniform** (the core's `sampler`, kit/ir), read by the Dialect's spellings (fields: `sample(img, p)` is `texture(img, p)`, `imageSize(img)` is `vec2(textureSize(img, 0))`) and passed whole to a helper's `sampler2D` parameter. The host binds it, and the binding is part of the contract, since the shader states none of it: upload the image's RGBA bytes as `RGBA8` **without a flip** (`UNPACK_FLIP_Y_WEBGL` false, so row 0, the bottom, is at t = 0, matching `uv`'s y up), set `TEXTURE_MIN_FILTER` and `TEXTURE_MAG_FILTER` to **`NEAREST`** and both wraps to **`CLAMP_TO_EDGE`**, and set the uniform to the texture unit (`uniform1i`). That is the convention fields' `sample` reference and JS spelling implement (the nearest texel, coordinates clamped to the edge, bytes over 255), and what [kit/harness](../../harness/README.md)'s `gl.js` does. Filtering and wrap are fixed, not per param: nothing asks for more yet. A canvas `ImageData` has row 0 at the top, so a host that starts from one flips it once, at upload.
- **Helpers are functions** declared before their callers (the LIR's order); a Library function a Program does not use is not emitted. Constants are baked in at each use, as lowering leaves them. A prelude (an intrinsic's own definition, such as `ihash`) is declared once, before the functions, however many call it.

## The line map

`r.lines` has one entry per line of `r.source`, in order:

- `{ origin: "kernel", kernel, span, start }`: a statement's line points at its statement's span in that kernel's own lambda source (`kernel` is the core Kernel's name; `start` is the span's line and column); a function's first and last lines point at the whole lambda. As in the JS backend, an `if`/`else`'s lines and a loop's all carry the statement's span, and a `let`'s span begins at its declarator (`dist = length(d)`, not `const`).
- `{ origin: "prelude", name }`: a line of an intrinsic's prelude.
- `{ origin: "scaffold" }`: the version line, precision, uniform declarations, `main`.

`showLineMap(lines, source)` prints them beside the text, which is how the goldens read.

## What the target refuses

Before any lowering, [`capabilities.js`](capabilities.js) checks the kernel and the helpers it reaches against what the Dialect declares for `glsl` (`accepts: { domains: ["pixel"] }`): its space, its effects (only calls to the program's own helpers and reads of declared uniforms are allowed), and that a pixel kernel returns a `vec3` or `vec4`. The helpers it reaches and their purity come from [kit/query](../../query/README.md) (`reachableHelpers`, `impurities`). A uniform read records no effect (it is a load of a read-only place), so the uniform allowance admits only a `read` effect a Dialect might record; a load of an undeclared uniform is the LIR's R005. A refusal is **T001**, in the proposal's §6 words:

> Target `glsl` cannot take `Mole.onFrame#0`: it writes entity state and emits an event. Shader targets accept pure kernels over `pixel`.

Then the LIR's refusals (R001 an f64-dependent kernel, R002 a value with no form, R003 an intrinsic with no spelling, R004 a missing or recursive helper, R005 an undeclared uniform, R006 `%` on f32) arrive in the same sentence: ``Target `glsl` cannot take `<kernel>`: <why>.``

## Tests

`test/sketches.test.js` emits `swirl`, `bulge` and `domain-warp` and compares the text and the line map with the goldens in `test/golden/` (`.frag` and `.map.txt`); after a deliberate change, rewrite them with `UPDATE_GOLDEN=1 node --test kit/emit/glsl/test/sketches.test.js` and review the diff. It also verifies the LIR each went through and checks the shader's shape, the prelude's place and the line map's spans. `test/capabilities.test.js` is the refusals, and what must still emit. `test/text.test.js` is literals and the nodes the sketches do not use. `test/sampler.test.js` is an image param: the `sampler2D` uniform, `texture`, `textureSize` and a helper's `sampler2D` parameter.

**Nothing here runs a shader**; the comparison harness does. As a one-off check while building, the three goldens were compiled and linked as WebGL2 fragment shaders with `sleepy` (a page of `gl.compileShader` calls, `sleepy eval <page> --js window.RESULT`, outside the sandbox): all three compile and link.

## Known edges of the Dialect's spellings

Where GLSL leaves undefined what JavaScript defines, the reference interpreter and the shader may differ outside the sketches' ranges: `pow(x, y)` with `x < 0`, `smoothstep(a, b, x)` with `a >= b`, `int(x)` of a float outside int32 (in `ihash`), and `sin`/`cos` of large arguments (GPU precision). Within the two sketches' own ranges none arises (`pow` takes `1 - stripe` with `stripe` in [0, 1]).

`sample` at a point exactly on a texel edge (`p.x * width` a whole number) may land on either texel: the JS spelling multiplies in doubles, a GPU in its own fixed-point texel arithmetic. A NaN coordinate reads texel 0 in JavaScript and is undefined in GLSL. The coverage case samples off the edges, and the harness's test image is 16 texels square so no pixel center of a recorded grid sampled at `uv` lands on one.

Also undefined in GLSL ES 3.00, and so possibly different from JavaScript: `clamp(x, lo, hi)` with `lo > hi`, `sqrt(x)` with `x < 0`, and `min`/`max` with a NaN operand (JavaScript's give NaN; a GPU may return the other operand). `!!x` on an f32 is false for NaN in the shader (`wb_truthy` tests `isnan`), but that holds only where the driver honors NaN. `%` on f32 is refused (R006) rather than approximated: see the [LIR README](../../lir/README.md).

**Rounding.** An intrinsic rounds once in JavaScript and in the reference interpreter (the double result, then `Math.fround`), and per operation in GLSL (each f32 step of `smoothstep`, `mix`, `length` and the rest rounds), so results can differ by a few ULP. The comparison harness's tolerance covers this.
