# M1: the game slice

*2026-11-23 · plan · milestone M1 of [the kit proposal](2026-11-23-workbench-kit-proposal.md) §15, under the rulings in [the delivery decisions](2026-11-23-delivery-decisions.md)*

## The question

Can the runtime lambdas of a real fluent DSL be parsed from their source, lowered to a typed IR, and emitted back as JavaScript that behaves exactly like the original? And how much of a real grammar fits inside the runtime subset without awkward rewrites? These are hypotheses **H1** (the subset is comfortable) and **H10** (the IR earns its keep), tested before any kit is extracted around them. If the subset is uncomfortable, we want to learn that now.

## The method: swap the lambdas, compare the traces

The DMG Workbench's DSL core runs headless in Node unchanged. It is lines 509–1553 of [`2026-11-23-dmg-workbench.html`](2026-11-23-dmg-workbench.html), and it ends in `module.exports = DSL`. That makes it the oracle. For each preset:

1. Build it with the DMG DSL, which yields a spec whose runtime lambdas are live closures.
2. For each runtime lambda, take `String(fn)`, parse it with our subset parser, lower it to IR and emit JS. Put the emitted function into the spec in place of the closure. The DMG runtime stays the host: tick order, entities, events, RNG and rendering are unchanged, and only the lambdas differ.
3. Run the original and the swapped spec with the same seed and the same input trace, and compare full per-tick traces.

A lambda that cannot be lowered keeps its original closure and is counted, with its reason. That count is the H1 measurement.

## Scope

- **Presets 04–07**, not 01–05. 01–03 have almost no runtime logic: only `draw` and `hud`, which run at render time and affect nothing in the observable state. Between them, 04–07 cover typed attributes and integer wrap, the RNG, live params, timers, methods, fragments, input, events, pools, spawn and destroy, fixed point, and a param-bounded loop. 01–03 still get lowered, and their `draw`/`hud` output is compared through the framebuffer.
- **Lowering-only survey of all 22 presets:** count lowered and rejected lambdas per preset, with reasons, but run no differential check on them. That extends the H1 estimate beyond the four presets.
- **Out of scope:** GLSL, wasm and C backends (M2, M5), declarative constructs (M3), the editor, skins, the book, and the artifact page. The DMG grammar is not redesigned. It is the fixed test subject.

## Decisions that bind several leaves

- **The kit lives in `kit/`**, self-contained, so it can be split into its own repo later. Oracle and analysis tooling live in `scripts/`.
- **Stack:** plain JavaScript ES modules with JSDoc types, `node:test` and Node 26, with no dependencies. Every kit module must also run in a browser (no Node built-ins in `kit/`), because checks run in the artifact page as the baseline (delivery decisions).
  > **Corrected 2026-11-23:** still plain JavaScript, but type-checked: `tsc --noEmit` under `checkJs` and `strict`, with shared types in `.d.ts` files, and `typescript` as the one dev dependency. So "no dependencies" no longer holds. See [the delivery decisions](2026-11-23-delivery-decisions.md), Stack, which also says why TypeScript source was considered and dropped.
- **No DMG code is copied into the repo.** The oracle loader reads the DSL core out of the HTML at run time. The DMG grammar's dialect description, written in the kit's own terms, is ours to write.
- **The subset starts as the proposal's §5.5** and widens only on evidence. The [read of the DMG file](2026-11-23-dmg-workbench-read.md) already found one widening that 04–06 need: predicate lambdas passed to declared query intrinsics (`w.board.filter((m) => !m.up)`). The parser leaf decides how to admit it; the obvious form is a pure single-parameter lambda, lowered as a kernel over entities.
- **D1 (typed operators) stays open.** M1 needs only scalar arithmetic, but the parser should not foreclose operators on dialect types.
- **Integer semantics follow the oracle.** In the DMG runtime, coercion happens only when a typed attribute is stored through the proxy, and an assignment expression evaluates to the unwrapped value. So `--self.ttl` on a u8 holding 0 yields −1 while 255 is stored. The proposal's §5.8 example wraps before comparing, which is wrong for this runtime. The IR leaf chooses how to represent this, but the emitted code must match the oracle, and the choice gets written down.

