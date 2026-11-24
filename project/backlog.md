# Backlog

Work decided against, parked rather than dropped in silence. Nothing here is scheduled or blocking — active work lives in `job`. Read it before proposing something that sounds novel; it may already have been weighed and parked.

- **One dated H2 per item:** what it is, why it's parked, and *what would un-park it*.
- **Delete an item when it lands, or when it stops being plausible.** A long list is one nobody reads.
- **Something parked that turns out to be needed becomes a task in `job`** — move it, don't work it from here.

Format: one dated H2 per entry, a headline, then what it is, why it's parked, and the trigger that would revive it.

---

## 2026-11-23: a query and pass API over the IR

An agent-facing API over the IR (loops, effects, def-use, reaching stores) plus a pass manager, so an agent asks questions and writes passes rather than reading IR JSON. Manuel's advice; TraceRepl in ds-js-os is the working example. Parked because M1 needs neither. Un-park at the start of M3 (kit extraction), or sooner if an agent needs an answer the JSON form can't give. Who may write passes is open: [passes, queries and several IRs](2026-11-23-passes-queries-and-several-irs.md).

## 2026-11-23: IR stages below the core for hostless backends

A lower IR in which stores carry explicit wrap and clamp operations, for backends with no DMG-style proxy to coerce for them (C, wasm). Parked because the JS backend leaves coercion to the host. Un-park when the first hostless backend starts (M2 if GLSL needs integer stores, otherwise M5). CJI's per-stage interpreters are the model for testing each stage.

> **Corrected 2026-11-23 (M2):** the first stage landed in M2, for a different reason than this entry gave: GLSL needed it, not integer stores. `kit/lir` makes f64 narrowing, uniforms, choice indices and intrinsic spellings explicit, has its own verifier (W001–W011) and diagnostics (R001–R006), and `kit/emit/glsl` reads it ([its README](../kit/lir/README.md)). The entry stays, narrowed to what is still parked: the **integer-store stage** (explicit wrap and clamp), which no shader needs; un-park it when the first hostless integer backend starts (M5). See [the M2 findings](2026-11-23-m2-findings.md).

## 2026-11-23: a range analysis on a small lattice

Interval ranges over the IR, to prove a sized store never wraps (so a C backend can skip the coercion) and to back the loop-bound check L007. Parked until a backend or check needs it. Un-park when a hostless backend wants to drop coercions, or when L007 needs more than syntactic bounds. Prior art: CJI's `src/ranges.js`; keep the API concrete (Manuel's caution).

> **Corrected 2026-11-23 (M2):** M2 supplied the second use this entry waited for. A fields param can bound a loop but its value is unchecked there (a count param needs a `max` below 2^24 or the f32 counter stops changing), and a shader's output staying in [0, 1] is a property worth proving ([guarantees and testing](2026-11-23-guarantees-and-testing.md)). Still parked; **un-park at the start of M3**, with the query API. See [the M2 findings](2026-11-23-m2-findings.md).

## 2026-11-23: tracing lambdas with symbolic proxies

A second front end for pure, branch-free dialects: call the lambda with symbolic values and record a hash-consed expression graph, as Candela's `src/fx.js` does. It cannot branch, so it cannot replace parsing for game lambdas. Un-park when M2's shader dialect is designed.

> **Corrected 2026-11-23 (M2):** the trigger fired (the shader Dialect was designed) and the answer is to stay parked. M2 used the parser as its one front end, and the fields programs are not branch-free: `grep -c -E '\bif \('` finds 5 in `programs/uv-remaps.js`, 4 in `programs/domain-warp.js` and 1 plus 3 `for` loops in `library.js`, so a tracer that cannot branch could not have taken them as written. Un-park only for a pure, branch-free Dialect that wants an expression graph. See [the M2 findings](2026-11-23-m2-findings.md).

## 2026-11-23: a dream-code checker for phase 1 of the workflow

This checks example programs (the "dream code" a model writes before any dialect exists) against themselves. It checks the subset, harvests the grammar through a recording proxy, builds a provisional environment from the examples' own declarations, and lowers in an "open world" mode that turns unknown intrinsics into a wishlist with joined signatures. Ben wants it ("a fascinating addition"). Design: [a dream-code checker](2026-11-23-dream-code-checker.md). It is parked only because it belongs to the kit's workflow, not to M1 or M2. Un-park when M3 is planned, alongside H4.
