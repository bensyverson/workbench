# Architecture consult: a first-principles design (pass 1)

*2026-11-24. By `consult` (job Cy9u98), written blind to the current kit design from [the brief](2026-11-24-architecture-consult-brief.md). Pass 2 will compare it with ours.*

**What I read.** The IR survey, whole. Jig and Candela, cloned at HEAD and read in code: `import/jigcad/src/engine/{part,ir,expr,params,program,compile,guard,cadpkg,fea}.js`, `import/jig/README.md`, Candela's `src/engine/fx.ts` and its architecture page, Jig's agent-evaluation summaries and failure history. The two prompts. The DMG Workbench and *Uncommon Math*, which I searched with two small scripts. I did not read anything else under `project/` or `kit/`, nor README, AGENTS or `scripts/`. **One caveat on blindness:** this session's auto-loaded CLAUDE.md lists the current kit's documentation set (component names such as Kernel, LIR, a GLSL backend and a harness). I set it aside, but where my vocabulary matches yours, that list may be why.

**Labels.** *Verified* means I read it in code or reproduced it with a command (Appendix E). *Inferred* means it is my reasoning or a projection. Token figures are heuristic estimates, ±25 % (Appendix E).

---

## 0. The recommendation on one page

**At workbench scale, compiler engineering turns inside out.** The old world puts its complexity *after* the IR, in optimizers and linkers that serve machines and millions of lines. A workbench needs almost none of that, because the browser's JIT and the GPU driver optimize whatever we emit. The complexity moves *before and around* the IR instead:

- capturing behavior from the code a model would write anyway;
- letting a model define a language in minutes, against a prebuilt kit it never reads;
- giving several composed dialects one meaning across their seams;
- making every representation cheap for a model to read and to fix.

The design:

1. **JavaScript stays the surface.** The conventional choice is right: builders for structure, lambdas for behavior.
2. **The kit parses whole program files**, not only `String(fn)`. Programs still run natively. The parse buys exact spans, exact closure capture, and static knowledge of params, libraries and parts. Only runtime lambdas are lowered.
3. **One small typed IR, for behavior only.** These are the kernels: structured control with no CFG, explicit effects, precise f32 and integer semantics, and a reference interpreter that fixes their meaning. Structure stays as plain data owned by each dialect, with addresses. It does not go into the IR.
4. **Binding time is the organizing idea.** The stages are define, build, run (per tick, frame, pixel or row) and observe. Params need no special form. Read at build time, a param is a plain number: the kit records the read and rebuilds when the param changes. Read inside a kernel, it is a uniform.
5. **A dialect is a module of ordinary immutable builder classes.** It adds TypeScript-like signature strings, four slot markers (`Build`, `Native`, `Kernel`, `GpuKernel`), an engine, a view and a required text view. Types flow from step to step because each kernel is typed eagerly, at the builder call, in a context that ordinary code computes from `this`.
6. **To compose dialects, treat each part as a process.** Only two things cross between parts: *signals* (typed at build time, read as snapshots at run time) and *kernels* (shared helpers, legalized again for each target). The kit supplies one address scheme (`lab:`), one clock and scheduler, and frame tags that are checked where values cross.
7. **Verification is routine.** Four witnesses are compared: the reference interpreter, the emitted JS, the GLSL, and the original JS source (a free extra witness for scalar kernels). Dialects declare laws, and budgets are checks.
8. **Legibility is a design target that we measure.** Kernels use in-distribution syntax (vector operators, `Math.*` as an alias). Each meaning has one way to write it. References are generated, everything has a text rendering, and diagnostics are data, with fixits the page can apply.

Against the brief's §4 current choices:

- **Keep:** JS DSLs, our own parser, one typed core IR, our own emitters, no embedded engine, `checkJs`, small files.
- **Change four things:**
  - parse whole program files rather than only `String(fn)`;
  - keep structure out of the core IR;
  - drop any special form for runtime values inside structure, and track build-time reads instead;
  - make composition a kit service (processes, signals, scheduler) instead of something each workbench invents.

---

## 1. Old world, new world

### 1.1 What changes at this scale

The numbers set the terms:

- **Programs are short.** A program is tens to a couple of hundred lines; the 22 DMG presets run from 13 to 185 lines (verified).
- **Everything is small.** A dialect is a few hundred lines, and a bench is a handful of files. Whole-program analysis takes milliseconds.
- **The writer is a model.** It pays per token and has strong priors from public JS, TypeScript, GLSL and Python.
- **So is the reader.** Most code is read by a model, or by nobody, and nobody reads a generated shader.
- **The language is new.** Each user's language is written fresh, in minutes.
- **Dialects come from different sessions.** Several dialects, often written in different sessions, have to work together.

### 1.2 What carries over

