# Architecture consult: the brief

*2026-11-24. A brief for a fresh agent (Opus, effort xhigh) asked to design the Workbench pipeline from first principles, before it sees our current design. **Draft for Ben's edit:** the goal and constraint labels in §4 decide what the consultant is allowed to question.*

You are being asked for a design, not a review. We have built a lot, and we are willing to throw all of it away if a better approach exists. In this first pass you will **not** see our current design; afterward you will, and we will ask you to compare the two honestly. Your design is worth most to us if it is your own.

## 1. The question

**How ambitious can a workbench get, and what pipeline makes that possible?**

A workbench is a small domain-specific language plus an IDE, a coding agent and a textbook, all running as one page in a browser. Today, a long prompt to a frontier model reliably produces one: a Game Boy-style game engine, a math textbook with 113 interactive sketches, a CAD tool. Each is a single domain.

The bet is that the ceiling is much higher. Ask for a very high-level goal, or **compose several DSLs** (a game whose levels come from a procedural-generation DSL and whose effects are shaders; a CAD part whose stress is solved by an FEA DSL and rendered by a path tracer), and you should be able to build very complex programs from a handful of files.

The tension we want you to resolve:

- **The old world.** Most of compiler engineering (see the survey below) is optimized for thousands of files, separate compilation, rich type systems, and optimizers that squeeze machine code.
- **The new world.** A few application-specific DSLs, each small, that compose easily, are written and read largely by language models, and together build very ambitious things in a few files.

Which ideas from the old world carry over, which are dead weight at this scale, and what does the new world need that the old world never had to solve? We suspect the hard problems move to **the seams between DSLs** (values, types, identity and time crossing from one to another), to **legibility to an agent** (tokens to understand, to write, to fix), and to **verification** (knowing a composed program means what it says), and away from optimization. Test that suspicion; don't assume it.

## 2. Read these

| Input | Where | Why |
|---|---|---|
| The IR taxonomy survey (24k words, by Manuel) | `local/2026-11-24-ir-taxonomy-survey.md` | The design space. Read it whole. Part VI (construction APIs), Part XIV and §47.4 bear most directly, but do not skip the rest |
| Jig and Candela (Manuel) | `github.com/go-go-golems/jig` (use `gh`; Candela is under `import/candela`) | A recent workbench whose program is a JS builder that evaluates to a reified feature timeline, with a separate string expression language for dimensioned values, and OpenCascade and a Rust core as wasm |
| A third party's reading of Jig | §6 below | Useful framing; verify it against the code |
| The original prompts (Ramon, Manuel) | `local/2026-11-23-manuel-ramon-prompts.md` | What a workbench is asked to be today |
| The DMG Workbench (347 KB, one file) | `project/2026-11-23-dmg-workbench.html` | A real workbench those prompts produced. Search it; do not read it whole |
| *Uncommon Math* 0.1.0 (4.8 MB) | `local/uncommon-math-0.1.0.html` | A real textbook workbench. Mostly one JSON blob; search it |

**Do not read** anything else under `project/` or `kit/`, or `README.md`, `AGENTS.md` or `scripts/`, in this pass. They hold our current design, and you will get them in the second pass. Licensing: take ideas from Jig, Candela and the prompts; copy no code.

## 3. What a workbench is and how it is used

- **The artifact.** One page on claude.ai (a "Claude artifact"), which a user may also download and open from `file://`. It holds the DSL, an editor with presets, a live view (simulation, render, chart), a parameter panel built from parameters the program declares, visible errors, a chat agent that edits programs, and the textbook.
- **The user's flow:** paste a link into a chat → the model creates a DSL for the user's domain → fills the workbench's slots (DSL definition, programs, book) → the page starts → the user iterates both on programs written in the DSL and on the DSL itself.
- **The loop we care about** is the tightest possible feedback loop at two levels: improving the language, and using it to try ideas quickly.
- **Who writes the code.** Mostly language models: a frontier model writing a new DSL, and later possibly small local models using a finished workbench to make new programs.

