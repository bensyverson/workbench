# The Workbench Kit: consolidated proposal

*Draft 2 for discussion · 2026-11-23*

This document merges two earlier proposals (mine, and the one written by the agent that built the DMG Workbench) with the design goals and corrections that came out of the review conversation. It separates what we have observed from what we are guessing, and attaches a test to every guess.

---

## 1. Summary

Ramon's and Manuel's prompts reliably produce **workbenches**: a domain language, an IDE around it, an agent, and a textbook. Three things limit the technique today.

1. **Every workbench is rebuilt from a previous one.** Most of each file is shell, and small deviations are inherited silently.
2. **The IR describes the program but nothing depends on it.** Behaviour lives in opaque JS closures, so nothing can be analysed, optimised or compiled.
3. **Form and function are fused**, and the output is one very large file that an agent must absorb whole.

The proposal:

- **A kit, written once and owned by us**: a parser for a subset of JS, a small typed IR, emitters, a test harness, an editor, an agent shell and a book renderer.
- **Four things generated per workbench, each in its own file**: a *dialect* (what the domain means), a *workbench* declaration (what the tool does), a *skin* (how it looks) and a *book* (what the reader learns).
- **The IR is the single source of truth.** Every front end lowers into it. The browser stage, the graph, the checks and every backend read it and nothing else.
- **Backends are organized by execution model, not by device.** JavaScript runs natively in the browser. WebAssembly is the path to modern architectures. Shader languages are first-class. Anything exotic is a plugin a dialect brings.
- **Everything is addressed, not located.** The UI, the agent and the book are three clients of one API and one address scheme.

---

## 2. What we looked at

| Source | How it was examined |
|---|---|
| Ramon's prompt (2026-11-18) and Manuel's prompt (2026-11-23) | Read in full |
| DMG Workbench (347 KB, one HTML file) | DSL core, IR builder and C emitter read closely; UI and agent code searched, not read |
| The other agent's proposal, including its comparison of five workbenches | Read in full. **Its claims about Skate, Plads, Lastwork and Sonnet are taken on trust**; only the DMG workbench was inspected here |
| *Uncommon Math* 0.1.0 (4.8 MB textbook) | Data structure, chapter list, one chapter's opening and API section, the start of Appendix B, one sketch, the page script. The prose itself was not read |
| Browser-runnable toolchains | Web search; sources in Appendix A |
| What an artifact page may load | The artifact publishing rules |

---

## 3. Learnings (observed)

**From the DMG Workbench**

- **L1.** The domain shaped the grammar without being asked to. Hardware limits appear as types, lints and budgets.
- **L2.** Manuel's three ideas landed concretely: proxy diagnostics with "did you mean", fragments as mixins with conflict reports, and a mutation mode for agents.
- **L3.** One `eval` tool over a rich lab API is a better agent interface than many small tools. A text rendering of the screen lets the model see the result.
- **L4.** The IR is built after compilation, from the compiled spec plus regex scans of lambda source. The runtime and the C emitter both bypass it.
- **L5.** The C emitter gets data exactly right and emits every lambda body as a comment. Structure lowers; behaviour does not.
- **L6.** The template chain drifts. This workbench loads a web font from a CDN, which Ramon's prompt forbids.
- **L7.** The 22 presets, which include seven games other than the one the grammar was designed for, show the grammar was not overfit.

**From the five-workbench comparison (other proposal, unverified here)**

- **L8.** What is shared is a model: a language compiled to an IR, several views, parameters declared in source, checks, progressive examples, an agent.
- **L9.** What varies is the source form (JS, YAML, canvas), the layout, the time model, single design versus a population of variants, and the look.

**From *Uncommon Math***

- **L10.** The "god file" is a bundle. About 99% of it is one line of JSON holding 27 Markdown chapters, 113 sketches and 195 demo records whose ids already look like file paths.
- **L11.** Prose links into the bench by address. There are 2,098 `lab:` links in three kinds (`demo`, `book`, `sketch`). The DMG Workbench styles the same link class.
- **L12.** Each sketch declares its own parameters in a `meta` block, so the book needs no interface code per figure.
- **L13.** Figures are inline SVG styled by semantic classes, which already separates content from look.
- **L14.** Chapters run 94k to 220k characters. No agent reads the book whole, but each chapter and sketch carries a one-paragraph summary.
- **L15.** Sketches cannot import, so helpers are pasted. The book's own Appendix B counts 75 of 113 sketches defining general-purpose helpers inline.
- **L16.** Shader material is maintained twice by hand: 51 GLSL listings beside JavaScript re-implementations, including two CPU fragment shaders.

