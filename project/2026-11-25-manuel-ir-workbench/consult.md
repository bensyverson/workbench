*2026-11-25. The blind consult: a separate `claude -p --model opus --effort xhigh` run (48 turns, $4.11) from a scratch folder outside the repo, given only [the brief](consult-brief.md), our proposal and architecture synthesis, [the summary](summary.md), Manuel's repository and his three reports. It did not see the per-slot effects draft or anything built since the synthesis. Saved unchanged by the main thread; the informed pass beside it checks each point against what we have.*

# What the Workbench Kit should learn from IR Workbench v6 and its Typed → RV32 compiler

*Independent design review, 2026-11-25. "Ours" is the Workbench Kit; "theirs" is the IR Workbench v6 framework with the Typed → RV32 compiler defined on it.*

**How sources are cited.** For ours, "Proposal §n" is `ours/proposal.md` and "Synthesis §n" is `ours/architecture-synthesis.md`; where they differ I follow the synthesis. For theirs, "Rep1", "Rep2" and "Rep3" are the three files in `theirs/reports/`. "IG" is the IRWB-002 intern guide and research agenda (`ttmp/2026/11/24/IRWB-002…/design-doc/01-…md`). "D02" is the coordinator's implementation diary and "D05" the UI agent's diary (`ttmp/2026/11/24/IRWB-001--ir-workbench/log/`). "DD01", "DD02" and "DD05" are that ticket's design docs. Code paths are relative to `theirs/repo/`. I checked every claim a recommendation depends on against code or a primary document. Where only `theirs/summary.md` supports a claim, I write "(summary only)". **INFERRED** marks my own inference.

---

## 1. The two systems

**Ours.** The Workbench Kit is infrastructure for producing many small domain languages, each delivered as a "workbench": a language, an IDE, an agent and a book in one browser page (Proposal §1). An author writes programs in JavaScript. Build-time code runs natively, and runtime lambdas are parsed from a JS subset and lowered into a small typed Kernel IR. Operators take their meaning from types (D1), and a reference interpreter defines what the IR means (Proposal §5.7 correction). Emitted JS must match the interpreter bit for bit; emitted GLSL must match within a tolerance (Proposal §6, §12 corrections). A Dialect and a Grammar are declared as data, and the kit generates a builder from them. The test of the design is a fresh agent building a new language from the docs alone (Proposal §14, H5). Performance is delegated to the browser's JIT and the GPU driver; the synthesis lists optimizers, pass managers and SSA as dead weight (Synthesis §1). What is next is composition: dialects as portable packages, seam types, clocks and a build record (Synthesis §3.4–3.7, §6).