## 4. Goals, constraints and current choices

Each item is labeled. **Goals** are what we want. **Constraints** are facts of the platform or rulings you must design within. **Current choices** are decisions we made that you may overturn if you say why.

### Goals

- **G-ambition.** Composed DSLs build very complex programs from a handful of files (§1).
- **G-agent.** An agent quickly understands the user's goal, what a workbench is, and how to make a new DSL. Progressive disclosure: a short entry document, then the DSL reference, then the optional textbook.
- **G-tokens.** Token-efficient to learn, write, run and iterate: less reading, searching, parsing, thinking and generating.
- **G-small-models.** A finished workbench is usable by small local models to make new programs.
- **G-behavior.** Behavior, not just structure, is analyzable: the runtime code inside a program (per-frame logic, per-pixel shaders, per-row derivations) can be checked, explained, stepped through and compiled to other targets (GPU shaders today; WebAssembly or C later).
- **G-domains.** Not tied to one kind of domain. Games, shaders, data tools, CAD, path tracing, and stateful simulations are all in scope.
- **G-form-function.** What the tool does is separate from how it looks.
- **G-book.** The textbook has a natural home and links into the live workbench by address.
- **G-verify.** We can show a program means what it says: an executable meaning (a reference interpreter or similar) that backends are compared against.
- **G-errors.** Errors a model can act on in one step: a code, a location, a "did you mean", a fixit.

### Constraints

- **C-browser.** Every stage, including every check, runs in a browser page inside a Claude artifact. Node with a shell is an extra for agents that have one, not the baseline.
- **C-artifact.** The page can load its own sibling files by relative path and start Web Workers from them; up to 16 MiB. Fetches to other hosts are blocked. Scripts load only inline or from a short CDN allowlist. WebAssembly instantiates; whether WebGPU is available is unverified. The page can save edited files back to the artifact.
- **C-download.** A downloaded artifact must work from `file://`, which in practice means one self-contained file.
- **C-entry.** A user starts by pasting a GitHub link; an agent fetches a prebuilt page and publishes it unchanged beside the files it wrote. The agent never reads the kit's own source.
- **C-models-in-page.** In-page model access is Claude built in, then an Anthropic key, then any OpenAI-compatible endpoint.
- **C-no-reuse.** No verbatim reuse of the original prompts' generated code or Manuel's repos.

### Current choices (open to challenge)

- **The DSLs are JavaScript.** A program is JS: a fluent builder for structure, and JS lambdas for behavior.
- **We own a parser** for a subset of JavaScript, so runtime lambdas can be read as source (via `String(fn)`) and lowered. Background: the original prompts said "no parser or interpreter" because without that line models wrote their own every time; the parser exists so no workbench rebuilds one.
- **One small typed core IR**, which every front end lowers into and every backend and check reads.
- **Our own IR and emitters; no LLVM**, nothing heavy vendored on the critical path.
- **No embedded JS engine**; JS is run natively by the browser.
- **Plain JS ES modules, type-checked by TypeScript (`checkJs`)**, no build step.
- **A package of small files**, with a single-file bundle only as a build output.

## 5. What we have observed

These are facts from building and reading workbenches, stated without our design.

