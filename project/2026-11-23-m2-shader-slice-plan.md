# M2: the shader slice

*2026-11-23 · plan · the roadmap row is in [the proposal §15](2026-11-23-workbench-kit-proposal.md). The rulings below were made before the plan was written, and they bind it.*

**Goal.** Build a tiny `fields` Dialect, one Kernel emitted to both JS and GLSL, a comparison within a tolerance, and the pixel debugger. It tests H2 (a neutral core covers games and shaders) and H3 (typed operators make shader code pleasant without confusing authors).

## Rulings (2026-11-23, with Ben, who accepted the main thread's recommendations)

- **Typed operators (D1): yes.** Operators take their meaning from Dialect types (`uv + k * q` on vectors). So the fields Dialect's Runtime Lambdas run only through the IR; they are no longer runnable as plain JavaScript. H3 tests whether authors and models accept this. See the proposal, §5.7.
- **A reference interpreter over the IR is M2's oracle.** With no runnable closure, the interpreter says what a Kernel means. The JS and GLSL outputs are each compared against it, floats within D5's tolerance and integers exactly. M1 declined to build one; [the M1 findings](2026-11-23-m1-findings.md) flagged it as necessary here.
- **`f32` and fixed-size vectors become IR value types.** Today every value is an `f64`. Integer sizes stay on storage (store rules), as before. This is the one change M2 makes to the core, and H2's test of it.
- **No wasm in M2.** GLSL is the first backend with no host to lean on, so it owns the first LIR stage, with an IR verifier after each lowering. Wasm follows later, on that LIR.
- **Source material:** the Uncommon Math book is `local/uncommon-math-0.1.0.html`. It is gitignored, a 4.8 MB single-page app whose chapters are built from JS data. Two of its fragment sketches are ported both ways for H3; which two is the plan's first leaf (a survey).

## Inputs

- [The M1 findings](2026-11-23-m1-findings.md), "What M2 and M3 should change."
- [Passes, queries and several IRs](2026-11-23-passes-queries-and-several-irs.md).
- [The backlog](backlog.md): LIR, range analysis, and the tracing front end. Candela's tracing suits branch-free shaders; M2 still uses the parser as its one front end unless the plan argues otherwise.
- The proposal: §8.1 (the `fields` Dialect sketch), D3 (backend order) and D5 (tolerance).
- [The glossary](../kit/glossary.md), for terms.

## The shape of the work

M2 adds a second Dialect (`fields`) next to the DMG one, and it changes the core in one way only: `f32` and fixed-size vectors become IR value types. Everything else is new kit code beside the M1 code: an IR verifier, a reference interpreter, the first LIR stage and a GLSL backend, a comparison harness, and the pixel debugger. H2 is judged by how much of M1's IR, lowering and JS backend had to change beyond the planned value types; record every such change as it happens, in the leaf's notes, so the findings leaf can count them.

**Order and why.**

1. **Two leaves start at once:** the survey of the Uncommon Math sketches (it picks the two H3 sketches and lists the intrinsics they need) and the IR verifier (small, and every later lowering runs it).
2. **The value types** come next, because the interpreter, both backends and the `fields` Dialect all read them.
3. **The `fields` Dialect** waits on the survey (which intrinsics) and the types.
4. **The interpreter and the JS backend's support for the new types** can then run in parallel; the GLSL stage waits on the Dialect.
5. **The comparison harness** waits on all three outputs, and its GLSL half waits on a decision for Ben: how the GLSL side runs where there is no browser.
6. **The pixel debugger and the H3 port** come last. The findings leaf closes M2.

**Already decided, binding every leaf:** the rulings above; one front end (the parser; tracing stays in the backlog); the glossary's terms; no code copied from ds-js-os, Candela or CJI ([the passes note](2026-11-23-passes-queries-and-several-irs.md), "Ruling on reuse"); checks run in the browser as the baseline, and Node is an extra ([delivery decisions](2026-11-23-delivery-decisions.md)); `kit/` imports no Node built-ins.

**The open decision.** The browser runs GLSL (WebGL2 works inside an artifact; [M0](2026-11-23-m0-platform-probe.md)), but Node does not, and agents test in Node. Either the kit's GLSL comparison runs only in a page and agents drive that page, or a headless browser becomes a dev dependency so `npm test` can run it. It is a dependency and so Ben's call; the leaf below states the options.

