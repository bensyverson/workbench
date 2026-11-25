*2026-11-25. A summary of Manuel's IR Workbench v6 and Compiler Workbench, written blind to our design by a separate `claude -p --model opus --effort xhigh` run (119 turns, $28.77) from a scratch folder outside the repo, given only [github.com/wesen/2026-11-24--compiler-workbench](https://github.com/wesen/2026-11-24--compiler-workbench) (shallow clone of that day) and three of his project reports from parc.yolo.scapegoat.dev. Saved unchanged by the main thread. It describes his system on its own terms; the comparison with ours is the consult beside it.*

# IR Workbench v6 and the Typed → RV32 compiler defined on it: a technical summary

## How to read the citations

Every statement names its source in square brackets:

- **Rep1–Rep3**: the `reports/` files whose names start with `1-`, `2-` and `3-`.
- **DD01–DD05**, **AN01–AN03**, **D01–D06**: the IRWB-001 ticket's `design-doc/`, `analysis/` and `log/` files. The diaries are:
  - D02, the coordinator's;
  - D03, the backend subagent's;
  - D04, the f32/Candela subagent's;
  - D05, the UI subagent's;
  - D06, the RV32F subagent's.

  In diary citations, "L" is a line and "s" a step.
- **CL**, **TASKS**, **IDX**: that ticket's changelog, task list and index.
- **IG**: the IRWB-002 intern guide. Its Part 1 describes commit `a11f6bf`, which predates the RV32F backend, field bindings and `dfe`.
- **IG-log**: the IRWB-002 diary.

Paths are relative to `repo/`. **INFERRED** marks my own inference.

---

## 1. What it is, and the goals it states

The repository (npm package `compiler-workbench`: "An inspectable compiler workbench: the IR Workbench v6 framework extended for a complete Typed -> RV32 compiler", `package.json`) combines two imported prototypes:

- **IR Workbench v6** is a TypeScript framework for inspectable compilers. It has four layers: an incremental task runtime, a Strategy IR of plans, semantic contracts, and generic IR manipulation through adapters [AN01 §2].
- **Compiler Workbench (CW)** is a browser lab for one real compiler, from Typed (the statically typed JavaScript subset used on the PicoCalc handheld) to RV32IM. It comes with 44 projects and a 17-chapter book that states exact numbers [AN02 §2].

The repository keeps v6's framework whole in `src/framework/` and adds six extensions to it (E1–E6). On that framework, `src/typed/` defines the Typed compiler: IRs, thirteen passes plus `specialize`, six analyses, an evaluator that defines program meaning, an RV32 backend, and a program host with revisions and provenance. On top sit a `wb` API (`src/workbench/`) and a browser workbench (`site-src/`) ported from CW [Rep1 §1; IG §2; `src/typed/passes.ts:1116-1130`]. Later work added single-precision floats and an RV32F backend, so that the compiler could take on **Candela**, a 332-function path tracer, and specialize it per scene [Rep2; DD05 §9].

**Stated goals.**

- **The ticket:** "create an IR workbench, a framework plus UI for building and inspecting compilers whose IRs are domain representations such as CAD, meshes, scenes, expressions and constraints" [IDX].
- **IRWB-001:** a compiler *defined on* the framework, "every IR registered as a framework IR, every pass a framework pass, every check a framework invariant, every pipeline a framework plan". Where the framework lacked something, it was "extended rather than bypassed", because only framework data can be enforced [Rep1 intro, §1].
- **CW's promise, kept:** "whatever you write, you see what it changed, why it says that was valid, and whether the program still means what it meant" [DD01 §1].
- **Parity:** matching the prototype on all 44 projects is the correctness criterion, with CW's book as the regression oracle [DD01 §4; Rep1].
- **Candela as "the first real workload":** facts known only above Typed should drive Typed passes soundly [DD03 §1, §8].
- **Expected gains** [DD02 §11]: every stage an artifact with exact identity; provenance across the whole compiler; preserved facts "checked, not trusted"; pass orders as searchable data; a kernel able to host a second domain.
- **IRWB-002:** an onboarding guide plus 54 research items in ten workstreams, under four rules: the meaning contract is the gate; O2, the corpus and the book's numbers are frozen; every item lands with a project and a test; compile time is a reported result [IG §18].

---

## 2. Architecture

### 2.1 Framework layers

`src/framework/*/*.ts` is 10,910 lines (my count). IG §2 gives per-layer counts at `a11f6bf`: core 1,645, strategy 1,868, contracts 2,549, ir 3,886, dataflow 550 and passes 412.

| layer | owns | origin |
|---|---|---|
| `core/` (`data.ts`, `types.ts`, `runtime.ts`, `query.ts`, `records.ts`) | canonical encoding, a portable `sha256`, `fingerprint`, `immutable`, `deepFreeze`; the types `Artifact`, `Task`, `Pass`, `PassContext`, `PassPolicy`; the incremental runtime `Compiler` (cache, dependency records, LRU of 2,048) and read-only `Queries` | v6 [AN01 §2.2; `core/runtime.ts:85-105`] |
| `strategy/` (`ir.ts`, `builders.ts`, `interpreter.ts`, `registry.ts`, `validation.ts`, `editing.ts`, `serialization.ts`) | plans as frozen JSON over versioned algorithms, 13 node kinds, `AlgorithmRegistry`, an interpreter with budgets | v6 [AN01 §2.3] |
| `contracts/` (`definitions.ts`, `analysis-manager.ts`, `registry.ts`, `effects.ts`, `types.ts`, `differential.ts`) | eight `define*` APIs (IR, type, analysis, property, invariant, objective, effect, transformation); the `AnalysisManager`; assurance; sampled differential invariants (E5) | v6 + E5 [AN01 §2.4] |
| `ir/` (`types.ts`, `adapters.ts`, `view.ts`, `transactions.ts`, `store.ts`, `diff.ts`, `correspondence.ts`, `patterns.ts`, `rewrites.ts`, `traversal.ts`, …) | adapters and projection, `IRView`, edit transactions, a compare-and-swap revision store, `diff`, many-to-many correspondence, patterns, seven rewrite schedules; the `control` category (E1); reasons and `whyEntity` (E2) | v6 + E1, E2 [AN01 §2.5; D02 s2] |
| `dataflow/` (`lattices.ts`, `solver.ts`, `analysis.ts`) | lattices, a fixpoint solver, `dataflow()` compiling to an ordinary analysis with a checked transfer rule | new, E4 [D02 s3] |
| `passes/` (`define-pass.ts`, `bridge.ts`) | `definePass`, `applyPass`; `passAlgorithm`, `analysisAlgorithm`, `metricsAlgorithm` for strategies | new, E3 and E6 [`define-pass.ts:1-17`; `bridge.ts:1-9`] |

Nine extensions were planned (DD02 §10); E1–E6 were built in the framework. The other three live in the domain: E7 (selection as a tiling schedule over patterns) stayed a hand-written selector in `select.ts`; E8 (readable-id handles) lives in `src/workbench/`; E9 (the r0…rN timeline) lives in `Program` [Rep1 §1, §10; IG-log L105].

### 2.2 What was kept and cut

v6's `src/` was about 14.7k lines, of which the framework was 5,940 [DD01 §3.2]. The whole framework was kept "as code", reformatted, with its tests, instead of a 2.9k-line subset [DD01 §3.2; CL].

About 6.4k lines (43 %) were cut [DD01 §3.2; D02 s1]:

- v6's UI, which had never been rendered in a browser;
- the CAD, game, linkage and door domains;
- the v4 and v5 labs;
- `core/strategies.ts`;
- the tests for all of the above.

v6's four IR labs became `src/labs/`, and tutorials 01–03 and 05 became `src/conformance/`, both "fixtures, not product code" [D02 L55-63].

### 2.3 Import rules

`tests/framework/layering.test.mjs` enforces three rules [lines 1-4, 15-30]:

1. Nothing under `src/framework/` imports from outside it ("no layer of the framework imports a domain (labs, typed, candela, workbench)").
2. `strategy`, `contracts` and `ir` take only `core/data.js` and `core/types.js` from core ("v6's separability claim").
3. `core` imports no higher layer.

