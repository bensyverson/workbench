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

## 2026-11-23: a range analysis on a small lattice

Interval ranges over the IR, to prove a sized store never wraps (so a C backend can skip the coercion) and to back the loop-bound check L007. Parked until a backend or check needs it. Un-park when a hostless backend wants to drop coercions, or when L007 needs more than syntactic bounds. Prior art: CJI's `src/ranges.js`; keep the API concrete (Manuel's caution).

## 2026-11-23: tracing lambdas with symbolic proxies

A second front end for pure, branch-free dialects: call the lambda with symbolic values and record a hash-consed expression graph, as Candela's `src/fx.js` does. It cannot branch, so it cannot replace parsing for game lambdas. Un-park when M2's shader dialect is designed.