## Parser rulings (2026-11-23, with Ben)

These come from the construct survey (`node scripts/subset-survey.js`, which covers 126 runtime lambdas in 21 presets).

- **Parse broadly, then check the subset in a separate pass.** The parser accepts a fairly wide slice of JavaScript. A separate check reports every construct outside the subset at once, each with a code, a line, a one-line tip, and, where the rewrite is mechanical, a machine-applicable edit (a fixit) that an agent can apply directly. The subset is a table of rules, so a dialect narrows it by adding rules. Syntax that nobody uses (`class`, `function`, `switch`, `try`, `async`, regex) stops parsing with a single "unsupported syntax" error.
- **Callbacks are legal only as arguments to queries the dialect declares** (`filter`, `find`, `some`, `every`, `reduce`, `count`). Lowering inlines them as bounded loops, so no closure exists at run time, and a callback may read the enclosing lambda's locals. Twelve lambdas need this, among them every whack-a-mole preset.
- **Destructuring and `for…of` over fixed-size collections are allowed, as shorthand.** Lowering checks that the loop's bound is known.
- **The syntax tree follows ESTree**, with `loc` (line and column relative to the lambda) and `range` (offsets) on every node.
- **Allowed:** `++`/`--` and assignments inside expressions; strings, object and array literals, `a[i]` and `Math.*`. Lowering judges these by type, so `self[axis]` is rejected there, not in the parser.
- **Rejected by the check, with a tip:** `while`/`do`, `new`, `this`, template literals (with a fixit to `+` concatenation), `?.`, `delete`, `void`, `typeof`, `in`, `instanceof`, the comma operator, spread, and `var`.
- **Also rejected by the check** (added after the parser review, 2026-11-23, with Ben): a `for` with no condition (S112, which defeats the loop-bound check), computed object keys (S113, a dynamic property name), and default values, including defaults inside destructuring (S114). Destructuring stays allowed without defaults. No DMG lambda uses any of these; widen on evidence.
- **A fixit never changes meaning.** Where a rewrite is only sometimes equivalent, the diagnostic keeps its tip and offers no edit. So loose `==`/`!=` (S116) stays a warning with no fixit, because `x == null` and `x === null` differ for `undefined`. `var` (S110) stays an error and hoisting is not supported; its fixit to `let` is offered only when that is safe: the declaration sits directly in the lambda's top-level block, the name is declared once, and nothing uses it earlier.
- **Free identifiers are lowering's concern.** M1 counts them as rejections. The long-term answer is helper functions written in the subset (`lib/*.js`), as the proposal's §8.1 describes.

## Subset widenings after M1 (2026-11-23, with Ben)

These are ruled on the evidence in [the M1 findings](2026-11-23-m1-findings.md), "H1". Count figures come from `node scripts/dmg-diff/cli.js survey`.

- **Program helpers lower as program functions.** A top-level helper of the preset program is parsed, checked against the subset, and lowered like a DMG method, with its signature inferred from its call sites and the same rules: effects, and no recursion. A top-level constant becomes a baked constant. This is the largest class of rejections: 11 lambdas, of which about 7 would then lower; the other 4 also break deliberate rules.

  > **Corrected 2026-11-23 (job m82n5e):** "about 7 would then lower" was wrong. It came from reading the helpers' names, not their bodies. With helpers lowered, **2 of the 11** lower (preset 14's `memory.onFrame#0` and `memory.on(guess)#0`, through `nth`). The other helpers also need array literals, which are not lowered (`DIRS`, `[w.player, w.cpu]`, `[[3, 2], …]`), or `w.bg`, which the DMG dialect does not describe. A few also break deliberate rules: spread, a regex, `while`, a loop bound that is an expression, or `new`. All the helpers are arrows bound with `const`, so no parser change was needed. A top-level constant is baked only when it is a number, string or boolean expression. `node scripts/dmg-diff/cli.js survey`.
