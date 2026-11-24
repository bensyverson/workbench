# Backend direction: wasm first, C as export, Linux-in-wasm as a sandbox

*2026-11-24. A discussion note from Ben's questions after the architecture review: why lower to IR and emit C or Rust rather than compile to machine code ourselves; whether to vendor Zig (as wasm) to compile C in the browser; and what running Linux in wasm ([unkernel](https://github.com/pithings/unkernel)) unlocks. Ben agreed with the conclusions below (2026-11-24); nothing here changes the roadmap's order, which is the [architecture synthesis](2026-11-24-architecture-synthesis.md)'s.*

## In the browser, the real assembly is wasm

A page cannot run x86 or ARM code, so "fully lower to asm" means emitting WebAssembly. The proposal already says so (§6: "We emit the binary directly"); C and Rust were always readable export targets, not the route to execution.

Wasm fits our IR closely: structured control flow, typed `f32` / `f64` / `i32`, and a stack machine, so the emitter needs no register allocation, no instruction selection and no SSA. The browser's engine compiles it to machine code. So the obstacle was never "making a compiler is hard": the hard parts of a native backend are the parts we do not need. An IR-to-wasm emitter should be about the size of the GLSL emitter (estimate).

**Where our provenance pays off is domain-level passes, not instruction selection.** The kit knows what no C compiler can recover: a loop runs over at most 40 sprites, a parameter is fixed at build time, a Kernel writes only `Mole.ttl`. That allows partial evaluation of build-time values, bounds checks removed by known ranges, entity state laid out as flat arrays, per-pixel Kernels fused, and code specialized by binding time. Those passes, emitted to wasm, are the compilation worth owning. They are also the first real client for the parked pass manager (backlog, "a pass manager and H11").

**The one case for our own machine code** is an exotic target a Dialect brings, such as the Game Boy's SM83 for a real ROM: known integer widths, bounded loops and declared effects make an 8-bit backend tractable where a general C compiler struggles. This is the proposal's "target plugins".

**Suggestion, not ruled:** the wasm emitter is now M6 (after Composition and Form and book). Domain passes are where ambitious workbenches (whole simulations, CPU path tracing) turn into measurable speed, so it may deserve to move up once Composition lands.

## Zig (or another C compiler) in the page

Not on the main path. IR → C → a compiler of roughly 10 MB or more (estimate) → wasm is a detour beside IR → wasm through our own small emitter, and it crowds the 16 MiB page limit. A C compiler's real value is **checking our C output**: the DMG Workbench's C emitter produced code that would not compile, and nothing noticed. Compiling emitted C, running it and comparing with the reference interpreter belongs in the harness, first where a shell exists (Node, CI). Parked: see the backlog.

## Linux in wasm (unkernel)

From its README (read 2026-11-24; the figures are the project's own):

- The kernel is compiled to native wasm with a real MMU; syscalls cost about native (`getppid` 172 ns against 110), fork is faster than native.
- User programs are unmodified aarch64 binaries on an emulator written in Zig: an interpreter at about 250–300 million guest instructions per second under Node, and a JIT to wasm worth 1.6–2.3× on top. Pure computation is "well behind native", and floating point always runs on the interpreter.
- About 10 MB to download, plus a 4 MB Alpine image fetched from GitHub; a prompt in 0.3 s. Several CPUs need a cross-origin-isolated page.
- The kernel is GPL-2.0; the JavaScript SDK is MIT.

What that means here:

1. **Not a target for our programs.** Code compiled and run inside it goes through an aarch64 emulator; wasm we emit runs directly. It strengthens the case for emitting wasm ourselves.
2. **A narrow capability inside an artifact:** no package installs (pages cannot reach other hosts), about 14 MB of the 16 MiB limit, one CPU (M0 found `SharedArrayBuffer` unavailable), and shipping a GPL kernel binary sits badly with the delivery decisions' business-friendly aim. What fits: a sandbox with a tiny fixed toolset, such as TinyCC to check emitted C in the page, or a real shell for the in-page agent. Outside an artifact (its CLI and SDK) none of these limits apply, but native compilers are usually there too.
3. **A precedent worth noting:** its JIT emits wasm that "matches the interpreter bit for bit", the same architecture as ours (a reference interpreter as the oracle, emitted code checked against it), built by a small team.

A unikernel booted on an emulated x86 in wasm is the slowest of the options. Writing wasm directly is what the kit does anyway.

## The backend picture

| Target | Role |
|---|---|
| JavaScript | now; the default |
| WebAssembly, emitted directly | the "real compilation", with domain passes |
| GLSL / WGSL | pure data-parallel Kernels |
| C / Rust text | export, checked by compiling where a compiler exists |
| Dialect plugins (SM83, …) | exotic machine code |
| Linux in wasm | an opt-in sandbox for foreign tools, not a target (backlog) |