**From the platform**

- **L17.** An artifact published from files may load its own files by relative path, and may start Web Workers from them. A page may be up to 16 MiB.
- **L18.** Fetches to other hosts are blocked. Scripts load only inline or from a short CDN allowlist. Downloads started by the page are refused unless a capability provides them.
- **L19.** Not yet verified: that WebAssembly instantiates inside an artifact, and that WebGPU is available there. Pyodide being on the script allowlist suggests the first.

---

## 4. Design goals

| # | Goal | Consequence in this design |
|---|---|---|
| G1 | An agent quickly understands the user's goal, what a workbench is, and how to implement a new domain language | A fixed brief, a short entry document, a small reference workbench, and a declarative way to define a grammar (§8, §11) |
| G2 | Token-efficient to learn, execute and iterate | The kit is opaque to the agent. Budgets on every document it does read. A headless check with compact output (§11) |
| G3 | Form and function are separate | Function declares views by role, with no positions. A skin arranges whatever exists (§9) |
| G4 | A natural home for the textbook | Markdown chapters that link and embed by address (§10) |
| G5 | Own and control the key technologies | Our own parser, IR and emitters. No LLVM. Vendored code is pinned and off the critical path (§7) |
| G6 | Everything runs in a web environment | Every stage of the pipeline is JavaScript or our own WebAssembly, loadable in an artifact (§7) |
| G7 | Not tied to one kind of domain | The core has no entities, events or frame loop. Games, shaders and data tools are all dialects (§5) |
| G8 | JavaScript runs natively in the browser | The JS backend emits plain JS. No embedded JS engine anywhere (§6) |
| G9 | Not confined to a single file | A package of small files. A single-file bundle is a build output, not the source |

---

## 5. The core IR

### 5.1 The hourglass

```
front ends     fluent JS  ·  YAML  ·  canvas edits  ·  agent edits
                                │  lower (every node keeps its source span)
                                ▼
core IR        types · functions · kernels · effects · declarations · spans
                                │                         ▲
                                │                         └── analyses, optimisations
        ┌──────────┬────────────┼─────────────┬─────────────────┐
        ▼          ▼            ▼             ▼                 ▼
       JS        wasm      GLSL / WGSL    C / Rust text    target plugins
   (the stage)                              (export)       (a dialect brings)
```

JavaScript is the first front end. YAML and canvas editing lower into the same IR and write back to source through spans; they come later.

### 5.2 What is in the core

| Category | Members |
|---|---|
| Types | `bool`, sized integers, `f32`, `f64`, fixed-point, vectors, matrices, enums, structs, fixed-length arrays. Each numeric type states its overflow rule |
| Functions | Pure by default, with bounded control flow: `if`, `select`, `for` over a constant or declared range, `return`, `break` |
| Kernels | A function plus the **domain** it runs over: per pixel, per vertex, per instance, per row, per entity, once per tick, once per change |
| Effects | Every read, write and intrinsic call that is not pure is recorded on the statement |
| Declarations | Generic nodes for whatever the dialect's grammar declares (parameters, components, layers, tables), each pointing at its kernels |
| Spans | Every node maps back to a line and column of source |

The whole IR has a JSON form that is diffable and readable by the agent.

### 5.3 What is deliberately not in the core

Entities, events, timers, frame loops, sprites, tables and queries. Each is a dialect construct built from kernels and effects. A shader dialect is almost nothing but pure kernels over pixels. A game dialect is kernels over entities, plus effects.

### 5.4 Build time and run time

Both prompts ask for this distinction to be explicit. It gets a precise meaning:

- **Build-time lambdas** run as ordinary JavaScript while the program is being built. They may use the whole language. They must return data, which is folded into the IR as constants.
- **Runtime lambdas** are parsed from their source text and lowered to kernels. They must stay inside the subset below.

Build time is where cleverness goes. Run time is where restrictions apply, and the restrictions are what make every backend possible.

### 5.5 The runtime subset

The kit defines a core subset. A dialect may narrow it, never widen it.

**Allowed**

- Arrow functions with positional parameters and a destructured context
- `const` and `let` with initialisers; assignment and compound assignment
- Arithmetic, bitwise, comparison and logical operators; the ternary
- `if` / `else`, early `return`
- `for` loops with a bound that is a constant, a parameter or a declared size
- Member access on known receivers, and calls to declared functions and intrinsics
- Literal constructors for dialect types (`vec2(…)`, a struct literal as a return value)