`dataflow` and `passes` are bound only by rule 1. They import contracts, ir and strategy types [`dataflow/analysis.ts:15-19`; `define-pass.ts:18-40`]. The test's regex sees only single-quoted relative `from` imports, so inline `import('…')` types (`bridge.ts:22`) are unchecked [`layering.test.mjs:13`]. IG §2 states the rule of thumb: "anything generic belongs in `src/framework` and must not know that Typed exists".

### 2.4 The domain and above

`src/typed/` (7,191 lines: `model.ts`, `ir.ts` with `BlocksIR` and `blocksAdapter`, `lift.ts`, `tx.ts`, `analyses.ts`, `passes.ts`, `evaluate.ts`, `f32.ts`, `specialize.ts`, `builder.ts`, `strategies.ts`, `program.ts`, `reference.ts`, `ilp32f.ts`, `format.ts`, `candela-render.ts`); `src/typed/backend/` (3,046 lines); `src/workbench/` (4,310 lines: the `wb` API and `sync.ts`); `site-src/` (5,875 lines: the UI); `tools/` (16 scripts); `tests/` (36 files); `corpus/` (44 projects, the book, `candela-gallery/`). `vendor/ds-js-os/` holds the Typed front end, the RV32 interpreter and the reference compiler with its pass groups, "copied unchanged" from commit `b19062b…`, with SHA-256 digests [`VENDOR.json`] that `tools/node-vendor.mjs` and `tools/build-site.mjs` check before loading.

## 3. The representations

### 3.1 Artifacts, revisions, content hashing

An artifact is `{ id, revision, contentHash, kind, schemaVersion, value }` [`core/types.ts:10-17`; `core/runtime.ts:822-830`; `ir/adapters.ts:130-135`], where:

- `contentHash = fingerprint(value)`;
- `revision = fingerprint({ kind, schemaVersion, value })`.

The data functions [`core/data.ts:12-63`, `:189`]:

- `canonical` sorts keys and writes `-0` as `0`. It rejects cycles, accessors, sparse arrays and non-plain objects, and throws `IR data must contain only finite numbers` for NaN or infinity.
- `fingerprint` is SHA-256 of that text.
- `immutable` returns a deep-frozen canonical copy.

Equal content gives equal revisions, so a revision names "the program itself", and a fact cached under it needs no invalidation [IG §3]. Ids come from counters stored in the value, so the same pass on the same revision yields the same hash [IG §5; D02 L316]. Revision *numbers* (r0, r6) are positions in one `Program`'s timeline, not framework data [IG §3].

`createIRArtifact` originally did five whole-value encodings, two SHA-256 passes and two encodings per entity during projection [DD05 §3.1]. On Candela this dominated the cost (section 10). D02 s12 added caches "keyed on objects that cannot change": a `CANONICAL` WeakSet of values `immutable` produced, a canonical-text cache, memoized fingerprints, a short circuit in `immutable`, and `VERIFIED` and `PROJECTED` caches. Hashes are unchanged by construction; all 44 projects' revisions were checked identical [D02 L794, L791; `data.ts:7`, `:9`, `:189`; CL].

### 3.2 The IRs

Three IRs are registered:

- **`typed.blocks`** (`src/typed/ir.ts:290`).
- **`rv32.image`** (`backend/image.ts:235`). It is finite JSON with code as base64, `entries`, `fns` and one `ImageInsn { id, fn, offset, op, word, text, covers, … }` per word. Instruction ids are `insn:FN+0xOFF` with no revision suffix, "because the artifact revision now identifies the image". The value holds no timing, so the hash does not depend on it [D03 L60, L156; `image.ts:32-96`].
- **`typed.bindings`**: outer facts for specialization [`specialize.ts:49`].

Two proposed chains were not built: DD02 §1's (`typed.project`, `typed.tape`, `rv32.vcode`, `rv32.alloc`, run as tasks on v6's runtime) and DD03 §3's (`candela.graph/wgsl/packed`). IG §17: "Only `typed.blocks` and `rv32.image` are IRs; Candela, WGSL and the tape are not" (task P4.2 is open). Machine code between selection and encoding is an internal `MInsn[]` [IG §14, §17].

### 3.3 `typed.blocks`

`typed.blocks` is a control-flow graph whose statements hold expression trees [IG §5; `model.ts:5-212`]:

- **Functions** `fn:NAME`: params, result, locals and ordered blocks.
- **Blocks** `bb:NAME.N`: each ends in a terminator.
- **Statements** `s:NAME.N`: one of `set`, `store`, `eval`, `br`, `br_if`, `return`, `trap`, `zero`.
- **Values** `v:NAME.N`: one of 54 operators, each value with exactly one user. The operators are `const`, `get`, integer arithmetic and comparisons, `load`, `load16u`, `call`, `fadd … fsqrt`, `ffloor/fceil/ftrunc`, `feq … fge`, `f2i`, `f2u`, `f2bits`, `i2f`, `u2f`, `bits2f`, `caddr`, `aaddr`, `result` and `tuple`.
- **Front-end ops** `op:NAME#N`: each carries a source position and anchors provenance to source lines.

The native `TypedBlocks` holds id-keyed tables (`fns`, `blocks`, `stmts`, `values`, `ops`) plus counters, `rev`, `fnOrder` and front-end metadata. Only live entities are stored. Passes copy it into a mutable `Store` and emit `toNative()` [IG §5].

Design decisions [IG §5]:

- **Mutable locals.** Locals are mutable variables, so finding where a value comes from needs reaching definitions.
- **One user per tree.** The lifter therefore materializes pending values into temporaries wherever evaluation order could change: before an assignment to a local a pending value reads, before memory changes, before calls, and around control flow [Rep1 §2].
- **Conservative purity.** Purity is decided per operator: loads, calls, divisions and `caddr` are impure, so no load is ever hoisted or shared [`analyses.ts:40-64`].

Floats are carried as bits (section 8.3). `validateBlocks` and `checkTypes` enforce referential integrity, acyclic trees, operand classes per operator, tuples only as returns, and `zero`/`aaddr` within the frame's array bytes [`ir.ts:92-288`].

### 3.4 Adapters and projection

An adapter declares `relationKinds`, `entities`, `resolve`, `relations` and `describe`, and optionally `roots`, `validate`, `rebuild(base, graph)`, `operation`, `serialize` and `visualize` [`ir/types.ts:64-81`]. The projection consists of `IREntity { id, kind, attributes }` and `IRRelation { id, kind, category, from, to, order? }`. The category is one of `containment`, `dependency`, `binding`, `adjacency`, `provenance`, `control` [`ir/types.ts:14-21`]. E1 added `control` because encoding CFG edges as `dependency` would make `dependencies()` and `redirectReferences` follow branches [D02 L136].

`blocksAdapter` projects six entity kinds (`fn`, `local`, `block`, `stmt.<op>`, `value.<op>`, `op`) and nine relation kinds [Rep1 §2; `ir.ts:505-540`]:

| category | relations | meaning |
|---|---|---|
| containment | `declares`, `contains`, `emits` | function → locals, blocks; block → statements |
| dependency | `uses`, `operand`, `reads` | statement → value tree; value → operands; `get` → local |
| binding | `writes` | `set` → local |
| control | `succ`, `jump` | block successors; branch targets |

Projection and `rebuild` are exact inverses, tested on every corpus program, so a `diff` of two projections is "the change a pass made" [Rep1 §2]. `openIR` gives a budgeted `IRView`. Its `beginEdit()` returns an `Edit` that refuses a lossy rebuild (`ir.lossy-rebuild`), and `IRStore` rejects stale heads (`ir.stale-edit`) [`transactions.ts:306-313`; `store.ts:86-103`]. The Typed passes use neither `beginEdit`, the pattern matcher nor the rewrite schedules; they return native values [IG §4; IG-log L163].

### 3.5 Correspondence and provenance (`why`)

**Origins.** Every statement, value, block and function carries `origin: Origin[]`, with `{ from, via, kind, rev, because, note }`. An origin records what the entity was made from, by which pass, at which revision, and which entities or facts made the change valid. The transaction writes it and refuses a removal without `because` [IG §9.2, §11; `model.ts:101-108`].

