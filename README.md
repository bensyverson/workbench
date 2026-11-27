# Workbench Kit

A toolkit for building small, focused programming tools that run in a single web page.

A workbench pairs a small language for one kind of problem with an editor, an AI helper and a built-in book, all in one page. This kit is written once: it reads a subset of JavaScript, turns it into a typed intermediate form (IR), and emits JavaScript or GPU shader code from it, with checks that the outputs agree. Each workbench is then a few small generated files. This is a prototype: milestones M1 to M4 are done (through composing packages on one page), and the API will change.

## Install

Requires Node 26 or newer. There is no build step and no runtime dependency.

```sh
npm install      # dev tools (TypeScript, Node types) and the pre-commit hook
npm test         # fast suite, about 5 seconds
npm run typecheck
npm run test:prerelease   # slow suites; run before a release
```

## Quick Start

One fields Program, followed through every stage. Each command runs from the repo root and prints exactly what is shown here (the GPU figures in step 5 aside); `npm test` runs them all and checks.

**1. The Program.** [`examples/rings.js`](examples/rings.js) writes a per-pixel color with the fields builder. The lambda is an arrow function in a subset of JavaScript: the builder keeps its source text, and the kit parses that and never runs it as plain JavaScript (so `uv - vec2(…)` is vector arithmetic). The source text as a string works too.

```js
import { field } from "../kit/dialects/fields/index.js";

// Concentric rings, `n` of them layered. The kit reads the lambda's text and lowers it; it never runs it as plain JavaScript.
export const rings = field("rings")
  .param("k", { value: 4, min: 0, max: 8 })
  .param("n", { value: 3, min: 1, max: 8 })
  .pixel((uv, u) => {
    let sum = 0;
    for (let i = 0; i < u.n; i++) {
      sum += sin(length(uv - vec2(0.5, 0.5)) * u.k * 6.28 + i);
    }
    return mix(color(0, 0, 0), color(1, 1, 1), pmod(sum, 1));
  })
  .build();
```

**2. Parse and lower to an IR Kernel.** Types are inferred: `0` becomes an f32, `uv - vec2(…)` the vector operation `sub.vec2`, `i++` the assignment `i = add.f32(i, 1)`, and the loop gets a bound from the param's `max`. `pmod` is a Library function the Program did not write; it is lowered as its own Kernel and shows as an effect. See [kit/lower](kit/lower/README.md) and [kit/ir](kit/ir/README.md).

```sh
node --input-type=module -e '
import { rings } from "./examples/rings.js";
import { lowerField } from "./kit/dialects/fields/index.js";
import { printKernel } from "./kit/ir/index.js";

const { kernel, diagnostics } = lowerField(rings);
console.log(diagnostics.length, "diagnostics");
console.log(printKernel(kernel));
'
```

```
0 diagnostics
kernel rings.pixel(uv: vec2, u: Uniforms) -> color ; pixel
  ; effects: call pmod
  let sum: f32 = 0
  for i = 0; lt.f32(i, u.n); i = add.f32(i, 1) {    ; bound size n
    sum = add.f32(sum, sin(add.f32(mul.f32(mul.f32(length(sub.vec2(uv, vec2(0.5, 0.5))), u.k), 6.28), i)))
  }
  return mix(color(0, 0, 0), color(1, 1, 1), pmod(sum, 1)) ; call pmod
```

**3. Emit JavaScript.** Every f32 operation is rounded with `Math.fround`, so the function agrees bit for bit with the reference interpreter. The vector helpers it calls (`$fv`, `$vsub`, `$cw`) and `pmod` are emitted beside it and left out here; see [kit/emit/js](kit/emit/js/README.md).

```sh
node --input-type=module -e '
import { rings } from "./examples/rings.js";
import { lowerField, INTRINSICS } from "./kit/dialects/fields/index.js";
import { emitKernel } from "./kit/emit/js/index.js";

const js = emitKernel(lowerField(rings).kernel, { intrinsics: INTRINSICS });
console.log(js.source);
'
```

```
function rings_pixel(uv, u) {
  uv = $fv(uv);
  let sum = 0;
  for (let i = 0; i < Math.fround(u.n); i = Math.fround(i + 1)) {
    sum = Math.fround(sum + Math.fround(Math.sin(Math.fround(Math.fround(Math.fround(Math.fround(length($fv($vsub(uv, [0.5, 0.5])))) * Math.fround(u.k)) * 6.28000020980835) + i))));
  }
  return $fv($cw((a0, a1, a2) => mix(a0, a1, a2), [0, 0, 0], [1, 1, 1], Math.fround(pmod(sum, 1))));
}
```

