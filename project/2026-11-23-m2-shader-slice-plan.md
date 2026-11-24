# M2: the shader slice

*2026-11-23 · plan, being drafted · the roadmap row is in [the proposal §15](2026-11-23-workbench-kit-proposal.md). The rulings below were made before the plan was written, and they bind it. The `tasks:` block is still to be written (see [the handoff](2026-11-23-handoff-widenings.md), "Next").*

**Goal.** Build a tiny `fields` Dialect, one Kernel emitted to both JS and GLSL, a comparison within a tolerance, and the pixel debugger. It tests H2 (a neutral core covers games and shaders) and H3 (typed operators make shader code pleasant without confusing authors).

## Rulings (2026-11-23, with Ben, who accepted the main thread's recommendations)

- **Typed operators (D1): yes.** Operators take their meaning from Dialect types (`uv + k * q` on vectors). So the fields Dialect's Runtime Lambdas run only through the IR; they are no longer runnable as plain JavaScript. H3 tests whether authors and models accept this. See the proposal, §5.7.
- **A reference interpreter over the IR is M2's oracle.** With no runnable closure, the interpreter says what a Kernel means. The JS and GLSL outputs are each compared against it, floats within D5's tolerance and integers exactly. M1 declined to build one; [the M1 findings](2026-11-23-m1-findings.md) flagged it as necessary here.
- **`f32` and fixed-size vectors become IR value types.** Today every value is an `f64`. Integer sizes stay on storage (store rules), as before. This is the one change M2 makes to the core, and H2's test of it.
- **No wasm in M2.** GLSL is the first backend with no host to lean on, so it owns the first LIR stage, with an IR verifier after each lowering. Wasm follows later, on that LIR.
- **Source material:** the Uncommon Math book is `local/uncommon-math-0.1.0.html`. It is gitignored, a 4.8 MB single-page app whose chapters are built from JS data. Two of its fragment sketches are ported both ways for H3; which two is the plan's first leaf (a survey).

## Inputs for drafting the rest

- [The M1 findings](2026-11-23-m1-findings.md), "What M2 and M3 should change."
- [Passes, queries and several IRs](2026-11-23-passes-queries-and-several-irs.md).
- [The backlog](backlog.md): LIR, range analysis, and the tracing front end. Candela's tracing suits branch-free shaders; M2 still uses the parser as its one front end unless the plan argues otherwise.
- The proposal: §8.1 (the `fields` Dialect sketch), D3 (backend order) and D5 (tolerance).
- [The glossary](../kit/glossary.md), for terms.