`Program.why(id)` follows `from` and `because`. Ids missing from the head are resolved backwards through the immutable revisions (`Program.lookup`); the prototype instead never deleted entities [Rep1 §7; D02 L408]. `statusOf` gives `live`, `removed@rN`, `replaced@rN`, `detached` or `absent` [`program.ts:428-439`]. The test-asserted tree for Blend after O2 [Rep1 §7]:

```text
s:blend.15  inv = ((a * b) + 64)        live · via licm · r6 · hoisted out of loop:blend@bb:blend.1
  made from v:blend.37  ((a * b) + 64)  live · via constprop · r4 · rebuilt around a changed argument
    made from v:blend.25  ((a * b) + scale)   detached · via ingest
      made from op:blend#35  i32.add (line 5)
  because loop:blend@bb:blend.1
```

**Framework correspondence (E2).** `Reason { because?, note? }` is attached to correspondence entries, redirects and every `IREdit` method. `because` "names entities or facts (e.g. `s:peak.4`, `fact:ranges(peak)@r5`)" [`ir/types.ts:145-155`]. The operations:

- `makeCorrespondence` completes the given entries with implicit `retained`, `removed`, `unmapped-origin` and `inserted` ones [`correspondence.ts:99-144`].
- `composeCorrespondence` names composed relations `a > b` and unions their reasons [`:146-206`].
- `whyEntity(target, chain)` walks backwards and returns `WhyNode { entity, at, relation, because, note, from }` trees [`:289-340`]; `Program.whyChain` uses it.

The domain's `revisionCorrespondence` groups each new entity under its first origin, and maps a removal to an empty target with the removal's `because` [Rep1 §3; D02 L352].

**Into machine code.** Each instruction's `covers` lists the statement and value it implements. It is an attribute because v6 refuses dangling cross-graph edges [D03 L43]. `imageCorrespondence` (`covered-by`, `retained`, `removed`, `inserted`) composes r0 → rN → image. That is how 322 of Blend's 451 executed instructions are attributed to source line 5 [D03 L61, L198; Rep1 §7].

**Fact references** are `fact:<kind>:<id>@<12 hex>#<entity>` [`specialize.ts:68`].

**Known limits:** only the first origin is used; entities created and pruned within one pass application are in no revision, so `why` answers "absent"; a value's reason sits one level below its statement's; `invertCorrespondence` drops reasons [IG §11; Rep3 §9; `correspondence.ts:216-220`].

## 4. Passes

### 4.1 Declaring a pass

`definePass(spec)` (`passes/define-pass.ts:97-108`) requires an id, a version, `run`, and `writes { entities, relations }`. The spec [`:78-91`]:

| field | meaning |
|---|---|
| `id`, `version`, `description` | identity; the version invalidates caches |
| `ir`, `adapter` | what it works over |
| `needs` | analyses it reads, computed for the exact input revision |
| `writes` | entity kinds (glob `prefix*`) and relation kinds it may change |
| `preserves` | analyses it claims survive |
| `contract` | a transformation contract the output must satisfy |
| `run(ctx)` | edits `ctx.edit` (a v6 `IREdit`) or returns `{ native, correspondence?, edits?, report? }` |

The context carries `before`, `view`, `facts`, `records`, `params` and `edit` [`:58-66`].

Typed passes use `typedPass` (`src/typed/passes.ts:165-217`), which keeps the prototype's vocabulary. It:

- maps write kinds onto projection kinds (`ENTITY_WRITES`, `:79-90`): `values` → `value.*`; `stmts` → `stmt.*`, `value.*`; `locals` → `local`; `cfg` → `block`, `stmt.*`, `value.*`;
- maps analysis names onto `ANALYSES`;
- runs the body once per function through a `Tx`;
- returns the whole-program native value, the correspondence and a report.

So a pass always visits every function, even when it edits three of 332 [IG §9.1, §17]. No pass declares its own contract; the host supplies `optimizationContract(params)` (id `typed.optimization`) per application [`passes.ts:221-244`].

**The transaction** (`tx.ts`) offers `const`, `make`, `get`, `local`, `set`, `stmt`, `insert`, `move`, `remove`, `replace`, `replaceStmt`, `setField`, `block` and `rewrite` (a bottom-up rebuild of value trees). Its rules [`tx.ts:30-45`, `:179-198`, `:351-358`, `:503-528`]:

- every method checks that the write kind was declared;
- every created entity records its origin;
- `remove` without `because` throws `missingBecause`;
- `commit` prunes unreachable blocks with `because: ['cfg']`.

Its error codes are `undeclaredWrite`, `missingBecause`, `absent`, `badPosition`, `unknownLocal` and `unsupported`.

**The passes** (all `typed.<name>`, version `1`) [`passes.ts:279-1114`; `specialize.ts:71-143`; IG §9.4]:

| pass | effect | needs | writes | preserves |
|---|---|---|---|---|
| `fold` | operator on constants → constant; keeps div/rem traps; f32 only via the evaluator's bit functions | – | values | cfg, dominators, loops, liveness, reaching |
| `simplify` | about sixteen integer identities | – | values | cfg, dominators, loops |
| `constprop` | a read whose reaching definitions all assign one constant | reaching | values | cfg, dominators, loops |
| `dce` | dead assignments, effect-free `eval` | liveness | stmts | cfg, dominators |
| `cfg` | constant branches, jump threading, block merging | cfg | stmts, cfg | – |
| `licm` | pure loop-invariant trees to the preheader | loops | stmts, values, locals, cfg | – |
| `lvn` | repeated pure expression within one block → new local | – | stmts, values, locals | cfg, dominators |
| `strength` | `x / 2^k`, `x % 2^k` → shift/mask when ranges prove `x ≥ 0` | ranges | values | cfg, dominators, loops |
| `bce` | bounds check dominated by a proving branch | dominators, reaching, ranges | stmts, cfg | – |
| `bcm` | merges a block's checked addresses on one buffer | reaching | values | cfg, dominators, loops |
| `subst` | single-use pure temporary into its reader | liveness | stmts, values | cfg, dominators |
| `dfe` | functions unreachable from `params.roots` (raw `definePass`, whole program) | – | fn, local, block, stmt.\*, value.\*, op | – |
| `div-to-shift` | deliberately wrong `x / 2^k → x >> k` | – | values | cfg, dominators, loops |
| `specialize` | bound parameter or record field → constant (only via `Program.specialize`) | reaching | values | cfg, dominators, loops |

`PIPELINES` (`passes.ts:1133-1181`):

| pipeline | passes |
|---|---|
| `O0` | none |
| `O1` | `cfg, fold, simplify, constprop, fold, simplify, dce, cfg` |
| `O2` | sixteen: `cfg, fold, simplify, constprop, fold, simplify, dce, cfg, licm, lvn, strength, bce, subst, subst, dce, cfg` |
| `O2+` | O2 then `subst` |
| `loops` | `cfg, simplify, licm, lvn, subst, dce, cfg` |
| `checks` | `cfg, simplify, bce, cfg` |
| `broken` | `div-to-shift` |

### 4.2 `applyPass`: stages and failure modes

`applyPass(pass, before, options)` (`define-pass.ts:190-323`) runs these stages in order:

1. `manager.analyse` for each need, cached per exact revision [`:199-203`].
2. Open `beginEdit()` and call `run`. On a throw, roll back and rethrow [`:204-218`].
3. Build the result:
   - from a native result: `createIRArtifact`, a `diff` of the two projections, then `makeCorrespondence`;
   - from an edit result: `edit.prepare()`, then roll back, because "applyPass publishes revisions itself" [`:221-244`].
4. If nothing changed, return `changed: false` [`:245-253`].
5. `undeclaredWrites`: any changed entity or relation whose kind matches no declared glob raises `undeclaredWrite` [`:147-163`, `:255-259`].
6. Contract: `manager.verifyTransformation({ input: before, ...contractInputs }, { output: after }, gate, correspondences)`, with a correspondence record (default id `entities`, relation `generic-ir-edit`). Failure raises `contractRejected` [`:261-281`].
7. Preservation, for each claimed analysis [`:283-310`]:
   - If the manager holds no fact for `before`, skip it, unless `auditPreservation` is set; then compute the fact.
   - Try `manager.preserve`, the analysis's transfer verifier (outcome `transferred`).
   - Otherwise recompute on both revisions and compare canonical JSON. A mismatch raises `preserveViolated`; a match gives `confirmed-by-recompute`.