**Rejected, each with a reason and a fix**

- A free variable that is not a declared constant or parameter. Fix: declare it with `.const(…)` or `.param(…)`. This is how the loss of closure scope in `fn.toString()` is handled: nothing is captured silently.
- Closures, nested functions, callbacks passed to arbitrary functions
- Dynamic property names, `this`, `delete`, prototype access
- Unbounded loops and recursion
- `async`, promises, timers, DOM access, I/O
- Anything the dialect forbids, with the dialect's own message

Each runtime lambda ends up in one of three states: **lowered**, **rejected (reason, line)**, or, where a dialect permits it, **browser-only (reason, line)**. The editor shows the state in the gutter and the agent can query it.

### 5.6 The parser

We write our own, and it only ever parses lambda bodies. The host JavaScript engine executes the builder chain, so the kit never needs to parse the full language. A recursive-descent parser for this subset is small enough to own and test thoroughly.

### 5.7 Operators on dialect types (decision D1)

JavaScript has no operator overloading, so `uv + k * q` on vectors does not run as plain JS. Because runtime lambdas are parsed and not executed directly, the subset can give operators their meaning from the types.

- **Recommended:** operators resolve on declared types. Runtime lambdas are always executed through the IR. Shader-style code reads naturally, and there is exactly one execution path.
- **Cost:** a runtime lambda is no longer runnable as-is, so debugging goes through emitted code and spans, and the original closure cannot serve as a test oracle. A small reference interpreter over the IR takes that role (§12).
- **Alternative:** keep strict JS semantics and write `add(uv, mul(k, q))`. Every lambda stays directly runnable, at the price of unpleasant shader code.

### 5.8 A worked example

Source, in a hypothetical fields dialect:

```js
.pixel((uv, { k }) => {
  const q = vec2(fbm(uv), fbm(uv + vec2(5.2, 1.3)));
  return ramp(fbm(uv + k * q));
})
```

IR:

```
kernel marble.pixel(uv: vec2) -> vec3     ; domain pixel · pure · reads param k (live)   [L8]
  t0 = call fbm(uv)
  t1 = call fbm(add.vec2(uv, const vec2(5.2, 1.3)))
  q  = vec2(t0, t1)
  t2 = call fbm(add.vec2(uv, mul.f32.vec2(k, q)))
  return call ramp(t2)
```

JavaScript backend:

```js
function marble_pixel(uv, P) {            // L8
  const q = [fbm(uv), fbm([uv[0] + 5.2, uv[1] + 1.3])];
  return ramp(fbm([uv[0] + P.k * q[0], uv[1] + P.k * q[1]]));
}
```

GLSL backend:

```glsl
vec3 marble_pixel(vec2 uv) {              // L8
  vec2 q = vec2(fbm(uv), fbm(uv + vec2(5.2, 1.3)));
  return ramp(fbm(uv + u_k * q));
}
```

The same machinery handles a stateful kernel. From the DMG Workbench's whack-a-mole preset:

```js
.onFrame((self, w) => {
  if (self.up && --self.ttl === 0) { self.up = false; w.emit("escaped", { cell: self.index }); }
})
```

```
kernel Mole.onFrame(self: &Mole)   ; domain entity · read up · read/write ttl · write up · emit escaped   [L96]
  if load(self.up) {
    t0 = sub.wrap.u8 load(self.ttl), 1
    store self.ttl, t0
    if eq t0, 0 {
      store self.up, false
      emit escaped { cell: u8 = self.index }
    }
  }
```

---

## 6. Backends

| Backend | Role | Owner |
|---|---|---|
| **JavaScript** | Runs natively in the browser. Drives the stage. Enforces the dialect's numeric rules (integer wrap, `f32` rounding, fixed point) | Kit |
| **WebAssembly** | The path to modern architectures: browsers and other runtimes compile it to native code. We emit the binary directly | Kit |
| **GLSL and WGSL** | For kernels that are pure and data-parallel | Kit |
| **C and Rust text** | A readable hand-off for people leaving the workbench. Not on the critical path | Kit |
| **Target plugins** | Anything exotic: a console CPU, a microcontroller, SQL, a font format | The dialect |

**Capabilities.** Each target declares which kernel domains, effects and types it accepts. The compiler reports precisely what cannot go where:

> Target `glsl` cannot take `Mole.onFrame`: it writes entity state and emits an event. Shader targets accept pure kernels over `pixel` and `vertex`.

