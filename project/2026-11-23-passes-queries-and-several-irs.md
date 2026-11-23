# Passes, queries and several IRs: input from Manuel and from ds-js-os

*2026-11-23 · finding · input to M2 and M3, not to M1. Sources: Ben's conversation with Manuel Odendahl (summary pasted by Ben), and a read-only survey of [wesen/2026-10-20--ds-js-os](https://github.com/wesen/2026-10-20--ds-js-os) as of its last push on 2026-11-23.*

## What Manuel said

- **Design the APIs for inspecting and transforming a compiler before the shape of one IR.** An agent should be able to ask "find the loops", "show the dominance tree" or "what happened to this variable", and then write a pass against the answer. The compiler supplies whatever representation the question needs. He found afterwards that Rust's pass manager reflects part of this.
- **Use several IRs, not one graph.** Rust lowers AST → HIR → THIR → MIR → LLVM IR. His own prompt tends to produce one graph, one IR and one compilation step, which is too little for the lowering and optimization he wants.
- **Make passes specific to the domain.** Don't rebuild LLVM for whack-a-mole. An agent should be able to generate a small pass in the domain's own terms ("a pyramid pass") when a task needs one. IRs also make a program visual and checkable, and let feedback arrive in the domain's terms rather than as a register spill.
- **Lattices and fixed points** give analyses such as constant propagation or range analysis a shared vocabulary. In his demo, a range analysis warned that an interval lattice of infinite height needs widening, and a sign analysis flagged a non-monotone transfer. His caution: an API that is too abstract defeats an agent asked a concrete question, such as register allocation.
- **His Game Boy demo was a promising prototype, not proof of native compilation.** He and Ben suspected that its C output did not account for the running game, and that the browser was running JavaScript. Runtime callbacks are opaque closures; compiling them needs captured variables handled and types inferred.

## What M1 already shows

- **The suspicion about the C is right, for the DMG Workbench.** The runtime runs each callback as a JavaScript closure, and the C emitter bypasses the IR ([the DMG read](2026-11-23-dmg-workbench-read.md), L4 and L5; the proposal's §3).
- **The opaque callbacks of presets 04–07 are now data.** All 25 parse, lower to a typed IR and emit JavaScript that matches the original on a seeded trace (`npm test`, `scripts/dmg-lower/test/emit-oracle.test.js`, f8f6d3d). Types the DMG never declares (event payloads, method signatures) are inferred across the whole program, by iterating to a fixed point (`kit/lower/index.js`, `lowerProgram`).
- **Captured variables are counted, not solved.** 11 of 126 lambdas use top-level helpers of their preset (`npm run inventory`, field `topLevelRefs`). Lowering rejects them with L001.

## What it means for the plan

1. **Several IRs.** The proposal's §5.1 has one core IR with every backend hanging off it. M1 already needs a second level. A store's integer coercion is free in the JS backend, because the DMG proxy performs it, but a C or wasm backend has no such host and needs explicit wrap and clamp operations ([the M1 plan](2026-11-23-m1-game-slice-plan.md), "Integer semantics in the IR"). So treat the core IR as one stage in a chain, and let a backend or dialect add its own lowering stages. This shapes M2 and M5, not M1.
2. **A query and pass API.** The IR records every statement's effects, so questions like "who writes `Mole.ttl`?" are cheap. The proposal promises only a diffable JSON form. Before the kit is extracted (M3), add a small API: loops, effects, def-use, reaching stores, and a pass manager. Then H10 ("the IR earns its keep") can be judged by the questions it answers, not only by whether closures can be removed.
3. **Who owns the passes** is open; see below.
4. **Lattices** pay off first in a range analysis. A range analysis can prove that a `u8` store never wraps, so a C backend can skip the coercion. It can also back the loop-bound check (L007), which the IR review found too weak. Parked until a backend needs it.

## Who owns the passes (open, for Ben)

The proposal's §7 puts IR, analyses and optimization passes in the kit. Manuel's model has agents write domain passes per workbench.

| | The kit owns every pass | Dialects and agents add passes; the kit owns the pass manager, query API and verifier |
|---|---|---|
| Correctness | One pipeline, tested once | Each workbench brings new pass code. It needs the safety net to be automatic: an IR verifier after every pass, and the differential check §12 already requires of every optimization pass |
| Kit size (H7) | Grows toward a general compiler as domains ask for more | Stays small; domain cleverness lives with the domain |
| What the agent must learn (H5) | Little: it never writes passes | The query and pass API becomes part of the ~8,000-token documentation, and a public contract that is costly to change |
| Feedback | In the kit's general terms | In the domain's terms, which Manuel wants |
| Reference interpreter | Optional (M1 decided against one) | Likely needed, to check a pass with no closure to compare against (CJI below does this per IR) |

A middle path: the kit owns the core IR, its invariants (bounded loops, recorded effects, spans), a verifier, the query API and the stages below the core. Dialects own the stages above the core and any optional optimizations, each gated by the verifier and the differential check. Testing it would be a new hypothesis for M3: *a fresh agent can write a correct domain pass against the API from the documentation alone.*

## ds-js-os: working code for each idea

Manuel's repo ("PicoCalc OS and its compilers": a handheld on an ESP32-P4, with apps in "Typed", a typed JavaScript dialect compiled to RV32 and to wasm) has no license. We take ideas only (ruling below). Pointers:

- **Several IRs, tested per stage:** `compiler/cji/`, a nanopass compiler for a JavaScript subset from the book *Compiling JavaScript, Incrementally*. It has an interpreter for every intermediate language, `run-tests.js --oracle` checking each pass against Node, rejection tests (`tests/reject/*.err`) and mutation testing (`tools/mutate.mjs`).
- **Lattices:** CJI's type inference by abstract interpretation (`src/infer.js`) and interval range analysis (`src/ranges.js`).
- **A query API over compiler output:** `tools/trace-repl/`, JavaScript sessions over pass results. This is the TraceRepl Manuel invited Ben to point an agent at.
- **Another front end:** Candela (`firmware/third_party/candela/src/fx.js`), a path-tracer workbench from the same prompt family, turns lambdas into a hash-consed expression graph by calling them with symbolic proxies. It cannot branch (E202: use `fx.select`), so it cannot take the DMG lambdas, which confirms parsing for M1. It suits branch-free dialects such as M2's shaders, and evaluates one graph four ways: WGSL, CPU JavaScript, interval bounds and printing.
- **An IR verifier and a wasm backend:** the Typed compiler (`compiler/typed/`, `docs/typed-compiler.md`) declares each opcode once with its operand types and an effects bitset, checks a typed operand stack over about 4,200 tapes (`tests/compiler/typed-tape.test.mjs`), emits wasm bytes directly, and makes f32 results identical across targets.

## Ruling on reuse (Ben, 2026-11-23)

Take inspiration from ds-js-os, Candela and CJI, but copy no code: they carry no license, and even a small change in our approach will likely need something different anyway. This extends the "no verbatim reuse" ruling in [the delivery decisions](2026-11-23-delivery-decisions.md).