**Theirs.** One optimizing compiler, from Typed (the PicoCalc's typed JS subset) to RV32IM/F, is *defined on* a generic framework for inspectable compilers. "Defined on" means every IR, pass, check and pipeline is framework data, so the framework can enforce it (Rep1 intro, §1). The framework (v6, about 5.9k lines kept whole, DD01 §3.2) offers content-hashed artifacts, adapters that project an IR into entities and relations, analyses cached per revision, transformation contracts and a plan language for pass orderings. On it sit sixteen-pass pipelines, six analyses, an evaluator that defines meaning, an RV32 backend and a provenance system that answers `why` for any entity (Rep1 §2–§7). The gate for every pass is a sampled differential check against the original program, r0 (Rep1 §4). The correctness criterion was exact parity with the prototype's book (Rep1 §7). Later work took on Candela, a 332-function f32 path tracer, and specialized it per scene (Rep2; DD05 §9). The browser workbench and its agent panel are ports of the prototype. The panel ships switched off, with no model connection (`site-src/agent.js:6-14`).

**Where the goals differ, and what that decides.** The two systems differ on five axes, and each limits what transfers.

1. **Many languages against one.** Their front end is vendored unchanged (Rep1 §2), so defining a language, which is our core problem, does not arise for them.
2. **Lowering once against transforming repeatedly.** Their provenance, preservation claims and strategy machinery answer questions that only exist once a program is rewritten many times. We do not optimize.
3. **One exact target against several numeric models.** They make the evaluator agree with RV32F hardware bit for bit (Rep2 §1, §3). We have a GPU that we cannot make exact.
4. **The agent's role.** Their agent is optional and reads the workbench's own source (`corpus/book/17-agent.md`). Ours is a primary user and the test of the design.
5. **Scale.** Their real workload has about 235,000 records (DD05 §3.1). Our Kernels are small, though dialect data may not be (INFERRED).

What does transfer: their checking discipline (how cases are chosen, what evidence is recorded, the rule that declarations get audited), their precision about float semantics, a few engineering practices, and their performance walls.

---

## 2. What to adopt, ranked by value to ours

### 2.1 Audit every declaration against an execution, including declarations no program exercises

**In theirs.** A pass declares which analyses its edit preserves. `applyPass` checks a claim only when the fact already exists for the input revision (`src/framework/passes/define-pass.ts:284-288`, "if (!manager.hasAnalysis…) continue"). The first full corpus run refused a false claim the prototype had shipped: `lvn` claimed to preserve `typed.loops` (Rep1 §6). The defect was latent in the prototype only because its pipelines happened to run `licm` before `lvn` (Rep1 §6). An audit mode then computes every claimed fact first. With the prototype's claims restored, it found two more false claims that had survived the first run: `subst` on 10 revisions and `dce` on 2 (Rep3 §6). The research agenda names the general gap as "facts are trusted, not tested" and proposes checking analyses against executions as a differential invariant (IG §17, item C5). It also proposes that audit mode be the default in tests (IG I3).

**Our problem.** Our Dialects are full of declarations, and fresh agents write them:

- intrinsic purity and effects;
- per-target spellings beside a reference implementation (Proposal §8.1);
- target capabilities (`accepts`);
- soon, per-slot effects: "a lambda changes only the instance it is handed; shared totals only by commutative bumps" (Proposal §9.4 correction).

An expert wrote theirs and they were still wrong. We should expect ours to be wrong more often. Worse, a per-target spelling is compared only when some program calls the intrinsic on the inputs a run happens to produce. This is the same blind spot as "checked only when the fact exists" (INFERRED mapping).

**Smallest version now.** Add a "dialect audit" stage to `check`:

- (a) For every intrinsic, run its reference implementation against each target spelling directly, on generated arguments, independently of the programs. GLSL can share the harness's existing render path (INFERRED that it can).
- (b) Run every intrinsic and Library function through the interpreter's existing `onNode` hook (Proposal §12 correction) with reads and writes recorded. Fail if the observed effects are not a subset of the declared ones. For JS-implemented intrinsics, pass a recording proxy as the runtime state.
- (c) When per-slot effects are built, check the claim dynamically: run each per-instance kernel over its instances in two orders (forward and seeded-shuffled) and compare final states.

**Cost.** (a) and (b) are about a day each, given the harness and interpreter hooks that already exist (INFERRED). (c) belongs to the per-slot effects work. See §3.3 on why (c) must compare floats with care.

### 2.2 Choose the cases on purpose: edge values first, target-undefined inputs set aside, and faults that only show at the edges

**In theirs.** Four float rewrites are valid over the reals and wrong in IEEE arithmetic (`x+0→x`, `x·0→0`, `x−x→0`, `!(a<b)→a≥b`). Written as deliberately unsound passes, two of the four were *accepted* at 40 random cases per function and rejected only at 400: 1 and 3 disagreements in 11,200 cases (Rep2 §1). The fix was in case generation. The first quarter of a function's cases sweeps 15 f32 edge values: NaN, ±∞, ±0, ±1, subnormals, extremes and the `to_i32` bounds (`src/typed/evaluate.ts:190-251`). After the sweep, all four rewrites are rejected at 40 cases (Rep2 §1). The guide's lesson: the case distribution "is part of the trusted base" (IG §10). Their check also has a third outcome. A case where either side hits a limit is *inconclusive*: it is counted and set aside, and a check with no decided case fails, "because it has established nothing" (`src/framework/contracts/differential.ts:8-9`, `:84-96`, `:116-119`). Their gross planted fault (`fmul`→`fadd`) was caught 20 times out of 20 (Rep2 §3). It was the subtle faults that slipped through.

**Our problem.** We compare the interpreter with JS exactly and with GLSL within 1e-3 (Proposal §12 correction). H8 tests sensitivity with planted faults (Proposal §14). The inputs do not say what the harness generates (§7, Q1). They also do not say how the comparison treats outputs that are NaN or ±∞, or operations GLSL ES leaves undefined: `sqrt` of a negative, `pow` with a negative base, `normalize` of a zero vector, division by zero (INFERRED from general knowledge of GLSL, not from the inputs). A tolerance comparison has nothing sensible to say about NaN against a number. Such cases either fail spuriously or, worse, are skipped silently.

**Smallest version now.**

- (a) Give each scalar type an edge set and use it for the first quarter of the cases of every Kernel and intrinsic parameter, component-wise for vectors.
- (b) Let an intrinsic's target entry declare an optional "undefined when" predicate, for example GLSL `sqrt` when x < 0. A case whose reference inputs satisfy it counts as inconclusive *for that target*, and zero decided cases is a failure.
- (c) Add their four unsound rewrites, plus `floor`/`trunc` swapped on negatives and the sign of `%`, as planted faults in H8's set.

**Cost.** About a day for (a) and (b); an hour for (c).

### 2.3 Pin dialect packages by content digest, checked at load

**In theirs.** Every vendored file is listed with its SHA-256 and the source commit. The loader refuses a mismatch before running anything ("so a test never runs a modified copy") (`tools/node-vendor.mjs:1-22`; `corpus/candela-gallery/VENDOR.json`). Lazily loaded files in the page carry SRI hashes (summary only, §9). A related hazard: a definition's code changes while its version label does not. The workbench's replay keys therefore include a hash of a user pass's body (Rep3 §8), and the agenda asks the same of every cached definition (IG F2).

**Our problem.** The proposal's first problem statement is "small deviations are inherited silently", with a CDN font as the example (Proposal §1, L6). The synthesis is now fixing a package format: dialects are fetched from a repo, a path or an upload, and "pinned" (Synthesis §3.4). The Composition milestone also wants a build record that says why something rebuilt (Synthesis §3.7, §6). A pin by tag or branch cannot detect drift. A pin by digest can, and the same digest is the honest "dialect version" for the build record.

**Smallest version now.** A package manifest lists each file with its SHA-256; the package digest is a hash of the sorted list. The loader refuses a mismatch with a diagnostic that names the file. Content keys and the "why did this rebuild" answer cite the package digest, never a version string.

**Cost.** Half a day, inside the Composition milestone. It is cheaper before form and book build on the format, which is the synthesis's own argument for ordering (Synthesis §6, item 2).

### 2.4 Content keys per unit, computed off the main thread

**In theirs.** An artifact's revision is a SHA-256 of its canonical encoding (IG §3). This removes stale facts by construction, and it scales with the whole value. Making one artifact cost five whole-value canonical encodings and two SHA-256 passes (DD05 §3.1). On Candela the profile shows encoding at 38.0 s, `sha256` at 11.9 s and `immutable` at 5.9 s, against 0.6 s for the hottest compiler function (Rep2 §5). Caching brought a no-change pass from 86 s to 18 s (D02 Step 12), which the guide still calls "far too long" (IG §3). The planned fix is per-function hashing as a hash tree (IG F1). It comes with a warning: changing the hashing scheme invalidates every stored revision, so "make that change once and before F2 creates a store" (IG §22). In the page, opening Candela holds the main thread for about 10 s while r0 is hashed (D02 Step 21).

**Our problem.** We are about to define content keys for the build record and for caching expensive dialect builds (Synthesis §3.1, §3.7). Our Kernels are small, but a dialect's build output may be a world, a table or a grid (INFERRED). Changing the key scheme later is the expensive mistake they are now facing.

**Smallest version now.**

- A unit key is the hash of the unit's kind, schema version and canonical value, plus the digests of its inputs. A unit is a Kernel, a construct's record or a dialect build output.
- A program key is the hash of its sorted unit keys.
- Never deep-freeze and hash whole worlds.
- Anything large is hashed in a Worker.

**Cost.** A design decision now, almost no code. Retrofitting later is what IG F1 sizes as "L" (one to three months).

### 2.5 Report evidence, not verdicts

**In theirs.** A differential check returns evidence: method `sampled`, invariant id, seed, total, agree, disagree, inconclusive and up to five counterexamples (`differential.ts:54-64`, `:132-142`). The seed comes from a small deterministic generator, so a reported counterexample can be rerun (`differential.ts:14-24`). The framework has an assurance vocabulary that separates `checked-sampled` from `checked-exact` (`differential.ts:145-148`). In practice that distinction was lost. The manager records invariants as plain `checked` (`src/framework/contracts/analysis-manager.ts:1140`), and `assuranceOf` is called only in one test (`tests/framework/ext-e5.test.mjs:50`; nothing else calls it).

**Our problem.** The proposal's sample check output reads "js = interp 8/8 · glsl ≈ js 6/6 (max error 1.2e-6)" (Proposal §11.3); I have not seen the real output. That counts programs, not cases, and gives no seed. The synthesis already concedes that the harness cannot show intent (Synthesis §3.6). The neighbouring limit, that it shows agreement only on the cases it ran, is not yet visible to the agent or the reader.

**Smallest version now.** Each comparison line carries cases, seed, inconclusive count and the word "sampled". `diff(target)` in the lab API returns the evidence object. The tolerance line keeps its maximum error and adds the case that reached it, which IG D6 proposes for their own tolerance contracts.

**Cost.** Hours. Their history shows the distinction has to be designed into the record, or it disappears.

### 2.6 A layering test that keeps Dialects out of the kit

**In theirs.** `tests/framework/layering.test.mjs` enforces three import rules on the source, including "no layer of the framework imports a domain". Its regex sees only single-quoted static `from` imports (`:13`), so inline `import('…')` types escape it (summary only, §2.3; the regex itself I checked).

**Our problem.** G7 says the core has no entities, events or frame loop (Proposal §4). Even so, M2 had to change 14 existing source files to add a second Dialect (Proposal §15 correction). Packages that travel (Synthesis §3.4) only work if the kit never reaches into a dialect.

**Smallest version now.** A test that the kit's core folders import nothing under `kit/dialects/`. It should catch static and dynamic imports with either quote style.

**Cost.** An hour.

### 2.7 Compare every later stage with the origin, and carry assumptions with the artifact

**In theirs.** Every pass is checked against r0, not against the previous revision, "so errors cannot accumulate across passes" (IG §10; Rep1 §4). Specialization changes meaning on purpose. They record an assumption, restrict the comparison to inputs that satisfy it, store it with each revision, and drop it on undo or checkout. A rejected specialization rolls it back (Rep3 §7; D02 Step 6, "Restoring assumptions").

**Our problem.** We have no passes yet. H11 lets dialects add passes "gated by the verifier and the differential check" (Proposal §7 correction). Our LIR→GLSL path already compares against the interpreter of the core IR (Proposal §6 correction), which is the origin rule.

**Smallest version now.** Write two sentences into the pass and query API draft. First, the reference is always the interpretation of the IR as lowered from source. Second, any pass that specializes on a value records the binding with its output and is compared only on inputs that satisfy it.

**Cost.** A paragraph now. It saves a design argument later.

### 2.8 Provenance as a required field at the first rewrite, without their three holes

**In theirs.** Every entity carries `origin: [{from, via, kind, rev, because, note}]` (summary only, §3.5, citing `src/typed/model.ts:101-108`). A removal without `because` throws `missingBecause` (`src/typed/tx.ts:356`). The book's `why` tree for Blend is reproduced node for node (Rep1 §7). Three holes are documented:

- only the first origin is used;
- entities created and pruned inside one pass appear in no revision, so `why` answers "absent";
- a reason sits on the rewritten value, one level below its statement.

(IG §11; Rep3 §9; D02 Step 14.)

**Our problem.** We have spans per node and no provenance across rewrites. The synthesis wants one record to feed `why`, `trace` and the build record (Synthesis §3.7).

**Smallest version now.** In the LIR stage that already exists, each node records `from: [core node ids]` and `via: 'lir'`, and each refusal or narrowing records `because`. Keep all origins as a list. Keep entities born and removed in one step in that step's report.

**Cost.** About a day for LIR (INFERRED), then a rule for every later stage. Value is moderate while we have so few rewrites.

### 2.9 Book numbers as pinned tests that name their configuration

**In theirs.** Every number in the prototype's book is asserted by a test (Rep1 §7). "A mismatch against it has so far always been a misreading or a missing piece, never a tolerance question" (D02 Step 6). One such misreading came from running each project's own pipeline where the book meant "O2 everywhere" (D02 Step 6). Reading their own report back against the evidence found eleven sentences that claimed more than was measured (D02 Step 28).

**Our problem.** Proposal §10 already says chapter examples run as tests. Agents will write the books, and they overclaim as theirs did.

**Smallest version now.** A number in a chapter is either an embed of a check's output or a fenced assertion that names its configuration (target, seed, case count). `check` fails when it drifts.

**Cost.** Small, when M5 (form and book) starts.

### 2.10 Structured diaries in fresh-agent trials

**In theirs.** Each subagent kept its own diary with fixed headings: what didn't work, what I learned, what was tricky, what warrants a second pair of eyes, and review instructions (D02 throughout; logs 03–06). The exact error text from failures is in those entries. Examples: a scripted edit that silently matched nothing (D02 Step 8), and a prediction script that promised 421 removable checks when the pass removed 11 (D02 Step 13).

**Our problem.** Fresh-agent trials are our main test of the design (Proposal §14, H5). The synthesis cites agent failure data as decisive (Synthesis §3.3).

**Smallest version now.** The trial brief asks for a diary with those headings, with every diagnostic quoted verbatim. Friction then arrives as data rather than recollection.

**Cost.** A paragraph in the brief.

---

## 3. What should change in our approach

**Verdict.** The direction holds, and their numbers confirm the synthesis's ruling against a strategy layer and a pass framework. Three premises need tightening:

- what the harness can claim to show;
- D5's split of comparisons into "exact" and "tolerance", which needs a third outcome;
- the per-slot effects draft's "commutative bumps" rule, which does not survive floats (INFERRED).

### 3.1 No change: the strategy layer and pass framework stay out

Synthesis §3.7 keeps out `repeatUntilStable`, `chooseBest` and analysis invalidation. It un-parks a pass manager only "when a backend wants a transformation". Their measurements support that:

- Searching four orderings across 44 projects took 21 minutes and saved 2.2% of instructions (Rep3 §5).
- Per-function search never beat a single choice per program (Rep3 §5).
- Eleven of the twelve wins were one extra `subst` at the end of O2. A fixed pipeline, `O2+`, captured 98% of the search's gain (D02 Step 11).
- The framework's generic projection, diff and rewrite machinery is mostly unused by their own compiler. The passes return native values and use neither `beginEdit`, the pattern matcher nor the rewrite schedules (IG §4). The task runtime is unused (IG §15).

Nothing in their experience argues for building either sooner.

### 3.2 Tighten: what the harness shows (Synthesis §3.6, Proposal §12, H8, §16)

Proposal §16 says "Differential checks gate every backend and every pass". Synthesis §3.6 says we "can show that every fast path agrees with a reference". Their evidence says a sampled check shows agreement *on the cases it ran*, and that its strength is a property of the case distribution. Two of their four unsound rewrites passed at 40 cases (Rep2 §1). Their research agenda makes "kill rate" a first-class number to track, like instructions (IG §22, D2).

The change: §3.6 should read "every fast path agrees with a reference on a stated, sampled distribution". H8's fault set should include edge-only faults (§2.2(c)). The kill rate of the planted faults should be reported as a number, not as a pass. This is a wording and measurement change, not a redesign.

### 3.3 Tighten: D5 needs a third outcome

D5 says floats compare within a tolerance and integers exactly (Proposal §17). Their float work shows that "IEEE semantics is not specific enough". Comparisons on NaN, `min`/`max` with −0, saturating conversions and `floor` of large values are each a choice the target makes (Rep2 §1, table). Their harness already has an "inconclusive, set aside" outcome (`differential.ts:116-119`).

For a GPU target, some inputs have no defined result at all (INFERRED, general knowledge of GLSL ES). Tolerance cannot express that. The change: D5 gains a third outcome. Inputs in a target's declared undefined domain are set aside per target and counted, and a run with nothing decided fails (§2.2(b)).

### 3.4 Tighten (INFERRED): "commutative bumps" is not enough for floats

The per-slot effects draft allows a per-instance kernel to touch shared state "only through commutative bumps" (Proposal §9.4 correction). Float addition is commutative but not associative, so the *order* of accumulation changes the low bits. Their work shows twice that order and grouping change results:

- With widening, the dataflow fixpoint depends on visit order, and two schedules produced different programs (Rep1 §5).
- In Candela renders, how pixels were grouped into spans changed the output bits: 36 of 180 compared floats in scene V-03 (D05 Step 6, and again in the stride-1 entry). I could not find the cause in what I read.

Synthesis §3.8 also promises that replay gives "the same state hash". That promise and float bumps interact.

The change: integer bumps stay exact. Float bumps either have a reference order defined by the interpreter (instance order) and are compared within a tolerance that grows with the count, or they are refused on targets that cannot honour the order. Decide this before per-slot effects are built. It costs nothing now.

### 3.5 No change: the kit stays opaque to the agent, and the IR shape stays

Their agent reads the workbench's own source (`corpus/book/17-agent.md`). Our G2 keeps the kit opaque (Proposal §4). Their panel is switched off and unmeasured (`site-src/agent.js:6-14`), so their experience offers no evidence either way. Their agenda keeps a CFG with expression trees as the one primary IR, treats SSA and similar forms as optional views, and makes "compile time is a result" a rule (IG §18, §22). That is consistent with our small Kernel IR and changes nothing.

---

## 4. What not to adopt, and why

- **v6's representation layer:** adapters projecting into entity and relation graphs, generic `diff`, composable correspondence, `IRStore`, patterns and rewrite schedules, the task runtime. These serve a compiler that rewrites programs many times. Their own passes bypass most of it (IG §4, §15). Its cost dominated at scale (Rep2 §5). And the second domain that was to prove its generality was listed as an expected gain (DD02, line 494) but never built: no task for it appears in `IRWB-001…/tasks.md`. Our generic layer is the Definition API, and it already has three Dialects behind it.
- **The Strategy IR, `chooseBest` and per-function search.** See §3.1. One fragment is worth keeping as a habit: when the kit makes a choice, such as where a kernel can run, it records the alternatives and the reason. T001 already does this (Proposal §6 correction).
- **The AnalysisManager with preservation claims and checked transfer, and the dataflow framework with lattices and widening.** We have no cached analyses shared between passes, and our loops are bounded by construction (Proposal §5.5). Recomputing a query costs milliseconds.
- **Carrying every f32 as integer bits throughout the IR** (Rep2 §1). They needed it because every artifact is hashed as finite JSON. We need only the narrower fix for constants (§6, risk 7).
- **The replay context** that runs synchronous scripts over an asynchronous kernel (`src/workbench/sync.ts`; Rep3 §8). It exists because v6's contracts and plan interpreter are async (`src/workbench/DIVERGENCES.md`). It makes scripts rerun k + 1 times and requires them to be deterministic. Keep our kit synchronous, and confine async to GPU readback.
- **The backend machinery:** tiling selection, linear-scan allocation, bounds-check merging (summary only, §8.2; D02 Steps 13–14). We emit JS and GLSL, and the JIT and driver do this work (Synthesis §1).
- **Restricted-contract specialization as a general mechanism** (Rep3 §7). Binding time folds build-time values before any IR exists (Synthesis §3.1). There is nothing to restrict unless a later pass specializes, and then §2.7 suffices.
- **Exact parity with a frozen prototype as the correctness criterion** (Rep1 §7). It worked for them because they had an external, exact oracle. We have none for model-written dialects (Synthesis §3.6).

---

## 5. Where ours is ahead, or chose differently on purpose

- **Generality is tested, not claimed.** We have three Dialects (game, shader, data table) behind one Definition API. Their framework's ability to host a second domain was never exercised (§4).
- **Staging is built in.** Their agenda proposes, as a research item, a staged builder in which host code constructs the IR and folds build-time values. The reason given is that facts Candela's generator knows "are lost when it prints text" (IG J1). Their specialization machinery exists to recover those facts afterwards (Rep3 §7). Our programs already work this way: build-time JS constructs the IR, and binding time is explicit (Proposal §5.4; Synthesis §3.1).
- **Several numeric models are first-class.** We have a working tolerance harness against a real GPU (Proposal §15, M2 correction: within 2.19e-4 per component). Their tolerance contracts are a proposal (IG D6).
- **We plant faults.** H8's planted faults exist in ours. Their mutation score is proposed (IG D2), and they found the float weakness only "because someone thought to test it" (IG D2).
- **A stepping debugger.** Our pixel debugger steps the interpreter with spans and values (Proposal §12 correction). Theirs has `why` and per-line instruction counts, and proposes bisection as future work (IG I4).
- **The agent is the user and the test.** Ours has token budgets, a check loop that answers in 40 lines, and fixits on every diagnostic (Proposal §11). Theirs ships the agent switched off (`site-src/agent.js:6`).
- **Convergence where both landed.** Both systems have one `eval` tool, YAML-sized results (their cap is 9,000 characters, `site-src/agent.js:19`), auto, ask and read-only modes, and a revert per step (`corpus/book/17-agent.md` §2). Theirs adds two small touches worth copying into our in-page agent. Earlier tool calls are summarized to their first line, and snapshots are cheap because revisions are immutable (`corpus/book/17-agent.md` §1–§2).

---

## 6. Risks their reports reveal that ours will meet too

1. **Edge-value blindness.** Random cases miss NaN, ±0 and ±∞, and the faults that live there (Rep2 §1). It matters most for our shader Dialect and Library helpers (INFERRED).
2. **A false declaration stays latent until some order exposes it.** Their `lvn` claim was harmless in the prototype only because of pass order (Rep1 §6). Ours: an intrinsic declared pure, or a lambda declared instance-local, that stays harmless until a target parallelizes it (INFERRED).
3. **A check runs only when something triggers it.** Their preservation checks ran only when a fact happened to exist (`define-pass.ts:284-288`). Ours: target spellings are compared only through the programs that call them (§2.1).
4. **Performance walls stay invisible at example scale.** An adapter's `resolve` scanned every entity on each call: about 10¹⁰ steps on 103,618 entities. Projection did not finish in 60 s, and the corpus "never exposed the problem" (Rep2 §5). Keeping 13 revisions with their analyses took 5.8 GB (D02 Step 16). Test dialect builds and the build record at 100 times the size of the examples, and share structure between kept revisions (INFERRED).
5. **The page's main thread blocks.** A promise chain that never waits for I/O froze the page for 34 s, until they yielded through a `MessageChannel` macrotask (Rep3 §8). Hashing r0 holds the page for about 10 s, and full-resolution renders need a Worker (D02 Step 21). Our in-page checks (Proposal §11.3) and GPU comparisons will hit the same wall. Run them in a Worker from the start.
6. **Partitioning work changes float bits** (D05 Step 6: span grouping, V-03). Splitting a per-instance or per-pixel computation into Worker tiles is safe only for truly instance-local kernels. Any accumulation breaks bit-exactness (INFERRED; see §3.4).
7. **JSON is lossy for floats.** Their canonical encoder refuses non-finite numbers and writes −0 as 0 (`src/framework/core/data.ts:12-20`). A NaN metric crashed a strategy run, and they judged the refusal correct (Rep3 §4, §9). Our IR has a JSON form (Proposal §5.2), and the synthesis promises state hashes (Synthesis §3.8). Plain `JSON.stringify` turns NaN and Infinity into `null` and −0 into `0`. A folded build-time NaN, or a −0 constant, could change meaning or collide in a content key (INFERRED; see §7, Q4).
8. **Step limits and inconclusive cases quietly weaken checks.** There were 215 inconclusive Candela cases, all in five deep functions (Rep2 §3). The scene-kernel contract compares entries only, and the per-function check compared two specialized revisions with each other, not with r0 (D02 Steps 19 and 27). Their verdict rule also lets any trap agree with any other trap (`src/typed/evaluate.ts:531-534`), which hides a change in *which* error occurs. Our dialect runtimes and the lab API's error states face the same choice (INFERRED).
9. **Gate strength falls as candidates multiply.** "A technique that generates many candidates raises the chance that one wrong candidate slips through a sampled check" (IG §22). This applies to H11's agent-written passes and to agents iterating on a Dialect until `check` goes green (INFERRED).
10. **Agents overclaim.** One report draft predicted wrongly, and a first explanation "was a guess" (D02 Step 9). Eleven sentences in a later report went beyond the evidence (D02 Step 28). Our "Corrected" notes show the same pattern (Proposal, passim).
11. **Silent no-ops.** Scripted edits to reformatted files matched nothing and reported success (Rep3 §9; D02 Step 8). A separate prediction script measured what a deeper analysis could do rather than what the pass did: 421 predicted, 11 removed (D02 Step 13).
12. **Async creeps.** Once the core became async, every script needed a replay mechanism, and one corpus script changed behaviour (`src/workbench/DIVERGENCES.md`; Rep3 §8).

---

## 7. Questions I could not settle from the inputs

- **Q1.** What inputs does our harness generate for Kernel comparisons: a pixel grid only, or random parameters too? Does it include NaN, ±0, ±∞ and subnormals? The inputs say "1e-3 per color component, measured on one GPU" (Proposal §12) and nothing about distribution.
- **Q2.** Which faults are in H8's planted set, and what is the kill rate? Are any of them faults that differ only at edge values?
- **Q3.** How does our GLSL comparison treat NaN and ±∞ outputs, and operations GLSL leaves undefined?
- **Q4.** Does our IR's JSON form round-trip −0, NaN and ±∞ constants, including values folded from build-time code? Will content keys and replay state hashes (Synthesis §3.8) be built on it?
- **Q5.** Is every intrinsic's per-target spelling exercised by at least one program today, or only some?
- **Q6.** Will per-slot effects permit f32 bumps, and on which targets? WebGL2 GLSL has no float atomics (INFERRED, general knowledge), so the question may decide itself.
- **Q7.** Is the kit synchronous end to end? Would WebGPU comparisons, with asynchronous readback, push async into the lab API?
- **Q8.** On their side: what makes V-03's output depend on span grouping (D05 Step 6)? The diaries I read record the effect, not the cause.
- **Q9.** On their side: whether v6's adapter model generalizes to a second domain cannot be judged. It was planned (DD01 §4 Phase 4; DD02 line 494) and not built.
- **Q10.** On their side: the summary says `checked-sampled` is never recorded. I confirmed that `assuranceOf` is called only in a test and that the manager writes `checked` at `analysis-manager.ts:1140`. I did not read the other two `checked` sites (`:598`, `:1424`), so whether any path records the sampled level is not fully settled.