**Piecewise lowering.** One program may split across targets. A particle system can send its update kernel to a compute shader and its control logic to JavaScript.

**Why emit JavaScript when the source is JavaScript.** The emitted code is the code every other backend is compared against. It carries the dialect's numeric semantics and the optimisations, and it can be instrumented for stepping, tracing and cost counting.

**Native machine code.** The default answer is WebAssembly, plus C or Rust text for a host toolchain. Writing our own x86-64 or ARM64 object code is feasible for an IR this small, but it would be much slower than an optimising compiler's output and could not be run in the browser to test it. It is out of scope unless asked for (question Q1).

---

## 7. Ownership

| We write and own | Vendored, pinned, source in the repository, off the critical path | Not used |
|---|---|---|
| Subset parser | Math typesetting (KaTeX today; our own TeX-subset to MathML renderer is a later option) | LLVM, or anything that requires it at run time |
| IR, analyses, optimisation passes | Device-side runtimes a target plugin needs | An embedded JavaScript engine |
| JS, wasm, GLSL, WGSL, C and Rust emitters | | Network loads from CDNs |
| Reference interpreter and test harness | | A stock JS parser |
| Editor and highlighter, Markdown renderer | | |
| View, skin and address systems | | |

Everything in the first column runs as JavaScript in a page. Nothing in the pipeline needs a server.

Appendix A records what we found about QuickJS, MicroQuickJS and the small C compilers, and why none of them sits on the critical path.

---

## 8. Defining a domain language

Three things are declared per domain. All three are mostly data, so they are cheap to generate, check and diff.

### 8.1 Semantics

```js
Dialect("fields", { kit: "^1" })
  .type("vec2", { of: "f32", n: 2 })
  .type("color", { of: "f32", n: 3 })

  // where kernels can run
  .domain("pixel", { args: { uv: "vec2" }, returns: "color", pure: true })
  .domain("tick",  { args: { t: "f32", dt: "f32" }, effects: ["state"] })

  // operations, with their effects and how each target spells them
  .intrinsic("fbm",    { sig: "(p: vec2) -> f32", pure: true, impl: "lib/fbm.js" })   // written in the subset: lowers everywhere
  .intrinsic("sample", { sig: "(t: texture, uv: vec2) -> color", effects: ["read:texture"],
                         js: (rt, t, uv) => rt.sample(t, uv), glsl: "texture($t, $uv)" })

  .forbid("Math.random", "use rand(seed): it is seeded, so results repeat")

  .target("js",   { accepts: "*" })
  .target("glsl", { accepts: { domains: ["pixel"], effects: ["read:texture"] }, compare: "tolerance" })
  .target("wasm", { accepts: { domains: ["pixel", "tick"] } })

  .check("range", (ir) => /* a domain check that returns diagnostics */ [])
```

Intrinsics written in the subset itself (`impl: "lib/fbm.js"`) reach every backend for free. That is also how a dialect shares helpers instead of pasting them.

### 8.2 Grammar

The fluent vocabulary is declared, not hand-written. Each construct lists its slots, and each lambda slot says whether it is build-time or runtime and which domain it runs over.

```js
  .construct("layer", {
    slots: {
      param:  { kind: "decl" },                          // .param("k", { value: 4, min: 0, max: 8 })
      const:  { kind: "decl" },
      bake:   { kind: "build" },                         // full JS, returns data
      pixel:  { kind: "runtime", domain: "pixel" },      // subset, lowered
      tick:   { kind: "runtime", domain: "tick" },
    },
    mixins: true,                                        // .with(fragment)
  })
```

From this the kit generates:

- the fluent builders, wrapped in proxies that report misuse with a suggestion and a line number
- the lowering of each slot into IR declarations and kernels
- the language reference, the graph legend and the agent's prompt

Fragments are mixins over constructs. A grammar that does not fit this shape can still supply hand-written builders that produce the same IR nodes.

**Parameters** use one declaration everywhere, in programs and in book sketches: `{ value, min, max, step }`, `{ value, options }` or `{ value: true }`, plus `live: true` when the value may change while running. Live parameters stay dynamic. The rest are folded in as constants.

### 8.3 Two modes of use

- **Declarative:** a program builds an IR, which is then run or compiled.
- **Direct:** an agent or a test drives a running program through the lab API (`step`, `observe`, `mutate`, `setParam`). Mutations are IR-level stores, so they obey the same types and are logged.

---

## 9. Function and form

