# Architecture review: what the two consults change

*2026-11-24. Main thread, after two first-principles design consults (job `Cy9u98`). Inputs: [the brief](2026-11-24-architecture-consult-brief.md), [consult A](2026-11-24-architecture-consult-design.md) (a subagent; partly anchored, see below), [consult B](2026-11-24-architecture-consult-design-blind.md) (fully blind), [the proposal](2026-11-23-workbench-kit-proposal.md), [the M3 plan](2026-11-24-m3-kit-v0-plan.md) and [the composition note](2026-11-23-dialect-composition-and-extension.md). Nothing here is ruled until Ben confirms §6.*

## 1. The verdict: keep the horse

Ben asked whether a better pipeline exists, and was willing to discard all the work so far. Two Opus (effort xhigh) designs, written from the same brief without our design, both say no. They also say where the design is thin.

- **Consult A** ran as a subagent of this session. It was told not to read `project/` or `kit/`, but it inherited this session's `AGENTS.md`, which names the kit's parts. It disclosed this. Its agreement with us is therefore weak evidence; its departures still count.
- **Consult B** ran as a separate `claude -p` process from a scratch folder outside the repo, with copies of the inputs only. Nothing about our design reached it. This is the one to weigh.

**Where both landed, and where we already are:**

| Bet | A | B | The kit today |
|---|---|---|---|
| Programs are JS; build-time code runs natively; builders record structure | yes | yes | yes |
| Runtime lambdas are parsed from source (not traced with proxies, not a string language, not GLSL strings) | yes | yes | yes |
| One small typed core IR, for behavior only; structure stays outside it as each dialect's data | yes | yes | yes (`kit/ir` holds Kernels; structure is the record) |
| Operators take their meaning from types (vector `+`, GLSL meaning), with a reference interpreter as the oracle | yes | yes | yes: D1, built in M2 (proposal §5.7) |
| A dialect is defined declaratively, and the kit derives the builder, checks and reference | no: builder classes with signature strings | yes: a schema of kinds, slots, state and ports | yes: `defineDialect`, `defineGrammar` |
| Types flow between steps because a lambda is typed at its builder call, and the dialect computes the next step's type with ordinary code | yes | yes (a per-kind `type` rule) | yes: construct state (trial 2) |
| Dead weight: SSA, CFGs, optimizers, separate compilation, incremental query engines, lossless syntax trees, LLVM, an embedded JS engine | yes | yes | none of these built; `dynUhe` (Kernel queries) is the closest |

B arrived at our declarative definition API, our construct state and D1 without seeing any of them. That is the strongest evidence in either document that the current direction is sound.

**On Ben's framing (old world against new world).** Both answers agree: the old world's *semantic* machinery carries over (a typed core, staging, one IR read many ways, identity and provenance, legality per target, differential testing against a reference interpreter); its machinery for *scale and speed* is dead weight, because the browser's JIT and the GPU driver optimize whatever we emit. Both correct the brief's guess that the hard problems move to seams, legibility and verification: they do, but **binding time** (when a value becomes known) comes first and ties the others together, and the hard part of a seam is not its type (shapes are known at build time) but its **frame, clock and identity**. Both cite Jig, which already composes CAD, FEA and a path tracer with hand-written seams of exactly those kinds.

## 2. Ben's answers (2026-11-24)

- **Dialects will mostly be written fresh, but must be reusable.** So the definition API stays the first investment, and a dialect must be a self-contained, portable unit from the start, not something tangled into one workbench.
- **Composition looks like:** "I have a DSL at `bensyverson/mydsl`, and another here on disk (or uploaded); use both to do XYZ." So composition happens inside one workbench page, and a dialect is a *package* that can be fetched from a GitHub repo, read from disk or taken from an upload, then combined with others it has never met.

Consequence: neither dialect author knew about the other, so the seam between them cannot be designed by either. It has to be the kit's: a shared vocabulary of seam types that every dialect speaks, and a glue program (written by the model doing XYZ) that connects them, with conversions named and checked.

## 3. What changes

Each item says where it came from, what we have, and what to do. "Both" means A and B independently.

### 3.1 Binding time replaces the `live` flag (both)

**Now:** a parameter is folded as a constant unless declared `live: true` (proposal §8.2). Trial 1 found no form for a runtime value inside structure (`.limit($.topN)`); three agents invented three.