**4. Emit GLSL.** The same Kernel goes through the [LIR](kit/lir/README.md) to a GLSL ES 3.00 fragment shader. None of this is in the lambda: `let sum = 0` is `float sum = 0.0`, the loop counter is a `float`, `u.n` and `u.k` are the declared uniforms `u_n` and `u_k`, `vec2(…)` and `color(…)` are `vec2` and `vec3`, the Library's `pmod` is a function emitted from its own Kernel, and the pixel position comes from `gl_FragCoord`. See [kit/emit/glsl](kit/emit/glsl/README.md).

```sh
node --input-type=module -e '
import { rings } from "./examples/rings.js";
import { lowerField, FIELDS_DIALECT } from "./kit/dialects/fields/index.js";
import { emitGlsl, fromLowering } from "./kit/emit/glsl/index.js";

const glsl = emitGlsl(fromLowering(lowerField(rings)), FIELDS_DIALECT);
console.log(glsl.source);
'
```

```
#version 300 es
precision highp float;
precision highp int;

uniform float u_t;
uniform float u_aspect;
uniform float u_k;
uniform float u_n;
uniform vec2 wb_resolution;
out vec4 wb_color;

float pmod(float x, float n) {
  return x - (n * floor((x / n)));
}

vec3 rings_pixel(vec2 uv) {
  float sum = 0.0;
  for (float i = 0.0; i < u_n; i = i + 1.0) {
    sum = sum + sin((((length((uv - vec2(0.5, 0.5))) * u_k) * 6.28) + i));
  }
  return mix(vec3(0.0, 0.0, 0.0), vec3(1.0, 1.0, 1.0), pmod(sum, 1.0));
}

void main() {
  vec2 uv = gl_FragCoord.xy / wb_resolution;
  wb_color = vec4(rings_pixel(uv), 1.0);
}
```

**5. Compare the three.** The [harness](kit/harness/README.md) runs the Program over a 64 by 64 grid through the interpreter, the emitted JS and the emitted GLSL. JS must match the interpreter bit for bit; GLSL must land within the tolerance the fields Dialect declares for its GLSL target (`r.tolerance`), because a GPU rounds each f32 step. The GLSL half runs on a GPU through `sleepy`, a headless browser (see [scripts/shader-diff](scripts/shader-diff/README.md), including how it runs in a sandbox). Without `sleepy` the snippet prints `GLSL skipped` for the last two lines and the JS comparison still runs. The GLSL figures are one GPU's and will vary.

```sh
node --input-type=module -e '
import { rings } from "./examples/rings.js";
import { runCase } from "./kit/harness/index.js";
import { findSleepy, sleepyRender } from "./scripts/shader-diff/sleepy.js";

const c = { name: "rings", program: rings, width: 64, height: 64,
  sets: [{ label: "defaults", values: { k: 4, n: 3, t: 0, aspect: 1 } }] };
const r = await runCase(c, findSleepy() ? { render: sleepyRender() } : {});
const show = (label, p, limit) => console.log(label.padEnd(20), p ? `worst ${p.worst.diff.toExponential(2)} (${limit})` : "GLSL skipped: no sleepy");
show("interpreter vs JS:", r.jsVsInterp, "identical bits required");
show("interpreter vs GLSL:", r.glslVsInterp, `tolerance ${r.tolerance}`);
show("JS vs GLSL:", r.glslVsJs, `tolerance ${r.tolerance}`);
'
```

```
interpreter vs JS:   worst 0.00e+0 (identical bits required)
interpreter vs GLSL: worst 3.93e-6 (tolerance 0.001)
JS vs GLSL:          worst 3.93e-6 (tolerance 0.001)
```

**6. A type error.** Types are checked when the Program is lowered, before any target sees it. Every diagnostic has a code ([the list](kit/lower/README.md)), a message that names both types and a tip that writes the fix.

```sh
node --input-type=module -e '
import { field, lowerField } from "./kit/dialects/fields/index.js";

const bad = field("bad")
  .pixel((uv, u) => {
    const p = uv + 1;
    return color(p.x, p.y, 0);
  })
  .build();
const { diagnostics } = lowerField(bad);
for (const d of diagnostics) console.log(`${d.code} ${d.message}\n  tip: ${d.tip}`);
'
```

```
L003 '+' takes two vec2s, not a vec2 and f32.
  tip: Build the vector: uv + vec2(1, 1).
```

## Learn more

- [kit/glossary.md](kit/glossary.md): the kit's terms
- [kit/page/host/README.md](kit/page/host/README.md): the workbench page, where you load packages and a glue and play them in the browser
- [kit/dialects/fields/README.md](kit/dialects/fields/README.md): the fields language used above
- [kit/parse/README.md](kit/parse/README.md), [kit/ir/README.md](kit/ir/README.md), [kit/lower/README.md](kit/lower/README.md): parser, IR and lowering
- [project/](project/): dated plans, findings and decisions; M1 to M4 are done; the latest handoff is [here](project/2026-11-26-handoff-page-and-m4-closed.md)
- [AGENTS.md](AGENTS.md): the full list of docs, including the scripts

## Authors and license

Ben Syverson. License: not yet chosen.