### 9.1 Function: the workbench declaration

```js
Workbench("fields-bench")
  .dialect(fields)
  .source(lang.js())                                        // or lang.yaml(schema)
  .view("stage", { role: "stage", render: stageView })      // a domain view
  .use(views.source, views.params, views.diagnostics, views.graph,
       views.ir, views.emitted("glsl"), views.book, views.agent)
  .command("export-glsl", { run: (wb) => wb.emit("glsl") })
  .time(time.frame())                                       // or time.none(), time.onChange()
  .lab({ probe })                                           // extra functions in the agent's scope
  .programs("programs/")
  .book("book/")
```

It says nothing about tabs, panes, positions or colours. A view has an id, a **role** (`source`, `stage`, `params`, `inspector`, `diagnostics`, `docs`, `agent`, `export`) and a render function. A workbench is fully usable with no interface at all, through the lab API.

### 9.2 Form: the skin

```js
Skin("kiln-dock")
  .tokens({ ground: "#fff", ink: "#1a1a1a", accent: "#e2001a", font: "Arial", hairline: 1, radius: 2.5 })
  .wide((ui, wb) => ui.split(
    ui.stack(wb.views.role("source"), wb.views.role("agent"), wb.views.role("docs")),
    ui.stack(wb.views.role("stage"), ui.tabs(wb.views.rest()))))
  .narrow((ui, wb) => ui.tabs(wb.views.all()))
```

Rules that keep hundreds of skins interchangeable:

- A skin asks for views by role, never assumes a particular view exists, and places everything left over with `rest()`.
- A skin must place every view or hide it on purpose. The check reports any view that is neither.
- Views draw with tokens and semantic classes, never literal colours or fonts.
- The kit ships one plain default skin, so function can be built and tested before anyone designs anything.

### 9.3 Addresses

Nothing refers to a location on screen. Everything refers to an address, using the `lab:` scheme the textbook and the DMG Workbench already share, extended a little:

```
lab:program?id=10&line=96        lab:view?id=graph
lab:param?name=k&value=4         lab:node?id=Mole.onFrame
lab:book?ch=4&sec=4.5            lab:sketch?id=04-noise/domain-warp
```

Code calls `reveal(address)`. The skin decides what revealing means: switch a tab, scroll a pane, flash a node. The interface, the agent and the book are three clients of the same lab API and the same addresses.

### 9.4 The graph view

The graph stops being a destination and becomes a view of the analyses: effect edges with conflicts marked, folded constants, dead nodes with reasons, cost per kernel where the dialect supplies costs, and a three-way link between source lines, IR and emitted code. Editing the graph directly is not a goal.

---

## 10. The textbook

The pattern worth generalising from *Uncommon Math* is the weave: prose that reaches into a live bench by address.

- **Chapters are Markdown files** with a short front matter: `title`, `about` (one paragraph), `requires`.
- **A link reveals.** `[the comparison sketch](lab:sketch?id=04-noise/noise-compare)` opens it in the bench.
- **An image embeds.** `![Domain warp](lab:program?id=05&k=4)` places a live view in the page with those parameters pinned. Raw Markdown stays readable either way.
- **Static figures are `svg` fences** styled by semantic classes, so the skin controls their look.
- **Custom widgets** are named functions in `book/widgets.js`, embedded the same way: `![…](lab:widget?id=fade-curve)`.
- **Sketches may be free-form JavaScript or dialect programs.** Dialect programs also lower to other backends. Both declare parameters the same way.
- **Examples in chapters run as tests**, so the book cannot drift from the language.

The book is a view with the role `docs`. One skin can put it in a tab. Another can make it the main column with the bench beside it, which is the *Uncommon Math* layout. It can also be published on its own.

A workbench has up to two books. The **language reference** is generated from the dialect. The **primer** on the subject is written, and is optional.

For agents, the kit generates `book/index.json`: every chapter's `about`, its section headings and its key points. An agent reads the index, then one section, and never a whole chapter.

---

## 11. The agent's experience

### 11.1 Package layout

```
START.md            what a workbench is, the loop, where to look
kit/API.md          the only kit document an agent reads
kit/                opaque and versioned; never read, never edited
examples/hello/     the smallest complete workbench
<workbench>/
  brief.md          goal, domain, primitives, targets, what is real and what is simulated
  dialect.js        semantics and grammar
  workbench.js      views, commands, lab scope
  skin.js           form
  lib/*.js          helpers written in the subset
  programs/*.js     examples, which are also the tests
  book/*.md         the primer
```