8. Return `{ changed, artifact, changes, correspondence, edits, preserved, contract, report }`.

`PassError` codes are `undeclaredWrite`, `preserveViolated`, `contractRejected`, `badResult` (a pass closed its own edit) and `passFailed`, which is declared but never thrown [`:44`, `:237`].

Despite its header comment, `applyPass` publishes into no `IRStore`. `verifyTransformation` commits the contract transaction (unless `deferCommit`) before the preservation checks run [`analysis-manager.ts:1538-1553`; `define-pass.ts:265` vs `:283`].

The revision timeline belongs to the host [`program.ts:54-65`, `:255-296`, `:354-365`]:

- `Program.apply` gates each pass with `optimizationContract({ inputs, count: 40, seed: 7, roots: entries })` unless `check: false`.
- If the program changed, it pushes `{ rev, pass, artifact, edits, correspondence, ms, assumptions }`.
- `Program.pipeline` records a rejected step and continues.

### 4.3 How claims are checked, and what checking found

Writes are checked twice (per call in `Tx`, structurally by diff); meaning by the contract (section 6); preservation by transfer or recomputation. On the first full corpus run the preservation gate refused `ERROR [preserveViolated] Pass typed.lvn claims to preserve typed.loops, but it changed`. `lvn` inserts `set vn` inside loops, and the loop fact records each loop's assigned locals, which `licm` uses; `dce` and `subst` made the same false claim. The prototype never checked claims, and its pipelines ran `licm` first, so the defect was latent there. All three now claim `['cfg', 'dominators']`, with comments, and a regression test refuses the old claim [Rep1 §6; `passes.ts:1067`].

`tools/audit-preservation.mjs` sets `auditPreservation` and applies every claiming pass to every revision of every corpus pipeline: 1,376 applications, with no failures under the corrected claims [Rep3 §6; CL].

## 5. Analyses and facts

`defineAnalysis` (`contracts/definitions.ts:86-105`) declares `id`, `version`, `input`, `output`, `run`, and an optional `transfer { id, version, verify }`; write effects are refused. `AnalysisManager.analyse(def, artifact, params)` caches by `fingerprint` of the analysis and type references, the subject `{ id, revision, kind, schemaVersion }`, and the params. It reuses a record only if the record is valid, epoch-valid and has valid dependencies [`analysis-manager.ts:237-245`, `:518-627`].

The six analyses (`src/typed/analyses.ts:539`; output type `typed.facts`):

| id | fact | built with |
|---|---|---|
| `typed.cfg` | predecessors, successors, reverse postorder | `defineAnalysis` |
| `typed.dominators` | immediate dominators (Cooper–Harvey–Kennedy) | `defineAnalysis` |
| `typed.loops` | natural loops `loop:<fn>@<head>` with preheader, exits, assigned locals | `defineAnalysis` |
| `typed.liveness` | live locals per block | `dataflow`, backward, `setLattice`, round-robin |
| `typed.reaching` | reaching assignments per block | `dataflow`, forward, `setLattice`, round-robin |
| `typed.ranges` | i32 interval per local | `dataflow`, forward, `mapLattice(intervalLattice())`, round-robin, `widenAfter: 3`, per-edge refinement, custom `widen` |

[`analyses.ts:125-504`]

**`dataflow()` and lattices.** A `Lattice` has `bottom`, `join`, `equal`, `encode`/`decode` to JSON, and `infiniteHeight`. The library has `setLattice`, `flatLattice`, `intervalLattice` (infinite height, with its own `widen`) and `mapLattice` (no `widen`) [`dataflow/lattices.ts`].

`dataflow(spec)` takes `direction`, `lattice`, `regions`, `transfer`, `boundary`, `edge`, `widen`, `widenAfter`, `strategy: 'worklist' | 'round-robin'` and `reads { entities, relations }`. It returns a v6 analysis with transfer rule `<id>.unchanged-reads` [`dataflow/analysis.ts:35-53`, `:110-201`].

The solver refuses an infinite-height lattice without `widen` (`noWidening`), finds loop heads as targets of retreating edges, widens at a head after more than `widenAfter` visits, and either sweeps in reverse postorder (round-robin, up to 200 rounds) or runs a worklist (up to 10,000 iterations) [`solver.ts:90-181`].

**Schedules change results.** With widening, the fixpoint depends on visit order. The first E4 solver (a worklist that widened at the first revisit) lost the exact interval of small constant-bound loops. The prototype sweeps round-robin and widens after three visits. Since `strength` and `bce` act on intervals, the two schedules gave different programs, so the solver gained `edge`, `widenAfter` and `round-robin` [Rep1 §5]. IG §8: "When you add a domain, state its schedule."

**Facts as stored and as used.** Framework facts must be finite JSON, while the prototype's facts were objects with methods. The framework stores per-block `in`/`out`. Passes read them through views that replay the transfer from the block entry: `liveView(...).liveAfter(stmt)`, `reachView(...).reachingAt(stmt, local)`, `rangeView(...).of(stmt, value)`. The views are built on the pass's working copy, because `strength` asks about values its own transaction rebuilt [Rep1 §5; IG §8].

**Fact equality** is canonical-JSON equality, which makes recompute-and-compare possible [Rep1 §5; `define-pass.ts:300`].

**Checked transfer.** The verifier re-diffs the two revisions, ignoring the supplied correspondence, and accepts only if no declared `reads` kind changed [`dataflow/analysis.ts:163-181`].

## 6. Checking meaning

**Contracts and assurance.** `defineTransformation` declares typed ports and the clauses `requires` (checked at begin), `ensures` (before acceptance), `establishes`, `preserves` (`check` or `transfer`), `correspondence`, `effects` and `cache` (`pure`, `tracked`, `never`) [AN01 §2.4; `definitions.ts:142-237`].

Assurance is `'declared' | 'checked' | 'transferred' | 'proof'` [`contracts/types.ts:161`]. The README says the framework "does not contain a theorem prover" and that "supplying an assurance string cannot create an accepted fact" [`contracts/README.md:117`].

E5 adds `assuranceOf(evidence)`, which returns `checked-sampled` for sampled evidence and `checked-exact` otherwise [`differential.ts:146`]. The manager, however, records every invariant (differential ones included) as plain `checked` [`analysis-manager.ts:1140`], and `assuranceOf` is called only in `tests/framework/ext-e5.test.mjs:50`. IG §17 notes that no Typed check is exact.

**Differential invariants (E5).** `differential(spec)` (`differential.ts:70-99`) returns a v6 invariant tagged `method: 'sampled'`. The spec gives `inputs` with distinct `baseline` and `subject` ports, a positive `count`, `seed` (default 1), `random` (default mulberry32; "a port may supply its tool's own generator"), `cases`, `run(side, value, case)`, `compare`, optional `inconclusive`, and `maxCounterexamples` (default 5).

A case where either side is inconclusive is set aside. The evidence records `method`, `invariant`, `seed`, `total`, `agree`, `disagree`, `inconclusive`, `status` and counterexamples. The check passes only with status `agree`. With no decided case it fails ("no decided case among N"), because "it has established nothing" [`:54-64`, `:84-96`, `:102-143`].

**The evaluator** (`src/typed/evaluate.ts:345-513`) is the definition of meaning, ported from CW. It returns `trap`, `result` (i32, f32 bits, or record leaves), `limit`, `steps` and the final memory; the default limit is 2·10⁵ statements; call depth above 64 traps; `caddr` traps "checked address out of range"; division traps on zero and on overflow. `casesFrom(st, fn, { count, seed = 7, inputs })` uses CW's xorshift32, so the corpus's cases are the book's. Default i32 inputs are 72 % in [−20, 60], 20 % in [−1000, 1000], 5 % edge values and 3 % arbitrary, and `project.json` input specs override them. For f32 parameters the first quarter of the cases sweeps the fifteen `F32_EDGES` [`:179-252`]. `agrees` decides each case: a fault never agrees, a trap agrees with any trap, and otherwise results and written memory must match [`:531-537`].

