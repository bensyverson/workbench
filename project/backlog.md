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

## 2026-11-24: a program record in the kit core

A uniform node list (id, kind, declared data, span, phase, owned Kernels) that Dialects fill in, with edges derived from Kernel effects plus edges implied by slot types (a slot taking a table and returning a table). The proposal's §5.2 "Declarations" promised it. Parked because it falls out of a generated Grammar builder, which sees every call; designing it ahead of that builder would shape it around three hand-written versions. The counter-argument: a record with opaque `data` is an index, and a `nodes()`/`edges()`/`resolve()` protocol each Dialect implements may be as good and cheaper; the evidence to settle it is two consumers (who reads or writes P, what is downstream of a param; resolve an address to a span) written over all three Dialects. Un-park when the minimal Grammar's generated builder exists and a consumer (the lab API's addresses, a graph view, the query API) needs a uniform node list. Not a generic DAG: DMG's graph is cyclic and a field's is a star. See the M3 plan's revision blocks and job leaves RJtpuF and UWVq0O.

## 2026-11-24: a pass manager and H11

A way for a Dialect to add a pass above the core, gated by the verifier and the differential check. Parked because nothing consumes an optimization yet (the JS backend is DMG's only backend). Un-park when the Kernel queries have a real client and a backend wants a transformation; H11 is "not tested" in M3 until then. This extends the 2026-11-23 query and pass API entry, whose un-park trigger ("start of M3") fired and was answered: queries only, and only with a client (rewrite `kit/emit/glsl/capabilities.js` on them, or the data Dialect's "which params does this lambda read"). Job xMYcAM.

## 2026-11-24: re-declaring DMG through the Definition API

The kit has no DMG Grammar: `kit/dialects/dmg` is only the Environment, derived from declarations extracted from the original builder; the builder (about 145 lines) and `compile()` (about 230) live in the original HTML, and the delivery decisions forbid copying them. Re-declaring DMG means writing a DMG builder from scratch (9 injected globals, `art` templates, the nested `board(b => ...)`, `timer`'s optional middle argument, aliases, fragment merge order, `bake`). It is M3's largest possible leaf and the place an API would bloat. Parked until the minimal Grammar is proved on fields and the data Dialect. The M1 survey (126/111/7/4/4), goldens and differential run read lambdas from the original builder, so they are regression checks, not H4 evidence; pointing them at a generated builder's record would make them evidence. Job Ieojrm.

## 2026-11-24: a kit boundary, a generic differential harness, and a packaged distribution

Move the Dialects out of `kit/`, define what `kit/` exports, package START.md, API.md and `hello` with the kit as a distribution, and generalize `kit/harness` (which runs only fields Programs) to compare any Dialect's Kernels across targets. Needed for a clean H5 reading ("it had to read kit source" is measurable only against a package) and as H11's differential gate. Parked until the docs exist and the pilot gives a reason; the pilot uses the interpreter alone. Job dLBHp7.

## 2026-11-24: SQL as an emit target

Emit a SELECT from a data-Dialect table pipeline, golden-tested, with no engine and no dependency: the proposal's §6 "target plugin" meaning of SQL, and a second backend for the data domain. SQL is not an input language (Ben, 2026-11-24). Parked as optional; un-park when the data Dialect's operators are in place and a second backend is wanted. Job dOwNtu.

> **Corrected 2026-11-24 (M3 plan):** the dream-code checker entry above says to un-park "when M3 is planned, alongside H4". The M3 plan takes the cheap half: the fresh-agent trial's checker script (job lMNmIB) loads a candidate Dialect and prints each violation with a code and a fix, and is `check` v0. The harvest and open-world lowering half stays parked until the generated builder can be run in an open mode.

## 2026-11-24: the GLSL target's kernel shape is hard-coded, not declared

`emitGlsl` (kit/emit/glsl/index.js) requires a kernel taking one `vec2` plus uniforms, computes `uv` from `gl_FragCoord`, and writes `vec4(color, 1.0)`. The slot's *name* (`pixel`) is the fields Dialect's, but "a fragment shader is a function from a position to a color" lives in the backend rather than in the Dialect's `targets.glsl` declaration. Parked because there is one shader Dialect and Ben's ruling is not to build for what does not exist yet. **Un-park when** a second shader Dialect or slot needs another mapping (textures, a vertex stage, a different output), or the Definition API's target declaration is opened for another reason.

## 2026-11-24: a C compiler in the page, to check emitted C

Compile the kit's emitted C inside the artifact (Zig or clang built as wasm, or TinyCC), run it, and compare with the reference interpreter. Parked because no C backend exists yet, a full compiler is about 10 MB or more against the 16 MiB page limit, and the same check runs with a native compiler wherever there is a shell (Node, CI). Un-park when the C export target exists and its check must run in the page itself; try TinyCC first, for size. See [backend direction](2026-11-24-backend-direction.md).

## 2026-11-24: Linux in wasm (unkernel) as an opt-in sandbox

Embed [unkernel](https://github.com/pithings/unkernel) so a workbench can run foreign native tools in the page: a tiny fixed toolset (TinyCC, SDCC) to check output, or a real shell for the in-page agent. Not a backend: its user programs run on an aarch64 emulator, well behind the wasm we emit. Parked because, inside an artifact, it cannot install packages (no fetch to other hosts), takes about 14 MB of the 16 MiB limit, runs one CPU (no `SharedArrayBuffer`), and its kernel is GPL-2.0, which sits badly with the delivery decisions' business-friendly aim. Un-park when a workbench needs a foreign tool no wasm port provides, and the size limit, the fetch rule or the licensing question has moved. See [backend direction](2026-11-24-backend-direction.md).

## 2026-11-24: a construct's own code for a bad opening argument, before B004

A construct cannot refuse a bad opening argument with its own code: the opening is matched against its specs when the construct opens, so a value of the wrong shape is the builder's generic `B004` before any check runs, and a construct `check` sees only what matched. The data Grammar works around it by making the view's table an `opt(ref)`, so that a lambda in the name's place reaches its construct check (T007) instead of B004. Building it means an `opens` hook (or a per-spec `check`) that runs before shape matching and may replace B004 with the Dialect's code; it is not trivial because the record keys, B002 and the instance name all come from the matched opening. Parked by job NrXepo (gap 5): one workaround in one Grammar, and it works. **Un-park when** a second Grammar needs a construct-specific refusal for an opening's shape, or a dogfood trial shows B004 misleading an author at an opening.

## 2026-11-24: a child construct's own helper slots

A child construct has every method of its parent, so a `fn` or `const` slot on both `program` and `table` is D010 (trial 3's agent B wanted table-local helpers). Parked because module-scope helpers and the root's `.fn` already give one place for a helper, and per-construct scoping would add a second name lookup to the free-name rule. Un-park if a Dialect needs helpers whose names differ per construct instance, or a fresh-agent trial asks for it again ([trial 3](2026-11-24-definition-api-trial-3.md), finding 2).

## 2026-11-24: a convention whose return names a member of the construct's state

A lambda that returns a string meant to name a column (`.y(() => $.metric)`) type-checks as `str`, so a nonsense column is accepted (trial 3's agents A and B). A convention could return `ref(<state namespace>)`, an enum built from the state's names, and lowering would check each returned literal (and a param's options) against it. Parked because no shipped Dialect needs a run-time-chosen column, and it needs string enums in the core types. Un-park when a Grammar ships a run-time column choice or a chart slot ([trial 3](2026-11-24-definition-api-trial-3.md), finding 3).

## 2026-11-24: a ref that may not name its own instance

A slot `ref` that refuses the instance it sits in (a transfer from account `a` to account `a`), or `ctx.instance` in a slot check so an author can refuse it. One of three agents in the [API pilot](2026-11-24-api-pilot.md) asked (agent A, gap 4); a slot check can already find the instance as `ctx.program.<construct>.at(-1)` (API.md pitfall 6). Parked because one agent asked and a workaround exists. Un-park if the stateful fresh-agent run (`3Cd9hb`) or a later trial asks for it again.

## 2026-11-24: a default value for an optional slot

A `default` on a `once` slot, so the record carries the value when the slot is not called (the budget sheet's horizon defaults to 12). One of three agents in the [API pilot](2026-11-24-api-pilot.md) asked (agent C, gap 5); `environment` or `init` can fill a missing value today. Parked because one agent asked and the workaround is one line. Un-park if the stateful fresh-agent run (`3Cd9hb`) or a later trial asks for it again.

## 2026-11-24: may a cave's `.carve` read another part's output?

The composition checker's open question: `scripts/compose-trial/docs/cave.md` says the cave re-runs when its `.seed()` lambda reads another part's output (`game.out`), but does not say whether `.carve` may. Parked by Ben (2026-11-24) because no composition rerun is scheduled. Un-park when one is, and settle it before it runs ([composition trial](2026-11-24-composition-trial.md)).

## 2026-11-24: harden the module-scope scan, or replace it with a real parser

The review of `c189880` found that the scan in `kit/parse/blank.js` and `toplevel.js` can still be misled into vouching for a closure as a top-level helper that reads the wrong binding (B012 passes, nothing reports it): a line comment, regex or string ends only at `\n`, not `\r`, U+2028 or U+2029; and one wrong regex-or-division guess whose span holds a backtick swaps template text and code for the rest of the file (a label after a statement with no `;` or after `if (a)`, `export default /re/`, `extends /re/`, `1./2`, `++/re/.lastIndex`). `toplevel.js` is also quadratic on long whitespace inside a declaration (80k newlines: 102 s). Probes, a fuzzer and a TypeScript-parser oracle are in `local/rev-c189880-probes/` and `local/rev-c2845ca-probes/`. The options were to patch the lexer and add a bracket-balance guard plus the oracle as kept tests, or to vendor acorn and rebuild the scan on its AST. Parked by Ben (2026-11-24): every trigger is input an agent is unlikely to write, and the scan is close enough for agent-written code. **Un-park when** a misread turns up in practice (a trial, a pilot or a user's Program), and fix that case at the source; weigh acorn again if a second one does.