A build step bundles a workbench into an artifact: either several files, or one file when that is wanted.

### 11.2 Budgets

| Document | Budget |
|---|---|
| `START.md` | 1,500 tokens |
| `kit/API.md` | 4,000 tokens |
| `examples/hello/`, all files | 200 lines |
| Default output of one check | 40 lines |
| `book/index.json` entry per chapter | 300 tokens |

Budgets are enforced by the kit's own tests. Kit size is tracked but does not count, because the agent never reads it.

### 11.3 The loop

```
$ node kit/check.js fields-bench
dialect   ok   2 constructs · 6 intrinsics · 3 targets
programs  7/8  05-warp: E031 line 12: `SCALE` is not declared. Add .const("SCALE", 3) or .param("SCALE", …)
lowering  js 8/8 · glsl 6/8 · wasm 8/8
            glsl: 07-trails uses effect state (tick); glsl accepts domain pixel only
diff      js = interp 8/8 · glsl ≈ js 6/6 (max error 1.2e-6)
skin      ok   all 9 views placed
```

- Every diagnostic has a code, a line and a one-line fix. `explain E031` gives more on request.
- The kit's own builders are proxied, so a wrong call to `Dialect(…)` or `Workbench(…)` answers with a suggestion. The agent learns the API by failing cheaply.
- The same checks run inside the page through the lab API, for agents that have only the artifact.

### 11.4 The in-workbench agent

One tool, `eval`, over the lab API, as today. Its scope and its prompt are generated from the declarations. It gains `ir()`, `effects(id)`, `why(id)` for a rejected lambda, `emit(target)` and `diff(target)`. The modes stay: auto, ask, read-only, with a revert for each step.

---

## 12. Verification

1. **Reference interpreter.** A small, slow, obviously correct interpreter over the IR defines the semantics. Every emitter is tested against it.
2. **Differential runs.** The same kernel inputs, or the same seed and input trace for a stateful program, go through two backends. The report names the first difference, the value that differed and the source line that last wrote it.
3. **Exact where possible, tolerant where not.** Integer and fixed-point results must match bit for bit. Floating-point results from a GPU are compared within a tolerance the target declares.
4. **A pixel debugger for free.** Because every shader kernel also has a JavaScript form, one pixel can be run on the CPU and stepped through.
5. **Programs are tests.** Each example carries its own assertions. Each optimisation pass must leave differential results unchanged.
6. **Spec checks.** No network assets, required comments present, every view placed, budgets met. This is what stops template drift.

---

## 13. Workflow for a new workbench

Each phase ends with something reviewable. Scope decisions are written down, not made silently.

| Phase | Output | Notes |
|---|---|---|
| 0. Brief | `brief.md` | Domain, primitives, what is build-time and what is runtime, the targets, the first thin slice |
| 1. Examples first | `programs/` as examples only, simple to complex | Redesign the grammar until they read well. Include one lambda that is deliberately outside the subset, with its diagnostic |
| 2. Dialect | `dialect.js`, `lib/` | Types, domains, intrinsics, constructs, targets, checks |
| 3. Thin slice | One program: source to IR to the stage, plus one other backend | Differential check passing, before any breadth |
| 4. Function | `workbench.js` on the default skin | Domain views, commands, lab scope |
| 5. Breadth | The remaining programs, each with assertions | |
| 6. Book | `book/` | Woven with `lab:` links and embeds |
| 7. Skin | `skin.js` | A separate pass, possibly a separate agent |
| 8. Summary | Limitations and open decisions first, then features | |

### Changes to the prompts

Manuel's prompt becomes phases 0 to 2. Ramon's becomes phases 4 to 7.

**Manuel, revised**

> Read `START.md`, then `kit/API.md`. The idea: *‹idea›*.
> Write `brief.md`: the domain's composable primitives, which parts of each are build-time and which runtime, and the targets worth compiling to.
> Then output only programs, from simple to complex, in the grammar you intend. Declare parameters in the source. Use fragments to extend constructs. Include one runtime lambda that is deliberately outside the subset, with the diagnostic it should produce. If the examples read awkwardly, redesign the grammar; do not patch it.

**Ramon, revised**

> Turn the dialect and programs into a workbench. Declare function only: views by role, commands, the lab scope. Do not describe layout. Check it on the default skin.
> Write the primer as Markdown chapters that link and embed by `lab:` address. Two audiences: people learning by playing, and agents reading only the source.
> Then, as a separate pass, write a skin: *‹style brief: Swiss, Arial only, light and dark, 1 px hairlines, 2.5 px radius›*. Wide screens side by side; narrow screens one view at a time.
> Keep the credit comment at the top of every bundled output, verbatim.

