*2026-11-24. The fully blind consult: a separate `claude -p` run (Opus, effort xhigh; 20 min, 61 turns, $7.02) from a scratch folder outside the repo, given only the brief (paths rewritten to its `inputs/`), the survey, the prompts, the DMG Workbench, *Uncommon Math* and Jig. Saved here unchanged by the main thread. Its closing reply (summary, risks, questions, brief errors) is in the job note on Cy9u98.*

# The Workbench pipeline, from first principles

*A design written for Ben, 2026-11-24. Main text: about 25 minutes, much of it tables. Appendices hold the depth.*

**How to read the evidence tags.** **[read]** means I read it in Jig's code or in `inputs/`. **[ran]** means I measured it with a script over `inputs/` (I ran nothing from Jig). **[inferred]** means I reasoned it out and did not check it. Untagged statements in sections 2–6 are design proposals.

---

## 0. The recommendation on one page

**The headline answer.** The new world keeps the old world's semantics machinery and drops its machinery for scale and speed. These carry over:

- a small typed core calculus;
- staging, meaning binding times;
- one IR with many interpretations;
- names as identity, with provenance;
- declaratively defined dialects;
- legality per target;
- differential testing against a reference interpreter.

These are dead weight: SSA/CFG optimizers, separate compilation, incremental invalidation, lossless syntax trees and rich type systems. The new world needs three things the old world never had:

- a language definition small enough for a model to write in one sitting, from which every tool is derived;
- seams that are semantic (units, frames, identity, clock, stage) rather than ABI-level;
- a cost function, tokens-to-correct, that makes "one way to say each thing" and "errors fixed in one step" requirements on the compiler.

**Your suspicion holds, but it is missing its upstream half.** The hard problems do move to seams, legibility and verification. They start one step earlier, though: at *acquiring* behavior. All three systems I read fail at the same spot.

- The DMG Workbench scans lambda source with regular expressions, and its C emitter pastes lambdas in as comments [read].
- Candela traces per-pixel fields with proxies, but its per-frame `.behavior` lambdas are opaque JS [read].
- Jig hashes lambdas by their source text, so values they close over are not in the cache key [read].

The concept that ties seams, staging and "runtime values inside structure" (observation 8c) together is **binding time**.

**The pipeline.**

1. Programs stay JavaScript. The build stage is ordinary JS, run natively; fluent builders record a graph of domain nodes.
2. Every lambda that re-runs after the build (on a parameter change or every tick), or runs once per element (per cell, pixel or row), is written in **Kernel JS**. Kernel JS is a strict subset of JS syntax. The kit reads it with `String(fn)`, parses it, and resolves its free names against the module's top-level bindings. That recovers tracing's one advantage (helpers and constants just work) without tracing's costs: no method-chain arithmetic, no lost branches.
3. Kernel JS lowers into **one small typed core for behavior**, K-IR. Types in K-IR carry units, frames, storage widths and a binding-time stage; functions also carry a domain (once, per instance, per element).
4. K-IR is interpreted by a kit-owned reference interpreter, which fixes its meaning. It is compiled to JS closures by default, to GLSL/WGSL for per-pixel code, and to C for export.
5. *Structure* is not forced into that core. It lives in a **schema-typed program graph** whose node kinds come from each DSL's definition.

**Composition.** DSLs compose through typed **ports**. Anything crossing a port is one of about a dozen kit **seam types**, such as `Grid`, `Mesh`, `Signal`, `Field` and `Ids`. Each carries its unit, frame, identity space and clock. Code can cross a seam too: a `lib/` helper written once runs in JS at build time in one DSL and in GLSL per pixel in another. That alone removes the double-maintained shaders of observation 7.

**What a model writes to define a DSL.** A schema, about 700 tokens for a game DSL like DMG's. A reference runtime and a view, which I estimate at 6–12k tokens [inferred]. A book and presets. From the schema the kit derives the builder with did-you-mean, the checker, the generated reference, editor completions, the parameter panel, the IR text views and the agent's API help.

**What I would not build.** An optimizer beyond partial evaluation, tracing, a second string expression language, lossless syntax trees, a general type inference engine, an embedded JS engine, or LLVM.

**Top risks.**

1. Models may not stay inside Kernel JS cheaply.
2. The schema layer may distort domains more than it saves.
3. Seam types may not buy real leverage when programs compose.

Each has an experiment that takes a day or two (§7).

---

## 1. The answer to §1: what carries over, what doesn't, what is new

### 1.1 Testing the suspicion