**`typed.meaning-kept`** (`meaningKept(params)`, `evaluate.ts:564-605`) defaults to 40 cases, seed 7, a 2·10⁴-statement limit and optional `roots`. Its version is `1+<FNV hash of params>`, so each parameter set is its own registered definition [Rep1 §4]. `optimizationContract` wraps it as the only `ensures` clause. Every pass application, from a pipeline, a strategy or the browser, runs under it with `origin` bound to **r0**, "so errors cannot accumulate across passes" [IG §10]. On `wrong-shift`, `div-to-shift` is rejected with "27/80 sampled cases disagree", and nothing is published [Rep3 §3].

**Assumptions.** `Program.assume` fixes parameter values in the case generator, or record fields written as `'<param>.<field>'` and merged as `{ oneOf: [v] }`. The contract then compares with r0 only on inputs that satisfy them. Each revision stores the assumptions in force; `checkout` restores them, and a rejected `specialize` rolls them back [`program.ts:139-196`, `:379-387`; Rep3 §7].

**Entries.** `Program`'s `entries` option ("the functions the host calls") becomes `MeaningParams.roots`, and checks compare only those functions [`program.ts:93-97`; DD05 §9].

**Strength of sampling.** Four float rewrites that hold over the reals but not in IEEE arithmetic (`x+0→x`, `x·0→0`, `x−x→0`, `!(a<b)→a≥b`) were written as unsound passes. With random cases, two of them passed at 40 cases per function and were caught only at 400. After the edge sweep, all four are rejected at 40 [Rep2 §1]. IG §10: the case distribution "is part of the trusted base".

**Other oracles.**

- **`imageAgrees`** (`rv32.image-agrees`) compares the evaluator on the blocks with the emulator on the image: 40 cases, seed 7, limits 2·10⁴ and 2·10⁵ [`run.ts:365-414`].
- **The emulator** checks `sp` alignment, the return address and the callee-saved x registers at each call and return. `runImage` adds fs0–fs11, which the interpreter does not track. A violation is a fault [IG §14; D06 L79].
- **`referenceRun`** compares the evaluator with the reference compiler's image, called with the ilp32f convention. `ebreak` and memory faults count as traps; the limit is 2·10⁷ [`reference.ts:40-77`].
- **Rendering** compares whole frames bit for bit, "a far stronger whole-program check" [D02 L995].

## 7. Strategies

### 7.1 The plan language

A plan is frozen JSON (`formatVersion: 1`) naming algorithms by `{ id, version }`, with no code [`strategy/ir.ts:3`]. Algorithm kinds are `transform`, `analysis`, `predicate`, `selector`, `invariant` and `metrics`. The thirteen node kinds [`ir.ts:34-133`; IG §12]:

- `apply`, `sequence`, `parallel`;
- `fork`: named branches on one input give a candidate set;
- `chooseBest`: a metrics algorithm, constraints `<= >= < > ==`, and a `min`/`max` objective;
- `conditional`;
- `attempt`: on a listed rejection code, run the fallback on the original input;
- `repeatUntilStable`, keyed on revision;
- `forEach`, `require`, `verify`, `checkpoint`, `scope`.

`execute` validates, then runs with budgets (100,000 steps, depth 256, concurrency 8) and returns a record per node [`interpreter.ts:134-146`]. In `chooseBest`:

- a non-finite metric is a fatal `candidate-metrics` fault;
- having no feasible candidate is a rejection;
- ties go by `lexicographic candidate name (code unit order)`.

Its `SelectionDecision` lists each alternative as `feasible`, `infeasible` or `rejected`, with metrics and reason [`interpreter.ts:534-647`]. Rep3 §2: plans can be stored and diffed, decisions explained afterwards, and the registry is "the single place where the compiler decides what a plan is allowed to call".

### 7.2 Passes as algorithms; fallbacks

`passAlgorithm` registers a pass as a `transform` over artifacts. It calls `applyPass` and reports results through `onResult`. Only `contractRejected` becomes a recoverable strategy rejection (`contract-rejected`). `undeclaredWrite`, `preserveViolated` and `badResult` abort the run, and `auditPreservation` is unreachable through the bridge [`bridge.ts:29-62`].

A rejected pass therefore turns its fork branch into a rejected candidate, or triggers an `attempt` fallback: "a strategy cannot choose a wrong program, however it is written" [IG §12]. `pipelinePlan` wraps tolerated passes in `attempt(…, typed.keep, { codes: ['contract-rejected'] })` [`strategy.ts:19-36`].

### 7.3 The Typed strategy layer (`src/typed/strategies.ts`)

- **`strategyRegistry`** registers [`:98-159`]:
  - every pass, gated by a 40-case, seed-7 contract;
  - per-function copies `typed.<pass>@<fn>` (3,652 for Candela [D02 L672]);
  - `typed.keep`;
  - `typed.metrics@1`.
- **`measure`** reports [`:66-95`; Rep3 §4]:
  - `statements`, `blocks`;
  - `bytes`, from the lowered image;
  - `instructions`, emulator steps over 10 seeded cases per function;
  - `limited`, the runs that hit the 2·10⁵ limit. Such a run costs the limit, which replaced a `NaN` the framework refused.
- **`runStrategy`** publishes only the winner's chain into `Program.revisions`, so `why` is unaffected [`:266-326`].
- **The short form** (`planFromSpec`) takes `passes`, `choose` (+ `by`, optional `constraints`) or `repeat` [Rep3 §2].
  - The presets are `O2`, `fastest`, `smallest` and `cleanup`.
  - `fastest` compiles to 37 nodes: 214 lines at 72 columns, against 9 in short form.
- **`searchPlan`** chains one `chooseBest` per function in source order, each measured on that function's cases [`:333-363`].
- **`MetricsOptions.pause`**, a Typed-layer hook, keeps the page responsive [D05 L272].

### 7.4 Specialization on outer facts

An outer fact enters as a `typed.bindings` artifact: `{ formatVersion: 1, source, bindings: [{ fn, param, value, entity }] }`. `specialize` replaces reads of the bound parameter with the constant, citing the fact in `because`. `Program.specialize` calls `assume` first [Rep3 §7; `program.ts:186-196`], and ordinary passes do the rest.

On `match-enum`, binding `s = Square` in `area(s, k)` and running O2 leaves `return (k * k)`. Each revision agrees with r0 on 80 of 80 assumed cases, and the same program fails the unrestricted check [Rep3 §7].

Candela added three things [DD05 §9; D02 s18; `specialize.ts:94-108`]:

- a field form, `{ record: 'K', field: 'scene', value, entity }`, applied to every `K` parameter and refused statically where a function stores to the field or the field is f32;
- entry-only contracts;
- `dfe`.

The per-scene pipeline is `specialize, constprop, fold, cfg, dce, cfg, dfe`.

### 7.5 Search over orderings

`tools/search-experiment.mjs` compiled each project three ways [Rep3 §5]:

- O2;
- the best of four candidates per program: `O2`, `O2x2`, `loops+O2`, and `O2+more` (O2, then `lvn, subst, subst, dce, cfg, licm, subst, dce, cfg`);
- that choice made per function.

It checked every candidate after every pass. Eleven of the twelve gains are one extra `subst` after O2's final `dce` and `cfg`, which removes a loop copy such as `t3 = i` once `bce` has removed the check. That became `O2+`; O2 stays unchanged for parity [`passes.ts:1154-1177`]. Per-function search never beat per-program choice, and its choices differed only where alternatives tied [Rep3 §5].

## 8. Front end and language, backend, float semantics

### 8.1 Typed, the front end and lifting

Typed is the PicoCalc's typed JavaScript subset. Its front end is vendored unchanged, so the compiler accepts exactly the device's language [IG §1, §6]. The front end parses, type-checks and emits a **tape** (per-function stack code) and Wasm.

`lift.ts` provides [`lift.ts:187-758`; D04 L199]:

- `frontEnd`: the inspection path, Wasm-level events with spans;
- `frontEndTape`: tape-level events;
- `inferLocalTypes`: simulates the operand stack until no local changes;
- `lift`;
- `ingest(program, source, { tape, spans, maxSourceLength })`.

`LiftError` codes are `frontEndError`, `unsupportedOp` and `typeConflict`; a `block` or `loop` with a result is unsupported. The default path keeps CW's ids, and with them the book's provenance trees [IG §6].

Candela needed the tape path [AN03 §3; D04 L73]:

- Its source exceeds the front end's 64 KiB input limit, so it uses `maxSourceLength` 2²².
- Inspection failed with `unknown tape opcode 151 at 12`. The cause was the Wasm backend's `describeWasmFunction`, which decodes Wasm expansions of `min_num`, `max_num`, `to_i32` and `to_u32` with the tape's opcode table.

Candela constructs [Rep2 §2; D04 L114, L213-214]:

- `caddr(r, p)` traps unless `p <u load32[r]`, and otherwise gives `r + 2p`. It is impure and materialized before stores and calls.
- Multi-value results are an `eval call` followed by `result#k` leaves, plus `return tuple(…)`. 180 of the 332 functions return up to 26 leaves.
- Frame arrays use `aaddr` and `zero`, backed by a 16-aligned area in a 64 KiB stack.

The corpus has 44 projects in 12 groups, 70 functions, about 480 lines of Typed, 46 scripts and 11 UI scripts [AN02 §2.5; Rep3 §8].

### 8.2 The RV32 backend

The backend is a port of CW's `backend.js`. It works per function [IG §14; D03 s2]:

1. `select` tiles value trees onto virtual registers, largest first: `addi` for 12-bit constants, folded load offsets, branches fused with comparisons, `slli` for power-of-two multiplication, "Hacker's Delight 10-1" magic division, and target-directed assignments.
2. `allocate` is a linear scan per class over caller-saved `t0–t4`, `a0–a7` (leaves only) and callee-saved `s1–s11`. An interval crossing a call needs a callee-saved register; there is no live-range splitting.
3. `finish` spills through `t5`/`t6` and builds a 16-aligned frame; a frame over 2,032 bytes gives `frameTooLarge`. It then runs `relaxBranches`, which uses an inverted branch over a `jal` for targets beyond ±4 KiB.
4. `encode` follows.

`BackendOptions` has nine switches: `registers`, `fuse`, `immediates`, `divmagic`, `useRanges`, `order`, `spill`, `hints`, and `layout` (`'source'`, "the only layout so far") [`options.ts:25-54`].

The RV32F extension adds [D06]:

- an f register class, with pools `ft0–ft9`, `fa1–fa7`/`fa0` and `fs0–fs11`, and scratch `ft10`/`ft11`;
- fa registers in calling functions, under a `physicalOccupancy` clash rule. The rule applies only to the f class, because the same rule for `a0–a7` "would change the corpus's integer images";
- constants via `li` and `fmv.w.x`;
- static rounding modes;
- `caddr` as `lw`/`bltu`/`ebreak`;
- `aaddr` relative to `sp`.

`encodeOne` refuses a register of the wrong class. `ilp32f.ts` holds the convention once, for both the runner and the oracle: integers in `a0–a7`, floats in `fa0–fa7`, overflowing floats in a free x register, then stack words. `ImageFn.sig` is recorded only where needed, so corpus image hashes did not change ("projects 44 differ 0 [] 5160").

### 8.3 Float semantics (Candela)

An f32 is stored as its IEEE bits in a signed i32: `1.0` is `1065353216`, −0 is `-2147483648`, and the canonical NaN is `0x7fc00000`. A value record carries `type: 'f32'`; its absence means i32, so integer artifacts keep their hashes. Float operators have their own names, so no integer rule can match them [Rep2 §1; `f32.ts:23`].

The evaluator follows the reference compiler and interpreter line by line [Rep2 §1]:

| operation | rule |
|---|---|
| arithmetic | double precision then `Math.fround`; static round-to-nearest-even, never fused; NaN results become canonical |
| `fneg`, `fabs`, `fcopysign` | sign bit only |
| `fmin`, `fmax` | the non-NaN operand; −0 < +0 |
| comparisons | false on NaN except `fne` |
| `f2i`, `f2u` | round toward zero, saturate |
| `floor`, `ceil`, `trunc` | x itself when \|x\| ≥ 2²³; `ceil(−0.5)` is −0 |

Rep2 §1: "'IEEE semantics' is not specific enough … the evaluator is the specification every optimization is checked against."

Pass rules for floats [Rep2 §1; D04 L271-279]:

- `fold` uses `F32_FOLDABLE`, which excludes `floor`, `ceil`, `trunc` and the integer conversions.
- `simplify` is integer-only.
- `lvn` keys include the type.
- `strength` and `bce` only match integers.
- `licm`, `lvn` and `subst` stay valid, because float operations are pure under a static rounding mode.

**Candela itself** is generated from WGSL into Typed by ds-js-os and runs on the ESP32-P4 [AN03 §2-4; DD05 §7]:

- Its sources are `types.typed`, `math.typed`, `kernel.typed` (3,146 lines), `scenes.typed` (3,332 lines) and `glue.typed`, vendored with digests in `corpus/candela-gallery/`.
- It has about 13,000 f32 operations and 559 checked text addresses.
- 177 of its 332 functions are per-scene sections, reached through five dispatchers on `K.scene`.

A `CandelaHost`, a port of ds-js-os `host.mjs`, renders scenes. It reads the scene table from the generated C file "so no Candela code runs" [CL; D02 L974].

**`bcm`** handles the checked addresses. Per block and receiver, positions of the form base + constant (exact modulo 2³²) keep only the smallest and largest checks. Two facts make this sound [CL; D02 L866-881]:

- capacity is below 2³¹, so nothing wraps;
- a trap aborts the program, so trapping earlier is safe.

Calls and unsafe stores end a group.

## 9. The workbench, and how a person or an agent uses it

**The `wb` API** (`createWb`, `src/workbench/workbench.ts:998-1154`) keeps CW's names and result shapes [`DIVERGENCES.md:3-5`]:

- programs, projects, pipelines, passes and analyses;
- `pass(name)` for user passes;
- `strategy`: `choose`, `fromSpec`, `presets`, `run`, and `save` to `strategies/<name>.json`;
- `compiler()`: passes, analyses, pipelines and strategies "as data", with their definition sites;
- `book`, `source`, `help`, `sync`, and `_snapshot`/`_restore`.

**The replay context** (`sync.ts`) runs CW's synchronous scripts on the asynchronous kernel. A script runs in attempts, and each async call either replays a recorded outcome or throws `Suspend`. The runner then:

1. performs the call on a scratch copy;
2. records the outcome under a key of operation, program, revision chain and arguments, plus a body hash for user passes;
3. restores what the attempt touched;
4. reruns the script.

A script with k new async calls runs k + 1 times, so it must be deterministic. More than 2,000 attempts fail with `notDeterministic`. Between attempts the runner yields to the browser via a `MessageChannel` macrotask [`sync.ts:1-45`; D05 L96-127; Rep3 §8].

**The UI** (`site-src/`) is a dock of tiles with linked selection and 22 views, among them source, IR, CFG, lineage, facts, pipeline, timeline, checks, RV32, console, book and reference [AN02 §2.4; `dock.js:9`]. Three views are new relative to CW [Rep3 §8; D05 s3, s8]:

- **Compiler**: declarations, source and Apply/Dry run. User passes are held to the built-ins' rules.
- **Strategies**: a short-form editor, plus each run's decision, published revisions and trace.
- **Candela**: renders any of 18 scenes, progressively, on the emulator (the reference `kernel` or `stock` policy, or our own image) or on the evaluator, and compares frames bit for bit across engines.

Projects are folders of files: `project.json`, `*.typed`, `scripts/*.js`, `ui/*.js` and `notes.md`. Edits are kept as an overlay in browser storage. UI scripts add tiles through a reactive DSL that refuses queries with side effects [AN02 §2.4]. Everything shown is formatted to 72 columns (`TILE_WIDTH`). That reformatted 88 corpus files, each checked for meaning and Markdown structure; Typed sources were left alone, since their line numbers are provenance [Rep3 §8].