These lose three assumptions the originals carried: a canvas, a frame loop, and a single file.

---

## 14. Hypotheses and how to test them

| # | Hypothesis | Test | It fails if |
|---|---|---|---|
| H1 | Models write runtime lambdas comfortably inside the subset | Lower all 22 DMG presets; count rejected lambdas and the effort to rewrite them | Many presets need awkward rewrites |
| H2 | A neutral core covers games, shaders and data tools | Three dialects, one of each kind | The kit has to change for the second or third |
| H3 | Typed operators make shader code pleasant without confusing authors | Port two *Uncommon Math* fragment sketches both ways (D1) and compare | Authors or models keep expecting plain JS behaviour |
| H4 | Most fluent grammars can be declared as constructs and slots | Re-declare the DMG grammar; compare the generated API with the hand-written one | Large parts need hand-written builders |
| H5 | A fresh agent can build a small workbench from about 8,000 tokens of kit documentation | Give a new agent only `START.md`, `API.md` and `hello`; measure tokens read and check iterations | It has to read kit source |
| H6 | Skins and workbenches are independent | Two skins by two workbenches; all four combinations pass the check | A skin needs to know a specific view |
| H7 | Owning the emitters is cheaper than vendoring compilers | Measure the size and build time of the JS, GLSL and wasm emitters | An emitter grows toward a general compiler |
| H8 | Differential testing catches lowering bugs cheaply | Plant faults in an emitter; count how many the examples catch | Planted faults pass |
| H9 | Addressed links and embeds are enough for the book | Port one *Uncommon Math* chapter with no per-figure interface code | Chapters need custom wiring |
| H10 | The IR earns its keep | Remove direct closure execution from one workbench | Something visible depended on it |

---

## 15. Roadmap

| Step | Contents | Done when | Tests |
|---|---|---|---|
| M0 Probe | A small artifact page that instantiates wasm, opens WebGL2 and WebGPU contexts, and fetches a sibling file | We know what the platform allows | L19 |
| M1 Game slice | Subset parser, IR and JS emitter for DMG presets 01 to 05, compared with the existing runtime | Behaviour matches on seeded runs | H1, H10 |
| M2 Shader slice | A tiny fields dialect; one kernel to JS and GLSL; tolerance comparison; the pixel debugger | The same source drives both | H2, H3 |
| M3 Kit v0 | Extract the kit; write `START.md`, `API.md` and `hello`; declarative constructs | A fresh agent builds a third, data-oriented workbench with a SQL plugin from the documents alone | H2, H4, H5 |
| M4 Form and book | Views by role, two skins, the address scheme, one ported chapter | Four skin and workbench combinations pass | H6, H9 |
| M5 More backends | The wasm emitter; C and Rust text | Differential checks pass | H7, H8 |
| M6 Regenerate | Revised prompts; one workbench built end to end; kit v1 frozen | No kit code was regenerated | |

The thin slices come before the kit extraction on purpose. If the subset is uncomfortable to write in, we should learn that before building a kit around it.

---

## 16. Risks

| Risk | Mitigation |
|---|---|
| The subset feels cramped | Build-time lambdas stay unrestricted. Diagnostics suggest the idiomatic form. Widen the subset only on evidence from H1 |
| Typed operators blur what is JavaScript | Runtime slots are visibly marked in the editor. The decision is tested (H3) before it is fixed |
| The core is secretly shaped like games | The second dialect is a shader tool and the third a data tool |
| The kit becomes a framework to study | The agent reads two short documents and never the source. Budgets are enforced |
| Standardising erases what made workbenches good | Only infrastructure is shared. Vocabulary, domain views, skins and books stay generated |
| Our emitters produce slow code | Acceptable for the stage and for shaders. C and Rust text remain for anyone who needs an optimising compiler |
| `fn.toString()` varies between engines | Source is never minified. Any parse doubt is a diagnostic, not a guess |
| Backends drift from the reference | Differential checks gate every backend and every pass |

---

## 17. Decisions to confirm

These defaults are written into the design above. Each can be changed.

