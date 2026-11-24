# Workbench Kit

A toolkit for building small, focused programming tools that run in a single web page.

A workbench pairs a small language for one kind of problem with an editor, an AI helper and a built-in book, all in one page. This kit is written once: it reads a subset of JavaScript, turns it into a typed intermediate form (IR), and emits JavaScript or GPU shader code from it, with checks that the outputs agree. Each workbench is then a few small generated files. This is a prototype: milestone M3 (a minimal Definition API) is in progress, and the API will change.

## Install

Requires Node 26 or newer. There is no build step and no runtime dependency.

```sh
npm install      # dev tools (TypeScript, Node types) and the pre-commit hook
npm test         # fast suite, about 5 seconds
npm run typecheck
npm run test:prerelease   # slow suites; run before a release
```

## Quick Start

Lower a small per-pixel color program to IR and print it. Run this from the repo root:

```sh
node --input-type=module -e '
import { field, lowerField } from "./kit/dialects/fields/index.js";
import { printKernel } from "./kit/ir/index.js";

const program = field("ripple")
  .param("k", { value: 4, min: 0, max: 8 })
  .pixel(`(uv, u) => {
    const d = length(uv - vec2(0.5, 0.5));
    return mix(color(0, 0, 0), color(1, 1, 1), sin(d * u.k * 6.28));
  }`)
  .build();
const { kernel, diagnostics } = lowerField(program);
console.log(diagnostics.length, "diagnostics");
console.log(printKernel(kernel));
'
```

It prints:

```
0 diagnostics
kernel ripple.pixel(uv: vec2, u: Uniforms) -> color ; pixel
  ; effects: none
  let d: f32 = length(sub.vec2(uv, vec2(0.5, 0.5)))
  return mix(color(0, 0, 0), color(1, 1, 1), sin(mul.f32(mul.f32(d, u.k), 6.28)))
```

The same Kernel can be emitted as JavaScript ([kit/emit/js](kit/emit/js/README.md)) or as a GLSL fragment shader ([kit/emit/glsl](kit/emit/glsl/README.md)) and compared ([kit/harness](kit/harness/README.md)).

## Learn more

- [kit/glossary.md](kit/glossary.md): the kit's terms
- [kit/dialects/fields/README.md](kit/dialects/fields/README.md): the fields language used above
- [kit/parse/README.md](kit/parse/README.md), [kit/ir/README.md](kit/ir/README.md), [kit/lower/README.md](kit/lower/README.md): parser, IR and lowering
- [project/](project/): dated plans, findings and decisions; the current plan is [M3](project/2026-11-24-m3-kit-v0-plan.md)
- [AGENTS.md](AGENTS.md): the full list of docs, including the scripts

## Authors and license

Ben Syverson. License: not yet chosen.
