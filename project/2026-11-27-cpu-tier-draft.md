# Draft: one language, two tiers (a CPU tier beside Bench)

*2026-11-27, leaf `Gqg0Sf` (cpu-tier-53). A design draft for [Ruling 2](2026-11-27-sketch-feasibility-findings.md#rulings-ben-2026-11-27) of the sketch findings; nothing here is built. Inputs: those findings ("The General question" and the per-sketch algorithms), [Manuel's Typed](2026-11-25-manuel-ir-workbench/summary.md) (ideas only: it carries no license), [passes, queries and several IRs](2026-11-23-passes-queries-and-several-irs.md), [the backend direction](2026-11-24-backend-direction.md), [the delivery decisions](2026-11-23-delivery-decisions.md), and the READMEs of kit/parse, kit/ir, kit/lower, kit/interp, kit/lir, kit/emit/js, with kit/API.md and kit/glossary.md. Constraint (Ben): no new dependencies. VERIFIED marks a doc, a file:line or a probe; the rest is design or inference. The three algorithm sketches below were run as plain JavaScript by a probe (`node scripts/feasibility/Gqg0Sf-sketches.probe.js`), which checks that each computes what it claims; how they would lower is a design claim, since nothing lowers them yet.*

## The answer in one paragraph

Keep one language and one parser, and give every Kernel a list of **needs**: the CPU-only features its body uses, each with its span, summed through the functions it calls as effects already are. A Kernel with no needs is Bench; a Kernel with any is CPU-tier. Five needs make up the CPU tier: **loop** (a `while`, `do…while`, or a `for` whose bound or step Bench cannot check), **recursion**, **heap** (a list made or changed at run time), **text** (reading inside a string) and **fnref** (a top-level function passed as a value). Closures that capture, maps, mutable struct fields, classes and exceptions stay out. A function's tier is inferred, never written; a Dialect's slot declares the tier it accepts (`tier: "cpu"`, default Bench), so a CPU-only lambda in a Bench slot is refused with the need and its line, and a Bench function can never call a CPU one, because its needs would include the callee's. In place of Bench's static guarantees, the CPU tier has run-time **budgets** (steps, call depth, list cells), counted the same way by the interpreter, emitted JS and wasm, so a runaway call traps at the same point everywhere and a replay reproduces it. Lists keep JavaScript's reference semantics and have no identity, which lets wasm use **one bump arena per call into the tier**, with inputs copied in and the result copied out, and no garbage collector or reference counts. The algorithms reach a run in three stages: CPU-tier slots first (no kit/run change), then package functions the trusted runtime calls, then runtimes written in the CPU tier. Trusted runtime JS stays until the third stage shows packages port cleanly; then it should retire. Knuth–Plass, a packrat PEG parser and Levenberg–Marquardt are written below in the tier, with the needs each one uses.

## Where the line falls today

The ruling calls Bench "the stricter, GPU-able check." It is the stricter check, but not the GPU one. Bench admits f64, strings, lists, structs and optionals, and the LIR refuses every one of them for GLSL (R001, R002: VERIFIED, [kit/lir](../kit/lir/README.md) "Diagnostics"). So there are three nested sets, not two:

| Set | What it guarantees | Who checks it |
|---|---|---|
| A target's LIR (GLSL today) | what that target can express: no f64, no strings or lists, explicit conversions | kit/lir, per target |
| **Bench** | every Kernel ends, with a cost bound its types give (bounded loops, no recursion), and holds no memory beyond what its types size | kit/parse's subset check and kit/lower |
| **The CPU tier** | every Kernel means what JavaScript means wherever it does not trap; a budget bounds its time, stack and memory at run time | the same, with the five needs allowed |

So the honest statement of the line is: **Bench is the total, statically sized tier; the CPU tier gives up totality and static sizing and gets run-time budgets in their place.** GPU-ability stays a per-target question under Bench, decided by the LIR. Two of Bench's existing parts already lean over the line, and the draft leaves them where they are: string concatenation is in Bench (`concat` gives `str`: VERIFIED, `kit/ir/verify-rules.js:188-191`), so a Bench string is an opaque value the host builds, and the IR already has a `list` expression and a `push` statement (VERIFIED, `kit/ir/ir.d.ts:127`, `:170`), which lowering uses inside query loops. The CPU tier reuses both.

## 1. Which features enter the CPU tier, and why

**A feature is CPU-only when Bench cannot keep its promise with it:** it makes the work or the memory of a call depend on run-time values rather than on types. Each such feature is one of five needs.

| Need | What the author writes | Why it cannot be Bench | Who asked for it |
|---|---|---|---|
| `loop` | `while (c) …`, `do … while (c)`, and a `for` with any bound or step (`i < n` for a local `n`, `i--`, `i += 2`) | no bound a lowering can check (S101, L007 today) | every heavy algorithm: KP's trace-back, PEG's repetition, LM's retries |
| `recursion` | a helper that calls itself, directly or through others | unbounded stack; GLSL has none (R004) | recursive descent (PEG, Markdown's nesting) |
| `heap` | `[]`; `xs.push(v)`, `xs.pop()`; `xs[i] = v`; a list literal or `[...xs]` that the program then changes | memory sized by run-time values; an item store makes a list a mutable object, which Bench's lists, being values, are not (L012 today) | all three; voice allocation; pagination |
| `text` | `s.length`, `s.charCodeAt(i)`, `s[i]`, `s.slice(a, b)`, `s.indexOf(t, from)`, `s.startsWith(t, pos)`, `String.fromCharCode(c)`, `String(x)`, `parts.join(sep)` | a string's contents need a representation a target can read (L002, L009 today) | parsers, itemizers, Markdown |
| `fnref` | a top-level helper's name used as a value, `lmStep(fit, …)`, and a call through a parameter, `residual(data, p)` | GLSL has no function values; wasm needs a table | LM's residual; any solver over a user's function |

**What enters both tiers**, because it costs Bench nothing:
- **`xs.length` on any list.** A Definition API Dialect refuses it today: `xs.length` is L002 and `for (let i = 0; i < xs.length; i++)` is L007, because only the DMG environment declares the list object's `length` member (VERIFIED: `kit/dialects/dmg/index.js:233`; `node scripts/feasibility/kuwxBq-probe.js`, rerun 2026-11-27, prints `L002 a list has no member 'length'` and the L007). The findings listed this as unconfirmed; it is confirmed, and it is a bug in Bench, not a CPU feature.
- **`??`** (L012 today, "not lowered yet"). `xs[i] ?? 0` is plain JavaScript and allocates nothing.
- **A loop index narrows its read.** Inside `for (let i = 0; i < xs.length; i++)`, where the body neither assigns `i` nor changes `xs`, `xs[i]` is not possibly empty. Today it is (L008), which costs every loop over a list a null check.

**What stays out**, each with what would bring it in:

| Left out | Why | Un-park when |
|---|---|---|
| Closures that capture (S111) | an environment on the heap with a lifetime past the call: the one thing that forces a collector in wasm. `fnref` plus data passed explicitly covers all three algorithms; a PEG grammar is data, not combinators | a sketch needs a callback over local state that explicit data cannot carry |
| `Map`, `Set`, objects as dictionaries | `new` (S102), identity, and insertion-order iteration; lists indexed by number serve all three algorithms (PEG's memo is `rule × (n + 1) + pos`) | Liang hyphenation or Markdown's link references need string keys at scale |
| Mutable struct fields | the list is the only mutable container, so aliasing has one kind and structs stay values; KP links nodes by index | stage 5's instances (below) |
| `class`, `new`, `this`, `throw`, `try` (P004, S102, S103) | a trap is a kit outcome, and an expected failure is a value (PEG returns −1) | never planned |
| Typed arrays | `new`; a `list` of f64 is already an f64 array in wasm | a measured cost in the JS backend |
| `sort`, `map`, `filter` returning lists | `sort` needs `fnref` and a stated stability; `map` is the draw-list draft's open question 1, which ruled no `map` for builders | open question 5 |
| Locale and Unicode-table string methods (`toLowerCase`, `localeCompare`, `normalize`) | each engine carries its own Unicode version, which breaks replay across browsers | a sketch needs case folding; then ship the table as data |
| `Math.random`, `Date`, the host's text measuring | never: a run is a pure function of its log | never |

## The tier's values

- **Lists are references, as in JavaScript.** `const b = a; b.push(1)` changes what `a` reads. A list still has no identity: `===` on lists stays L003 in both tiers. That is what lets a backend copy a list across a boundary without anyone noticing.
- **A list is growable or fixed, and mutable or read-only, and both are inferred.** `[]` is always growable. A list literal, or `[...xs]`, keeps Bench's type (`{ list, max, len }`) unless the program changes the list it makes: a `push`, `pop` or item store on its local, or passing it to a parameter that is changed. Then it is growable (`{ list, mut: true }`, no `max`). Whether a parameter is changed is known from the callee's body, so it settles in the whole-program fixpoint lowering already runs. A list a function is handed by its slot or the host is read-only: changing one is the proposed **L020**, with the tip "copy it first: `[...xs]`". Joins follow from that: a parameter passed a growable list at one site and a list of max 8 at another is growable; passed a mutable list and a read-only one, it is read-only. Every Bench list is read-only, so a CPU function may pass its own lists to a Bench helper.
- **An empty list takes its item type from its first `push` in source order**; a read before any push is L003 with that tip.
- **Capacity lives at boundaries, not on locals.** JavaScript has no syntax for it, and JSDoc types would be a second type language. A Dialect's declared types (state, ports, slot params and results) keep their `max`, and a growable list crossing into one is checked there: statically when lowering can prove it, else when the result is copied out, where a list longer than its declared max is a trap that names the boundary and the max (kit/run's `checkState` already refuses it as N002 for state).
- **Item stores and reads.** `xs[i] = v` with `i` outside `0 … xs.length − 1` traps; JavaScript would grow the array with holes, and the kit is stricter than JavaScript where its targets need it, as the interpreter already is for stores and loops (VERIFIED, [kit/interp](../kit/interp/README.md) "Semantics"). A read `xs[i]` stays possibly empty in both tiers, so one rule holds everywhere; `?? 0` and the loop narrowing above take the edge off. Whether the CPU tier should also have a read that traps is open question 2: the three sketches make 33 calls to `at` (a read `?? 0`) and 6 other `??` reads between them, which is the dogfood's question to answer.
- **Strings** are immutable sequences of UTF-16 code units in every backend, as JavaScript's are: `length` and `charCodeAt` count code units, `charCodeAt` past the end is NaN (so `c >= lo` is false, as the PEG sketch relies on), and `s[i]` past the end is empty.
- **Function values** are top-level helpers only, typed `{ fn: { params, returns, effects, needs } }`. A call through one records the type's effects and needs. Two helpers join as one parameter's type when their parameter and result types are equal; their effects and needs are unioned.
- **Structs** are values, as in Bench: built by literals, read by fields, returned whole.

## 2. How a function's tier is decided

**Inferred for every function, declared only by the slot.**

- **Lowering records needs**, not refusals, for the five features: `{ need, span, via? }` on the Kernel, the first occurrence of each. kit/parse's `checkSubset` takes the tier profile, so S101 becomes a recorded `loop` need instead of an error, and kit/lower does the same for L007's recursion and loop-bound cases, L012's item store and empty literal, and L002 and L009 on strings.
- **Needs sum through calls** as effects do: a helper's needs include its callees', a call through a `fnref` adds the type's needs, and a parameter or result type that holds a growable list or a function type adds `heap` or `fnref`. Recursion marks every function in the cycle. The fixpoint is the one `lowerProgram` already runs for signatures and effects.
- **A slot declares what it accepts**: `slots: { <slot>: { …, tier: "cpu" } }`, default Bench, so every Dialect today is unchanged. `defineDialect` refuses `tier: "cpu"` on a slot whose lambdas go to a target that cannot take it (GLSL), with a D code.
- **A Bench slot whose lambda has a need keeps today's code**, with a message that names the tier: `while` in a Bench slot is still S101 ("`while` makes this lambda CPU-only; this slot runs Bench"). A Bench slot that reaches a CPU-only function through a call is the proposed **L019**, which names the chain and the first need: "`score` calls `rank`, which is CPU-only: `rank` calls itself (line 4)".
- **Library entries and helpers have no tier of their own**; the generated docs and `printKernel` show each one's needs.

Rejected: a pragma per function (`// @cpu`), which is a second language in comments that the parser would have to read; and a folder per tier (`lib/cpu/`), which cannot express a helper both tiers call. Inference matches how the kit already treats types and effects, and the slot is where the requirement truly lives, as `may` is for effects.

**A known cost of inference.** A helper has one signature (L014), so a list helper called by a CPU function with a growable list and by a Bench slot with a list of max 8 joins to growable and becomes CPU-only, and the Bench slot then gets L019. The fix is generics by specialization, lowering a helper once per distinct call signature, which is already in the backlog ("growing Bench", item b). It becomes necessary in stage 4, when packages share helpers across tiers.

## 3. How the tiers call each other

- **CPU calls Bench**: an ordinary call. A Bench function is a CPU function with no needs, and the same IR emits to the same module.
- **Bench never calls CPU**: this is not a separate rule. A caller's needs include its callees', so the call makes the caller CPU-only, and its slot then decides (L019).
- **A CPU function takes a Bench Kernel as a value** through `fnref` (LM's residual can be a ray trace written in Bench). The callee stays Bench and still emits to GLSL where its own slot asks for it.
- **CPU code never dispatches GPU work.** Running a shader from a step is the host's job, through the GPU pipeline in the backlog, not a call in the language.

## 4. Memory in wasm

**One bump arena per call into the tier. No collector, no reference counts, no copy on assignment.**

- An **entry call** is one call from the host into CPU-tier code: a runtime calling a CPU slot, a package function, or a CPU-tier step. At entry, the host copies the arguments into linear memory (lists as a length, a capacity and the items; strings as a length and code units; structs field by field). The call allocates by bumping a pointer and frees nothing. At exit, the result is copied out to plain JavaScript values, and the pointer resets.
- **A growable list past its capacity** moves to a block twice the size; the old block is garbage until the call ends, so garbage is bounded by about the live size.
- **Why this fits the kit.** kit/run already treats a step as a pure function from a frozen state to a new one, checked and hashed between steps. An arena per entry call is the same boundary, and copying the result out costs the same order as the state hash and check that already run per step. Lists have no identity, so a copy is unobservable; host values are frozen, so nothing aliases across calls.
- **Rejected:**
  - *Reference counting:* every store and copy pays for counts, and the emitter grows, with no benefit when calls are short.
  - *Value semantics (copy on assignment):* it changes what JavaScript means. `const b = a; b.push(1)` would leave `a` unchanged in the kit and changed in emitted JS.
  - *WasmGC:* the engine's collector would manage memory, but (1) a GC heap has no deterministic memory budget, since OOM depends on the engine; (2) WasmGC arrays are opaque to JavaScript, so results are copied out anyway; (3) support needs a probe in an artifact. WasmGC shipped in Chrome 119 and Firefox 120, and in Safari 18.2 as I recall; none of that was checked here. The arena works on wasm MVP everywhere.
- **The arena's weak spot** is a long loop that allocates fresh lists every pass. LM allocates its Jacobian once per step and copies the normal matrix once per retry, so a 1,000 × 20 fit allocates about 41,000 cells per step (the 20,000-cell Jacobian and 21 residual lists of 1,000) and about 2,000 per retry, which a budget easily holds. Code that allocates in an inner loop hits the cell budget and traps with the span. The fix is a later pass, region inference that frees what a loop pass makes when it cannot escape, and it changes no meaning.

## 5. Budgets, traps, determinism and replay

A CPU-tier call is as pure as a Bench Kernel: no clock, no `Math.random` (the Dialect's rng handle as today), no host measuring, no module-level state (top-level constants are baked and read-only, L013). What Bench guaranteed statically, the CPU tier guarantees by budgets that every backend counts identically:

| Budget | One unit is | Default (to measure) |
|---|---|---|
| steps | one loop pass entered (`for`, `each`, `while`, `do`) or one call of a Program function (helper, method, `fnref`); intrinsics are free | 10⁷, the interpreter's `maxSteps` today |
| depth | one level of Program-function call nesting | 500 (see below) |
| cells | one list item slot created (a literal's item, a `push`, an item of a copy) or one string code unit created | 10⁷ |

- **The units are the language's, not a machine's.** wasm bytes and JS engine allocations differ; cells do not. So the interpreter, emitted JS and wasm trap at the same step with the same span, and the differential check compares the outcome (a value, or a trap with its kind and span) and the step count, as Manuel's evaluator compares results and written memory (`agrees`).
- **Traps are values of the run.** A trap (`steps`, `depth`, `cells`, `index`, `capacity`) stops the part, as a throw does, with the proposed **N013**: "the step trapped: the cell budget ran out at kp.js line 31". A replay traps at the same instant. kit/run's other contracts are unchanged.
- **Who sets a budget:** the Dialect, per slot and per package function, so it is part of the content key and never of the machine. A host may lower a budget for a test, never raise it silently.
- **Depth needs a measurement before it is fixed.** The interpreter recurses in JavaScript several frames per kernel call, so its real limit is below the engines' stack. The first stage measures the interpreter's JS stack per kernel call in V8, JavaScriptCore and SpiderMonkey, and sets the ceiling at half the smallest; 500 is a placeholder. kit/interp's `maxDepth` default today is 200.
- **Floating point** is the Bench rule unchanged. Arithmetic and `Math.sqrt` are exact IEEE everywhere. A Dialect's intrinsics run their `ref` in the interpreter and their JS spelling in emitted code; wasm imports the JS spelling, so wasm equals JS bit for bit within one engine. Across engines, only math written in the subset (a Library `sin`) is exact, as the findings say for the synth.
- **Number to string** (`String(x)`) is specified exactly by ECMAScript, so wasm imports the host's and loses nothing.
- **The development run's double step** exists because runtime JS is trusted and may hide state. A step written in the CPU tier (stage 5) cannot, so it runs once.

## 6. How it reaches a run

Today a trusted runtime calls the Program's compiled lambdas by slot (`ctx.kernels.<slot>(…)`). Three routes, in the order to build them:

1. **CPU-tier slots** (stage 1). A Dialect declares `tier: "cpu"` on a slot, and a Program's lambda in it is lowered by the tier's rules and reached as `ctx.kernels.<slot>`, exactly as now. Nothing in kit/run changes. This suits work that is the Program's own: a lens Program's merit function, a playground Program's semantic action, a custom hyphenation rule.
2. **Package functions** (stage 4). The package ships its algorithms as CPU-tier files (`lib/*.js`, which is the backlog's "Library entries as real files"), and names each one a runtime calls with a declared signature, as intrinsics declare theirs: `library: { <fn>: { file: "lib/<file>.js", params: [<types>], returns: <type> } }`. They are lowered once per package build (so a package's content key covers them), callable from Program lambdas as Library calls and from the runtime as `ctx.lib.<fn>(…)`. This is where Knuth–Plass, the PEG interpreter and LM go, and where the heavy algorithms leave trusted JS.
3. **Runtimes in the CPU tier** (stage 5). `init` and `step` written in the subset and lowered against a typed `ctx` (T and dt as numbers, the record typed from the built record, `kernels` by slot, `inputs`, `events` with `push` per port, `rng`), returning the Dialect's state. It needs struct spread (`{ ...state, <field>: <v> }`, S109 today), and one piece of real design: **how a step hands a writable instance to a Kernel.** Today a runtime builds a plain object and a Kernel's stores write its places. The bounce runtime in the seams trial, for one, builds a mutable ball, calls `kernels.drift?.(b, dt)` and `kernels.rebound?.(b)`, reads Program-declared fields by name (`b[n]`), and maps over balls with a closure that writes an outer `let` (VERIFIED, `scripts/seams-trial/fixtures/valid-3/bounce/bounce.runtime.js:22-38`). Loops can replace the closure; the instance and the per-Program field names cannot be done in the subset as drafted. So stage 5 is L, not M.

**Long jobs slice through state, not the language.** A call into the tier is atomic and bounded by its budget. A job longer than a frame (an optimizer, a book's pagination) runs as steps of a part that carry its progress in state: the LM sketch below is one damped step, with the solver's state carried from step to step. That gives cancellation (stop the part), progress (the state), rewind and replay for free, which a resumable language would not.

## 7. What retires and what stays

**Retires, each when its stage lands:**
- The interim ruling that heavy algorithms live in package runtime JS (Ruling 2's last sentence, gap 2): at stage 4.
- The "host-side text engine" backlog entry's parser as host code: it becomes a package function in the CPU tier (stages 2 and 4). The entry's editor stage and wasm encoder stay as they are.
- The development run's double step, for runtimes written in the CPU tier: at stage 5.
- **Trusted runtime JS for `init` and `step`**, recommended once stage 5 has ported this repo's runtimes and a dogfood shows fresh agents writing one without friction. Two ways to write a runtime is more surface than one, and the Lean backlog entry already asks that a Dialect's run semantics be writable in the subset. Until then it stays. This is open question 3.

**Stays:**
- Bench, its codes, and its guarantees, as the default tier of every slot. S101, L007 and L012 keep their codes in Bench slots; only their messages gain the tier.
- kit/run's contract: pure steps, checked state, hashes, replay.
- Trusted JS where the subset cannot reach and should not: custom-element stages, the page host, the kit's own runners (an audio worklet runner, a GPU dispatcher, a file save), Build-time JS (Grammar checks, `environment`), and intrinsics' `ref`s.
- The backlog's "fixed-size mutable local arrays" for Bench: the CPU tier covers the CPU's need, but a GPU Kernel's local array is a separate feature (GLSL has them).

## The IR, the interpreter and the JS backend

**One IR with two verifier profiles, not two IRs.** The ruling speaks of "a CPU IR with a heap"; this draft makes it the core IR's superset, not a second set of types. Why: kit/interp, kit/emit/js, kit/query's walk, the printer and the JSON form all keep working on the nodes they know; a CPU function calling a Bench helper is one program in one IR; and two IR type files would drift across the seam where they meet (the "one struct across a seam" principle).

| Change | Where | Bench |
|---|---|---|
| `needs: { need, span, via? }[]` on a Kernel | `kit/ir/ir.d.ts` | always `[]`, checked by `verify` |
| list type gains `mut?: true`, and `max` may be absent when `mut` is set | `ir.d.ts`, `types.js` (join) | V003 unchanged for Bench |
| `while` statement (`do…while` lowers to it with a first-pass flag) | `STMT` in `verify.js`, `walk.js` | V009 |
| `setItem` statement (`xs[i] = v`) and `pop` expression | `verify.js` | refused |
| `fnref` expression and `callref` expression; `{ fn }` type | `verify.js`, `verify-rules.js` | refused |
| string operations as core calls with fixed signatures (`str.length`, `str.charCodeAt`, …) | a core table beside `OPS` | refused |
| `verify(kernel, { tier: "cpu" })` | `verify.js` | the default profile is today's |

kit/interp adds about five node kinds and the cell count (its steps and depth budgets exist). kit/emit/js adds the same nodes, a small prelude (`$trap`, a step counter decremented at each loop head and function entry, a depth counter, the item store's bounds check), and reset of the counters at each entry call. The GLSL LIR and emitter do not change: they never see a Kernel with needs.

**wasm needs its own lower stage.** [kit/lir's README](../kit/lir/README.md) says a later wasm backend "takes the same LIR," but that LIR has no f64 (R001) and no lists or strings (R002), while DMG Kernels and every CPU-tier function are f64 and use lists. So wasm takes a second LIR stage, the **memory LIR**: f64, i32, pointers, explicit allocation, bounds and budget checks, and copies at entry and exit. That premise in the LIR README should be corrected when the wasm stage is planned.

## Three algorithms in the CPU tier

Each is written as a package would write it: top-level arrows, read by the kit from source, called from a CPU-tier slot or a runtime. The data they take is the Dialect's (a font's advance table, a grammar the Grammar built, a fit's points). Each ran as plain JavaScript in the scratch probe; the needs tables are what lowering would record.

### Knuth–Plass line breaking (Book)

```js
const INF = 10000;

// Splits text at spaces into boxes and glues, each code unit measured by the font's advance table.
const itemize = (text, advance, space) => {
  const items = [];
  let w = 0;
  for (let i = 0; i <= text.length; i++) {
    const c = text.charCodeAt(i);                       // NaN past the end
    if (c === 32 || i === text.length) {
      if (w > 0) items.push({ kind: "box", width: w, stretch: 0, shrink: 0, penalty: 0 });
      if (c === 32) items.push({ kind: "glue", width: space, stretch: space / 2, shrink: space / 3, penalty: 0 });
      w = 0;
    } else {
      w += advance[c] ?? 0;
    }
  }
  items.push({ kind: "glue", width: 0, stretch: INF, shrink: 0, penalty: 0 });       // the last line's fill
  items.push({ kind: "penalty", width: 0, stretch: 0, shrink: 0, penalty: -INF });   // the paragraph's end
  return items;
};

const at = (xs, i) => xs[i] ?? 0;

const isBreak = (items, b) => {
  const it = items[b];
  if (it == null) return false;
  if (it.kind === "penalty") return it.penalty < INF;
  const before = items[b - 1];
  return it.kind === "glue" && before != null && before.kind === "box";
};

const demerits = (r, pen) => {
  const d = (1 + 100 * Math.abs(r) ** 3) ** 2;
  if (pen >= 0) return d + pen ** 2;
  if (pen > -INF) return d - pen ** 2;
  return d;
};

// The item index of each break, by least total demerits; [] when no set of breaks fits.
const breakLines = (items, width, tolerance) => {
  const sw = [];                                        // sw[i]: the width of items[0..i), and so on
  const sy = [];
  const sz = [];
  let w = 0;
  let y = 0;
  let z = 0;
  for (let i = 0; i < items.length; i++) {
    sw.push(w);
    sy.push(y);
    sz.push(z);
    const it = items[i];                                 // narrowed by the loop's test
    if (it.kind !== "penalty") w += it.width;
    if (it.kind === "glue") {
      y += it.stretch;
      z += it.shrink;
    }
  }
  sw.push(w);
  sy.push(y);
  sz.push(z);

  const nodes = [{ pos: 0, demerits: 0, prev: -1 }];    // pos: where the next line starts; prev: an index
  let active = [0];
  for (let b = 0; b < items.length; b++) {
    if (!isBreak(items, b)) continue;
    const it = items[b];
    const pen = it.kind === "penalty" ? it.penalty : 0;
    const tail = it.kind === "penalty" ? it.width : 0;
    const keep = [];
    let best = -1;
    let bestD = 0;
    for (const k of active) {
      const n = nodes[k];
      if (n == null) continue;
      const room = width - (at(sw, b) - at(sw, n.pos) + tail);
      const give = room >= 0 ? at(sy, b) - at(sy, n.pos) : at(sz, b) - at(sz, n.pos);
      const r = give > 0 ? room / give : room === 0 ? 0 : room > 0 ? INF : -INF;
      if (r < -1) continue;                              // too full from here on: drop the node
      if (pen > -INF) keep.push(k);                      // a forced break ends every line before it
      if (r <= tolerance) {
        const d = n.demerits + demerits(r, pen);
        if (best === -1 || d < bestD) {
          best = k;
          bestD = d;
        }
      }
    }
    if (best !== -1) {
      keep.push(nodes.length);
      nodes.push({ pos: b + 1, demerits: bestD, prev: best });
    }
    active = keep;
    if (active.length === 0) return [];
  }

  let last = -1;
  let lastD = 0;
  for (let k = 0; k < nodes.length; k++) {
    const n = nodes[k];                                  // narrowed: nodes does not change in this loop
    if (n.pos === items.length && (last === -1 || n.demerits < lastD)) {
      last = k;
      lastD = n.demerits;
    }
  }
  const out = [];
  let k = last;
  while (k > 0) {                                        // node 0 is the paragraph's start
    const n = nodes[k];
    if (n == null) break;
    out.push(n.pos - 1);
    k = n.prev;
  }
  for (let i = 0; i < Math.floor(out.length / 2); i++) {   // reverse in place
    const j = out.length - 1 - i;
    const t = at(out, i);
    out[i] = at(out, j);
    out[j] = t;
  }
  return out;
};
```

| Need | Where |
|---|---|
| `heap` | `[]` and `push` for the items, sums, nodes and active list; the node list literal, then pushed; the reverse's item stores |
| `loop` | the `while` trace-back; `for` bounds `text.length`, `items.length`, `Math.floor(…)` |
| `text` | `itemize`'s `text.length` and `charCodeAt` (the breaker itself needs none) |
| both tiers | `xs.length`; `??`; the loop narrowing of `items[i]` and `nodes[k]` |

Font metrics arrive as data (the advance table), never measured by the host, as the findings require. `breakLines` is a pure function of the items and the width, so pagination calls it from a demand part's step.

### A packrat PEG parser (language playground)

The grammar is data the Grammar's build-time code makes from a Program's rules: a table of expressions, each a struct of one shape, and a rule as an index into it. The parser is a recognizer that reports the farthest point any expression failed, which the findings name as the error position; a tree is the same code pushing `{ rule, start, end }` records.

```js
// g: { start, rules: [<expression index of each rule>],
//      exprs: [{ op: "lit" | "range" | "seq" | "alt" | "star" | "not" | "ref", text, lo, hi, items, rule }] }
const UNTRIED = -2;

const fail = (far, pos) => {
  if (pos > (far[0] ?? 0)) far[0] = pos;                 // far is the caller's list, changed in place
  return -1;
};

// Where a match of expression e at pos ends, or -1.
const match = (g, src, e, pos, memo, far) => {
  const x = g.exprs[e];
  if (x == null) return -1;
  if (x.op === "lit") return src.startsWith(x.text, pos) ? pos + x.text.length : fail(far, pos);
  if (x.op === "range") {
    const c = src.charCodeAt(pos);                       // NaN past the end, which no range holds
    return c >= x.lo && c <= x.hi ? pos + 1 : fail(far, pos);
  }
  if (x.op === "seq") {
    let p = pos;
    for (const k of x.items) {
      p = match(g, src, k, p, memo, far);
      if (p < 0) return -1;
    }
    return p;
  }
  if (x.op === "alt") {
    for (const k of x.items) {
      const p = match(g, src, k, pos, memo, far);
      if (p >= 0) return p;
    }
    return -1;
  }
  const first = x.items[0] ?? -1;
  if (x.op === "star") {
    let p = pos;
    let next = match(g, src, first, p, memo, far);
    while (next > p) {                                   // stop at a failure or an empty match
      p = next;
      next = match(g, src, first, p, memo, far);
    }
    return p;
  }
  if (x.op === "not") return match(g, src, first, pos, memo, far) < 0 ? pos : -1;
  const slot = x.rule * (src.length + 1) + pos;          // "ref": a rule, memoized by (rule, pos)
  const seen = memo[slot] ?? UNTRIED;
  if (seen !== UNTRIED) return seen;
  const end = match(g, src, g.rules[x.rule] ?? -1, pos, memo, far);
  memo[slot] = end;
  return end;
};

const parse = (g, src) => {
  const memo = [];
  const size = g.rules.length * (src.length + 1);
  for (let i = 0; i < size; i++) memo.push(UNTRIED);
  const far = [0];
  const end = match(g, src, g.start, 0, memo, far);
  return { ok: end === src.length, end, farthest: far[0] ?? 0 };
};
```

| Need | Where |
|---|---|
| `recursion` | `match` calls itself for every sub-expression and rule |
| `loop` | the `while` of `star`; the memo's `for` to a computed `size` |
| `heap` | the memo, filled by `push` and written by item store; `far`, a literal changed by a callee, which makes it growable by the inference rule above |
| `text` | `startsWith`, `charCodeAt`, `length` |
| both tiers | `??`; `for…of` over a list in a struct |

It also tests **reference semantics**: `memo` and `far` are changed by callees and read by the caller, which value semantics would break. The n-ary `seq` and `alt` keep the recursion depth at about the input's nesting times the rules per level, which is why the depth budget wants measuring. Left recursion is a PEG's own limit, reported by the Grammar's check, not by the tier.

### Levenberg–Marquardt (Lens bench)

One damped least-squares step with a forward-difference Jacobian and up to `tries` values of λ, so a part runs one step per instant and carries `{ p, lambda, cost, iter, done }` in its state. The residual is a top-level helper passed by name; it can be a Bench Kernel (a ray trace through the lens).

```js
const zeros = (n) => {
  const xs = [];
  for (let i = 0; i < n; i++) xs.push(0);
  return xs;
};

const sumSq = (r) => {
  let s = 0;
  for (const x of r) s += x * x;
  return s;
};

// Solves a x = v for a symmetric positive definite n × n matrix a (row-major), by Cholesky.
const solve = (a, v, n) => {
  const L = zeros(n * n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let s = at(a, i * n + j);
      for (let k = 0; k < j; k++) s -= at(L, i * n + k) * at(L, j * n + k);
      L[i * n + j] = i === j ? Math.sqrt(s) : s / at(L, j * n + j);
    }
  }
  const x = zeros(n);
  for (let i = 0; i < n; i++) {                          // L y = v, with y kept in x
    let s = at(v, i);
    for (let k = 0; k < i; k++) s -= at(L, i * n + k) * at(x, k);
    x[i] = s / at(L, i * n + i);
  }
  for (let i = n - 1; i >= 0; i--) {                     // Lᵀ x = y
    let s = at(x, i);
    for (let k = i + 1; k < n; k++) s -= at(L, k * n + i) * at(x, k);
    x[i] = s / at(L, i * n + i);
  }
  return x;
};

const lmStep = (residual, data, s, tries, eps) => {
  const p = s.p;
  const r = residual(data, p);
  const m = r.length;
  const n = p.length;
  const J = zeros(m * n);                                // m × n, row-major
  for (let j = 0; j < n; j++) {
    const q = [...p];
    const h = 1e-6 * Math.max(1, Math.abs(at(p, j)));
    q[j] = at(p, j) + h;
    const rq = residual(data, q);
    for (let i = 0; i < m; i++) J[i * n + j] = (at(rq, i) - at(r, i)) / h;
  }
  const A = zeros(n * n);                                // Jᵀ J
  const g = zeros(n);                                    // Jᵀ r
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) {
      g[j] = at(g, j) + at(J, i * n + j) * at(r, i);
      for (let k = 0; k < n; k++) A[j * n + k] = at(A, j * n + k) + at(J, i * n + j) * at(J, i * n + k);
    }
  }
  let lambda = s.lambda;
  let t = 0;
  while (t < tries) {
    const D = [...A];
    for (let j = 0; j < n; j++) D[j * n + j] = at(A, j * n + j) * (1 + lambda);
    const delta = solve(D, g, n);
    const q = zeros(n);
    for (let j = 0; j < n; j++) q[j] = at(p, j) - at(delta, j);
    const c = sumSq(residual(data, q));
    if (c < s.cost) {
      return { p: q, lambda: lambda / 10, cost: c, iter: s.iter + 1, done: s.cost - c <= eps * s.cost };
    }
    lambda = lambda * 10;
    t += 1;
  }
  return { p, lambda, cost: s.cost, iter: s.iter + 1, done: true };
};
```

(`at` is the one Knuth–Plass defines. On the probe's 20 points of y = 2e^{0.5x}, starting from (1, 0.1), it reaches (2, 0.5) in 10 steps.)

| Need | Where |
|---|---|
| `fnref` | `residual`, a parameter called as a function, and the top-level helper passed for it |
| `heap` | `zeros`, `[...p]` and `[...A]` then item stores; every matrix |
| `loop` | the retry `while`; `for` bounds `n`, `m`, `n * n`, `j <= i`; the count-down `i--` |
| both tiers | `??` in `at`; struct results whose `p` joins a read-only list (from the state) and a growable one (to the state's declared max at copy-out) |

`data` takes one type per Program, since `lmStep` has one signature; a package that fits two kinds of data needs specialization (stage 4).

### The three, side by side

| Feature | KP | PEG | LM |
|---|---|---|---|
| `loop`: `while` | ✓ | ✓ | ✓ |
| `loop`: a computed or downward `for` | ✓ | ✓ | ✓ |
| `recursion` | | ✓ | |
| `heap`: `[]` and `push` | ✓ | ✓ | ✓ |
| `heap`: item store | ✓ | ✓ | ✓ |
| `heap`: a list changed by a callee | | ✓ | |
| `text` | ✓ (itemizer) | ✓ | |
| `fnref` | | | ✓ |
| both tiers: `.length`, `??`, loop narrowing | ✓ | ✓ | ✓ |

None needs closures, maps, mutable struct fields, exceptions or `pop`. `pop` stays in the list because a Markdown parser's stack of open blocks needs it, and voice allocation is a stack or a queue.

## Ideas taken from Manuel's Typed (no code)

- **Checked addresses that trap** (`caddr` traps unless the index is below the length): the item store's trap, and a trap as a defined outcome rather than a crash.
- **The evaluator defines meaning, with a step limit and a depth limit** (2 × 10⁵ statements, depth 64), and **agreement compares results and written memory**: our interpreter as the oracle, with budgets counted in the language's units, and the differential check comparing outcome and step count.
- **Frame arrays in a fixed area** (`aaddr`, `zero`): the later pass that puts a list that cannot escape its call on a stack instead of the arena.
- **Multi-value returns as tuples**: we return structs, which the IR already has.

Not taken: Typed's raw memory (`load`, `store` on addresses). It suits a device with no host, but it would lose the IR's types at the boundary, and with them the interpreter-against-emit comparison node by node. The CPU tier keeps lists typed and lets the wasm stage choose the layout.

## What it costs, staged

Sizes follow the findings' S/M/L. Line counts are estimates, against today's sizes (kit/lower about 3,400 lines, kit/interp 630, kit/emit/js 450, kit/ir 1,500: `wc -l kit/<module>/*.js`).

| Stage | What | Reuses | New, roughly | Size |
|---|---|---|---|---|
| 0 | **Bench fixes both tiers need:** `xs.length` on every list in every Dialect; `??`; the loop narrowing; `needs: []` on every Kernel with the verifier's check | everything; no new node kinds | lower 150, verify 40, tests 200 | S |
| 1 | **The tier's core**, with Knuth–Plass as its test: the five-need model; slot `tier`; `while`, any `for`, recursion; growable and read-only lists, the inference rule, L019 and L020; budgets and traps in the interpreter and emitted JS; the depth measurement; differential tests (outcome and step count) | the parser unchanged (it already parses `while`: S101 is a check); `checkSubset`'s rule list; lowering's statement and expression code, the signature fixpoint, effect summing; interp's `maxSteps` and `maxDepth`; emit/js's statement emitter and preludes | lower 450, ir 200, interp 120, emit/js 180, tests 700 | M |
| — | **Dogfood** (the local ruling): two blind legs, Sonnet and Haiku, each write KP's breaker and one of the two others from a draft of the tier's doc page, against a checker. Review by hand; change the design; then freeze. Settles open question 2 | the trial harness pattern of scripts/define-trial | | S |
| 2 | **Text**, with the PEG parser as its test | stage 1's needs; intrinsic-style signatures | 250 with tests | S–M |
| 3 | **Function references**, with LM as its test | the call-site join; effect summing | 300 with tests | M |
| 4 | **Package functions**: Library as `lib/*.js` files, declared entry signatures, `ctx.lib`, per-package lowering under the package's content key; generics by specialization | kit/define's Library path; kit/package's loader and key | 500 with tests | M |
| 5 | **Runtimes in the CPU tier**: typed `ctx`, struct spread, writable instances for Kernels (design first), per-Program fields; no double step; port this repo's runtimes; then rule on retiring trusted runtime JS | kit/run unchanged but for the double step | 800 with tests, plus the ports | L |
| 6 | **wasm** (M6 on the roadmap): the memory LIR, the arena, copies at entry and exit, budget and trap checks, intrinsic and number-format imports, the binary encoder (300–500 lines by the findings' estimate), differential tests against the interpreter | the IR; the existing LIR is untouched | 1,500–2,000 | L |

> **Stage 0 built 2026-11-27 (leaf `o2RhFb`).** A list's `length` is built into kit/lower's list typing (`LIST_LENGTH` in `kit/lower/expr.js`), so DMG's own declaration and the three workarounds in `kit/define` (ports, UI, Draw builders) retired, and `node scripts/feasibility/kuwxBq-probe.js` no longer prints L002 or L007 for `listRead`. `??` is `present` and `cond` over a temporary, no new node. The loop narrowing is worked out by the IR verifier from the enclosing `for` (`countsTo` in `kit/ir/verify-rules.js`), with no flag on the `index` node, and it reaches only a local list read by the counter itself. `Kernel.needs` is `[]` everywhere, V001 when absent and V013 (new) when non-empty; `printKernel` lists needs only when there are some. A refinement must not break a program that lowered before (the coordinator's ruling, same day): a checked read (`!= null`, `== null`, `??`) or a `const` binding of one keeps its possibly-empty type, and the const is narrowed present. In an f32 Dialect a list's `length` takes the Dialect's number type (the verifier accepts an f32 length for a max up to 2^24), and a list index may be an f32; both were L003 before.

> **Corrected 2026-11-27 (leaves `uyQknP`, `v4Ya0z`, `nQY0cL`; review of ce1e7b4).** Three claims in the note above were wrong. The member is built by `listLength` in `kit/lower/expr.js`; there is no `LIST_LENGTH`. An f32 length was not L003 before: an ordinary Program's `xs.length` was L002 in every Definition API Dialect, and the UI, port and Draw lowerings, which patched the member in, typed it f64; so typing it as the Dialect's number type made an f32 Dialect's UI lambda reading an open state list's length (max `OPEN_MAX`) a Kernel the verifier refuses (V002), and accepted an f32 counter against a length past 2^24. A length is now the Dialect's number type when that type holds the list's max exactly, else f64 (`holdsLength` in `kit/ir/types.js`, the verifier's own rule), and a length bounds a loop only when its max is within the counter's exact range (L007 past it); the f32 index claim stands. And the ruling that a refinement must not break a program that lowered before was not met: a `const` copy of a checked read (`if (m != null) { const k = m; … k.ttl }`) was L008. That copy lowers again; one form stays an exception, a read inside an array literal a pattern takes apart (`const [a] = [ms[i]]; if (a != null)`, L003), documented in kit/lower's README.

Stages 0–3 are about one agent each and reuse the existing lowering, interpreter and JS backend almost entirely: each adds node kinds and rules, not a new pipeline. Stage 4 is the first that changes the package format, and the first that takes heavy algorithms out of runtime JS. Stage 6 is the only new backend. The findings' gap 2 plumbing (data files that reach a runtime, `kit/run/part.js:128`) is needed before any package function can read a font or a glass catalog, and belongs before stage 4.

## Open questions for Ben

1. **The name.** The glossary has Bench as the Runtime Subset. Should Bench name only the strict tier, with the CPU tier as its own term, or should the language stay "Bench" with tiers named `bench` and `cpu`? This draft uses the second in code (`tier: "cpu"`) and leaves the glossary to you.
2. **A read that traps.** One rule now: `xs[i]` is possibly empty in both tiers, softened by `??` and the loop narrowing. The sketches make 39 such reads between them (33 through `at`, 6 more `??`). A CPU-tier read that traps out of range would read better but gives one syntax two typings. Decide after the dogfood?
3. **Retire trusted runtime JS** at stage 5 (one way to write a runtime, checked), or keep it as an escape hatch for runtimes the subset cannot express?
4. **Closures that capture** stay out (they force a collector in wasm). Confirm, or name a sketch that needs one.
5. **`map` and `filter` that return lists** in the CPU tier, with an expression-body callback inlined as a query is today. The draw-list draft's question 1 ruled `map` out of builders; does that ruling extend to the CPU tier?
6. **Mutable struct fields**, or writable instances only for the Kernels a CPU-tier step calls (stage 5's open design)?
7. **A bytes type** for exporters (TTF, PNG, zip): the findings put them in runtime JS with `Uint8Array`. A list of numbers works in the tier but is slow; a `bytes` value would be a sixth need. Wanted now, or when Grotesk is scheduled?
8. **wasm's place.** The backend direction suggested moving wasm up once Composition lands; the CPU tier is a second reason (heavy algorithms are where wasm pays). Keep it at M6 after stage 5, or after stage 4?

## Premises this draft corrects

- **"Bench stays the GPU-able check"** (the ruling, and this leaf's brief): Bench admits f64, strings, lists and structs, which the LIR refuses for GLSL (R001, R002). Bench is the total, statically sized check; GPU-ability is the LIR's, per target.
- **"`xs.length` is L002 … unconfirmed"** (the findings' doc errors): confirmed. Only the DMG environment declares a list's `length` (`kit/dialects/dmg/index.js:233`), so in every Definition API Dialect `xs.length` is L002 and a loop to it is L007, though kit/lower's README lists a list's length as a loop bound. Stage 0 fixes it.
- **"A later wasm backend takes the same LIR"** (kit/lir's README): that LIR has no f64, lists or strings, so wasm needs its own lower stage.
- **Bench has no heap** (the leaf's framing): true of lists, not of strings, which Bench already concatenates as opaque host values.

## Rulings (Ben, 2026-11-27)

Ben accepted the integrator's recommendation on each open question: (1) the language stays Bench, with tiers `bench` and `cpu`; (2) a read that traps is decided after the tier's dogfood; (3) retiring trusted runtime JS is decided at stage 5, on evidence; (4) closures that capture stay out; (5) `map` and `filter` stay out, loops cover them; (6) mutable structs or writable instances are decided at stage 5; (7) a `bytes` type comes when Grotesk is scheduled; (8) wasm comes after stage 4. **Stage 0 is scheduled now** (leaf filed 2026-11-27).