`DIVERGENCES.md` records the deliberate departures from CW:

- `p.apply` is gated against r0 on 40 cases, unless `{ check: false }`;
- reference images are not shipped;
- facts have no stale status, since a fact belongs to one revision.

The build (`tools/build-site.mjs`) bundles with esbuild and SHA-256-checks the vendor files. Candela and the reference compiler load lazily with SHA-384 SRI. The CSP has `connect-src 'none'`, and the site is served on `127.0.0.1:8765` [D05 L143-179, L658-662].

**The agent panel** (`site-src/agent.js`) has one tool, `eval(code)` [`agent.js:1-19`; `views.js:1243-1276`]:

- the code runs in `wb.sync`, with `wb, p, project, ui, src, book, log, yaml, param` in scope;
- the result comes back as YAML, cut at 9,000 characters;
- the modes are Auto, Ask and Read-only, and in Read-only, changing calls throw `readOnly`;
- every step is snapshotted, so it can be reverted.

The panel is **off by default**. There is no model connection and no API key; the page must define `window.WB_AGENT = { sample(messages, { tools, … }) }` [`agent.js:6-14`]. The agent learns from the reference (`wb.help`), the book and the workbench's own source (`wb.source`) [`corpus/book/17-agent.md`].

**A person** starts as IG §21 suggests: run `npm test` and `node tools/parity.mjs`, open Blend, step through O2, and ask `why` of `s:blend.15`.

## 10. Numbers

**Corpus parity.** Book = here, each asserted by a test [Rep1 §7; `tests/typed/*.test.mjs`]:

- **Blend at r0:** 7 blocks, 13 statements. Image 96 bytes, 531 instructions (40 cells, n = 40); 116 bytes with fuse/immediates/divmagic off.
- **O2 on Blend:**
  - revisions r1 cfg, r2 fold, r3 simplify, r4 constprop, r5 dce, r6 licm;
  - `s:blend.15` = `inv = ((a * b) + 64)`, and `s:blend.0` is `removed@r5`;
  - 88 bytes, 451 instructions;
  - `mul t2, a2, a3` covers `v:blend.23` and `s:blend.15`;
  - 322 of 451 instructions trace to line 5.
- **Checksum:** 64 B / 446 → 52 B / 366 after O2.
- **Corpus:** 44 projects, 70 functions, 7,000 cases; 6,986 decided agree, 14 at the step limit. The first full run read 69 functions, 6,886 agree, 1 failure (the `lvn` claim) [Rep1 §6].
- **Other r0 figures** [D03 L113-128]: sort 2,022; Collatz 1,590; value numbering 690; licm-nested 955; digitsum 76 B / 107 with divmagic, 60 B / 71 without; safeShare 56 B and 0 `ebreak` with ranges, 92 B and 3 without; calls 212 / 252 (callee order) / 220 (no hints).
- **`imageAgrees`** passes on all 70 functions: 2,796 decided, 4 inconclusive [D03 L160].

**Reference compiler** (emulator instructions) [Rep3 §6]:

| benchmark | r0 | O2 | reference |
|---|---:|---:|---:|
| Blend | 531 | 451 | 383 |
| Checksum | 446 | 366 | 292 |
| insertion sort | 2,022 | 2,022 | 1,533 |
| Collatz | 1,590 | 1,590 | 1,486 |
| value numbering | 690 | 570 | 695 |

- Corpus bytes: 5,160 against 7,628.
- Chapter 13: 6,986/6,986 agree, for the reference images and for our O2 images.
- Policies on Blend: default 176 bytes / 383; `interactive` 116 / 497. `interactive` over the corpus: 7,392 bytes [D02 L475; D03 L134].

**Preservation audit:** 1,376 applications, 0 failures. With the prototype's claims, `subst`→loops fails on 10 revisions, `lvn` on 9 and `dce` on 2 [Rep3 §6].

**Strategies and search.**

- **Blend preset by instructions** (10 cases per function): O0 2,255 / 96 B; O1 2,235 / 88; O2 1,925 / 88 (wins); loops 1,945 / 96. By bytes, O1 and O2 tie and O1 wins on name [Rep3 §4].
- **Ordering search:** 12 of 44 projects get faster [Rep3 §5]:

| project | O2 | best | winner |
|---|---:|---:|---|
| constants | 70 | 40 (−42.9 %) | `O2x2` |
| checksum | 1,410 | 1,260 | `O2+more` |
| early-exit | 631 | 566 | `O2+more` |
| wrong-shift | 1,650 | 1,500 | `O2+more` |
| strength | 1,938 | 1,802 | `O2+more` |
| ramp | 1,040 | 970 | `O2+more` |
| bounds-two | 810 | 760 | `O2+more` |
| bounds-lab | 5,333 | 5,038 | `O2+more` |
| strings | 10,833 | 10,302 | `O2+more` |
| start-here | 3,871 | 3,750 | `O2+more` |
| histogram | 2,292 | 2,230 | `O2+more` |
| across-calls | 640 | 630 (−1.6 %) | `O2+more` |

- **Search totals:** 77,321 → 75,651 instructions (−2.2 %, excluding `my-analysis`); 5,160 → 5,092 bytes; 0 of 132 final programs disagree; 1,265 s of compile time, about 21 min [Rep3 §5; D02 L650].
- **Conflicting-candidate test:** 33,354 instructions both per program and per function [Rep3 §5].
- **O2+:** 77,321 → 75,681 instructions and 5,160 → 5,104 bytes; 11 projects better, 0 worse; "captures 98% of the search's gain". Checksum 1,410 → 1,260 [CL; D02 L748-756].
- **Specialization (`match-enum`):** 80/80 per revision; 3 statements pruned within one revision [Rep3 §7; D02 L482].

**Candela on the kernel** [Rep2; D04]:

- **r0:** 332 functions, 2,409 blocks, 12,358 statements, 37,220 values, 40,916 ops.
- **Oracle against `stock`** (100 cases per function): 33,200 cases; 31,617 value agreements, 1,368 both-trap, 0 disagree, 215 inconclusive. The inconclusive cases are in five functions, which agree 50/50 at a 5·10⁶ limit.
- **Oracle against `kernel`:** the same counts, in 313 s [D02 s15].
- **Fault injection:** changing `fmul` to `fadd` makes 20/20 disagree.
- **Unsound float passes:** `subSelf` and `notLess` were accepted at 40 cases and rejected at 400 (1/11,200 and 3/11,200). After the sweep they fail at 40 (4/1,120 and 1/1,120) [D04 L293-300].
- **O2** [Rep2 §4]:
  - 16 passes, 13 revisions, 0 rejected, 13,280 cases per pass;
  - statements 12,358 → 9,479 (−23 %);
  - `cfg` r1 makes 974 edits, `dce` 2,164 removals, and `subst` merges 355 temporaries;
  - final check: 33,142 agree, 58 inconclusive, 0 disagree.

**Framework cost on Candela** [Rep2 §5; D02 s12, s16; DD05 §9]:

- O2 took 36 min at 4–6 GB; a no-change pass cost 56–79 s.
- After the caches, a no-change pass went 86 s → 18 s (4.7×), and `cfg` 101 s → 31 s.
- Full O2 pipeline time went 2,178 s → 1,129 s ("36 → 19 min"), at a max RSS of 5.8 GB. Its final check gave 33,184 agree and 16 inconclusive at a 2·10⁵ limit.
- Projection went from over 60 s to 14–18 s after indexing `blocksAdapter.resolve` and `rebuildBlocks`. The full test suite went 32.7 s → 6.8 s, and later 49 s → 37 s.

**`bcm`** [D02 s13-14]: 559 `caddr` in 41 functions (256 in `cdlInit`). The pattern script predicted 421 removable; v1 removed 11. v2 took 559 → 100 (482 edits, 56.5 s), accepted by the contract.

**RV32F images**, 100 cases per function [D06 s9]:

| image | bytes | instr/case | disagree |
|---|---:|---:|---:|
| ours r0 | 183,324 | 921.0 | 0 |
| ours O2 | 151,748 | 870.3 | 0 |
| `stock` | 312,740 | 1,598.6 | 0 |
| `kernel` | 434,996 | 747.7 | 0 |