| Claim in the brief | Verdict | Evidence |
|---|---|---|
| Hard problems move to **the seams** | **Holds**, and more broadly than stated | Jig's CAD-to-renderer seam is two hand-written files, about 45 KB (`cadpkg.js` 21 KB, `render/jig-candela.js` 24 KB) [read]. They handle every seam dimension at once: units and frame (mm with +Z up becomes metres with +Y up), vocabulary (engineering materials become appearance materials), identity (persistent face names) and time (study poses interpolated linearly and by quaternion). Observations 8a–8c show the same problems *inside* one DSL, between steps. A seam is any edge where a value changes owner, stage or frame, not only an edge between DSLs. |
| Hard problems move to **legibility to an agent** | **Holds, sharpened** | The cost that matters is tokens-to-correct. It is dominated by the number of ways to say something (8: "agents split between them, and the wrong one passed") and by whether one error leads to one fix. Jig's guard proxies (`j.fit.hol does not exist. Did you mean j.fit.hole?`) and Candela's coded errors with hints are already good [read]. Runtime state needs a text view as much as code does (observation 3; Jig's L0–L6 views each answer one question) [read]. |
| Hard problems move to **verification** | **Holds as a need, overstated as a promise** | We can check mechanically that backends agree with a reference, that declared laws hold on samples, and that replays are deterministic. We cannot check that a *model-written* reference runtime means what the user intended. That stays with examples, golden snapshots and review (§2.4). |
| Hard problems move **away from optimization** | **Mostly holds** | What remains of optimization is staging. That means folding build-time values, turning parameter-stage values into uniforms, and putting per-element code on the GPU. It is the same machinery as checking stages. The DMG C emitter already does it by hand, `#define` for folded parameters and a variable for live ones [read]. V8, GPU drivers and C compilers do the rest. We are what the survey calls a "sidekick" producer (§18.7). |
| *Missing:* **acquiring behavior** | **The upstream hard problem** | All three systems fail at runtime lambdas, as listed in §0. The survey anticipates this: "How a computation is acquired can be as difficult as optimizing it" (§40.3). |
| *Missing:* **binding time** as the unifying concept | **The single most useful old idea here** | These are all one concept: observation 8c (`.limit($.topN)` had three invented forms); DMG's build-time versus runtime lambdas; Jig's staging table (known and pure / unknown but finite / unknown and continuous / effects, in its README §6) [read]; CDK tokens; Pulumi `Output<T>` (§29.3, §29.5). |

### 1.2 Old world → new world

| Old-world idea (survey) | Verdict | Why, at this scale |
|---|---|---|
| Typed functional core calculus (§9.5, §47.3) | **Carry over**, for behavior only | One small first-order core with structured control is enough. It lets every check and backend read the same thing. |
| Staging and partial evaluation (§6.3, §19.8, §29.3) | **Carry over, central** | Binding time becomes part of every type. It explains when a parameter forces a rebuild, what becomes a uniform, and what can cross which seam. |
| One IR, many interpretations: tagless-final's idea (§19.9, §28.1) | **Carry over as folds over an explicit IR** | This is the survey's own hybrid: an initial encoding, interpreted many ways. Candela's `fx` already does it: "one DAG, four evaluations" (WGSL, CPU JS, interval bounds, printing) [read]. As a user-facing API in JS it costs too many tokens. |
| Hash-consed DAGs and content addressing (§10.1, §34.1) | **Carry over** | Gives cheap sharing, cache keys and diffing. Jig chains feature keys over canonical arguments [read]. |
| Declarative IR definition: ODS and IRDL (§18.5) | **Carry over, as the DSL definition format** | This is how a model "makes a new DSL". It writes the schema, and the kit derives everything else. |
| Dialects coexisting, interfaces and traits (§18.2, §18.4) | **Carry over, small** | A composed program is one module with several dialects. Generic checks go through capabilities such as `hasUnits`, `pure`, `stage` and `owns`, never through closed enumerations of kinds. |
| Legalization and dialect conversion (§21.6) | **Carry over** | Backends state which K-IR operations are legal on them. This yields precise errors such as "template strings are not available in `glow.light` (compiles to GLSL)". |
| Algorithm versus schedule: Halide (§28.4) | **Carry over as form versus function** | What the program does, how it looks (views and look files), and how it runs (target, resolution, sample count) are three separable parts. |
| Names as identity, provenance (§13.3, §36, §29.7) | **Carry over, central** | Identity at seams is a name, never an index. Every node and every K-IR operation maps back to `file:line:col`. |
| Dynamic verifiers rather than intrinsic typing (§15.4) | **Carry over** | JS has no GADTs. Smart constructors catch local mistakes; a verifier checks global invariants. |
| Differential testing and translation validation (§33.5) | **Carry over, cheaply** | Each build compares each backend with the reference interpreter on sampled inputs. |
| Laws with justifications (Jig README §8) [read] | **Carry over** | A law must say what it pays for. Only declared laws are run. |
| Attribute grammars, demand-driven types (§6.4, §25) | **Carry over in miniature** | A node's output type is computed when asked for and memoized. That solves 8a (types flow between steps) and 8b (a step reads another step's type). |
| SSA, CFG, phi, dominance, register allocation (§8–9, §42) | **Dead weight** | We emit high-level code to targets that already optimize it. Keep structured `if` and bounded `for` regions, in the spirit of RVSDG (§10.4), and never a CFG. |
| Sea of Nodes (§10.3), e-graphs (§12), polyhedral (§11) | **Dead weight for now** | V8's lesson applies (§10.3). Smart-constructor simplification is enough. |
| Separate compilation, linkers, module graphs (§26.6) | **Dead weight** | A handful of files. Whole-program compilation every keystroke takes milliseconds [inferred]. |
| Pass managers with analysis invalidation (§21.7), Salsa (§25) | **Dead weight** | Recompute everything except expensive domain results (B-rep, FEA, BVH), which are cached by content key. |
| Lossless and red-green syntax trees (§7.3) | **Dead weight** | Agents edit by find and replace (Jig's `files.edit`) [read]. People need highlighting, not refactoring at scale. |
| Rich type systems: polymorphism, classes, dependent types (§15) | **Dead weight** | Monomorphic types plus units, frames, record and row types, nullable types with narrowing, and specialization at call sites. Inference flows forward only, with no unification across the program. |
| Stable public interchange IRs (§35.1) | **Mostly dead weight** | Version the *kit*, not the IR. The one stable public thing is the set of seam types. |

### 1.3 What the new world needs that the old world never solved

1. **The language definition is the main artifact a model writes.** Language workbenches such as Spoofax, MPS and Rascal assumed human language engineers working for weeks. Here a model writes a DSL in one session, so the definition must be a small schema from which the builder, checker, reference, completions, parameter panel and agent help are all *derived*.
2. **Orthogonality enforced by the checker.** Old languages accumulate synonyms. Model-written code splits across them, and the wrong one often passes (observation 8). Every concept gets exactly one spelling, and near-misses are rejected with a fixit that rewrites them to it.
3. **Semantic seams.** The old world's seams were ABIs: calling conventions and layouts. The new world's seams are millimetres versus metres, Z-up versus Y-up, per-frame versus per-pixel, and a persistent face name versus an index.
4. **Runtime legibility.** Text renderings of screen and state (observation 3), `why(x)` provenance, and line-by-line explain traces of a single behavior call.
5. **Docs that compile.** A generated reference, plus a book whose code blocks and `lab:` links are checked on every build.
6. **Usable by small models.** A finished workbench must be operable by a 1–8B model. That means a generated reference of 2–3k tokens, nearby presets as examples, slot-sized tasks, and errors that fix in one step.

### 1.4 How ambitious can it get?

Four things bound ambition [inferred]:

1. the tokens a frontier model can write coherently for one DSL (schema, runtime and view; I estimate 10–25k);
2. the cost of debugging across seams;
3. browser compute (JS and WebGL2 as the baseline; WebGPU is unverified in artifacts);
4. the 16 MiB limit.

The kit absorbs the generic shell. In the DMG Workbench that shell is about half the file: the UI is 99.6 KB, the agent 38 KB and the CSS 44 KB, against 78.6 KB of DSL engine and 85 KB of presets [ran]. The kit also absorbs about two-thirds of the DSL engine (builders, compile and lint scaffolding, the IR and the C emitter) [ran: section sizes]. With seam machinery on top, I expect **3–4 composed DSLs, with programs of 50–300 lines each**, to fit in one frontier session. Examples would be a procedurally generated roguelike with GPU lighting and a dialog DSL, or a parametric part with FEA and a path-traced render. Jig shows the second composition already exists, with hand-written seams [read]. The ceiling is set by the cost of debugging across seams, not by expressiveness. That is why seam types and text views get so much of this design.

---

## 2. The pipeline

### 2.1 Representations

```
R0 Package          files the model wrote: workbench.json · dsl/ · programs/ · lib/ · book/
 │  load            kit module loader, in a Worker; programs run as plain JS (the build stage)
R1 Recorded graph   builder records {kind, id, slots, at} + raw lambdas + a snapshot of top-level bindings
 │  capture         String(fn) → Kernel JS parser; free names resolved against the snapshot
R2 Kernel AST       one per parsed lambda and per lib/ function, with exact file ranges
 │  elaborate       schema check · refs by id · forward type flow · units and frames · stage
 │                  inference · seam check · DSL lints → diagnostics with fixits
R3 Checked program  program graph (schema-typed nodes, ports, seams) + typed, staged K-IR  ◄ static meaning fixed
 │  lower           K-IR → JS closures (default) | GLSL/WGSL (per-element on GPU) | C (export)
 │                  the DSL runtime builds domain plans (tile atlas, BVH, B-rep…), cached by content key
R4 Plans
 │  run             the DSL runtime advances its clock; compiled behaviors read and write typed state
R5 State            typed buffers per kind · clocks · event queue; deterministic; snapshot and replay
 │  render
R6 Views            pixels (the DSL's view) · text (the DSL's text view, IR levels, seam table, explain)

Cross-cutting: provenance, content keys, diagnostics, the K-IR reference interpreter, the verification harness
```

| Representation | Produced by | Consumed by | Identity | Text view for agents |
|---|---|---|---|---|
| R0 Package | frontier or small model; the person | kit loader | file path | the files themselves |
| R1 Recorded graph | program code running under the generated builders | capture, elaborate | id given by the author, else derived from path (flagged when referenced across a seam) | `ir.text('source')` |
| R2 Kernel AST | Kernel JS parser | elaborator | file range | (internal) |
| R3 Checked program | elaborator | lowerers, lab API, agent | node id; K-IR value ids | `ir.text('graph' \| 'types' \| 'stages' \| 'seams' \| 'kir', {node})` |
| R4 Plans | kit backends; DSL runtime `build()` | DSL runtime `step()` and views | content key | `ir.text('plans')`, cache report |
| R5 State | DSL runtime | views, lab API | (node id, instance, field) | `state.table(kind)` |
| R6 Views | DSL views; kit | the person; agent | — | `screen.text()`, `explain(fn, at)` |

### 2.2 Where meaning is fixed

- **Static meaning** is fixed at R3: what the program says. That covers its types, stages and seams, which code runs on which target, and which parameters force a rebuild.
- **Dynamic meaning of behavior** is fixed by the K-IR **reference interpreter**. It is owned by the kit, versioned and tested once for every workbench. It is a slow tree-walker that can step.
- **Dynamic meaning of domain kinds**, such as what a `Tile` or a fillet *does*, is fixed by the DSL's **reference runtime**, which the model writes.
- Every fast path is a refinement checked against one of those two: compiled JS, GLSL, C, or a GPU renderer beside a CPU one.

### 2.3 Seven rules a model learns once

1. **One way to say each thing.** The checker rejects near-misses with a fixit to the canonical form. For example, it rewrites `.limit(() => topN)` to `.limit(topN)`.
2. **Once-per-build code is JS; everything else is Kernel JS.** Code that runs once, or once per instance, at build time is unrestricted and runs natively. Code that re-runs on a parameter change or every tick, or runs per element (cell, pixel, row), is parsed.
3. **Behavior is closed.** A late lambda sees its parameters, top-level constants, parameters, helpers and the standard library. It sees nothing else. Data that varies per instance goes into state, not closures. This is Reynolds' defunctionalization (§5.6), done by the author and enforced by the checker.
4. **Values crossing a seam are seam types**, which carry unit, frame, identity space and clock.
5. **Identity is a name, never an index.**
6. **Every representation has a text view sized for a model.**
7. **Meaning lives in reference interpreters.** Fast paths must agree with them.

### 2.4 Verification (G-verify)

The harness runs on every build within a time budget of about 50 ms [inferred as feasible].

1. **Backends against the reference.** Each compiled K-IR function runs on sampled inputs, drawn from declared types and ranges and from states recorded in the last run. Results must match the reference interpreter: exactly for integers and booleans, within a declared tolerance for floats. GPU code is checked by rendering an 8×8 tile and reading the pixels back.
2. **Replay.** Recorded inputs give the same state hash. Nondeterminism (`Math.random`, wall-clock time) is rejected at parse time, as DMG's lints already intend [read].
3. **Declared laws.** Generators are derived from types; Jig's `justifies` rule applies.
4. **Golden text snapshots.** Each preset's text view after N ticks of fixed input is stored. When *the DSL* changes, the presets become its regression suite, and the language diff shows which ones moved.
5. **Seam range checks.** Declared ranges are sampled at run time, and a warning names both sides of the seam.

What this does *not* establish is that the DSL's reference runtime matches what the author meant. I would say so in the UI.

---

## 3. How behavior is captured

### 3.1 The options compared

| | **Parse source** (Kernel JS via `String(fn)`) | **Trace / symbolic proxies** (Candela `fx`) | **String expression language** (Jig `expr`) | **Staging** (LMS `Rep[T]`) | **Tagless-final** | **Tagged-template quotation** |
|---|---|---|---|---|---|---|
| Branch or loop on runtime values | yes | no: `fx.select` instead; `if` raises E202 [read] | no (expressions only) | in JS, becomes tracing | via combinators | yes |
| Natural operators, `a*b+c` on vectors and units | **yes**: the checker types them | no: `a.mul(b).add(c)`; `a*b` raises E201 [read] | scalars and units, yes | no | no | yes |
| Mutating declared state (`self.hit -= 1`) | yes | no: `-=` forces toPrimitive [inferred from fx's proxy handler] | no | — | — | yes |
| Helpers and constants it closes over | resolved from the module snapshot; closures over build-time locals rejected with a fixit | free: values at trace time | names only | free | free | `${}` interpolation |
| Error location | exact range (we parse) | line, from the stack | column inside the string | stack | stack | inside the template |
| Editor highlighting and TS types | yes | yes | no (strings) | yes | yes | no |
| Kit cost | parser, resolver, typer: about 3–4k lines [inferred] | about 1k-line proxy layer | small parser | — | — | parser |
| Reaches GLSL and C | all targets | GLSL; C loses state and control | constants only | — | — | all |
| Tokens per behavior | lowest | about 1.5–2× [inferred from G-02 preset] | lowest for one-liners | high | high | low, plus escaping |
| How an agent fails | writes outside the subset; a fixit says what to write | writes `a*b` or `if`; E201 or E202 | forgets quotes; mixes two syntaxes | — | — | escaping |

### 3.2 The decision

**Parse.** Every slot whose lambda re-runs after the build, or runs per element, takes a lambda written in Kernel JS. The kit reads it with `String(fn)` and parses it. `Function.prototype.toString` returns the exact source text for functions written in source in all modern engines; ES2019 standardized this [inferred from the spec, not tested here]. The file position comes from the builder's call site, the way Jig's `callsite.js` gets lines [read], plus a search for the exact source slice near that line.

**Resolve free names against the module, not the closure.** The kit's loader already rewrites `import` and `export` at the top level, as Candela's own module loader and Jig's script runner do [read]. It appends an epilogue that returns `{ __scope: { …every top-level binding… } }`. A free name in a late lambda then resolves as follows:

- **a parameter handle** becomes a parameter-stage input;
- **plain data** becomes a deep-frozen constant, content-hashed, which closes the gap in Jig's cache key;
- **a function** is parsed as a K-IR helper, recursively, and must itself be Kernel JS;
- **a DSL handle** becomes a reference by id;
- **anything else**, or a name bound only inside a build-time function, is an error with a fixit.

This recovers the main thing tracing gives you: helpers and constants just work. It keeps natural operators and real control flow.

**Infer stages; don't declare them.** A lambda's stage is the latest stage of anything it reads: constant < build < parameter < tick. Each DSL names its own tick clock; `tiles` calls it `frame`. The slot sets the ceiling. Stage is separate from **domain**: once, per instance, or per element (cell, pixel, row). The domain decides the target and the inputs (`px`, `c`, `r`); the stage decides what the lambda may read and when it re-runs. `cave.fill` runs per cell with a parameter ceiling; `glow.light` runs per pixel at the tick stage. This replaces DMG's `.live` flag on parameters [read] with a derived fact. If a parameter is read only by parameter-stage code or later, it is live and becomes a uniform. If build code reads it, changing it triggers a rebuild, which is cached by content key. The IR view shows which is which, for example "`linger`: folded at build (read by `mole.init`)".

**One syntax for every late value.** Jig's string expressions (`'w - 2 * wall'`) earn their place: they are relations tracked by dependency and checked for units, not dead numbers [read]. But they are a second syntax beside JS. A parameter-stage arrow function (`() => w - 2 * wall`) gives the same properties because we parse it: dependencies, units, provenance. A bare parameter handle is passed directly (`.limit(topN)`). Observation 8c gets one form.

**Kernel JS is JS-shaped, not JS-meaning.** Because the checker knows types, `p * 6` on a `vec3`, `self.at + vec2(dx, dy)` and `3 * mm` mean what GLSL and physics mean, and a `u8` state field wraps when written. Kernel JS never runs natively; it always runs through the kit's compilers. The subset leaves out the places where JS semantics would surprise: `==`, string `+` with numbers, object truthiness, `this`, getters, `async`. Build-time kit values such as `vec3` throw a clear error on `Symbol.toPrimitive`, as Candela does [read], so `a + b` on vectors in plain build code fails loudly instead of concatenating strings.

**Evidence that the subset is reachable.** I scanned the runtime lambdas of DMG's 22 presets, 113 lambdas in `onFrame`, `method`, `draw`, `on`, `hud`, `init` and `timer`, with brace matching and regular expressions [ran; approximate]:

- **About four in five (92)** use only parameters, locals, arithmetic, `if`, ternaries and `for`.
- **About one in ten (10–13, depending on the detector)** reach top-level helpers or constants, such as Snake's `placeFood`, Breakout's `isBrick`, Life's `ROWS`/`COLS`. These cluster in the more complex games, so module resolution is mandatory.
- **Nine** contain nested closures and **eight** call array methods with callbacks (`forEach`, `map`, `filter`). Kernel JS should accept callbacks to array methods over fixed-size arrays and lower them to loops.
- **Up to twelve** destructure, about half of them in their parameters. **Three** push onto or splice arrays, which means state needs a bounded `list<T, N>`. **One** uses `while`, which is legal on CPU targets under a step budget.

Candela points the same way [read]. Its traced `fx` covers per-pixel fields well (preset G-02). Its per-frame `.behavior((self, {t, dt}) => { self.position.y = … })` (preset W-01) is opaque JS, because tracing cannot express it.

**What I would keep from the other options.**

- *Staging*, as the stage lattice and as partial evaluation.
- *Tagless-final*, as "one K-IR, many interpreters": reference, JS, GLSL, WGSL, C, intervals, print, explain.
- *Jig's expression language*, as a property (dependency-tracked relations with units) rather than a syntax.
- *Tracing*: nothing in v1. I would revisit it only if the risk-1 experiment (§7) shows models can't hold the subset for per-pixel code.

### 3.3 How a behavior reads at each level

Source, in `programs/diver.js`:

```js
.update((self, w, pad) => {
  const next = self.at + vec2(pad.dx, pad.dy) * 0.12;
  if (!w.solid(next)) self.at = next;
  if (w.every(seconds(1)) && self.air > 0) self.air -= 1;
})
```

`ir.text('kir', 'diver.update')`, the text view an agent reads:

```
fn diver.update(self: Diver, w: World, pad: Pad)  stage=tick(60 Hz)  writes={self.at, self.air}
  let next: vec2@cell = add(self.at, mul(vec2(i2f(pad.dx), i2f(pad.dy)), 0.12))    ; diver.js:22
  if not(w.solid(next)):                                                         ; :23
    set self.at = next
  if and(w.every(1 s), gt(self.air, 0)):                                         ; :24
    set self.air = sub(self.air, 1)                    ; u8: wraps on write
```

`explain('diver.update', { tick: 120 })` gives each line with its values. The reference interpreter produces it, which is how an agent answers "why didn't the diver move?".

---

## 4. How DSLs compose: a worked example

**The program.** *Cave Diver.* Levels come from a procedural-generation DSL (`cave`). Play happens in a tile game DSL (`tiles`, the DSL defined in §5). A per-pixel lighting DSL (`glow`, compiled to GLSL ES 3.0) adds a lantern and water shimmer. One noise helper is shared by `cave` at build time and by `glow` per pixel. This is §1's "levels from a procedural-generation DSL, effects as shaders". It stresses all four seam dimensions: values, types, identity and time.

### 4.1 What the model writes

The helper library is Kernel JS from top to bottom (`'use kernel'`):

```js
// lib/noise.js
'use kernel';
export function hash2(p) {
  const q = fract(p * vec2(0.1031, 0.1030));
  const r = q + dot(q, q.yx + 33.33);
  return fract((r.x + r.y) * r.x);
}
export function noise2(p) {
  const i = floor(p), f = fract(p), u = f * f * (3 - 2 * f);
  return mix(mix(hash2(i), hash2(i + vec2(1, 0)), u.x),
             mix(hash2(i + vec2(0, 1)), hash2(i + vec2(1, 1)), u.x), u.y);
}
export function fbm(p, octaves = 4) {
  let sum = 0, amp = 0.5;
  for (let k = 0; k < octaves; k++) { sum += amp * noise2(p); p = p * 2.03; amp *= 0.5; }
  return sum;
}
```

The program, about 535–600 tokens [ran: 1,925 characters at 3.2–3.6 characters per token]:

```js
// programs/diver.js: a cave dive. Levels from `cave`, play in `tiles`, light in `glow`.
import { param, seconds } from 'kit';
import { cave } from 'cave';
import { game, actor, tile, art, t } from 'tiles';
import { glow } from 'glow';
import { fbm } from '../lib/noise.js';      // Kernel JS: compiled to JS for cave, to GLSL for glow

const seed = param.int(7).range(1, 999).label('Seed');
const rock = param.num(0.48).range(0.35, 0.6).label('Rock');

const level = cave('level').size([64, 48]).seed(seed)
  .fill(c => fbm(c * 0.11) < rock ? 'rock' : c.y > 40 ? 'water' : 'open')
  .smooth(4)
  .rooms({ min: 12 })
  .spawn('diver', { room: 'largest' })
  .spawn('pearl', { count: 6, room: 'farthest' });

const diver = actor('diver').sprite({ swim: art.file('diver.png') })
  .at(() => level.spawn('diver'))
  .state({ air: t.u8.init(100) })
  .update((self, w, pad) => {
    const next = self.at + vec2(pad.dx, pad.dy) * 0.12;
    if (!w.solid(next)) self.at = next;
    if (w.every(seconds(1)) && self.air > 0) self.air -= 1;
  });

const pearl = actor('pearl').count(6).sprite({ shine: art.file('pearl.png') })
  .at(i => level.spawn('pearl', i))
  .state({ taken: t.bool })
  .update((self, w) => {
    if (!self.taken && distance(self.at, diver.at) < 0.5) { self.taken = true; w.state.score += 1; }
  })
  .draw(self => self.taken ? null : 'shine');

const dive = game('dive').size([20, 15])
  .tiles({ wall: tile(art.file('rock.png')).solid(), floor: tile(art.file('sand.png')),
           pool: tile(art.file('water.png')) })
  .map(level.grid.as({ rock: 'wall', open: 'floor', water: 'pool' }))
  .actors(diver, pearl)
  .camera(w => diver.at);

export default glow(dive)
  .light(px => {
    const lamp = smoothstep(7, 1, distance(px.world, diver.pos)) * (diver.air / 100);
    const wave = px.tile === 'pool' ? 0.15 * fbm(px.world * 0.7 + vec2(0, px.time)) : 0;
    return px.color * (0.08 + lamp) + wave;
  });
```

### 4.2 What crosses each seam

`ir.text('seams')`:

| # | Seam | From → to | Seam type | Clock / stage | Conversion | Identity |
|---|---|---|---|---|---|---|
| ① | `level.spawn('diver')` → `diver.at` | cave → tiles | `Cell@cell` (int vec2) | parameter → build | int→num, cell centre | spawn name, plus index for `pearl` |
| ② | `level.grid` → `dive.map` | cave → tiles | `Grid<{rock,open,water}>@cell`, 64×48 → `Grid<Tile>` | parameter → build; content-keyed, so the same seed means no rebuild | **vocabulary map** `.as({…})`; frames **unified** (tiles' `cell` becomes cave's `cell`) | coordinates |
| ③ | `dive` → `glow` | tiles → glow | `Image@px` + the camera edge `cell→px` + `map` as an R8 texture | tick → texture and uniforms | enum → index | — |
| ④ | `diver.pos` | tiles → glow | `Signal<vec2@cell>` | tick (60 Hz) → per display frame, `between: 'lerp'` | none | actor `diver`, single instance |
| ⑤ | `diver.air` | tiles → glow | `Signal<u8>` | tick → uniform | u8 → float, lossless | read-only: tiles owns it |
| ⑥ | `fbm` | lib → cave, glow | `fn(vec2) → num` (code) | per cell at build in cave; per pixel each tick in glow | **compiled twice**: JS and GLSL | the function's content key |

The rules behind the table:

- **Frames.** The kit keeps a small graph of frames, with affine edges known at some stage. Binding a grid as a map unifies the two frames. `glow` receives the camera edge from `dive` and so derives `px.world`. Jig's mm/+Z → m/+Y conversion is one edge of exactly this kind, written by hand today [read].
- **Clocks.** A consumer slower than its producer must say how it samples (`latest`, `lerp`, `integrate`). A faster consumer holds the last value implicitly. Jig's study poses interpolated between rows are the hand-written form of `between: 'lerp'` [read].
- **Ownership.** One writer per state field. Other DSLs read it as a `Signal`.
- **Cardinality.** A handle with `count > 1` cannot be used where one value is expected.
- **Code crossing a seam** works because K-IR is shared. The harness checks `fbm` in JS against `fbm` in GLSL on an 8×8 sample. This is observation 7 solved structurally, not by discipline.

### 4.3 What an error at a seam reads like

Every seam error names both sides, its code, and a fix that can be applied mechanically. Each also has a one-line form for the agent's context block.

```
error E-FRAME  programs/diver.js:44:35  [glow.light ← tiles.diver.pos]
  distance(px.uv, diver.pos): px.uv is vec2@screen (0..1) but diver.pos is vec2@cell.
  diver.pos is port `pos` of actor 'diver' (tiles), programs/diver.js:18.
  fix  distance(px.world, diver.pos)          px.world is this pixel in cells
```

```
error E-STAGE  programs/diver.js:12:3  [cave.fill ← tiles.diver.air]
  .fill runs once per build (ceiling: parameter); it reads diver.air, which changes every tick.
  A cave cannot change while it is being played. Read a parameter, or move this into the game.
```

```
error E-VOCAB  programs/diver.js:38:3  [cave.grid → tiles.map]
  level.grid has cells rock | open | water; the map has tiles wall | floor | pool.
  'water' has no tile.  fix  .as({ rock: 'wall', open: 'floor', water: 'pool' })
```

```
error E-CARD  programs/diver.js:44:54  [glow.light ← tiles.pearl.pos]
  pearl is 6 actors; a per-pixel light needs one position.
  fix  pearl.nearest(px.world).pos     or loop: for (const p of pearl) …  (6, unrolled on GPU)
```

```
error E-TARGET  programs/diver.js:45:20  [glow.light → GLSL ES 3.0]
  template string `${…}` is not available on the GPU. glow.light compiles to a fragment shader.
```

### 4.4 The same machinery applied to CAD, FEA and rendering

Jig already composes CAD, FEA through CalculiX, and Candela rendering [read]. Under this design:

- the CAD package becomes `Mesh@cad` with `Ids<'face'>` (persistent names) and a frame edge `cad(mm, +Z up) → render(m, +Y up)`, declared once;
- the material table becomes a vocabulary map at the seam;
- study poses become `Signal<Pose>` with `between: 'slerp'`;
- FEA results become a `Field<point@cad → stress(MPa)>`, which a Kernel JS colormap lambda in the renderer turns into colour.

I expect the 45 KB of hand-written seam code to become about 30 lines of declarations plus the kit's generic machinery [inferred].

---

## 5. What a model writes

### 5.1 Defining a new DSL

A **schema** is about 680–760 tokens [ran: 2,445 characters]. This is the `tiles` DSL used above.

```js
// dsl/tiles.js: a DSL for grid games. The schema; the meaning is in tiles.runtime.js.
import { defineDSL, t } from 'kit';

export default defineDSL({
  name: 'tiles', version: '0.1.0',
  about: 'Grid games: a tile map, actors with typed state, per-frame rules, a HUD.',
  clock: { frame: 60 },
  frames: { cell: 'world grid; 1 = one tile', px: 'screen; 16 px = 1 cell' },
  kinds: {
    Game: {
      root: true,
      slots: {
        size:  t.vec2(t.int).of('cell').default([20, 18]),
        map:   t.grid(t.ref('Tile')).of('cell').stage('param'),
        rules: t.fn('frame', { w: 'World' }).many(),
        hud:   t.fn('frame', { w: 'World', out: 'Hud' }).many(),
        camera: t.vec2(t.num).of('cell').stage('frame').default('center'),
      },
      children: { actors: t.list(t.ref('Actor')), tiles: t.dict(t.ref('Tile')) },
      state: { score: t.u16, over: t.bool },
      ports: { out: { map: t.grid(t.ref('Tile')).of('cell'), frame: t.image('px') } },
    },
    Tile: { slots: { art: t.art(16, 16), solid: t.bool.default(false) } },
    Actor: {
      id: 'name',
      slots: {
        sprite: t.dict(t.art(16, 16)),
        count:  t.int.default(1).range(1, 64),
        at:     t.fn('build', { i: t.int }, t.vec2(t.num).of('cell')),
        state:  t.state(),
        update: t.fn('frame', { self: 'state', w: 'World', pad: 'Pad' }),
        on:     t.handlers('frame', { self: 'state', w: 'World' }),
        draw:   t.fn('frame', { self: 'state' }, t.str.nullable()),
      },
      ports: { out: { pos: t.signal(t.vec2(t.num).of('cell'), { between: 'lerp' }) } },
    },
  },
  scope: {
    World: {
      frame: t.u32, state: 'Game.state',
      solid: t.sig([t.vec2(t.num).of('cell')], t.bool),
      rand:  t.sig([t.int], t.int),
      every: t.sig([t.time], t.bool),
      frames: t.sig([t.time], t.int),
      emit:  t.effect([t.str, t.any]),
    },
    Pad: { dx: t.i8, dy: t.i8, pressed: t.sig([t.enum('A', 'B', 'Start')], t.bool) },
  },
  lints: {
    'tiles.sprites': p => p.sum('Actor', a => a.count) <= 40 || 'more than 40 sprites: the screen flickers',
  },
  forbid: { 'Math.random': 'w.rand(n): replays and the bot must be deterministic' },
  laws: {
    replay: { gen: 'pad(600)', prop: (run, pad) => run(pad).hash === run(pad).hash,
              justifies: 'rewind, the bot, golden tests' },
  },
  runtime: './tiles.runtime.js',
  views: { screen: './tiles.view.js', text: './tiles.view.js#text' },
});
```

Every slot also accepts a lambda that computes its value at an allowed stage. That is Jig's four-way slot discipline [read], reduced to value or lambda.

A **reference runtime** gives the meaning of each kind, in plain JS:

```js
// dsl/tiles.runtime.js (shape only)
export function build(prog, kit) {            // prog: the checked program; behaviors arrive compiled
  return { game: prog.root, actors: kit.instances(prog.all('Actor')), map: kit.grid(prog.root.map) };
}
export function step(S, pad, kit) {           // one tick; writes go through typed state buffers
  for (const a of S.actors) a.update(a.state, S.world, pad);
  for (const r of S.game.rules) r(S.world);
  kit.dispatch(S);                            // queued emits → on(...) handlers
}
```

A **view** (canvas or WebGL) and a **`text(state)`** view complete the definition. The text view renders the screen as characters plus a state table, for agents.

**Cost estimate [inferred].** The runtime, view and text view together come to 6–12k tokens. DMG's own runtime, art and font sections total about 27 KB (≈7.5k tokens). Its builders, compile scaffolding, IR, C emitter, diagnostics and parameter code total about 51 KB [ran: section sizes]. Under this design the kit owns that second group, except for budget rules specific to the domain. On top of the runtime, a DSL needs 5–20 presets (programs) and an optional book.

**What the kit derives from the schema:**

- the fluent builder, with guarded did-you-mean;
- the checker;
- `.d.ts` files, for agents that have Node and for editor completions;
- a compact **generated reference**, about 1.5–3k tokens per DSL [inferred];
- the parameter panel;
- the IR text views;
- the agent's `help(x)`;
- a JSON description of every slot, for small models doing structured edits.

Observation 8 is handled by the schema's optional per-kind `type` rule. It computes a node's output type when asked, which gives types flowing between steps and joins that see the other table. Appendix G shows it on the data-tools DSL.

### 5.2 Writing a program in the DSL

The whack-a-mole program is about 510–580 tokens [ran: 1,848 characters]. For comparison, DMG's whack-a-mole preset is 5,300 characters [ran], but most of that difference is inline ASCII sprites, which live in files here.

```js
// programs/whack.js: whack-a-mole. D-pad moves the hammer, A whacks.
import { game, actor, tile, art, param, t } from 'tiles';

const linger = param.time(1.5).range(0.5, 4).label('Mole stays');
const spawn  = param.time(0.75).range(0.25, 1.5).label('Spawn every');
const HOLES  = [[4, 6], [10, 6], [16, 6], [4, 10], [10, 10], [16, 10], [4, 14], [10, 14], [16, 14]];

const hammer = actor('hammer')
  .sprite({ idle: art.file('hammer.png'), smash: art.file('hammer-smash.png') })
  .state({ hole: t.u8.init(4), hit: t.u8 })
  .at(() => HOLES[4])
  .update((self, w, pad) => {
    if (pad.dx || pad.dy) self.hole = clamp(self.hole + pad.dx + 3 * pad.dy, 0, 8);
    self.at = HOLES[self.hole] + vec2(0, -1);
    if (self.hit > 0) self.hit -= 1;
    if (pad.pressed('A') && self.hit === 0) { self.hit = 8; w.emit('whack', self.hole); }
  })
  .draw(self => self.hit > 3 ? 'smash' : 'idle');

const mole = actor('mole').count(9)
  .sprite({ up: art.file('mole.png'), bonk: art.file('mole-bonk.png') })
  .state({ up: t.bool, ttl: t.u16, bonk: t.u8 })
  .at(i => HOLES[i])
  .update((self, w) => {
    if (self.bonk > 0) self.bonk -= 1;
    if (self.up && --self.ttl === 0) { self.up = false; w.emit('escaped', self.index); }
  })
  .on('whack', (self, w, hole) => {
    if (self.up && self.index === hole) { self.up = false; self.bonk = 24; w.state.score += 10; }
  })
  .draw(self => self.bonk > 0 ? 'bonk' : self.up ? 'up' : null);

export default game('whack')
  .tiles({ grass: tile(art.file('grass.png')), hole: tile(art.file('hole.png')) })
  .map(g => g.fill('grass').put(HOLES, 'hole'))
  .actors(hammer, mole)
  .rules(w => {
    if (w.every(spawn)) {
      const m = mole.instance(w.rand(9));
      if (!m.up && m.bonk === 0) { m.up = true; m.ttl = w.frames(linger); }
    }
  })
  .hud((w, out) => out.text(1, 1, `SCORE ${w.state.score}`));
```

Notes on the program:

- `HOLES` and the parameters are reached by their JS names inside behaviors. There are no `w.param('time')` string lookups (DMG uses those [read]), and a typo gets a did-you-mean drawn from the module's names.
- `.map(g => …)` is build-stage JS.
- `--self.ttl === 0` stays inside the subset.
- The HUD's template string is legal because `hud` runs on the CPU. The C backend lowers it to a formatted print.

### 5.3 Reading costs: progressive disclosure (G-agent)

| Reader | Reads | Tokens [inferred] |
|---|---|---|
| Frontier model making a DSL | entry doc `WORKBENCH.md` → meta-reference (`defineDSL`, `t.*`, the Kernel JS subset, seam types, error codes) → one example DSL | about 1k + 5k + 6–8k |
| Model writing programs in a finished DSL | user entry doc → generated DSL reference → 2 presets chosen by the kit | about 0.5k + 2–3k + 1–2k |
| Small local model | the same, plus slot-sized tasks: "write `mole.update`; in scope: self{up,ttl,bonk}, w{…}" | about 3–5k |

---

## 6. What I would not build, and what would change my mind

| Not building | Why | What would change my mind |
|---|---|---|
| An optimizer beyond partial evaluation and constant folding | Downstream compilers optimize; staging captures the large wins | Profiles showing per-element code bound by redundant work the GPU compiler misses |
| Tracing as a second capture path | Two ways to write behavior splits models (observation 8); parsing covers the cases | Risk-1 experiment: models fail Kernel JS on per-pixel code far more than on per-tick code |
| A string expression language next to JS | Subsumed by parameter-stage arrow functions plus units in types | Small models proving much better at `'w - 2*wall'` than at `() => w - 2*wall` |
| Lossless syntax trees, incremental parsing | Whole files reparse in milliseconds; edits are textual | Files growing past about 5k lines (that would also mean the design failed) |
| General type inference (HM), generics, type classes | Forward flow and specialization at call sites suffice; errors stay local | DSL authors routinely needing polymorphic helpers that specialization can't type |
| An embedded JS engine | Build runs natively; only K-IR needs an interpreter (agrees with your current choice) | Needing to sandbox untrusted build code beyond what a Worker gives |
| LLVM or wasm on the critical path | JS closures and GLSL cover the live loop; C covers export | A domain (FEA, big simulations) where JS is more than 10× too slow and no GPU path exists. Then go K-IR → C → wasm offline, or emit wasm directly |
| Separate compilation, a package manager | A handful of files; only imports within the package and from the kit | Workbenches importing published DSLs from other workbenches, which also needs the answer to Q2 |
| Lenses beyond writing slider values back into literals | Expensive and rarely needed | Direct manipulation in views (dragging a sketch point, as Jig does) becoming a core loop |
| Declared closure captures | Rule 3 plus "move it into state" fixits are simpler | Risk-1 data showing that closures over build-time locals are common and the fix is costly. Jig's spec already imagines "declared closure values" [read] |

---

## 7. Top three risks, and the cheapest experiment for each

**R1. Kernel JS friction.** Models may write outside the subset: closures over loop variables, `Array.from`, strings in GPU code, `while` without bounds. They may also expect JS semantics where Kernel JS differs, such as integer wrap or vector operators. Tokens then go to fixing instead of building.

*Cheapest experiment, 1–2 days.*

1. Build the subset checker alone: a parser plus resolver plus rules, with no backends.
2. Run it over (a) the 113 DMG runtime lambdas and (b) the 51 GLSL listings, after a model translates them to Kernel JS.
3. Have 3 fresh agents write 5 programs each against a draft meta-reference.

Measure the share accepted on the first try, the fix turns per rejection, and the rejection categories. **Kill criterion:** fewer than 80% accepted after one fix.

**R2. The schema layer costs more than it saves, or distorts domains.** This is the survey's warning about MLIR at small scale (§18.6). Models might fight `t.*`, or real domains (B-rep timelines, sketch constraint systems, BVHs) might need `t.any` holes that switch the checker off.

*Cheapest experiment, 1 day.* Give one agent DMG's grammar (from its presets and book) and the draft `defineDSL` meta-reference. Ask it to write the schema plus the runtime skeleton. Count tokens, `t.any` escapes and questions asked. Repeat for a slice of Jig: `part`, `extrude`, `fillet` and selectors. **Kill criterion:** more than 10% of slots need escapes, or the schema exceeds 25% of the runtime's tokens.

**R3. Composition doesn't buy leverage.** Seam types and frames might not catch the bugs agents actually make, or agents might glue DSLs with plain JS objects and ignore ports.

*Cheapest experiment, 2 days.* Build Cave Diver twice with 3 agents each: once with ports and seam types, once with JS objects passed between three DSLs written without seam declarations. Count seam bugs found by the checker against bugs found at run time, total tokens, and time to the first correct run. **Kill criterion:** no fewer runtime seam bugs, or more than 20% more tokens with seams.

**Also watch:**

- Whether `new Function` works under the artifact CSP. DMG and Jig both use it [read]; I did not verify it inside claude.ai. This is a 10-minute probe.
- Whether WebGPU is available there. The probe is the same. Design to WebGL2 GLSL ES 3.0 until then; Candela supports both [read].
- False confidence from the verification panel (§2.4). Label clearly what is checked.

---

## 8. Questions for Ben

1. **Who writes DSL runtimes in a year?** Is it still a frontier model per workbench, or a kit library of reusable runtimes (tile engine, ray marcher, table engine, mesh viewer) that DSLs configure? The answer moves the line between schema and runtime.
2. **Where does composition happen?** Inside one workbench, as several DSLs in one package, or across workbenches by importing a published DSL? C-artifact blocks fetches across hosts, so the second means copying files and versioning DSLs.
3. **How real are the non-JS targets?** Is DMG's C export a requirement or a demo? It decides how strict the integer and allocation rules in Kernel JS must be.
4. **What latency do you want from edit to run?** I assumed under 100 ms excluding heavy domain compute, with expensive results cached by content key.
5. **Does the DSL co-evolve with existing programs?** When a person changes the DSL, should old programs be migrated automatically (schema diff plus fixits), or just re-checked with presets as the regression suite?
6. **Which small models, and do they use tools?** Without tools, single-shot generation needs constrained decoding against a grammar. The kit could export one from the schema, but only if you need it.
7. **Does "checked by TypeScript (checkJs)" cover programs**, or only the kit's own source? In-page, tsc is heavy (several MB). I would make the kit's checker authoritative for programs and emit `.d.ts` as a convenience.
8. **Do you have a yardstick?** That is, a set of prompts and workbenches you judge new designs by. The three experiments should use the same tasks.

---

## 9. Where I believe the brief is wrong or incomplete

1. **§1's list of hard problems leaves out acquiring behavior and binding time.** Both come before seams, legibility and verification (§1.1).
2. **"One small typed core IR, which every front end lowers into and every backend and check reads."** I agree for behavior. For structure I disagree: forcing tile maps, B-rep timelines, BVHs and tables into one small core would distort them (survey §18.6). Use one behavior core plus a generic graph typed by schema.
3. **Reading lambdas "via `String(fn)`" is not enough on its own.** Source text omits the values a lambda closes over. Jig's cache key has exactly this gap: `hash.js` keys functions by `fn.toString()` [read]. Pair `String(fn)` with resolution against the module scope and a closedness rule (§3.2).
4. **G-verify promises more than can be checked.** "We can show a program means what it says" is true for backends against reference interpreters. It is not true for whether a model-written reference runtime matches intent (§2.4).
5. **"Type-checked by TypeScript (checkJs)" conflicts with C-browser if it is meant for programs** (Q7). It is fine for the kit's own source.
6. **"The DSLs are JavaScript"** needs a qualifier. Once-per-build code is JavaScript. Code that re-runs later or runs per element should be Kernel JS: JS syntax with the kit's semantics (vector operators, units, integer widths), never run natively.
7. **Small factual point, §5.5:** two of the 27 chapters are shorter than 94k characters (34,884 and 57,034) [ran]. The other figures check out [ran]: 113 sketches, 195 demos, 2,098 `lab:` links, and the JSON blob at 99.0% of the file.
8. **§6's reading of Jig.** As corrected, it matches the code. Feature records are `{type, id, auto, args, opts, at}` on a frozen `Part`, and `irText` builds L0–L6 as views of one compile [read]. One addition: Jig's embedding is deep for structure but shallow for lambdas, such as `.feature(id, fn)` and strategies. Those are opaque and keyed by source text [read].

---

# Appendices

## A. K-IR: the behavior core

**Types.** `bool · int` (i32 semantics) `· num` (f64 in the reference, f32 on the GPU, with a declared tolerance) `· vec2/3/4 · mat3/4 · str` (CPU only) `· enum E · record R · array<T, N> · list<T, N>` (bounded) `· id<ns> · T?` (nullable, narrowed by `!= null` and `??`) `· time · fn`.

Each type carries annotations:

- **unit** dimensions (erased after the check);
- **frame** (for vectors);
- **storage width** (`u8`, `i16`, …, on state fields; wrap or saturate is declared and happens on write);
- **stage**: constant ⊑ build ⊑ parameter ⊑ tick.

Functions also carry a **domain**: once, per instance, or per element (cell, pixel, row, vertex). The domain picks the target, for example per pixel on the GPU.

Bare literals adopt the unit and frame of the other operand. Two declared values with different units or frames are an error. This catches the real bugs (mixing values from two DSLs) without taxing literals.

**Structure.** Programs are in A-normal form within structured regions:

```
Fn    := fn name(params) -> T  stage s  domain d  reads R  writes W { Stmt* }
Stmt  := let x = E | set place = E | if E { … } else { … } | for i in range(E, E) { … }
       | while E budget N { … }   (CPU targets only) | emit ev(E*) | return E? | break | continue
E     := lit | x | param p | read place | op(E*) | call f(E*) | select(E, E, E)
       | vec(E*) | swizzle(E, "xy") | record{…} | index(E, E)
place := self.f | world.f | local
```

The only effects are writes to declared state, plus `emit`. There is no heap, no recursion, and no closures after resolution: helpers are inlined or specialized at the call site.

**Interpretations.** Each is a fold over the IR:

- `eval`, the reference, with step hooks;
- `toJS`, code generation through `new Function`, scalarized vectors;
- `toGLSL` and `toWGSL`;
- `toC`, using storage widths, a `const` table for constant arrays, and formatted print for HUD strings;
- `interval`, for range lints such as "self.at.y can leave the map". Candela already computes interval bounds over `fx` [read];
- `print`, the text view in §3.3;
- `explain`, a trace of values per line.

**Legality by target** (abbreviated):

| | JS | GLSL/WGSL | C |
|---|---|---|---|
| `str` and template strings | ✓ | ✗ | formatted print |
| `while` with a budget | ✓ | ✗ | ✓ |
| `emit`, writing state | ✓ | ✗ (outputs only) | ✓ |
| `list<T, N>` push and pop | ✓ | ✗ | ✓ |
| reading textures and grids | ✓ (arrays) | ✓ | ✓ (arrays) |

## B. The Kernel JS subset, and its error catalogue

**Allowed:**

- arrow and function expressions;
- `const` and `let`;
- default parameters;
- arithmetic, comparison and logic (`===`, `!==`, `&&`, `||`, `??`, `!`, ternary);
- compound assignment, and `++` / `--`;
- `if` / `else`;
- `for (let i = a; i < b; i++)`, and `for…of` over fixed arrays and handles with `count`;
- `while` (CPU only);
- `break`, `continue`, `return`;
- member access on declared records;
- index access;
- object literals with known shape;
- swizzles;
- `Math.*` (mapped to intrinsics);
- the kit's standard library (`vec2/3/4`, `mix`, `smoothstep`, `clamp`, `fract`, `dot`, `distance`, unit constructors);
- callbacks to `forEach`, `map`, `some` and `every` over fixed arrays (lowered to loops);
- destructuring of parameters and records;
- template strings (CPU only).

**Rejected, each with a fixit:**

| Code | Construct | Fixit |
|---|---|---|
| K101 | free name bound inside a build-time function | "`x` is a local of the build code at line N. Behaviors see top-level names only. Move it into `.state({ x: t.num.init(x) })` or make it a top-level `const`." |
| K102 | `Math.random`, `Date`, `performance` | "use `w.rand(n)` / `w.frame`: replays must be deterministic" |
| K103 | `==`, `!=` | "use `===`" (applied automatically) |
| K104 | `this`, `class`, `new`, `async`, `await`, generators, `try` | "behaviors are plain functions of their parameters" |
| K105 | growing arrays (`push` on a non-`list`) | "declare `t.list(T, N)` in state" |
| K106 | recursion | "rewrite as a loop with a bound" |
| K107 | unknown member | did-you-mean from the declared record or scope |
| K108 | `fn.bind(...)` or native functions (`toString` returns `[native code]`) | "pass the function itself" |

## C. Seam types: the shared vocabulary

Each seam type carries `{unit, frame, idspace, clock, contentKey, range?}`.

| Seam type | For |
|---|---|
| `Scalar<unit>`, `Vec<n, frame>`, `Color` (linear RGB) | values |
| `Grid<T, frame>`, `Image<px>` | tile maps, heightmaps, frames, textures |
| `Mesh<frame>` with per-face `Ids` | CAD to renderer, FEA |
| `Table<Row>` (columnar) | data tools |
| `Field<D → T>` | **code as a value**: SDFs, stress fields, procedural textures |
| `Signal<T>` with `between` (`latest`, `lerp`, `slerp`, `integrate`) | values that change per tick |
| `Event<T>` | discrete occurrences |
| `Ids<ns>`, `Pose`/`Transform` | identity, placement |
| `Lookup<K → V>` | named spawns, room lookups |

Conversions are declared: frame edges, unit relations, vocabulary maps. The kit inserts a conversion only when it is lossless and unique. Otherwise it reports an error with a fixit stub.

## D. Evidence notes

**Jig and Candela [read]:**

- `part.js`: `Part` is frozen; `_add` appends `{type, id, auto, args, opts, at: callerLine()}`.
- `ir.js`: L0–L6 are text views of one compile.
- `expr.js`: tokenizer and parser with a cached AST, `deps`, `evaluate` with dimension checks, and errors carrying a column.
- `guard.js`: namespace proxies with edit-distance suggestions.
- `compile.js` `featureKey`: chained `prevKey` plus canonical arguments plus the values of the parameters they depend on. It recovers `j.fit.*` dependencies by a regular expression over the canonical text.
- `hash.js`: functions are keyed by `fn.toString()`.
- `cadpkg.js` and `jig-candela.js`: the seam, as described in §1.1.
- `fea.js`: CalculiX stress studies whose faces are named as in the rest of Jig, solved asynchronously, with results joined back as metrics.
- `agent/evaltool.js`: one `eval` tool, results as YAML cut at 9,000 characters, a 25-second timeout.
- `agent/prompt.js`: a `[context]` block of live state.
- Candela `fx.ts`: hash-consed, typed DAGs built by tracing lambdas with symbolic proxies; E201/E202 for staging mistakes; `fx.select` for branches.
- `diag.ts`: coded diagnostics with hint, suggest and location.
- Preset W-01: per-frame behaviors as opaque JS.

**DMG [read, ran]:**

- `scan()` and `lint()` use regular expressions over `String(fn)`.
- `emitC` emits data exactly and lambdas as comments.
- Engine sections: runtime 23.1 KB, compile 19.4, builders 10.9, IR 7.0, C emitter 6.6, font 2.7, diagnostics 2.3, parameters 2.2, art 1.5.
- 22 presets, 7 of them games other than whack-a-mole.

***Uncommon Math* [ran]:**

- 113 sketches; 111 export `draw` and 48 export `setup`.
- `mulberry32` is defined in 29 sketches, which illustrates observation 6.
- 51 GLSL listings in the chapters.
- The links are `lab:sketch?id=…` and `lab:book?ch=…`.

## E. Survey sections that shaped each choice

| Choice | Sections |
|---|---|
| Parse over trace | §19.6–19.7 (limits of proxies and tracing), §40.3, §47.4's pitfall: "arbitrary host behavior leaking into an allegedly inspectable representation" |
| Stage lattice | §6.3, §19.8, §29.3, §29.5 |
| One core for behavior, a graph for structure | §9.5, §18.6, §29.2 (constructs are not merely AST nodes) |
| Schema as DSL definition | §18.5, §44 (capability interfaces) |
| Legality by target | §21.6 |
| Identity and provenance | §13.3, §36, Principle 5 |
| Verification ladder | §33.5's table (structural verifier → type checker → differential → property → translation validation) |
| Form versus function | §28.4 |
| What to leave out | §10.3 (V8), §18.6, Principle 11 |

## F. Packaging under the constraints

- **C-entry.** The agent fetches the prebuilt `kit.html`, writes `workbench.json`, `dsl/`, `programs/`, `lib/` and `book/` beside it, and publishes the kit unchanged.
- **C-artifact.** The kit loads sibling files by relative path and compiles in a Worker. That makes runaway build code killable; Jig compiles in a Worker [read].
- **C-download.** A "save as one file" command inlines every sibling into one HTML file, in the page itself, with no build tool.
- **Drift.** `workbench.json` pins the kit's major version. That addresses observation 4, because nothing is copied from a previous workbench.
- **The book.** It lives in `book/*.md`. `lab:` addresses use one grammar (`lab:<program>#<node>[.<slot>]`, `lab:param/<name>=<value>`, `lab:ir/<level>?node=`) and are validated on every build. Book figures are programs; their helpers are imported from `lib/`.

## G. The data-tools DSL: observation 8, resolved

```js
// in the schema
derive: { slots: { name: t.str, fn: t.fn('param', { r: 'Row' }).per('row') },
          type: (n, T) => T.input.with(n.name, T.of(n.fn)) },                  // 8a: types flow forward
join:   { slots: { other: t.ref('Table'), on: t.fn('param', { a: 'Row', b: 'Row.other' }, t.bool).per('row') },
          type: (n, T) => T.input.merge(T.output(n.other), { prefix: n.other.id }) },   // 8b: steps see each other
limit:  { slots: { n: t.int.stage('param') } },                                 // 8c: .limit(10) or .limit(topN)

// in a program
const topN = param.int(10).range(1, 50);
export default table('orders').derive('margin', r => r.price - r.cost)
  .join(customers, (a, b) => a.cid === b.id)
  .filter(r => r.margin > 0 && r.signup != null && r.signup.year >= 2024)      // 8d: dates, nullable narrowing
  .limit(topN)
  .chart('bar', { x: 'customers.name', y: 'margin' });                          // columns checked against the row type
```

On 8d (missing value types), `date`, nullable types with narrowing, and string building are kit types, so no DSL author invents its own.