| Idea | Survey | Use here |
|---|---|---|
| A typed core calculus: first-order, close to ANF | §9.5, §28.1 (jaxpr), §47.4 | the kernel IR |
| Structured control instead of a CFG | §10.4 (RVSDG), §18.2 (`scf`) | every source (JS) and every target (JS, GLSL, WebAssembly, C) is structured, so a CFG would be a detour |
| Binding time and staging | §19.8 (LMS), §29.3 (CDK tokens), §29.5 (Pulumi `Output`) | the stage model; a signal is a deferred value that carries its dependencies |
| Partial evaluation | §6.3 | build-time free variables fold to constants inside kernels: JS is the macro language of the kernel |
| One signature, many interpretations | §19.9 (tagless-final), §28.1 | the interpreter, JS emitter, GLSL emitter, interval evaluator, printer and stepper are all folds over one op set. Tagless-final is the discipline for backends, not the user's API |
| Declarative definitions | §18.5 (ODS, IRDL) | builder signatures and intrinsics as data, from which checks, docs and guards are generated |
| Legalization by target | §21.6 | each target accepts a set of ops and types; anything else becomes a T-code at the call site |
| Defunctionalization | §5.6 | `arr.filter(x => …)` inside a kernel becomes a loop, so no closures exist at run time |
| Explicit effects | §14.2 | each slot's context grants capabilities, and each kernel carries an effect summary |
| Identity as a designed abstraction | §13.3 | one address scheme across records, state, kernels, params and the book |
| Provenance | §36 | every IR node and every emitted line maps back to a source span |
| Algorithm versus schedule | §28.4 (Halide) | the engine owns loops and order; kernels are loop bodies |
| A verification ladder | §33.5 | the interpreter as meaning, differential runs, property laws (as in Jig's §8) |
| Content-addressed caching | §34.1; Jig's feature cache | for expensive domain results only |
| Semantic queries over a retained program | §40.5; Jig's `Program` | the agent's eval API: `why`, `trace` and `inspect`, by address |
| Views, not levels | §37, Principle 12 | text renderings, each answering one question (Jig's L0–L6 are exactly this; see Appendix D) |

### 1.3 What is dead weight

| Idea | Survey | Why it is dead weight here |
|---|---|---|
| SSA construction, phi nodes and block arguments, dominance | §9 | there is no imperative optimization to do, and the downstream compilers do it anyway |
| Optimization frameworks: e-graphs, saturation, polyhedral, Sea of Nodes, pass managers with invalidation | §10.3, §11, §12, §21.7 | there is nothing to squeeze. V8's own retreat from Sea of Nodes (§10.3) is the cautionary tale |
| Separate compilation, linkers, module graphs, tree shaking | §26.6 | it is always whole-program |
| An incremental query database for the front end | §25 (Salsa) | a full rebuild takes milliseconds; cache only expensive domain work |
| Lossless persistent syntax trees | §7.3 | re-parsing a 200-line file on every keystroke is cheap |
| A universal multi-level infrastructure | §18, especially §18.6 | at this size it is accidental complexity |
| An intrinsically typed IR | §15.2 | JS cannot express it; a dynamic verifier (§15.4) fits |
| Instruction selection, register allocation, scheduling | — | every target is a high-level language |

### 1.4 What the new world needs that the old one never had to solve

1. **Legibility as a measured target.** Old compilers serve machines and expert humans with IDEs. Here the costs are tokens to learn, tokens to write, and steps to fix. Jig's agent-evaluation failure history (verified; 517 runs, 2,697 steps) shows:
   - 16 % of agent steps failed;
   - the largest failure classes were API-shape mistakes, not domain mistakes: 198 steps with an unawaited promise, and 111 with a name that was not in scope (`j`, `mm`);
   - 325 of the 444 failed steps (73 %) were fixed by the very next step.

   So errors that teach do work, and the shape of the API decides how often they are needed.
2. **Language definition as a cheap, checkable artifact that a model writes.** In the old world, language design takes experts years. Here a frontier model writes a dialect in minutes, against a prebuilt kit it never reads (C-entry). So the meta-level must be as in-distribution and as checkable as the object level.
3. **Semantics at the seams.** Old-world composition is linking: one semantics, many modules. Here several semantics have to agree on values, identity, time and units: a 60 Hz game, a per-pixel shader, a table recomputed on demand.
4. **Verification without a reader.** Nobody reviews the generated code. Meaning has to be executable, and the agent has to be able to compare backends routinely, on its own.
5. **Feedback latency as the performance target.** Throughput rarely matters. The time from an edit to seeing its result always does.
6. **Decomposing a goal.** "Make me X" has to turn into catalog dialects, at most one new dialect, and a glue program. This planning step can be taught in the entry document, and the kit makes it cheap by shipping composable dialects.

### 1.5 Testing the suspicion

The brief suspects that the hard problems move to seams, legibility and verification, and away from optimization.

- **Seams: confirmed, with one correction.** Types are the easy part of a seam, because shapes are build-time values: a 24×16 grid is concrete when the mismatch is checked. The hard parts are two others:
  - *binding time*: when a value becomes known (at build, per tick, per frame);
  - *identity across edits*: which bat is still "bat 2" after the seed changes.

  Jig is an existence proof. It already composes CAD, FEA and a path tracer (verified), and its seams are exactly these: persistent face names, a versioned data package with a one-time frame change (mm and +Z up to metres and +Y up), and pose tables over time.
- **Legibility: confirmed.** It is the strongest driver of all. It decides the capture method (§3), the definition API (§5) and how errors are designed.
- **Verification: confirmed,** and cheaper than feared, because behavior is executable twice: as the source JS and as the IR.
- **Away from optimization: confirmed for generated code,** but two performance concerns survive:
  - rebuild latency, which is the feedback loop;
  - domain-level asymptotics: caching geometry, rendering progressively, moving work to the GPU.

  Optimization moves out of the code and into scheduling and caching, inside each dialect.

### 1.6 How ambitious can a workbench get?

My estimate (inferred) is that the ceiling is set by the engines and by how many reference tokens a model can carry, not by the pipeline.

- **Engines.** These are geometry kernels, solvers and renderers: OpenCascade, CalculiX, a path tracer.
- **Reference tokens.** Each dialect's reference costs about 2–4k tokens. A frontier model can hold four to six dialects (15–25k tokens) and compose about ten parts in a handful of files, provided most of the dialects come from a catalog.
- **Small models** should get benches with one or two dialects, about 5–8k tokens of reference.

Jig shows that three heavy domains fit in one JavaScript program. It also shows the price: the engines are where the engineering went.

---

## 2. The pipeline

### 2.1 What a model writes

```
workbench.json        name, dialects, programs, libraries, book, presets (the page loads these by relative path)
dialects/<name>.js    a dialect: builders, intrinsics, engine, view, checks     (full JavaScript)
lib/<name>.js         helpers in the kernel subset: run on CPU and GPU; usable from any program
programs/<name>.js    builder chains with lambdas                                (the program subset)
book/<n>-<slug>.md    chapters; live figures are programs; links are lab: addresses
data/*                CSV, JSON, images
```

The kit page is fixed and prebuilt, and the agent never edits it. Catalog dialects (fields, tables, tiles, cave, sketch) ship beside it as files the agent may read but not change.

This layout also fixes four of the brief's §5 observations:

- **Copied pages (observation 4).** Nothing is copied from a previous page, so template drift has nowhere to start.
- **Pasted helpers (observation 6).** `lib/` is where pasted helpers go.
- **Double-maintained GLSL (observation 7).** Kernels written once in `lib/` or in a program are emitted as GLSL for both display and execution.
- **Book figures without interface code (observation 5).** Book figures are programs, so every figure gets a params panel for free.

### 2.2 Stages and representations

```
 dialect.js ──run natively──▶ Dialect record ──▶ guarded builders, type environment, intrinsics,
                               (D-codes)           engine, view, generated reference
 program.js ──parse──▶ Program AST ──instrument──▶ run natively, with the vocabulary in scope
                        (P-codes)                        │ every builder call: argument checks (B-codes)
                                                         │ every runtime lambda, at its slot:
                                                         │   resolve → type → fold   (K-codes)
                                                         ▼
                    Program record: parts (structure as addressed data) + kernels (typed IR)
                                    + params (with the set read at build time)
                                                         │ seams (S-codes), dialect checks
                                                         ▼
                       per target: legalize (T-codes) → emit JS, GLSL (later WebAssembly, C)
                                                         ▼
              scheduler: engines step on their clocks; signals publish snapshots; views draw
                                                         ▼
              observe: views, text renderings, traces, metrics (R-codes); verify (V-codes)
```

| Representation | Made by | Read by | Meaning fixed here? |
|---|---|---|---|
| Source files | the model | kit, model | — |
| Program AST: whole file, with spans and scopes | kit parser | instrumenter, static checks, the slider↔literal lens | no |
| Dialect record | the dialect module, run natively and validated | kit | the dialect's vocabulary and contracts |
| Program record: parts | the dialect's builders | engines, checks, agent | **structure**, defined by the dialect's engine (its JS is the reference) |
| Kernel IR | kit capture | interpreter, emitters, debugger, checks | **behavior**, defined by the reference interpreter |
| Target IR (for GLSL: no f64, explicit conversions) | kit legalizer | emitters | no; it must refine the kernel IR |
| Emitted code and line maps | emitters | engines, GPU | no; it is checked against the interpreter |
| Runtime state and signals | engines, scheduler | views, agent, other parts | **composition**, defined by the scheduler's snapshot rule |
| Text renderings | each engine's `text()`, the kit | agent, book | no |

### 2.3 Binding times

| Stage | When | Runs as | Code allowed | Sees |
|---|---|---|---|---|
| Define | page load | native JS | full JS | the kit API |
| Build | at program load, and again when a param read at build time changes | native JS, instrumented | the program subset | the vocabulary, `$` as plain values, libraries |
| Capture | each runtime lambda, at its builder call | kit | the kernel subset | its context, `$` (as uniforms), captured constants, libraries, intrinsics, signals |
| Run | per tick, frame, pixel, row or event, as the engine decides | emitted JS or GLSL; the interpreter when stepping | — | its context, uniforms, signal snapshots |
| Observe | any time | kit | — | everything, by address |

The one rule a model has to learn: **code outside a runtime lambda runs once, now, as ordinary JavaScript. Code inside one runs later, many times, and may use only what it is handed.**

### 2.4 Diagnostics

Every diagnostic has the same shape:

```js
{ code, level, at: 'lab:…', span: { file, line, col, len }, message, near?: [...], fix?: { span, insert | replace }, doc: 'ref#…' }
```

**Families:**

| Code | Family |
|---|---|
| D | dialect definition |
| P | parse and subset |
| B | builder argument |
| K | kernel: names, types, effects, capture |
| S | seam |
| T | target legality |
| R | run time |
| V | verification |

Dialects add their own codes under a prefix (`CV01`). The page can apply any `fix`, and the agent API offers `fix(i)`.

**One way per meaning.** When the checker sees "the other way" to write something, it refuses it with a fixit that points to the one way. Harmless aliases for in-distribution spellings (`Math.sin` for `sin`) are accepted and normalized. Two spellings that mean the same thing do no harm. The harm in observation 8 came from the wrong form passing the checker.

### 2.5 Three meanings, each executable

- **Behavior:** the reference interpreter for the kernel IR. It has exact IEEE f32 arithmetic, defined integer division by zero, and wraparound when storing to u8 or u16.
- **Structure:** the dialect's engine, written in JS, running on the record.
- **Composition:** the scheduler's rule (§4.1).

Because each meaning has an executable reference, each can be compared against something.

---

## 3. Capturing behavior

### 3.1 The options

Here is the same kernel, a smooth union of two circles, in five styles. The files and the estimator are in Appendix E.

| | Parse source: JS with vector operators | Parse source: plain scalar JS | Tracing with symbolic proxies (Candela) | String expression language (Jig's, extended to vectors) | Target-language string (GLSL) |
|---|---|---|---|---|---|
| One line of it | `length(p.uv - vec2(.3, .5)) - .2` | `Math.hypot(p.u - .3, p.v - .5) - .2` | `p.uv.sub(fx.vec2(.3, .5)).length().sub(.2)` | `'length(uv - vec2(.3, .5)) - .2'` | `"length(uv - vec2(.3, .5)) - .2"` |
| Tokens, whole kernel | 65–119 | 72–132 | 83–166 | 56–108 | 94–148 |
| In-distribution for models | high: reads like GLSL, HLSL, numpy | high | low: method chains on numbers | medium | high, but a second language |
| Control flow | `if`, `for`, `?:`, early return | same | a JS `if` on a proxy is always true, so it needs `select` combinators (verified: Candela notes that truthiness can't be trapped; its architecture page names `fx.loop`, but nothing under Candela's `src/` implements it) | whatever the string grammar has | full |
| Free variables | resolved statically (whole-file parse) | same | captured by running the code | names looked up in a scope | uniforms wired by hand |
| Stage errors | static, with spans | static | at trace time, via traps (Candela's E201, E202) | when the string is parsed | when the GPU compiles |
| Runs natively as JS (a witness) | no, if it uses vector operators | yes | no | no | no |
| Cost of the kit in the browser | parser and typer, about 3–5k lines (inferred) | same | proxies and a DAG (small) | a small parser per language | none, but no analysis either |
| Steppable, compilable to other targets | yes | yes | yes (via the DAG) | yes | GPU only |

Tagless-final belongs in this comparison as a *backend discipline*. As a user API in JS, it would surface as `ops.add(a, b)`, which is worse than proxies. As the rule that every backend implements the same op signature, it is exactly how to organize the interpreter, the emitters, the interval evaluator and the stepper. This is the hybrid in §19.9.

### 3.2 The pick: parse source

I pick parsing because, under G-agent, it is the only option in which the model writes what it would write anyway: operators, `if`, `?:`, `for`, destructuring, `Math.sin`. The others each cost something:

- **Proxies** cost roughly 30–40 % more tokens for the same kernel, are out of distribution, and fail silently on truthiness.
- **A string language** is a second syntax, with no checking by the host and no highlighting.
- **GLSL strings** are what *Uncommon Math* did, and they led to 51 listings maintained twice (observation 7).

Under C-browser, the price is a parser and a typer running in the page. That is affordable: one implementation, and a 200-line program needs no worker.

**Kernels use vector operators with GLSL meaning** (`p.uv - c`). This departs from JS, where the same expression would give NaN, so a kernel that uses vector operators cannot also run natively. The kit records which kernels are *JS-exact* (scalar only) and uses only those as the fourth witness.

### 3.3 Two subsets, and why parse the whole file

`String(fn)` cannot see closures. In `for (let i …) g.add(… p => p.x * i)`, the value of `i` is invisible from the function object. A whole-file parse tells the kit each lambda's free variables and where they are bound. Before running the file, the kit then inserts an environment thunk at the lambda's span, on the same line so that line numbers survive:

```js
__env(17, p => p.x * i, () => ({ i }))
```

What this buys:

- exact capture of build-time locals;
- exact spans for every kernel;
- static knowledge of `use()`, `params()` and part names;
- a check that a captured `let` is never reassigned after capture, since otherwise native JS and the kernel would disagree;
- the slider↔literal lens, working on exact spans.

**The program subset is what programs actually use.** I ran a census over the 22 DMG presets and the 113 *Uncommon Math* sketches (a regex screen, so the counts are approximate; verified by script). It found no classes, no async, no generators, no try/catch and no getters. Regex literals appear in 3 programs, `new` in 56 (for typed arrays, Map and Set), and spread, destructuring and template literals are common. So the subset is ES2020 statements and expressions minus `class`, `async`, generators, `try`, getters, labels and `with`. A file outside the subset still runs, with `String(fn)` capture and a P-warning; that is the graceful fallback.

**The kernel subset is what runtime lambdas may use.**

- *Allowed:*
  - operators and literals: scalar and vector arithmetic, comparisons, `??`, `?.` on optional types, `?:`, record and array literals;
  - statements: `if`, `for`, `for…of`, `while`, `break`, `continue`, `return`, `const`, `let`;
  - calls: to intrinsics, library functions and helpers in the same file;
  - array combinators with literal lambdas (`map filter find some every reduce forEach includes`);
  - `Math.*`, as an alias.
- *Refused:* `this`, closures that escape, recursion on the GPU, `Math.random` (use the context's seeded `rand`), `eval`, and `new` except for value constructors.

**The closure rule.** A kernel may read:

- its parameters and its context;
- `$`;
- libraries, intrinsics and signals;
- build-time bindings it captures.

Captured bindings become constants, folded at capture. A captured binding that is reassigned after capture is a K-code.

**Capture is eager.** A lambda is typed at the moment it is handed to the builder, so the next builder step already knows its result type (observation 8a). The one exception is a kernel that reads a part defined later in the file, such as the cave reading the game's depth in §4.2. That kernel is a cross-part signal reader, and it is typed when the build finishes.

### 3.4 The kernel IR

The IR is typed, first-order and structured; Appendix B sketches it.

- **Types:**
  - `bool`, signed and unsigned 8-, 16- and 32-bit integers, `f32`, and `f64` (CPU only);
  - `vec2`–`vec4` and `mat2`–`mat4`;
  - `string` (CPU only);
  - string-literal unions, which become enums (`'rock' | 'air'` compiles to an integer compare);
  - records;
  - fixed-length arrays, and dynamic ones on the CPU only;
  - `T | null`, with narrowing;
  - opaque dialect types (a `Date` stored as `f64`, plus intrinsics);
  - grids.
- **Statements:** `let`, assignment to a place, `if`, loop (with an optional static bound), `break`, `continue`, `return`, and a call made for its effect.
- **Spans:** every node has one.
- **Effects:** every kernel has an effect summary: the places it reads and writes, the events it emits, and whether it uses randomness. The summary is checked against the slot's capabilities.

### 3.5 What runs

The dialect chooses a marker for each slot; the model writing a program cannot.

| Marker | Runs | Notes |
|---|---|---|
| `Build<F>` | during the build, natively | any JS |
| `Native<F>` | at run time, natively | not analyzed. For canvas drawing and string-heavy data work; the listing says plainly that it is opaque |
| `Kernel<F>` | as emitted JS | must lower; its meaning is the IR's; steppable |
| `GpuKernel<F>` | as GLSL, plus JS for the debugger and the harness | must lower and be legal on the GPU |
| `Live<T>` | (an argument type, not a slot) | either a value known at build time or a `Kernel<() => T>`. For arguments that depend on run-time signals |

Portability is a gate only where the dialect declares one; elsewhere it is a check. A *Kernel* slot that fails to lower is an error. A *Native* slot is never lowered, and the listing says it is opaque. This keeps the open-ended domains (canvas sketches, string-heavy data tools) possible without letting analyzable slots quietly fall back to opaque code.

---

## 4. Composing dialects

### 4.1 The model

**Parts.** A bench program instantiates parts from several dialects. Each part is a process with a clock:

| Clock | Meaning |
|---|---|
| `demand` | re-run when an input changes |
| `tick(hz)` | a fixed step |
| `frame` | once per display frame |
| `progressive` | accumulate within a time budget |

Inside a part there are plain values and kernels, and that dialect's rules apply.

**Exactly two things cross between parts:**

- **Signals.** Everything a part offers other parts sits under `part.out`. A signal is typed at build time, including its static shape and frame tag, and it gets its value at run time. A reader sees the value committed at the end of the producer's last completed step: a snapshot. Events are signals that carry batches.
- **Kernels.** Library helpers, and kernels a dialect exports, can be called from any part's kernels. They are typed and legalized again at each call site, for that call site's target.

**The scheduler** is part of the kit. Every display frame runs in a fixed order:

1. input;
2. tick parts, using a fixed-step accumulator;
3. demand parts whose input versions changed, in topological order of their reads (a cycle reads last frame's value);
4. frame parts;
5. progressive parts, within their budget;
6. views.

Under a virtual clock this order is deterministic, so a composed bench has one meaning that tests and the agent can replay.

**Addresses.** `lab:<program>#<path>` names parts, outputs, entities, kernels, params and source positions: `lab:lantern#game.bat[2].pos`, `lab:lantern#fog`, `lab:lantern?seed=9`. Diagnostics, book links, the agent API and cache keys all use them. *Uncommon Math* already links its prose to the bench with 2,098 `lab:` links (verified).

**Frame tags.** A numeric seam type may carry a tag, such as `vec2i@cell` or `vec2@px`. A tagged value that flows *unchanged* into a slot with a different tag is an S-code, while arithmetic erases tags. This catches "forgot to convert" without building a unit algebra.

**Workers.** A heavy part (a path tracer, FEA) may run in a Web Worker. Snapshots map directly onto messages.

**Why snapshots?**

- Every read across parts is well defined, with no locks and no ordering puzzles.
- Cycles break with a one-step delay that is invisible at 60 Hz.
- They cross Worker boundaries unchanged.
- They are what a GPU uniform already is.

### 4.2 Worked example: Lantern Cave

Lantern Cave is a lamp-lit cave game:

- a procedural-generation dialect makes the levels;
- an arcade dialect runs the game;
- a per-pixel shader draws the darkness;
- the tables dialect charts the telemetry.

Together they exercise every kind of seam: a value (the grid), identity (spawn ids), time (the level changes when the game says so, and the shader follows the player every frame), a shared kernel (noise, on the CPU and on the GPU), units (cells versus pixels) and events.

```js
// programs/lantern.js: Lantern Cave. Four dialects (cave, arcade, fields, tables) in one program.
use('lib/noise');                                  // noise2(x, y) → f32: a kernel helper, written once

const $ = params({
  seed:    int(7, 0, 99, 'Cave seed'),
  density: num(0.47, 0.35, 0.6, 'Rock density'),
  oilBurn: num(0.0015, 0, 0.005, 'Lamp oil per frame'),
});

// 1. Levels. cave dialect, clock: demand (re-runs when an input changes)
const level = cave('depths')
  .size(20, 16)
  .seed(() => $.seed + game.out.depth)             // a kernel: game.out.depth is a signal, known only at run time
  .carve(c => noise2(c.x * 0.15 + c.seed * 7.1, c.y * 0.15) > $.density)
  .smooth(4)
  .spawns('bat', { count: 5, where: c => c.y > 3 })
  .spawns('gem', { count: 4 })
  .exit({ where: c => c.x > 15 });

// 2. The game. arcade dialect, clock: tick 60
const Bat = actor('Bat', art.bat)
  .attrs({ home: 'vec2@px', awake: 'bool' })
  .onTick((b, w) => {
    b.awake = w.lamp < 0.3 && distance(b.pos, w.player.pos) < 48;
    const goal = b.awake ? w.player.pos : b.home;
    b.pos += normalize(goal - b.pos) * (b.awake ? 0.9 : 0.4);
    if (distance(b.pos, w.player.pos) < 6) w.end('bitten');
  });
const Gem = actor('Gem', art.gem);

const game = arcade('lantern')
  .screen(160, 128)                                // 20 × 16 tiles of 8 px
  .background(level.out.cells, { rock: 'wall', air: 'floor' })
  .spawn(Bat, level.out.spawns.bat, s => ({ home: tile(s.at) }))   // tile(): cell → px centre
  .spawn(Gem, level.out.spawns.gem, s => ({ pos: tile(s.at) }))
  .attrs({ lamp: ['f32', 1], depth: ['int', 1] })
  .onTick(w => {
    w.player.move(w.input.dir() * 1.2, { solid: 'wall' });
    w.lamp = max(0, w.lamp - $.oilBurn);
    for (const g of w.touching(w.player, Gem)) { w.lamp = min(1, w.lamp + 0.35); g.remove(); w.emit('gem', { depth: w.depth }); }
    if (w.on(w.player, level.out.exit)) { w.depth += 1; w.restart({ keep: ['lamp', 'depth'] }); }
    if (w.lamp === 0) w.end('dark');
  })
  .onEnd((w, why) => w.emit('died', { cause: why, depth: w.depth }))
  .export({ player: w => w.player.pos, lamp: w => w.lamp, depth: w => w.depth });

// 3. The light. fields dialect, clock: frame, target: GPU
const fog = pixel('fog', p => {
  const d = distance(p.xy, game.out.player) / 160; // a Signal<vec2@px>: a uniform in this kernel
  const flicker = 0.04 * noise2(p.t * 3.0, 0.0);
  return 1 - smoothstep(0.05, 0.08 + game.out.lamp * 0.45 + flicker, d);
});

// 4. Telemetry. tables dialect, clock: demand
const deaths = table('deaths', game.out.events.died)
  .groupBy('cause', { n: agg.count(), deepest: agg.max('depth') });

export default bench('Lantern Cave')
  .show(game.view().multiply(fog))
  .show(chart(deaths).bar('cause', 'n'))
  .book('book/lantern.md');
```

**What crosses each seam:**

| Seam | What crosses | Type at build time | When it is read | Identity | Check |
|---|---|---|---|---|---|
| cave → game background | `level.out.cells` | `Grid<20, 16, 'rock' \| 'air'>` | at the game's start, and when its version changes | `lab:lantern#level.cells` | its shape against the screen (S201) |
| cave → game spawns | `level.out.spawns.bat` | `{ id: Id; at: vec2i@cell }[5]` | same | each bat keeps its spawn id, `lab:lantern#level.spawn.bat[2]` | frame tags (S251) |
| cave → game exit | `level.out.exit` | `vec2i@cell` | as a uniform in the game's tick kernel | — | — |
| game → cave seed | `game.out.depth` | `Signal<int>` | by the cave's seed kernel at the cave's step. A change re-runs the cave, and the game sees the new level at its next tick | — | a signal used at build time (S301) |
| game → fog | `game.out.player`, `game.out.lamp` | `Signal<vec2@px>`, `Signal<f32>` | as uniforms, one snapshot per frame | — | only exported signals cross (S312) |
| lib → cave and fog | `noise2` | `(f32, f32) => f32` | on the CPU at the cave's build; on the GPU per pixel | `lab:lib/noise#noise2` | legal for each target (T-codes); CPU and GPU agree (V-codes) |
| game → tables | `game.out.events.died` | `Event<{ cause: string; depth: int }>` | batches since the table's last step | the event's index | the event schema becomes a table schema |

There is a cycle here: the cave's seed depends on the game's depth, and the game's background depends on the cave. It is fine, because it crosses parts only through signals and the snapshot rule orders it.

**Size.** The program is 61 lines and an estimated 870–1,160 tokens. That is about the size of one single-dialect DMG preset: Snake comes to 1,180–1,680 by the same tool.

### 4.3 How seam errors read

These are illustrative (inferred), in the shape the agent would receive. Each one assumes a single mistake in the program above. T121 also assumes that `lib/noise` had a recursive `fbm`, which the listing in Appendix A does not:

```
S201 error  lab:lantern#game.background   lantern.js:33:15
  level 'depths' is 24×16 cells; the screen holds 20×16 tiles (160×128 px at 8 px)
  fix 1  lantern.js:12   .size(24, 16)  →  .size(20, 16)
  fix 2  lantern.js:32   .screen(160, 128)  →  .screen(192, 128)

S251 error  lab:lantern#game.spawn.Bat   lantern.js:34:51
  Bat.home is vec2@px, but s.at is vec2i@cell (from cave 'depths')
  fix    home: s.at  →  home: tile(s.at)          # arcade's tile(): cell → px centre

S301 error  lantern.js:13:9
  game.out.depth is a signal, known only while the bench runs; .seed() got it at build time
  fix    .seed($.seed + game.out.depth)  →  .seed(() => $.seed + game.out.depth)

S312 error  lab:lantern#fog   lantern.js:49:22
  fog (clock: frame, GPU) reads game.bats, which is state inside part 'lantern' (clock: tick 60).
  Parts read each other only through exported signals.
  fix    lantern.js:45  add  nearBats: w => w.count(Bat, b => b.awake)  to .export({…}); read game.out.nearBats

T121 error  lab:lantern#fog → lab:lib/noise#fbm   noise.js:15:10
  fbm calls itself, and GLSL has no recursion. CPU kernels may call it; fog's GPU target may not.
  fix    replace the recursion with a loop over octaves (the fixit carries the rewrite)

V204 warning  lab:lib/noise#hash2   noise.js:3
  CPU and GPU differ by up to 0.41 on 3 % of 4,096 sampled inputs: sin(x·127.1 + y·311.7)·43758.5453
  amplifies the GPU's sin error. The cave (CPU) and the fog (GPU) will disagree about where rock is.
  fix    use hash2i (integer hash) from lib/noise
```

The last one is the only kind of seam bug that types cannot catch. A routine differential run catches it, and it falls out of the design: the same kernel crosses into two targets.

### 4.4 Values, identity, time, units: a summary

| Seam concern | How it is handled |
|---|---|
| **Values** | Seam types form a small closed set: scalars, vectors, enums, records, arrays, grids, tables, events, signals of any of these. Static shapes are part of the type. |
| **Identity** | Addresses. An entity made from another part's output keeps that output's id, so telemetry, the book and the agent can all point at "bat 2". The id is positional within a kind for a given seed: change the seed and bat 2 is a different bat at the same address. For a game that is acceptable. A CAD dialect would need Jig-style persistent naming, and the address scheme leaves room for it. |
| **Time** | One scheduler, one snapshot rule, and declared clocks. |
| **Units** | Frame tags checked where values cross, with conversions named by the consuming dialect (`tile()`). |

---

## 5. What a model writes

### 5.1 Defining a dialect

A model needs eight concepts. The entry document teaches them in about 2k tokens.

| Concept | What it is |
|---|---|
| `Builder` | the base class. Immutable, with `with(patch)`, `step(record, schema)` and `require(cond, code, message, { near, fix })` |
| `static sig` | TypeScript-like signature strings. A trailing `//` comment becomes the reference text |
| Context types | getters (`get Cell()`), named in signatures |
| Slot markers | `Build`, `Native`, `Kernel`, `GpuKernel`, plus the argument type `Live<T>` |
| `static outputs` | what other parts may read, typed from the builder's state |
| `vocabulary` | the entry functions programs call |
| `intrinsics` | each with a signature, a JS reference implementation, and per-target spellings |
| `engine` | a clock and `step()`, `outputs()`, `text()`; plus a `view` (`size`, `draw`) and `checks` |

An excerpt of the cave dialect, which is in full in Appendix A (85 lines, an estimated 1,400–1,840 tokens):

```js
class Cave extends Builder {
  static sig = {
    size:   '(w: int, h: int): Cave                          // at most 4096 cells',
    seed:   '(s: Live<int>): Cave                            // a number, or a kernel read at each run',
    carve:  '(isRock: Kernel<(c: Cell) => bool>): Cave       // once per cell, in row order',
    smooth: '(steps: int, rule?: "4-5" | "majority"): Cave    // cellular-automaton passes',
    spawns: '(kind: string, o: { count: int; where?: Kernel<(c: Cell) => bool> }): Cave',
    exit:   '(o: { where?: Kernel<(c: Cell) => bool> }): Cave',
  };
  get Cell() { return t.record({ x: 'int', y: 'int', w: 'int', h: 'int', seed: 'int' }); }

  size(w, h) {
    this.require(w * h <= 4096, 'CV01', `${w}×${h} = ${w * h} cells is over the 4096-cell budget`);
    return this.with({ w, h });
  }
  carve(isRock) { return this.with({ steps: [...this.steps, { op: 'carve', isRock }] }); }
  // … smooth, spawns, exit: the same pattern

  static outputs = {                               // read by other parts as level.out.<name>
    cells:  c => t.grid(c.w, c.h, '"rock" | "air"'),
    spawns: c => t.record(Object.fromEntries(c.rules.map(r => [r.kind, t.array('{ id: Id; at: vec2i@cell }', r.count)]))),
    exit:   () => t.parse('vec2i@cell'),
  };
}

export default dialect({
  name: 'cave',
  about: 'Procedural cave levels: noise carving, cellular automata, spawn points with stable ids.',
  vocabulary: { cave: { sig: '(name: string): Cave', make: name => new Cave({ name }) } },
  engine: class CaveEngine {
    static clock = 'demand';
    step() { /* carve with kit.call(kernel, cell), smooth, place spawns with a seeded rng */ }
    outputs() { return this.out; }
    text() { return this.out.cells.rows(c => (c === 'rock' ? '#' : '.')).join('\n'); }  // what the agent sees
  },
  view: { size: p => [p.w * 8, p.h * 8], draw: (e, ctx) => { /* one square per cell */ } },
  checks: [ /* CV02: no carve step, so the cave is all air (with a fixit) */ ],
});
```

**What the kit does with a dialect:**

- **Guard proxies** on every builder, giving did-you-mean for method names drawn from `sig`.
- **Argument checks** for plain arguments, from the signatures (B-codes).
- **Slot capture** for `Kernel` parameters: the context comes from the named getter, and the parameter name from the signature.
- **A generated reference:** the `sig` lines and their comments, grouped by builder, plus `about` and the examples. Every example is built as a test, so the reference cannot drift from the dialect.
- **D-codes** for broken definitions:
  - a missing `text()`;
  - a slot whose context type doesn't resolve;
  - an intrinsic with no JS implementation;
  - an output with no type;
  - two dialects exporting the same vocabulary name (the program must then qualify it, as in `tables.table`).

### 5.2 Type flow: answering observation 8

```js
// dialects/tables.js (excerpt)
class Table extends Builder {
  static sig = {
    derive: '(name: string, fn: Kernel<(r: Row) => any>): Table   // a new column, computed per row',
    filter: '(keep: Kernel<(r: Row) => bool>): Table',
    join:   '(other: Table, on: string): Table                     // inner join on a shared column',
    limit:  '(n: int): Table',
  };
  get Row() { return this.schema; }                     // the type of `r` in this table's kernels
  derive(name, fn) { return this.step({ op: 'derive', name, fn }, this.schema.with(name, fn.returns)); }
  join(other, on) {
    this.require(this.schema.has(on), 'T01', `no column '${on}' here`, { near: this.schema.names });
    this.require(other.schema.has(on), 'T01', `'${other.name}' has no column '${on}'`, { near: other.schema.names });
    return this.step({ op: 'join', other, on }, this.schema.merge(other.schema, { on }));
  }
  // …
}
```

```js
// programs/sales.js
const $ = params({ minTotal: num(50, 0, 500), topN: int(5, 1, 20) });

const sales = table('sales', data('sales.csv'))         // schema inferred: { id: int, price: f64, qty: int, regionId: int, day: Date }
  .derive('total', r => r.price * r.qty)                // total: f64, known before the next line is typed
  .filter(r => r.total > $.minTotal)                    // $.minTotal in a kernel: a uniform, no rebuild on change
  .join(table('regions', data('regions.csv')), 'regionId')
  .groupBy('region', { revenue: agg.sum('total'), orders: agg.count() })
  .limit($.topN);                                       // $.topN at build time: a plain number; a change rebuilds

export default bench('Sales').show(chart(sales).bar('region', 'revenue'));
```

The program comes to an estimated 240–270 tokens, and the `Table` excerpt to 470–560. Taking the four parts of observation 8 in turn:

- **(a) Types flow between steps.** When `.derive` receives its lambda, the kit types it in the context `{ r: this.Row }` and hands back `fn.returns`. The method builds the next schema with ordinary code, so no type-level programming is needed: the types of runtime lambdas are build-time values. This is the central trick.
- **(b) Steps see each other.** Another table is just a build-time value passed as an argument, with its schema as a property. A chart holds its table. Checks can read the whole record.
- **(c) Runtime values inside structure get no special form.** `.limit($.topN)` is ordinary JS: `$` at build time is the current params object behind a proxy that records reads, so changing `topN` rebuilds (in milliseconds, and the engine migrates state by address where it can). Inside a kernel, `$.minTotal` is a uniform. The only value that really is runtime-only is a signal from another part, and that is written as a kernel, `.seed(() => …)`. Signals throw a teaching error (S301) if used at build time, so the wrong way cannot pass the checker.
- **(d) Missing value types.** The kit's type set covers sized integers, `T | null` with narrowing (`r.price ?? 0`, `if (r.x != null)`), string-literal unions as enums, records, arrays and grids. Dialects add opaque types with intrinsics, for example `Date` as `f64` with `year(d)`. Strings and string building are allowed in CPU kernels and refused on the GPU with a T-code.

### 5.3 Reading and writing costs (estimates)

**Reading:**

| Document | Estimated cost |
|---|---|
| The entry document: what a workbench is; the file slots; the binding-time rule; the eight dialect concepts; the decomposition recipe; the rules list | about 1.5–2k tokens |
| The kit reference: the definition API, the kernel subset, seam types, the diagnostics catalog | about 5–7k |
| A generated dialect reference | about 2–4k. For calibration, by the same tool: Jig's agent reference is 3.6–4.3k tokens and Candela's 4.9–6.0k (verified sizes) |
| The book | optional and large (the brief gives 94k–220k characters per chapter) |

A small model using a finished bench reads one dialect reference and a few presets, about 5–8k tokens, before its first edit.

**Writing:**

| What | Estimated cost |
|---|---|
| A dialect, engine and view included | 1.5–4k tokens (cave: 1.4–1.8k) |
| A program | 250–1,200 tokens |
| A fix | usually one diagnostic and one applied fixit |

---

## 6. What I would not build

| Not building | Why | What would change my mind |
|---|---|---|
| CFG and SSA; optimizer passes beyond constant folding and inlining | downstream compilers optimize, and kernels are small | a target where the emitted code is measurably too slow (a WebAssembly simulation, C for an 8-bit CPU) |
| An incremental query engine for the front end | a rebuild takes milliseconds | a typical rebuild over ~100 ms on a mid-range laptop |
| A string expression language | lambdas over `$` give dependency tracking in one syntax | a dimensioned domain (CAD) where CSV design tables full of formulas are central. Even then, as a dialect feature in Jig's style, not in the kit |
| A unit algebra in the kit | frame tags catch the common bug | physics or CAD dialects that need dimensional analysis. Then as an opaque type the dialect provides (as Jig's `Quantity` is) |
| Tracing proxies for capture | §3 | trials where parse errors dominate and proxy errors would not |
| An embedded JS engine; a full JS parser for dialect files | dialects run natively | needing to analyze engines for whole-program C. Then engines are written in the kernel subset rather than parsed as full JS |
| Structure in the core IR | structure differs by domain; behavior doesn't | two dialects needing the same structural analysis. Then share a library, not an IR |
| A general module system | `use('lib/x')` is enough | benches that outgrow a dozen files |
| Lenses in general | one is enough: slider ↔ literal in the code | visual editing of structure (dragging a sprite writes code) |
| Compiling engines | engines are runtime libraries per target, written by the model (the "SDK"). The kit compiles kernels and serializes records. This is the DMG C emitter done right: its data was right, and the lambda bodies were what it lacked | a real demand to export a game to hardware (a DMG ROM) |
| Synchronous reads across parts within one tick | snapshots are simpler, and enough at 60 Hz | a composition where the one-step delay is visible, such as tight physics coupling. Then merge the two into one dialect |

---

## 7. Top three risks

| Risk | Why it matters | Cheapest experiment |
|---|---|---|
| **R1. The capture rules fight natural code.** Models' runtime lambdas fall outside the kernel subset, or capture build-time state in ways the rules refuse, often enough that programs get awkward or diagnostics pile up | parsing source is the bet that the model writes what it would anyway. If that is false, a main argument for parsing over tracing falls | Static first, half a day: run a subset parser (or acorn, in a throwaway Node script) over the 135 existing programs. Count three things: lambdas that capture non-top-level bindings; constructs outside the program subset; constructs outside the kernel subset inside runtime lambdas. Then three fresh agents each write three new programs under the rules, reviewed by hand, with the size of the massage recorded as the finding |
| **R2. A frontier model cannot write a correct dialect in one pass from the documents alone** (C-entry: it never reads kit source) | the definition API is the kit's only contract with dialect authors, and observation 8 already showed friction with a draft API | Write the entry document and the kit reference *before* implementing them. Give three fresh agents one new domain with a GPU slot (particle fountains). They write the dialect and two programs against a stub `kit` that checks signatures and D-codes only. Record tokens, D-codes, what they guessed, and where the documents misled them. One to two days |
| **R3. The composition model is confusing or not enough.** Models put cross-part values in the wrong place, or real benches need same-tick reads that snapshots forbid | composition is where G-ambition lives, and it is the least tested part of this design | A paper run of Lantern Cave. Generate stub references for the four dialects; three fresh agents write `lantern.js` from those references plus the composition section. Review by hand: did they route cross-part values through `out`, use kernels for signal-dependent arguments, convert frames? Count how many mistakes an S-code would catch and how many no check would. One day. Then build the scheduler and replay their programs headless |

**Also watch:**

- f32 parity between CPU and GPU for hash-style noise (V204 above);
- small models editing kernels rather than structure. Jig's evidence is mostly structural edits: 35 cases with flash models at 89–94 % (verified).

---

## 8. Questions for Ben

1. **Catalog or fresh dialects?** Do you expect most benches to compose maintained catalog dialects plus at most one new one, or every bench to define its dialects from scratch? The answer decides whether to invest first in the definition API or in composition.
2. **Whole-program targets.** Is exporting a whole game, engine included, to C, WebAssembly or a DMG ROM a real goal? Or is kernel portability (shaders now) enough? The answer decides whether engines must be written in the kernel subset.
3. **Whole-file parsing.** Is it acceptable that program files are a JS subset (with a `String(fn)` fallback), which means owning a larger parser? Is vendoring a small MIT parser (acorn) on the table if the parser becomes the bottleneck? I'm asking per the dependency rule; my recommendation is to own it.
4. **What small models edit.** Will small models edit behavior (kernels), or mainly params and structure? Jig's evidence covers structural edits.
5. **Determinism.** Should a bench replay bit for bit across machines (a virtual clock, seeded randomness, f32 on the CPU)? It is cheap to promise now and expensive to retrofit.
6. **Book figures.** May every live figure in a book be a program in some dialect, with a `sketch` dialect that has a `Native` draw slot for free-form canvas code?
7. **Composition granularity.** Does composition mean one page with several dialects (my assumption), or linking separate workbench pages?

---

## Appendix A. The cave dialect in full

```js
// dialects/cave.js: procedural cave levels on a cell grid.
import { dialect, Builder, t } from 'kit';

/** A cave: a grid of rock and air, carved per cell by a kernel, smoothed by a cellular automaton,
 *  with spawn points that keep stable ids (cave#spawn.bat[2]) across rebuilds with the same seed. */
class Cave extends Builder {
  static sig = {
    size:   '(w: int, h: int): Cave                          // at most 4096 cells',
    seed:   '(s: Live<int>): Cave                            // a number, or a kernel read at each run',
    carve:  '(isRock: Kernel<(c: Cell) => bool>): Cave       // once per cell, in row order',
    smooth: '(steps: int, rule?: "4-5" | "majority"): Cave    // cellular-automaton passes',
    spawns: '(kind: string, o: { count: int; where?: Kernel<(c: Cell) => bool> }): Cave',
    exit:   '(o: { where?: Kernel<(c: Cell) => bool> }): Cave',
  };
  static init = { w: 20, h: 16, seed: 1, steps: [], rules: [], exitRule: null };

  get Cell() { return t.record({ x: 'int', y: 'int', w: 'int', h: 'int', seed: 'int' }); }

  size(w, h) {
    this.require(w * h <= 4096, 'CV01', `${w}×${h} = ${w * h} cells is over the 4096-cell budget`);
    return this.with({ w, h });
  }
  seed(s)              { return this.with({ seed: s }); }
  carve(isRock)        { return this.with({ steps: [...this.steps, { op: 'carve', isRock }] }); }
  smooth(n, rule = '4-5') { return this.with({ steps: [...this.steps, { op: 'smooth', n, rule }] }); }
  spawns(kind, o)      { return this.with({ rules: [...this.rules, { kind, ...o }] }); }
  exit(o)              { return this.with({ exitRule: o }); }

  // what other parts may read, as level.out.<name>: typed now, valued at run time
  static outputs = {
    cells:  c => t.grid(c.w, c.h, '"rock" | "air"'),
    spawns: c => t.record(Object.fromEntries(c.rules.map(r => [r.kind, t.array('{ id: Id; at: vec2i@cell }', r.count)]))),
    exit:   () => t.parse('vec2i@cell'),
  };
}

export default dialect({
  name: 'cave',
  about: 'Procedural cave levels: noise carving, cellular automata, spawn points with stable ids.',
  vocabulary: { cave: { sig: '(name: string): Cave', make: name => new Cave({ name }) } },

  engine: class CaveEngine {
    static clock = 'demand';
    constructor(part, kit) { this.part = part; this.kit = kit; }
    step() {
      const p = this.part, k = this.kit, seed = k.value(p.seed);        // a number, or the seed kernel's result now
      const g = k.grid(p.w, p.h, 'air');
      for (const s of p.steps) {
        if (s.op === 'carve') g.each((x, y) => g.set(x, y, k.call(s.isRock, { x, y, w: p.w, h: p.h, seed }) ? 'rock' : 'air'));
        if (s.op === 'smooth') for (let i = 0; i < s.n; i++) g.replace(automaton(g, s.rule));
      }
      const rng = k.rng(p.address, seed);
      const spawns = Object.fromEntries(p.rules.map(r => [r.kind, place(g, r, rng, k, p, seed)]));
      const exit = place(g, { kind: 'exit', count: 1, where: p.exitRule?.where }, rng, k, p, seed)[0]?.at ?? [p.w - 2, p.h - 2];
      this.out = { cells: g, spawns, exit };
    }
    outputs() { return this.out; }
    text() { return this.out.cells.rows(c => (c === 'rock' ? '#' : '.')).join('\n'); }   // what the agent sees
  },

  view: {
    size: p => [p.w * 8, p.h * 8],
    draw: (e, ctx) => e.out.cells.each((x, y, c) => { ctx.fillStyle = c === 'rock' ? '#333' : '#ddd'; ctx.fillRect(x * 8, y * 8, 8, 8); }),
  },

  checks: [
    p => p.steps.some(s => s.op === 'carve') ? null
      : { code: 'CV02', level: 'warning', at: p.address, message: 'no carve step, so the cave is all air',
          fix: { append: '.carve(c => noise2(c.x * 0.15, c.y * 0.15) > 0.5)' } },
  ],
});

function automaton(g, rule) {        // 4-5 rule: rock if ≥ 5 of the 9 cells around (and including) it are rock
  return g.map((x, y, c) => {
    let n = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) n += g.get(x + dx, y + dy, 'rock') === 'rock' ? 1 : 0;
    return rule === 'majority' ? (n > 4 ? 'rock' : 'air') : (n >= 5 || (c === 'rock' && n >= 4) ? 'rock' : 'air');
  });
}

function place(g, r, rng, k, p, seed) {   // `count` air cells passing `where`, in a seeded order: ids are stable per seed
  const free = [];
  g.each((x, y, c) => { if (c === 'air' && (!r.where || k.call(r.where, { x, y, w: p.w, h: p.h, seed }))) free.push([x, y]); });
  return rng.shuffle(free).slice(0, r.count).map((at, i) => ({ id: k.id(p.address, 'spawn', r.kind, i), at }));
}
```

The kit services it uses:

| Service | What it does |
|---|---|
| `k.call(kernel, ctx)` | runs a kernel |
| `k.value(live)` | resolves a `Live<T>` |
| `k.grid` | a grid seam value |
| `k.rng(address, seed)` | a deterministic random stream per address |
| `k.id(...)` | makes an address |

The shared library `lib/noise.js` is plain kernel-subset code, 12 lines and an estimated 180–240 tokens:

```js
export function hash2(x, y) { const h = sin(x * 127.1 + y * 311.7) * 43758.5453; return h - floor(h); }
/** Smooth value noise in [0, 1]. */
export function noise2(x, y) {
  const ix = floor(x), iy = floor(y), fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy), b = hash2(ix + 1, iy), c = hash2(ix, iy + 1), d = hash2(ix + 1, iy + 1);
  return mix(mix(a, b, ux), mix(c, d, ux), uy);
}
```

## Appendix B. The kernel IR, sketched

```ts
type Kernel = {
  address: string;                       // lab:lantern#fog
  params: { name: string; type: Type }[];
  ctx: Type;                             // the slot's context type
  uniforms: { name: string; type: Type; from: 'param' | 'signal'; ref: string }[];
  consts: { name: string; type: Type; value: unknown }[];   // captured build-time values, folded
  fns: Kernel[];                         // helpers it calls (lib, same file), deduplicated by address
  body: Stmt[];
  returns: Type;
  effects: { reads: Place[]; writes: Place[]; emits: string[]; rand: boolean };
  targets: Record<'js' | 'glsl', 'ok' | Diagnostic[]>;
  span: Span;
};
type Stmt = Let | Assign | If | Loop | Break | Continue | Return | Eval;      // structured: no blocks, no gotos
type Expr = Lit | Var | Unary | Binary | Select | Call | Field | Index | Swizzle
          | Make /* vec, record, array */ | Convert | IsNull;
```

**Semantics the interpreter fixes.** These have to be precise, or the differential harness will report false mismatches (§14.5).

| Topic | The interpreter's rule |
|---|---|
| `f32` arithmetic | IEEE single (the JS backend uses `Math.fround`) |
| Integer types | wrap on store |
| Integer division by zero | gives 0, with an R-warning in debug runs |
| `%` | follows JS (truncation); the GLSL emitter lowers it to match |
| Comparison against the GPU | the harness uses a tolerance, because GPUs don't promise IEEE results for transcendental functions |
| Array combinators | `map`, `filter` and the rest are inlined into loops |

**A listing**, as the agent sees it, keeps source lines, types and effects together:

```
kernel lab:lantern#fog  (p: Pixel) → f32     targets: js ok · glsl ok     effects: none
  uniforms  game.out.player: vec2@px ← signal · game.out.lamp: f32 ← signal
  49  const d: f32 = distance(p.xy, game.out.player) / 160
  50  const flicker: f32 = 0.04 * noise2(p.t * 3, 0)            → lab:lib/noise#noise2
  51  return 1 - smoothstep(0.05, 0.08 + game.out.lamp * 0.45 + flicker, d)
```

**A trace** steps one input through the kernel; the numbers are illustrative:

```
trace lab:lantern#fog  p.xy = (80, 64)  t = 2.5
  49  distance(p.xy, game.out.player) = 37.7   d = 0.2356
  50  noise2(7.5, 0) = 0.613                   flicker = 0.0245
  51  smoothstep(0.05, 0.4545, 0.2356) = 0.438  → 0.562
```

## Appendix C. The agent's interface

There is one `eval` tool over a lab API, which observation 3 and Jig both converged on. Results come back as compact YAML, as in Jig.

| Group | Calls |
|---|---|
| Files | `files.list() read(path, from?, to?) grep(re) edit(path, find, replace) write(path, src)` |
| Build | `run()`, `check()` (diagnostics), `fix(i)` |
| By address | `inspect(addr)`, `why(addr)` (which source line produced this value), `listing(addr)`, `trace(addr, input)`, `text(part)` |
| Params | `params()`, `setParam(id, v)` |
| Headless runs | `test({ seconds, inputs, seed })`, a fresh run under a virtual clock; `verify(addr)`, a differential run across backends |
| Book | `book.contents() chapter(n) search(text) open(addr)` |

Jig's largest failure class was unawaited promises (198 steps; its JIG-013 is named "reads are synchronous, effects are awaited"). So every call here is synchronous except `test` and `verify`, and the tool awaits a returned promise by itself.

## Appendix D. Evidence: what I verified, and the third party's reading of Jig

### Verified (read in code, or reproduced with the tools in Appendix E)

**Jig:**

- **The Part builder.** `Part._add` appends a frozen `{ type, id, auto, args, opts, at }` to a new frozen `Part`. The header says "Nothing is computed here" (`part.js`).
- **The expression language.** `expr.js` has `tokenize`, `parseExpr` (with a `Map` cache), `deps`, `evaluate` and `printExpr`, with dimensioned arithmetic through `Quantity` and `DimensionError`.
- **Params.** `params.js` resolves layered parameters as a DAG, with provenance (`src`, shadowed layers) and cycle paths (`param.cycle`).
- **The feature cache.** `compile.js` caches features by a per-feature hash (`featureCache`, bounded at 400 entries).
- **The live Program.** `program.js` builds a live `Program` "that answers why/param/ir/feature/faces/sketch/metric/find".
- **Guard proxies.** `guard.js` throws, at the read, a did-you-mean naming the members the namespace has.
- **The CAD package.** `cadpkg.js` defines `jig-cad-package` version 1, converting from mm and +Z up to metres and +Y up once, with content keys per body.
- **FEA.** `fea.js` names faces with the same selectors as the rest of Jig and solves with CalculiX.
- **The render bridge.** `jig-candela.js` addresses faces as `comp#face` and plays studies back from pose tables.
- **`j.field` is not implemented.** In `jigcad`, `j.field` throws "not supported by this kernel yet" (`j.js`).

**Candela:**

- `fx.ts` traces lambdas with symbolic proxies into a hash-consed, typed DAG with four evaluations (WGSL, JS, interval, print).
- It raises E201 and E202 for JS arithmetic or branching on symbols.
- It implements `select`. Nothing under `src/` implements a `loop` combinator, although the architecture page names `fx.loop` (I grepped the whole source tree).

**Jig's agent evaluation:**

- **The follow-up run** (JIG-013, 2026-11-02, 35 cases):

  | Model | Passed | Input tokens per case | Cached |
  |---|---|---|---|
  | glm-5.3-flash | 33/35 | about 119k | 90 % |
  | deepseek-4.1-flash | 31/35 | about 193k | 92 % |

  I read the input-token column as a per-case average.
- **The failure history** (517 runs): 16 % of steps failed, 73 % of failed steps were fixed in one step, and the classes are as quoted in §1.4.

**The DMG Workbench:**

- 22 presets, from 13 to 185 lines.
- Its IR is built after the fact: `makeIR` wires nodes with `scan(f.fn)` over `String(fn)` (`srcOf`).
- It runs program code with `new Function(NAMES.join(","), code + "//# sourceURL=game.js")` (line 1523), injecting the vocabulary as parameters, and it runs the agent's eval the same way (line 2900).

***Uncommon Math*:**

- 113 `exports.meta`, 111 `exports.draw`, 48 `exports.setup`.
- 2,098 `lab:` links in its prose.
- `new Function` three times.

So in-page evaluation, the mechanism this design relies on for running programs natively, is what real workbenches already do. I did not test it inside claude.ai myself.

**The construct census** is a regex screen with approximate counts (§3.3).

### Not verified (taken from the brief)

75 of 113 sketches pasting helpers; 51 GLSL listings; chapter sizes; 195 demos.

### Inferred

The biggest inferences in this document:

- the kit's cost (parser and typer at 3–5k lines; the whole kit at roughly 8–12k);
- that small models can edit kernels;
- that a one-step snapshot delay is invisible in practice;
- that frame tags catch most unit bugs;
- the exact wording and numbers in the diagnostics of §4.3.

### The third party's reading (brief §6), checked

| Claim | Verdict |
|---|---|
| "each call appends a feature record `{type, id, auto, args, opts, at}` to a new immutable Part"; "performs no geometry" | **verified** |
| A second IR for expressions with "tokenize, parse, deps, evaluate, print", cached ASTs, dimensioned arithmetic | **verified** |
| "content-addressed caching of feature results"; "compiler-as-a-service (retained, queryable Program objects)" | **verified** |
| "resource-oriented identity (stable feature, body and component ids)" | **verified** for features: an explicit `id`, or a generated `type + n` flagged `auto`. Persistent face names exist |
| "constraint programming (sketch solving)" | **consistent** (L3 reports degrees of freedom and conflicts); I did not read the solver |
| "multi-level compilation (features → parameters → constraints → topology → placement → meshes)" | **partly wrong.** `irText(P)` in `ir.js` builds all seven levels, L0–L6, from *one* compiled result. They are views that each answer a question (README §5), not representations lowered one into the next. This is a better idea than the reading credits it with, and I adopt it ("views, not levels") |
| "JavaScript is the metalanguage, Jig the object language" | a fair framing |

**Missing from the reading:**

- Jig already composes three domains: CAD, FEA and rendering through Candela.
- `import/jig/README.md` is an API spec ("examples only; there is no kernel"), while `import/jigcad` is the implementation, on OpenCascade.
- Candela, not Jig, is where Manuel captured runtime behavior, and it does so by tracing.

## Appendix E. Tools and figures

The scripts live in this job's scratch directory, `/Users/ben/.claude/jobs/3d093c96/tmp/`. They are not in the repository, because this pass was limited to writing one file; if these figures are to be re-run, the scripts belong in `scripts/`.

| Figure | Tool | Method |
|---|---|---|
| Token estimates | `node Cy9u98-tokens.mjs <files>` | Two estimators, reported as a range (min–max). A = characters ÷ 3.2. B = one token per 7 letters of each word, per 3 digits of each number, per punctuation mark and per newline, plus one per 8 spaces of indentation. Neither is a real tokenizer, so read them as ±25 % |
| The five kernel styles | `Cy9u98-k-{parsed,scalar,traced,string,glsl}.js` | the files the estimator ran on |
| Lantern, the cave dialect, the tables excerpt, the sales program, the noise library, DMG Snake | `Cy9u98-{lantern,cave,tables,tables-prog,noise,dmg-snake}.js` | the files the estimator ran on |
| Construct census | `node Cy9u98-constructs.mjs project/2026-11-23-dmg-workbench.html local/uncommon-math-0.1.0.html` | a regex screen over the 22 DMG presets and the 113 sketches; comments are stripped first |
| Preset list and preset source | `node Cy9u98-presets.mjs project/2026-11-23-dmg-workbench.html [id]` | — |
| Jig facts | the files named in Appendix D | from a shallow clone of `github.com/go-go-golems/jig` at HEAD on 2026-11-24, in `…/tmp/jig` |