- **`for…of` over a bounded list, and destructuring of structs, are lowered.** The parser rulings above already allow both, so this finishes lowering rather than widening the subset. Lowering must also check a `for…of` body, which it currently skips. Tuple destructuring (`const [dx, dy] = …`) comes with list indexing.
- **List indexing is allowed and typed as possibly empty**, like `find`'s result, so it must be checked before use. That matches JavaScript's `undefined` out of range, and gives a C backend its bounds check.
- **String functions (`repeat`, `toUpperCase`, …) are declared in a dialect only when a program needs them.** They are not part of the subset.
- **A loop step other than ±1 stays rejected** until a range analysis can bound a loop whose start is an expression (backlog, "a range analysis on a small lattice"). L007's tip suggests the rewrite: count the iterations and compute the value inside the loop.
- **Closures, `while` and spread stay rejected.** Each appears once in 126 lambdas and has a direct rewrite.
- **Array literals lower as bounded lists** (2026-11-23, with Ben, after job m82n5e). `[a, b]` is typed `{ list: T, max: n }`, with `n` the literal's length, so an item read by index or by tuple destructuring is possibly empty and must be checked, the same as any index. There is no fixed-length tuple type in the core IR for now. Ben: "On some systems we will need to be very careful with arrays." A bounded list keeps every array's size known to a backend.
- **`w.bg` is described in the DMG dialect** (2026-11-23, with Ben). The background map is dialect work, not a subset change. It gates five or six game lambdas.
- **A list literal records its exact length** (2026-11-23, with Ben, after job FrMVgR). A literal `[a, b]` knows it has exactly 2 items, so a constant index or destructuring position below that length is never empty. Any other index stays possibly empty. There is still no tuple type. This unblocks `const [ox, oy] = [3, 2]` (23 `Bird.onFrame#0`).
- **Parameter types across call sites: inferred, with a strict join** (2026-11-23, with Ben; job FrMVgR). No annotations are required. A method's or helper's parameter takes one type from all its call sites, using a closed list of joins: the same type; two string literals give their enum; a value and `null` give possibly empty; a string literal and a plain `str` give `str` (the one true widening, kept because `f("left")` next to `f(dir)` is natural JS). Anything else is one error at the second call site, naming both. This rule never uses the general join in `kit/ir/types.js`, which falls back to an open union. Ben: fail quickly and simply on mismatches, because widening types "when possible" caused trouble on another compiler project. Dialect types are nominal: `vec2` and `color`, or `Mole` and `Hammer`, never join, and payload structs join only when identical. An enum meets a literal by membership. A Dialect cannot add join rules; a conversion is an explicit intrinsic. Signatures are always shown (listing, diagnostics). Optional JSDoc pinning and per-call-site copies wait until a Program needs them. Why inference over annotations: the code must run as JavaScript, so `x: i32` cannot appear, and JSDoc is wordy for a model to write. First-call-wins made a Program's validity depend on call order.

## Integer semantics in the IR (2026-11-23, the IR leaf)

The ruling above (coerce on store; an assignment evaluates to the unwrapped value) is represented like this, in [`kit/ir/ir.d.ts`](../kit/ir/ir.d.ts):

- **Every number is an `f64` value.** Arithmetic, comparison and locals are plain doubles with JavaScript's meaning. A sized integer is not a value type.
- **The integer type lives on the place, as a store rule.** A writable field's `Place` carries `store: { type, min?, max?, values? }` (`u8`, `i8`, `u16`, `i16`, `fix`, `bool`, `enum`, or `f64` for `x`/`y`). Every `store` statement applies its place's rule: clamp to min/max, truncate, then wrap. Reads return what was stored.

  > **Corrected 2026-11-23:** the order above is wrong. The host's `Runtime.prototype.coerce` truncates toward zero first (warning when a fraction is lost), then clamps to `min`/`max` when given, then wraps into the type's range; `fix` rounds to 1/256 before it clamps. With integer bounds the stored value is the same in either order; what differs is the warning: a u8 with `max: 9` given 12.5 logs the lost fraction and then clamps to 9, which a backend that emits its own coercion must reproduce. `kit/ir/ir.d.ts` states the corrected order. Also writable since: `w.oamStart` (`u8`; the world proxy stores `(v | 0) & 255`) and `w.over` (`bool`; setting it true ends the game).