1. **Domains shape grammars unprompted.** In the DMG Workbench, hardware limits showed up as types, lints and budgets without being asked for. Its 22 presets include seven games other than the one it was designed for, so the grammar was not overfit.
2. **Structure is easy, behavior is hard.** The DMG Workbench built its IR after the fact, from the compiled spec plus regular-expression scans of lambda source. Its runtime and its C emitter both bypass that IR. The C emitter gets the data right and emits only some lambda bodies, as comments; the result would not compile.
3. **One `eval` tool over a rich lab API** beats many small tools as the in-page agent's interface. Both the DMG Workbench and Jig converged on it. A text rendering of the screen lets the model see the result.
4. **The template chain drifts.** Each workbench is rebuilt from a previous one; small deviations are inherited silently (one loads a web font from a CDN the prompt forbids).
5. **The textbook is a bundle.** *Uncommon Math* is about 99% one line of JSON: 27 chapters, 113 sketches, 195 demos. Prose links into the bench by address (2,098 links). Each sketch declares its own parameters, so no figure needs interface code. Chapters run 94k to 220k characters.
6. **Helpers get pasted.** 75 of the book's 113 sketches define general-purpose helpers inline, because sketches cannot import.
7. **Shader code is maintained twice by hand**: 51 GLSL listings beside JavaScript re-implementations.
8. **What fresh agents hit when declaring a DSL from a draft definition API** (two trials, three agents each, a data-tools DSL of tables, derives, joins and charts). The overall shape held across agents working apart. Where it broke: (a) **types flow between steps**: a table's columns change at every step, so each step's lambdas need the previous lambdas' inferred types; (b) **steps need to see each other**: a `join` must learn the other table's columns, and a chart's columns should be checked against its table; (c) **runtime values inside structure** (`.limit($.topN)`) had no form, and three agents invented three; (d) **missing value types**: integers, dates, nulls with narrowing, string building. When the draft allowed two ways, agents split between them, and the wrong one passed the checker.

## 6. A third party's reading of Jig (verify it)

Summarized from screenshots another agent produced:

- Jig sits at the intersection of Lisp metaprogramming, staged embedded DSLs, parametric CAD (persistent feature histories), incremental compilation (content-addressed caching of feature results), constraint programming (sketch solving), compiler-as-a-service (retained, queryable `Program` objects), multi-level compilation (features → parameters → constraints → topology → placement → meshes), resource-oriented identity (stable feature, body and component ids) and domain-specific lowering through a geometric kernel.
- **JavaScript is the metalanguage, Jig the object language.** `j.part("x").params({...}).add(j.box(...), {id:"base"}).fillet(...)` performs no geometry; each call appends a feature record `{type, id, auto, args, opts, at}` to a new immutable `Part`. A JS program is a generator of Jig terms: JSProgram → (host evaluation) → JigProgram → (domain compilation) → EngineeringModel. A deep embedding, closer to Halide, AWS CDK, Chisel and Lightweight Modular Staging than to a scripting API.
- **A second IR for expressions.** Strings like `'wall * 2 + 1 mm'`, `'w / 2'`, `'sin(30°)'`, `'1.24 g/cm^3'` belong to a small separate language (`expr.js`, `params.js`, `units.js`: tokenize, parse, deps, evaluate, print), with cached ASTs, dependency analysis and dimensioned arithmetic. So `inner: 'w - 2 * wall'` is a dependency-tracked, unit-checked relation, where `const inner = w - 4` would be a dead number.

## 7. What to produce (pass 1)

Write `project/2026-11-24-architecture-consult-design.md`. Aim for something Ben can read in 20 minutes; put depth in appendices if needed.

1. **Your answer to §1**: what the new world needs, which old-world ideas carry over and which do not, with reasons tied to the survey's sections.
2. **The pipeline you would build**, from what a model writes to what runs, checks and renders. Name the representations, who produces and consumes each, and where meaning is fixed.
3. **How behavior is captured.** Compare at least: parsing source, tracing or symbolic proxies, a string expression language (Jig's), staging, and tagless-final. Pick one or a mix, and say why under C-browser and G-agent.
4. **How DSLs compose.** Work through one concrete composed program end to end (pick from §1 or propose a better one), including what crosses each seam and how an error at a seam reads.
5. **What a model writes** to define a new DSL and to write a program in it, shown as code, with a token estimate for each.
6. **What you would not build**, and what would make you change your mind.
7. **Your top three risks**, each with the cheapest experiment that would test it.
8. **Questions for Ben.**

Label what you verified (read in code, ran) versus what you infer. A guess stated as a fact costs us more than a gap.