| # | Default |
|---|---|
| D1 | Operators resolve on dialect types; runtime lambdas always execute through the IR (§5.7) |
| D2 | Vendored code is allowed when pinned and source-available, and never on the critical path. Math typesetting is the one current case |
| D3 | Backend order: JavaScript, GLSL for WebGL2, WebAssembly, WGSL, then C and Rust text |
| D4 | Exotic targets are plugins a dialect brings, not kit concerns |
| D5 | Floating point is compared within a tolerance across backends; integers and fixed point exactly |
| D6 | Skins are written in a separate pass from function, on top of a plain default skin |
| D7 | The generating agent has files and a shell; the same checks also run inside the page |
| D8 | The source of a workbench is a package of files; a single-file bundle is a build output |
| D9 | `lab:` is the address scheme, extended with sections, parameters, views and nodes |

## 18. Open questions

- **Q1.** What should "modern architectures" mean: WebAssembly compiled by the host, source text for a host toolchain, or our own native object code?
- **Q2.** Does the rule against LLVM cover build-time provenance, meaning a vendored binary that was produced with an LLVM-based compiler?
- **Q3.** Does output need to leave the artifact, as a download or by flashing a device? That depends on the capabilities available to the page.
- **Q4.** Should one workbench carry several skins that the reader can switch between?
- **Q5.** How much two-way editing, from canvas back to code, belongs in the kit and how much in individual workbenches?
- **Q6.** Should the kit be one library for every workbench, or forked per family?
- **Q7.** What did Ramon and Manuel originally hope the graph would be: an editing surface, an explainer, or a compiler substrate? This proposal assumes the last two.

---

## Appendix A. Toolchain notes

Findings from the investigation into browser-runnable toolchains. None of these is on the critical path in this design.

| Tool | What we found | Verdict |
|---|---|---|
| QuickJS | A full JavaScript engine that runs as WebAssembly, at roughly a megabyte. It does not expose a syntax tree, so it does not help with parsing | Not needed. JavaScript runs natively in the browser (G8) |
| MicroQuickJS | A much smaller engine from the same author for embedded devices, accepting a strict subset close to ES5. A port for Espressif's framework exists | Of interest to a microcontroller target plugin, and as prior art for a strict subset |
| xcc | A small C compiler whose WebAssembly mode writes the binary directly; its author runs the compiler itself in a browser | The candidate if a dialect ever needs to compile C in the page |
| TCC | A browser build exists, produced with Zig and aimed at 64-bit RISC-V | Not needed |
| 8bitworkshop's compilers | Run in the browser as Emscripten builds | Shows the approach works; Emscripten rests on LLVM, which raises Q2 |
| wasm3 | A WebAssembly interpreter small enough for microcontrollers | Of interest to a microcontroller target plugin |

Sources:

- [quickjs-emscripten](https://github.com/justjake/quickjs-emscripten)
- [MicroQuickJS repository](https://github.com/bellard/mquickjs)
- [ESP-MQuickJS component](https://components.espressif.com/components/makgordon/esp-mquickjs/versions/0.2.1/readme?language=en)
- [xcc repository](https://github.com/tyfkda/xcc) and [Running a C compiler in a browser](https://dev.to/tyfkda/running-a-c-compiler-in-a-browser-4g9h)
- [TCC RISC-V Compiler runs in the Web Browser](https://lupyuen.codeberg.page/articles/tcc)
- [8bitworkshop-compilers](https://github.com/sehugg/8bitworkshop-compilers)
- [About Emscripten](https://emscripten.org/docs/introducing_emscripten/about_emscripten.html)
- [Wasm3 library notes](https://docs.particle.io/reference/device-os/libraries/w/Wasm3/) and [wasm3 repository](https://github.com/wasm3/wasm3)

## Appendix B. Where each idea came from

| Idea | Origin |
|---|---|
| Examples first; redesign the grammar, do not patch it | Ramon's and Manuel's prompts |
| Proxy diagnostics, fragments, mutation mode | Manuel's prompt |
| One markdown source for people and agents; two audiences | Ramon's prompt |
| The IR as the waist of an hourglass; effects; costs; kit and domain layer; two declarations | The other agent's proposal |
| Thin slice before breadth; a second backend early; a decisions log | The other agent's proposal |
| The runtime subset, the free-variable rule, capabilities per target | The first draft of this proposal |
| Differential testing against a reference | Both proposals |
| Kernels over domains; a core with no game concepts; typed operators | This draft, after the correction not to centre embedded targets |
| Views by role, skins, budgets, the check loop, declarative constructs | This draft, from the design goals |
| `lab:` addresses, embedded sketches, parameters declared by examples | *Uncommon Math* and the DMG Workbench |