- **A store never feeds back.** `--self.ttl === 0` lowers to `let t0 = sub(self.ttl, 1); store.u16 self.ttl, t0; if eq(t0, 0) …`. The compare reads the temporary, not the place, so on a u8 holding 0 it sees −1 while 255 is stored. The same holds for `x = e` used as a value (it yields `e`) and for postfix updates (they yield the old number).
- **Who performs the coercion is the backend's business.** The JS backend targets the DMG runtime, whose entity and world proxies already coerce on every set and log the wrap and fraction warnings that the trace compares. So JS emits a plain assignment through the proxy and leaves the rule to the host, rather than coercing twice. A backend without such a host (C, wasm) emits the rule from `store`.

This is why §5.8's `sub.wrap.u8` before the compare is wrong for this runtime: the wrap belongs to the store, not to the subtraction.

## Order

The oracle harness comes first: it is the yardstick for everything else and gives the lambda inventory the parser is built against. Parser, lowering and emitter are a chain of dependent leaves, best done by one agent in order. The differential run and H1 report close the stage.

Imported into `job` on 2026-11-23 under root `8qHPT3` (M1 is `oHF0p6`). The tracker is now the live plan; edit leaves with `job edit`, not this block.

```yaml
tasks:
  - title: "Workbench Kit"
    desc: |
      The prototype of the Workbench Kit: a parser for a JavaScript subset, a typed IR, emitters, and the tooling around them, so that a workbench (a domain language, an IDE, an agent and a book) can be built from a few small generated files instead of being regenerated whole every time.

      Proposal: project/2026-11-23-workbench-kit-proposal.md. Rulings: project/2026-11-23-delivery-decisions.md. Platform findings: project/2026-11-23-m0-platform-probe.md.
    children:
      - title: "M1: Game slice"
        desc: |
          Tests hypotheses H1 (runtime lambdas fit comfortably in the subset) and H10 (the IR earns its keep) on a real grammar: the DMG Workbench's. Each runtime lambda in a preset is parsed from String(fn), lowered to IR and emitted as JS, then swapped into the DMG runtime in place of the original closure. Seeded traces of the original and swapped runs are compared.

          Plan and binding decisions: project/2026-11-23-m1-game-slice-plan.md.
        children:
          - title: "DMG oracle harness and lambda inventory"
            ref: oracle
            desc: |
              Why: every later M1 leaf is measured against the existing DMG runtime, so it needs a headless harness that produces a complete, comparable trace, plus a way to swap individual runtime lambdas. This is also the first code in the repo, so it sets up the test command and the pre-commit hook.

              What: tooling in scripts/dmg-oracle/ that:
              - loads the DMG DSL core from project/2026-11-23-dmg-workbench.html at run time (lines 509–1553, ending in `module.exports = DSL`), with no copy committed;
              - builds a preset by id from the `window.DMG_PRESETS` JSON on line 1554;
              - runs it with an explicit seed and an input trace, and records a per-tick trace;
              - lets a caller replace any runtime lambda in the built spec.

              Presets 06 and 07 read input, so the harness needs seeded generated button traces. Neither has a `bot`.

              What the trace must include, from project/2026-11-23-dmg-workbench-read.md:
              - `rt.obs()`, which omits a lot;
              - the BG map and scroll, which hold game state in five games;
              - `oamStart`, and entity `visible`/`alive`;
              - every log entry, captured through `hooks.onLog`, because `rt.log` truncates at 600;
              - `rt.fb` after `render()`, at a fixed cadence.

              Always pass the seed explicitly: the UI ignores `Game.seed()` for the runtime RNG.

              Also produce the inventory: every runtime lambda slot in all 22 presets, with preset, slot kind (onFrame, on, method, timer, timer `every`, draw, hud, init, done, bot), owner and source text, written as a JSON file the parser leaf can use as its corpus. The slot table is in project/2026-11-23-dmg-workbench-read.md; the call sites are in the DMG Runtime class, lines 1171–1512.

              Seams: creates package.json (type module, `npm test` running `node --test`, no dependencies) and a git pre-commit hook that runs the tests. scripts/dmg-oracle/ may use Node built-ins; kit/ may not.

              Out of scope: any parsing or lowering of lambdas.

              Risk: the DSL core may reach for browser globals at load time. The earlier read ran it in Node unchanged, so this should be small.
            criteria:
              - "Two runs of each of presets 04–07 with the same seed and input trace produce byte-identical traces (test)."
              - "Swapping one lambda for a deliberately altered copy makes the trace comparison fail and name the first differing tick and field (test)."
              - "The inventory JSON lists every runtime lambda in all 22 presets with its slot kind and source text, and its count is stated in a note."
              - "npm test runs the suite and the pre-commit hook runs it before each commit."
          - title: "Subset parser for runtime lambdas"
            ref: parser
            blockedBy: [oracle]
            desc: |
              Why: the kit runs the builder chain as ordinary JavaScript and parses only runtime lambda bodies, from String(fn), so it never needs a full JS parser. This parser is the front door to the IR. Owning it once stops every workbench from reinventing one (delivery decisions, "Owning a parser is deliberate").

              What: kit/parse/, a hand-written recursive-descent parser over the source text of one arrow function. It returns an AST in which every node carries a line and column span, or a diagnostic with a code, a line and a one-line fix. The subset is the proposal's §5.5. Allowed:
              - arrow parameters, including a destructured context;
              - `const` and `let`, assignment and compound assignment, `++` and `--`;
              - arithmetic, bitwise, comparison and logical operators, and the ternary;
              - `if`/`else`, early `return`, and `for` with a bound;
              - member access, calls, and literals.

              Rejected, each with its reason: closures (except the predicate widening below), `this`, dynamic property names, `while`, async, and anything else outside the subset. Lexical rejection belongs here. Free-variable and type checks belong to lowering.

              Already decided: predicate lambdas passed as an argument (`w.board.filter((m) => !m.up)`) must parse, because presets 04–06 need them. Whether they are legal is lowering's call. Keep the grammar open to D1, typed operators on dialect types.

              Corpus: the oracle leaf's inventory JSON. Every lambda from presets 04–07 must parse. The rest of the 22 either parse or produce a diagnostic naming the construct.

              Strictly test-first: write the tests for each construct and each rejection, watch them fail, then implement.

              Out of scope: name resolution, types and lowering.
            criteria:
              - "Every runtime lambda in presets 04–07 parses to an AST with correct spans (tests over the inventory corpus)."
              - "Each rejected construct produces its own diagnostic code, the line, and a one-line fix (one test per code)."
              - "Running the parser over all 22 presets' lambdas prints a per-construct count of rejections (script in scripts/, output recorded in a note)."
              - "kit/parse/ imports no Node built-ins."
          - title: "Typed IR, DMG dialect description, and lowering"
            ref: ir
            blockedBy: [parser]
            desc: |
              Why: the IR is meant to be the single source of truth that every backend, check and view reads (proposal §5). In the DMG Workbench, nothing depends on its IR, and behavior lives in opaque closures (finding L4, confirmed in project/2026-11-23-dmg-workbench-read.md). This leaf makes runtime behavior into data.

              What:
              - kit/ir/: a small typed IR with a diffable JSON form. It has types, functions, kernels (a function plus the domain it runs over), effects recorded on statements, and spans on every node.
              - A lowering pass from the parser's AST, which resolves names and types against a dialect description and emits diagnostics: undeclared free variable, unknown member, type mismatch, effect not allowed in this domain.
              - A DMG dialect description written in the kit's terms. Its inputs: the types of `self` (attributes with their types, baked constants, built-ins `x y index world alive visible`), the `w` surface the presets use (`frame`, `param`, `rand`, `rng.pick`, `board.at`/`filter`, `pool`, `spawn`, `emit`, `sfx`, `toast`, `input.*`, `grid.step`), `at(c,r).text` printf, and `Math.*`. Read attribute types from the built spec; keep the description beside the oracle harness or in kit/dialects/dmg/.

              Already decided: integer semantics must match the oracle. Coercion happens on store, and an assignment expression evaluates to the unwrapped value, so `--self.ttl` on a u8 holding 0 yields −1 while 255 is stored. How the IR represents that is this leaf's call. Write the choice into the plan doc. Predicate lambdas to declared query intrinsics are allowed when they are pure. Strings are runtime values in this grammar (sprite names, choice params, event names), and so are entity references that may be empty.

              Open, agent's call: whether a reference interpreter over the IR earns a place in M1. The proposal (§12) wants one eventually, but here the DMG runtime is the oracle. Ask the user before widening the subset beyond the predicate case.

              Strictly test-first.

              Out of scope: the emitter; GLSL, wasm and C.

              Risk: return types like `"up" | {sprite, y} | null` and variadic printf may push the type system past what §5.2 lists. Record each such case for the H1 report rather than forcing it.
            criteria:
              - "Every runtime lambda in presets 04–07 lowers to IR, or is rejected with a coded diagnostic that the H1 report will count (tests)."
              - "The IR for preset 04's Mole.onFrame and spawn timer is checked in as a JSON golden and reads sensibly to a person."
              - "Each lowering diagnostic has a test that reads its fix line."
              - "The integer-semantics choice is recorded in the plan doc."
          - title: "JavaScript emitter"
            ref: emit
            blockedBy: [ir]
            desc: |
              Why: the JS backend runs natively in the browser and is the code every other backend is compared against (proposal §6). Its output replaces the original closures in the differential run.

              What: kit/emit/js/ turns an IR kernel into the source of a plain JS function with the same calling convention as the DMG slot it replaces: `(self, w)`, `(w, data)`, and so on. It carries the dialect's numeric rules and keeps a line map from emitted code back to source spans. Emitted code may call the DMG runtime's own `self`/`w` proxies; the point is to prove the lowering, not to replace the host.

              Strictly test-first: unit tests per IR construct, then the emitted functions for presets 04–07, each checked against the oracle closure on recorded inputs where a whole-run trace would hide the cause.

              Out of scope: other backends, optimization passes, and replacing the DMG runtime.
            criteria:
              - "Every lowered lambda in presets 04–07 emits a function that the JS engine accepts (test)."
              - "Each emitted function maps every line back to its source span (test)."
              - "kit/emit/js/ imports no Node built-ins."
          - title: "Differential run and H1/H10 report"
            ref: report
            blockedBy: [emit]
            desc: |
              Why: this is M1's definition of done. It answers whether the approach works on a real grammar, and how comfortable the subset is, before any kit is extracted.

              What:
              - A script in scripts/ that, for presets 04–07, swaps every lowerable lambda for its emitted version and compares traces against the original. Use several seeds and generated input traces, over enough frames to reach game over where a game has one.
              - The same script runs the lowering-only survey over all 22 presets: per preset, lambdas lowered, rejected with each reason, and the rewrites that would make each rejection lower.
              - A dated findings doc in project/ that gives the verdict on H1 and H10, the subset widenings the evidence supports, and what M2 and M3 should change. Every figure names the command that reproduces it.
              - The same doc corrects, in place, the proposal's errors listed in project/2026-11-23-dmg-workbench-read.md, each as a marked block quote. These are L5's overstated C coverage, L11's `lab:` links, L2's "mutation mode", the preset ids, and §5.8's wrap-before-compare.

              Out of scope: fixing rejected presets by changing the DMG grammar.
            criteria:
              - "For presets 04–07, every swapped run matches the original trace across the chosen seeds and input traces, or each mismatch is explained in the findings doc (script output)."
              - "The findings doc gives lowered/rejected counts for all 22 presets with reasons, and the command that reproduces them."
              - "The proposal's factual errors are corrected in place as marked block quotes."
```