## Tasks

Imported into `job` on 2026-11-23 under the Workbench Kit root (8qHPT3); the tracker is the plan from then on.

```yaml
tasks:
  - title: 'M2: Shader slice'
    desc: |
      Tests H2 (a neutral core covers games and shaders) and H3 (typed operators make shader code pleasant without confusing authors). A tiny `fields` Dialect; one Kernel emitted to JS and GLSL; a comparison within a tolerance; the pixel debugger.

      Plan, order and binding rulings: project/2026-11-23-m2-shader-slice-plan.md.
    children:
      - title: Survey the Uncommon Math fragment sketches and pick two for H3
        ref: survey
        desc: |
          Why: H3 ports two of the book's fragment sketches both ways (typed operators, and plain-JS `add(mul(…))` calls) and compares them. The `fields` Dialect's intrinsics and Iteration Spaces should be the ones real sketches use, not guesses. This leaf picks the two sketches and lists what they need.

          What: a dated finding, project/2026-11-2x-uncommon-math-sketches.md, that lists every fragment-style sketch in the book (a function evaluated per pixel or per point), and for each: its chapter, what it draws, its inputs and parameters, the operations it uses (vector arithmetic, swizzles, branches, loops and their bounds, noise, textures, state across frames), and whether it fits the Runtime Subset as it stands. Then a recommendation of two sketches for H3: one simple, one that exercises vectors and a bounded loop, with the reasons. Then the union of intrinsics and types those two need, which the `fields` Dialect leaf will implement.

          Already decided: the source is local/uncommon-math-0.1.0.html, a gitignored 4.8 MB single-page app whose chapters are built from JS data; it lives only in the main checkout, so pass its absolute path (/Users/ben/git/workbench/local/uncommon-math-0.1.0.html) and never copy it into the repo. Extraction code, if any, goes in scripts/um-survey/ with a README, so the survey can be re-run.

          Out of scope: designing the Dialect, porting anything. Risks: sketches may be written as canvas loops rather than per-pixel functions; say so, and say what that means for H3.
        criteria:
          - The finding lists every fragment-style sketch with its operations and subset fit, and names the command that reproduces the list
          - It recommends two sketches for H3 with reasons, and lists the intrinsics and types they need
      - title: An IR verifier, run after every lowering
        ref: verifier
        desc: |
          Why: M2 adds stages below the IR (the GLSL LIR) and new value types, and the passes ruling makes a verifier the safety net for every stage ([the passes note](../project/2026-11-23-passes-queries-and-several-irs.md); M1 findings, "What M2 and M3 should change"). M1 has none; its checks live inside lowering.

          What: kit/ir/verify.js, `verify(kernel)` returning diagnostics (never throwing), checking the IR's own invariants as kit/ir/README.md states them: every expression's type agrees with its operands and its node kind; every name is bound before use; every statement's recorded effects cover what it does; loops are bounded; every node carries a span; the JSON form round-trips. Lowering (kit/lower) runs it on each Kernel it produces, behind a flag the tests turn on, and a failure is a kit bug (its own diagnostic code range, documented in kit/ir/README.md). All M1 goldens (scripts/dmg-lower) and every lowered lambda in the survey must pass it.

          TDD: a test per invariant that builds a broken Kernel by hand and sees the right diagnostic, plus a test that every golden verifies.

          Seams: kit/ir (new file), the call in kit/lower/index.js. Out of scope: rules for f32 and vectors (the value-types leaf adds them), and LIR rules (the GLSL leaf adds those). Risk: the verifier finds real bugs in M1's lowering; file each as an issue with --found-in this leaf rather than fixing it here, unless it is a one-line fix.
        criteria:
          - verify() reports each broken invariant with its own code, with a test per invariant
          - Every M1 golden and every lowered survey lambda verifies clean, and lowering runs the verifier under test
      - title: f32 and fixed-size vectors as IR value types
        ref: types
        blockedBy: [verifier]
        desc: |
          Why: Ben ruled that `f32` and fixed-size vectors become IR value types; this is the one change M2 makes to the core, and H2's test of it. Shader code is vectors of f32 throughout, and typed operators (D1) need operand types to resolve on.

          What: the IR's value types gain `f32` and `vec` of n = 2, 3 or 4 of a scalar type (at least f32), with the operations shaders need: componentwise arithmetic, scalar-times-vector, component access (`.x`, `.y`, and swizzles if the survey shows them), construction, and explicit conversions between f64 and f32. The JSON form, the listing (kit/ir/print.js) and the verifier understand them. Integer sizes stay on storage (store rules), as in M1. Today every value is f64; existing Kernels and goldens must not change.

          Already decided: typed operators (D1, the proposal §5.7): `uv + k * q` on vectors means vector arithmetic. Nominal Dialect types: a Dialect's `vec2` and `color` never join even when both are three f32s (the strict-join ruling in the M1 plan, "Subset widenings after M1"); the IR may share a structural vector underneath, but lowering keeps the nominal names apart. No implicit f64↔f32 conversion anywhere; a mixed operation is a type error with a fix.

          Open, the builder's call (record the choice and why in kit/ir/README.md): whether vector operations are typed `binary` nodes or intrinsic calls; how a nominal Dialect type maps to its structural vector.

          Seams: kit/ir (types.js, ir.d.ts, json.js, print.js, verify.js), kit/lower where operator typing lives (expr.js). Not the backends: the JS-backend and GLSL leaves add emission. Record in this leaf's notes every change to existing M1 code, for H2's count.
        criteria:
          - The IR has f32 and vec2..4 types with arithmetic, access, construction and conversions, each with tests, and the verifier checks them
          - Every M1 golden is byte-identical and npm test passes, so the change did not disturb games
      - title: The fields Dialect, its Grammar, and typed operators in lowering
        ref: fields
        blockedBy: [survey, types]
        desc: |
          Why: the second Dialect is H2's test (does the neutral core cover shaders?) and the vehicle for H3. It should be the smallest Dialect that carries the two sketches the survey chose.

          What: kit/dialects/fields/ with a Dialect (types such as `vec2` and `color`, the `pixel` Iteration Space whose Kernel takes `uv` and returns a color, the intrinsics the survey listed, with each target's spelling) and a Grammar small enough to write a fields Program (one construct with `param` declarations and a `pixel` Runtime Lambda; the proposal's §8.1 and §8.2 sketch both). Lowering resolves operators on Dialect types (D1), so `uv * 2.0 + vec2(t, 0)` lowers to vector arithmetic, and a type error names the types and the fix. The two survey sketches, written as fields Programs, lower to Kernels that verify. Params are uniforms: constant across one frame, live between frames.

          Already decided: D1 (typed operators; such Lambdas no longer run as plain JS); nominal types; no `Any`; the strict join for parameter types; the Library (intrinsics written in the Runtime Subset, such as `fbm`) lowers like any helper, so it reaches every backend (glossary: Library).

          Seams: kit/dialects/fields (new), kit/lower (operator resolution; keep DMG behavior identical), kit/lower/environment.d.ts if the Environment needs a new shape. Look at kit/dialects/dmg for the existing pattern before inventing a new one. Record every change to existing M1 code in this leaf's notes, for H2.

          Out of scope: backends; the Definition API's generic `.construct()` machinery (M3, H4), so hand-written builders are fine here.
        criteria:
          - Both survey sketches lower from fields Programs to Kernels that verify, with tests
          - Operator type errors name both types and a fix, with tests; the DMG survey and goldens are unchanged
      - title: A reference interpreter over the IR
        ref: interp
        blockedBy: [types]
        desc: |
          Why: with typed operators a fields Lambda has no runnable closure, so something must say what a Kernel means. Ben ruled that a reference interpreter over the IR is M2's oracle; the JS and GLSL outputs are each compared against it (floats within D5's tolerance, integers exactly). The proposal's §12 asks for "a small, slow, obviously correct interpreter".

          What: kit/interp/, `run(kernel, inputs, env)` that evaluates a Kernel by walking the IR, with f64 as JS doubles, f32 rounded with Math.fround after every operation, vectors componentwise, and the M1 integer store rules. Intrinsics come from the Dialect (each intrinsic gets a reference implementation, kept separate from the JS backend's spelling so the two can disagree and be caught). Pure Kernels are the requirement. Then, as its own test of fidelity, it runs the M1 Kernels whose effects the DMG harness can supply and agrees with the emitted JS on a seeded trace; if effectful Kernels prove costly, stop at pure ones and say why in a note.

          Obviously correct beats fast: no optimization, no sharing of code with kit/emit/js beyond the IR types.

          Seams: kit/interp (new), kit/dialects/* for intrinsic reference implementations. Out of scope: stepping UI (the pixel debugger leaf builds on this, so expose a hook per evaluated node with its span).
        criteria:
          - The interpreter runs pure Kernels over f64, f32 and vectors, with a test per node kind
          - It agrees with emitted JS on the M1 Kernels it supports, or a note says why it stops at pure Kernels
          - It exposes a per-node evaluation hook carrying spans, for the debugger
      - title: The JS backend emits f32 and vectors
        ref: emitjs
        blockedBy: [types, fields]
        desc: |
          Why: the JS backend is the stage and the pixel debugger's CPU path, and the proposal says it enforces a Dialect's numeric rules, including f32 rounding (§6).

          What: kit/emit/js emits the new types: f32 operations rounded with Math.fround, vector operations in a representation the builder chooses (scalarized locals, arrays or typed arrays; record the choice and the reason in kit/emit/js/README.md), and the fields intrinsics in their JS spelling. A fields Kernel emits to a function the harness can call per pixel. The output agrees exactly with the reference interpreter where both exist (same rounding), which the harness leaf checks at scale; here, a test per new node kind.

          Seams: kit/emit/js only. DMG emission must stay byte-identical (the emit goldens and the dmg-diff runs). Record any change to existing M1 code in a note, for H2.
        criteria:
          - f32, vector and fields-intrinsic nodes emit, with a test per node kind
          - The DMG emit tests and dmg-diff over 04–07 are unchanged
      - title: 'Decision: how the GLSL comparison runs outside a browser'
        ref: glsl-runner
        labels: [decision]
        desc: |
          The question for Ben: agents test in Node, and Node has no WebGL. WebGL2 works inside an artifact page (M0), and the delivery rulings make the browser the baseline for checks, with Node as an extra.

          Options:
          (a) Page only. The comparison harness is kit code that runs in a page; agents check GLSL by opening that page in a browser (the built-in browser or Claude in Chrome) and reading its report. No new dependency; GLSL is never in `npm test`, so a regression is caught only when someone opens the page.
          (b) A headless browser as a dev dependency (Playwright or Puppeteer driving headless Chromium, whose software GL renderer gives WebGL2 without a GPU). `npm test` or the prerelease suite runs the page and reads the report. One large dev dependency (a Chromium download), and the software renderer's floats may differ from a real GPU's, so the tolerance must hold on real hardware too.
          (c) Both: (b) in the prerelease suite, and the page for real-GPU runs.

          Recommendation: (c), with the dependency in devDependencies only and the headless run in the prerelease suite, so the fast suite stays dependency-free and fast.

          Waiting on it: the GLSL half of the comparison harness. The GLSL backend itself can proceed, since its output can be unit-tested as text.
      - title: The first LIR stage and the GLSL backend
        ref: glsl
        blockedBy: [fields, verifier]
        desc: |
          Why: GLSL is the first backend with no host to lean on, so Ben ruled that it owns the first LIR stage, with an IR verifier after each lowering; wasm follows later on that LIR. A fields Kernel over `pixel` must become a GLSL ES 3.00 fragment shader (WebGL2, D3).

          What: a lowering from the IR to an LIR (kit/lir/ or a name the builder argues for) in which what GLSL cannot leave implicit becomes explicit: no f64 (each f64 is narrowed explicitly, and a Kernel whose meaning depends on f64 precision is rejected with a diagnostic), explicit int/float conversions, intrinsics bound to their GLSL spelling. The verifier gains LIR rules and runs after the lowering. Then kit/emit/glsl/ emits a fragment shader: params as uniforms, `uv` from the fragment coordinate, the color to the output, and a line map from GLSL lines to spans (as the JS backend has). A Kernel the GLSL target cannot take (effects, an Iteration Space it does not accept) is refused with the proposal's capability message (§6, "Capabilities").

          Seams: new kit directories; kit/ir/verify.js for LIR rules; the fields Dialect's GLSL spellings. Unit tests compare emitted text against goldens; running the shader is the harness leaf's job. Keep in mind the backlog's "IR stages below the core" entry: this LIR is that stage's first form, so name it and document it in its own README.

          Out of scope: wasm, WGSL, integer stores (fields has none; if a survey sketch needs one, say so and stop).
        criteria:
          - The two survey Kernels lower to LIR that verifies and emit GLSL ES 3.00 with a line map, with golden tests
          - A Kernel GLSL cannot take is refused with a capability diagnostic, with a test
      - title: The comparison harness, JS and GLSL against the interpreter
        ref: harness
        blockedBy: [interp, emitjs, glsl, glsl-runner]
        desc: |
          Why: this is M2's "done when": the same source drives both backends, and they agree with the reference. D5: floats within a tolerance the target declares, integers exactly.

          What: a harness (library in kit/, runnable in a page; a thin CLI in scripts/ for Node) that evaluates a fields Kernel over a grid of pixels and a set of param values through the interpreter, the JS backend and GLSL (read back from a framebuffer), and reports the worst difference per pair, the pixel, and the source line. JS against the interpreter must match exactly. GLSL against the interpreter must fall within a tolerance the GLSL target declares; this leaf proposes the figure from measurement on the software renderer and, if possible, a real GPU, and records it. Planted faults (an operator swapped, a constant nudged, a component swizzled) must be caught: report how many and which escape, as M1 did for dmg-diff.

          Seams: the interpreter, both backends, and the runner Ben chooses in the decision leaf. Record figures in an M2 findings draft with the command that reproduces each.
        criteria:
          - Both survey Kernels agree, JS against the interpreter exactly and GLSL within the declared tolerance, over a recorded grid and param set
          - The planted-fault run is recorded, with every escaped fault explained
      - title: The pixel debugger
        ref: debugger
        blockedBy: [interp, fields]
        desc: |
          Why: the proposal promises "a pixel debugger for free" (§12): because every shader Kernel also has a CPU form, one pixel can be run and stepped through. It is part of M2's roadmap row.

          What: given a fields Program, a pixel and params, step through the Kernel's evaluation node by node with each value and its source span, using the interpreter's evaluation hook. A library API in kit/ plus a preview page that renders the shader, lets a reader click a pixel, and shows the source with the current span highlighted and the values beside it (the Previews principle: the page also renders fixed states for review). Show where the interpreter's value and the GPU's differ, when the harness has a GPU value for that pixel.

          Seams: the interpreter's hook, the GLSL backend for the image. Keep the library free of DOM code; the page is a thin consumer. Out of scope: skins and the workbench shell (M4).
        criteria:
          - The library steps one pixel through a Kernel with values and spans, with tests
          - A preview page shows a clicked pixel's trace over the highlighted source, checked in a browser with a screenshot in the leaf's notes
      - title: Port two sketches both ways and test H3
        ref: h3
        blockedBy: [harness]
        desc: |
          Why: H3, "typed operators make shader code pleasant without confusing authors"; it fails if authors or models keep expecting plain-JS behavior. Ben ruled for typed operators (D1) before testing them, so this is the check on that ruling.

          What: the two survey sketches written twice, as fields Programs with typed operators and as plain-JS `add(mul(…))` calls, compared on length, readability, and errors. Then the model test: fresh agents given only the fields Dialect's documentation write a few new sketches in each style; count the errors that come from expecting plain-JS semantics (a vector printed or compared as an object, `+` used for concatenation, an operator on mismatched types), and how the diagnostics guided the fix. Record the result in the M2 findings.

          Open, the builder's call: how many fresh agents and sketches (enough to see a pattern; say how many and why). Which model writes them: say which, since the subject is models.
        criteria:
          - Both sketches exist in both styles and both pass the harness
          - The fresh-agent run is recorded with its error counts by kind, and an H3 verdict
      - title: M2 findings, H2 and H3
        ref: findings
        blockedBy: [h3, debugger]
        desc: |
          Why: M2 exists to test H2 and H3; the milestone closes on a written verdict, as M1 did (project/2026-11-23-m1-findings.md is the model).

          What: project/<date>-m2-findings.md: what was run (every figure with its command); H2, counting every change M2 made to M1's IR, lowering and JS backend beyond the planned value types (the leaves' notes record them) and judging whether the core stayed neutral; H3, from the port and the fresh-agent run; the tolerance figure and the planted-fault results; and what M3 should change. Correct earlier docs in place where a finding overturns them (the proposal's §5–§6, §12, the backlog entries for LIR and tracing).
        criteria:
          - The findings doc gives H2 and H3 verdicts with reproducible figures
          - Earlier docs that M2's findings overturn are corrected in place, as marked blocks
```