- O2 is 48.5 % of `stock`'s bytes and 54.4 % of its instructions, and 34.9 % and 116.4 % of `kernel`'s.
- O2 vs r0: −17 % bytes, −5.5 % instructions; 180 functions faster, 21 slower (`fbm3` +37,458).
- Sharing fa registers took r0 189,216 → 183,324 bytes (−2.5 % instructions).
- The run took 22 min 26 s and 1.54 GB.

**Rendering** [D02 s17, s21, s23-24; D05 s10]:

- **B-01 at stride 4:** 19,200 floats bit-identical between the emulator and the evaluator, at r0 and at the O2 head. Evaluator statements: 4.98 M at r0, 3.75 M at the O2 head (−25 %).
- **B-01 at 160×160 on `kernel`:** 217,105,487 instructions (8,481 per pixel); 18.7 s in Node, 38.0 s in the page. At stride 1, 0 of 307,200 floats differ.
- **Our own image as an engine:** bit-identical, at 11,200 instructions per pixel against `kernel`'s 8,501.
- **R-01:** `stock` 44,955 instructions per pixel, `kernel` 16,412.

**Per-scene kernels** [D02 s19, s25-27; DD05 §9]:

- **All 18 scenes:** 135–147 of 332 functions remain (185–197 removed), with 5,317–5,965 statements (−51.7 % to −57.0 %). Every frame is bit-identical at stride 8.
- **Evaluator cost per frame** varies 34-fold, from 654,182 to 22,032,217 statements.
- **B-01:** bytes 183,324 → 76,244 (−58.4 %); instructions per pixel 11,200.4 → 10,494.4 (−6.3 %), against `kernel`'s 8,501.
- **R-01:** bytes → 77,688 (−57.6 %); instructions per pixel 24,070.2 → 22,881.6 (−4.9 %), against `kernel`'s 15,655.9.
- **O2+ afterwards:** under 1 % (B-01 10,435.0; R-01 22,850.9). Per-function checks: 2,699 and 2,739 agree, 0 disagree.
- **Remaining gap to `kernel`:** +23 % (B-01) and +46 % (R-01).
- **General r0 call graph:** 220 of 332 functions are called once, and 17 non-entries are never called. 65 Candela functions are exact duplicates, or 74 ignoring the scene prefix [D02 L1112, L1380].

**Workbench** [Rep3 §8; D05]: 45 of 46 corpus scripts run unchanged; Blend's walkthrough returns `{bytes: [96, 88], steps: [115, 99]}`; the "pass orders" task went from 34 s frozen to 18 s with 86 frames; a user pass won by instructions, 50 against 60; `app.js` is 1,374 KiB (2,158 KiB with Candela support, plus 728 KiB of Candela on demand); Candela opens as a project in about 9.7 s in the page.

**Tests and size:**

- 197 tests after the lift; 325 (322 pass, 3 skipped) at the RV32F merge; `IRWB_FULL=1` 21 of 21 [D02 L27, L1161].
- Full corpus parity takes "84 seconds" [Rep1 §10]; the default run uses a ten-project subset [`passes.test.mjs:76-79`].
- At `a11f6bf`: 290 test calls, 54 value operators, 13 strategy node kinds, 9 backend options [IG-log L265].
- v6's inherited 371/371 tests are "Claimed by the archive, not reproduced" [AN01 §7].

## 11. Unfinished or open, per the sources

**Never done.** P0.1 (running the prototypes themselves) was refused by the permission policy, so parity rests on the book and the vendored oracles [Rep1 §8]. v6's own verification was never reproduced [AN01 §7]. P4.2, the Candela chain as registered IRs and tasks, is open [TASKS; IG §17].

**Framework.** Preservation is checked only when the fact exists; audit mode lives in a tool [Rep1 §10]. Only the first origin is used, and entities created and removed within one revision are unresolvable [Rep3 §9]. E7 is unbuilt; the rewrite engine and task runtime are unused [IG §17]. A secondary tie-break "would need a v6 extension" [D02 L556].

**Cost.** A no-change pass on Candela costs 18 s, because passes are whole-program and nothing persists; search took 21 min on the corpus [IG §3, §17]. Memory (5.8 GB) is now the limit [D02 L951].

**Checking.** Sampled checks miss rare inputs, and no check is exact [IG §17]. The scene-kernel contract compares entries only; folding the per-function check into it "remains open" [DD05 §9]. Step limits weaken checks on deep functions [D02 L1093]. `bcm`'s capacity < 2³¹ assumption is not stated in the IR, and the field rewrite ignores copies of `K` [D02 L901, L1058].

**Compiler.** There is no SSA view, load motion, cross-block value numbering, interprocedural analysis, inlining or cloning; there is one block layout, whole-interval spilling and hand-written tiles [IG §17]. Gaps to the reference compiler are rotation, multi-reader copy coalescing, inlining and float constants kept in registers [Rep3 §10; DD05 §9; D06 L556-558]. Frames over 2,032 bytes are refused, and the fs check covers only the entry function [D06]. Folding `floor`/`f2i` was deferred [Rep2 §1]. FMA tolerance contracts are still an idea [Rep3 §10], and guarded per-scene clones were "not justified" [DD05 §9].

**UI.** Stride-1 renders need a Web Worker [D02 L1143]. `Program.fork()` is proposed [D05 L131].

**Code inconsistencies** (my reading, INFERRED as defects): `passFailed` is never thrown; `checked-sampled` is never recorded; the contract commits before the preservation checks; `applyPass`'s "publishes revisions itself" comment is stale; `strategyRegistry`'s contract omits `roots` [`strategies.ts:119`]; `reference.md` omits `O2+`; `17-agent.md` describes the prototype's hosting.

**Forward plan.** IRWB-002 lists 54 items in ten workstreams. Phase 0 targets a no-change Candela pass under 1 s; phase 1 targets Blend at or below 400 instructions [IG §18-20].

---

## 12. Glossary

| term | meaning |
|---|---|
| adapter, projection | native value ↔ entities and typed relations (`rebuild` back) [IG §4] |
| artifact | immutable finite-JSON value with `contentHash` and `revision` [IG §3] |
| assumption | meaning contract restricted to inputs satisfying bindings; stored per revision |
| assurance | `declared`, `checked`, `transferred`, `proof`; `checked-sampled`/`-exact` via `assuranceOf` |
| audit mode | `auditPreservation`: compute every claimed fact so every claim is checked |
| `because` / `note` | why a change was valid (entity or fact references) / prose |
| `bcm` | bounds-check merging for `caddr` |
| binding | `typed.bindings` entry: parameter or record field → value, with the outer `entity` |
| `caddr` / `aaddr` | checked text address / frame-array address |
| Candela | the 332-function path tracer; `K` is its kernel record |
| correspondence | entity relation between revisions or IRs, with reasons |
| decided / inconclusive | case finished / hit the step limit |
| `dfe` | dead-function elimination from entries |
| entries, roots | functions the host calls; the only ones compared |
| fact, view | analysis result per revision; query methods rebuilt over it |
| gate, meaning check | `typed.meaning-kept` against r0 |
| ilp32f | RV32 hard-float calling convention |
| "kernel" | the record `K`, the reference `kernel` policy, per-scene kernels, or the compiler core [D02 L1366] |
| lift, materialize | tape → blocks; spilling pending values to temporaries |
| O2 / O2+ | CW's fixed 16-pass pipeline / plus one `subst` |
| plan, short form | Strategy IR JSON / its compact `{choose, by}` form |
| policy | reference-compiler mode: `stock`, `interactive`, default, `kernel` |
| replay context | `SyncContext`: synchronous scripts over async passes |
| revision | content hash of `{kind, schemaVersion, value}`; r0…rN are timeline positions |
| scene section | per-scene Candela function `s<k>_…` |
| `Tx` | the per-function transaction through which passes edit |
| `typed.blocks` | the main IR: CFG of statements over single-use value trees |
| `wb` | the workbench API for UI, scripts, console and agent |
| `why` | provenance tree via origins or `whyEntity` |