**Change:** a parameter read by build-time code is a plain number, and changing it reruns the build (milliseconds at our sizes, cached by content key where a dialect's build is expensive). The same parameter read inside a Kernel is a uniform and changes without a rebuild. The kit records which reads happened, so "live" becomes a derived fact, shown in the IR view ("`topN`: folded at build, read by `.limit`"). B adds that a lambda's stage can be inferred as the latest stage of what it reads, with the slot setting only a ceiling. The one value that is truly run-time-only inside structure is a signal from another part, written as a lambda; using one at build time is an error with a fixit (A's S301, B's E-STAGE). This gives observation 8c one form, and lets the checker refuse the wrong one.

### 3.2 Helpers and data resolve from module scope (both)

**Now:** a lambda is read with `String(fn)`, so a value it closes over is not captured; a name means the Dialect's or the Library's; top-level constants are taken by their text (the capture policy folded into the M3 design leaf).

> **Corrected 2026-11-24 (same day):** this understated what exists. DMG lowering already resolves a program's top-level `const f = (…) => …` as helper Kernels and its other top-level `const`s as baked constants (`kit/lower/README.md`, "Top-level helpers"), so the change below is to carry that rule into the Definition API (fields and the data Dialect), not to invent it. What remains new: data from a `lib/` file shared across programs and dialects, and a refusal with a fixit for a binding that exists only inside build-time code.

**Change:** resolve a lambda's free names against the program file's top-level bindings. A function becomes a helper Kernel (it must itself be in the subset); plain data becomes a frozen constant; a parameter handle becomes a parameter read; a binding that exists only inside build-time code is refused with a fixit ("move it to state, or to the top level"). A rewrote whole files to capture loop variables too; B's module snapshot is smaller (an epilogue that returns the top-level bindings, no source rewriting) and covers what the existing programs do. B measured that about one in ten DMG runtime lambdas reaches a top-level helper or constant, clustered in the larger games, so this is required, not a nicety. **Take B's form.**

### 3.3 Every dialect has a text view (both)

**Change:** a dialect must provide `text(state)`, the screen and its state as characters, sized for a model. A missing one is a definition error. Both cite the DMG Workbench and Jig converging on one `eval` tool plus a text rendering, and Jig's agent data: of 444 failed steps in 517 runs, 73 % were fixed by the next step, and the largest failure classes were API-shape mistakes. Text views and teaching errors are where agent cost is decided.

### 3.4 A dialect is a package (Ben's answer, and B)

**Change:** a dialect is a folder that travels: its definition (schema), its reference runtime, its views (canvas and text), presets that double as its regression suite, an optional book, and a version. Its reference (`API.md`-style) is generated from the definition, so it cannot drift. A workbench names the packages it uses by source (a GitHub repo, a path, an upload) and pins them. Vocabulary names that collide between two packages must be qualified (`tables.table`), a definition error otherwise (A). This extends the composition note's recommendation (imports, with crossings through named interface types) from "dialects that know each other" to "dialects that don't".

### 3.5 Composition is a kit service built on seam types (both; new work)

The composition note covered imports and nominal types and said nothing about time. Both consults put the real work there.

- **Seam types:** a small closed set that every dialect speaks: scalars, vectors, enums, records, arrays, `Grid`, `Image`, `Mesh`, `Field`, `Ids`, `Event`, `Signal`. Each carries a **unit or frame** (`vec2i@cell` against `vec2@px`), an **identity space** (a spawned bat keeps its spawn id as an address), and a **clock**.
- **Ports:** what a part offers others is declared and typed at build time (A's `static outputs`, B's `ports`); reaching into another part's state is an error that suggests exporting it.
- **Time:** every part has a clock (`demand`, `tick(hz)`, `frame`, `progressive`), and one kit scheduler orders a display frame. A reader sees the producer's last completed step: a snapshot. Snapshots make every cross-part read defined, break cycles with a one-step delay, cross Worker boundaries unchanged, and are what a GPU uniform already is (A). A slower consumer says how it samples (`latest`, `lerp`, `integrate`) (B).
- **Frames:** a small graph of frames with affine edges known at some stage; binding one dialect's grid as another's map unifies their frames, and a conversion is named by the consuming side (`tile()`, `px.world`). Jig's mm/+Z to m/+Y change is one such edge, written by hand today.
- **Code crosses too:** a `lib/` helper runs as JS in one dialect and as GLSL in another, compiled per target and checked against itself by the harness. This is what ends the twice-maintained shaders of *Uncommon Math*, and it already works within one dialect (the fields Library).
- **Seam errors name both sides** and carry a fixit (both consults show five or six; A's V204, CPU and GPU disagreeing about a hash, is the one kind only a differential run catches).

> **Tested 2026-11-24 ([the composition trial](2026-11-24-composition-trial.md)):** three agents (Opus, Sonnet, Haiku) followed these rules with no seam mistakes. What the model lacks is time and units: a reload needs a defined point in the tick and a visible **revision** of each input (the identity / revision / content-key split of §3.7), sampling needs a reset across a revision, and frames need **lengths** as well as positions (an affine edge whose scale converts a length). The next trial must compose dialects written in separate sessions.

### 3.6 A premise to correct: what G-verify can show (B)

We can show that every fast path (emitted JS, GLSL, later C) agrees with a reference: the kit's interpreter for Kernels, the dialect's runtime for structure. We cannot show that a model-written reference runtime means what the user intended. The proposal's §12 should say so, and B suggests the UI should too.

### 3.7 The build is recorded and can explain itself (Manuel's pass-design gist)

*Added 2026-11-24, after the consults, from [Manuel's pass-design gist](https://gist.github.com/wesen/2c6e5beb40c65cfdb958c240d2de63e0), written for Jig.* It proposes a compiler orchestration and observability layer: transformations kept apart from the strategies that schedule them; artifacts with separate **identity, revision and content hash**; four graphs kept apart (IR, dependency, provenance, execution); a queryable record of each compilation; structured explanations ("mounting hole: cache miss, because the build direction changed +Z → +Y"); one algorithm interface whose context does `require`, `read`, `derive`, `decide`, `emit` and `diagnostic`; and view providers registered per artifact kind.

Most of it is the same territory as §3.1 to §3.5, seen from the compiler's side, and it sharpens them:

- **Dependency manifests, not opaque hashes.** §3.1 already records which parameters build-time code read. Keep the record and answer "why did this rebuild?" from it: which input changed, or which dialect version. This is the feedback loop Ben's delivery decisions put first, and it costs little once reads are recorded.
- **Identity, revision and content hash are three things.** Both consults called identity across edits a hard seam problem. The package and seam design (§3.4, §3.5) should keep the three apart from the start: an address says which object, a revision which version, a content key whether a result can be reused.
- **Provenance and the execution record** are what our spans, addresses and the lab API's `why` / `trace` already reach for; one record should feed them all.
- **The algorithm context** has the shape of construct state's `step` context (`program`, `stateOf`, `error`), which trial 2 converged on.

What does not carry over at our scale: **the strategy layer and a general pass framework** (`repeatUntilStable`, `chooseBest`, analysis invalidation). Jig needs them because its compiles are expensive (OpenCascade, solvers, an orientation search). Our Kernel compiles take milliseconds, and both consults list pass managers and incremental query engines as dead weight. The gist itself says to validate dependency, identity and provenance before building a pass framework. So the existing backlog entry stands ("a pass manager and H11", un-parked when a backend wants a transformation). One exception is likely: a dialect's own expensive build work (a BVH, an FEA solve, a cave generation) is Jig's case in miniature, and the Composition milestone's scheduler and content-keyed cache are where a small orchestrator, recording its reasons, would live.

### 3.8 Smaller points

- **Required laws and replay** (both): a dialect may declare properties (B's `laws`, after Jig's `justifies`), and replaying recorded input must give the same state hash. Cheap to promise now, expensive to retrofit.
- **checkJs stays for the kit's own code only** (B): the TypeScript compiler is too large to run in the page for programs. That is already the case.
- **What the brief got wrong about Jig** is corrected in place in the brief.

## 4. What does not change

The JS surface, our own parser, the typed Kernel IR, D1, the reference interpreter and differential harness, the emitters, no LLVM, no embedded engine, plain JS checked by TypeScript, small files, the declarative Definition API with construct state, the M0 packaging (sibling files, one-file download), and the dogfood ruling. Neither consult recommends tracing, a string expression language, an optimizer, or a multi-level IR framework, and each says what would change its mind (proposal-level triggers are in A §6 and B §6).

## 5. Disagreements between the consults, and my call

| Question | A | B | Call |
|---|---|---|---|
| How a dialect is defined | builder classes with signature strings | a declarative schema | **B**, which is what we have. A's real point, that the next step's type is computed by ordinary code, is construct state |
| How capture finds free names | parse the whole file, rewrite each lambda with an environment thunk | `String(fn)`, plus a snapshot of top-level bindings | **B** (§3.2): smaller, no source rewriting, covers the existing programs |
| Stages | four slot markers chosen by the dialect | inferred from reads, with a ceiling per slot | **B**, if the trial in §6 shows models don't stumble on it; it removes a choice from the program author |
| Cross-part time | a scheduler and snapshot reads | clocks and sampling modes on seam types | **both**: they are the same idea from two sides |
| Opaque runtime code | a `Native` slot (canvas drawing, string-heavy data work) the listing marks as opaque | not offered | **A**: book sketches and data tools need it, and naming it keeps analyzable slots from quietly degrading |

## 6. Proposed plan changes (for Ben)

1. **Finish M3 as planned, with three additions folded into the Definition API:** the required text view (§3.3), binding-time parameters replacing `live` (§3.1), and module-scope resolution (§3.2). Each goes through the dogfood ruling before it is frozen.
2. **A new milestone after M3: Composition.** Package format and loading from a repo, a path or an upload (§3.4); seam types, ports, clocks, the scheduler and frames (§3.5); a build record that keeps identity, revision and content key apart and answers "why did this rebuild?" (§3.7); one composed workbench built from two dialects written in separate sessions. The current M4 (form and book) and later steps move down one. Reason: composition is where Ben's ambition lives, both consults call it the least tested part, and it constrains the package format, which is cheaper to fix before form and book build on it.
3. **Two cheap experiments now, before either design hardens** (both consults list them as top risks):
   - **Subset friction (half a day, a script):** parse every runtime lambda in the 22 DMG presets and the 113 *Uncommon Math* sketches; count what falls outside the Kernel subset and what reaches module scope. B's regex screen says about four in five already fit; a real parse settles it. Goes in `scripts/`.
   - **Composition on paper (one day, a dogfood trial):** write short references for three dialects (cave, tiles, glow, after B's worked example), and have three fresh agents write the composed program from those references and a draft composition section. Review by hand: did cross-part values go through ports, signal-dependent arguments through lambdas, frames through named conversions? Count what a seam check would catch and what nothing would.
4. **Correct the proposal in place:** §1 and §4 point here; §12 gets B's limit on G-verify; §8.2's `live` flag is marked superseded once (1) lands.

**Ruled (Ben, 2026-11-24):** all four items, including the Composition milestone after M3 and both experiments now.

## 7. Experiment 1, subset friction: already answered by the existing surveys

The two survey scripts already parse every runtime lambda with `kit/parse`, so no new script was needed. Figures from `node scripts/dmg-diff/cli.js survey` and `node scripts/um-survey/survey.js` (2026-11-24):

- **DMG, 22 presets:** 126 runtime lambdas; 111 lower (88 %). Of the 15 that do not: 7 use a top-level helper or constant that fails for some other reason (mostly L014, a helper that does not lower makes its callers fail), 4 fall outside the subset's syntax, and 4 hit gaps in lowering (`repeat` on a string, `reduce` with one argument, one L012).
- ***Uncommon Math*, 113 sketches:** of 548 kernel-candidate functions (everything but `draw`, `setup` and `meta`), 379 (69 %) are inside the subset's syntax. The refusals, by code: S111 (an arrow that is not a call argument, a closure) 93, S102 (`new`) 51, S109 (spread) 21, S101 (`while`) 17, S114 (parameter defaults) 11, S104 9, P004 8, S112 5, S108 1. By kind (the survey's per-sketch `fit`): pixel-loop sketches 177 of 232 clean (76 %), canvas sketches 195 of 308 (63 %), fragment sketches 7 of 8.

Reading: consult B's regex screen (about four in five DMG lambdas inside the subset) understated the fit; a real parse lowers 88 %. The book's gap is concentrated in four constructs, and three of them are the ones consult B predicted would need a rule: nested closures (lower array callbacks to loops, refuse escaping ones), `new` (typed arrays and value constructors), and spread. Many of the canvas sketches' functions belong in a `Native` slot (§5) anyway. **Verdict: the subset does not fight natural code enough to change the capture decision.** The un-modeled risk is new code written to the rules, which the composition trial (§6, item 3) exercises.
