# The Definition API: design, pass 1

*2026-11-24. Leaf `V93QGn`, pass 1 of 2. This pass writes the API section and the input to the dogfood trial (`lMNmIB`): the agent-facing draft is [scripts/define-trial/docs/api-draft.md](../scripts/define-trial/docs/api-draft.md) and the strict rule set with the checker's codes is [scripts/define-trial/docs/rules.md](../scripts/define-trial/docs/rules.md). This doc holds the reasons, the mapping of every Environment field, and where each Dream Code example lands. Pass 2, after the trial, revises the draft from what the agents report and writes START.md, API.md and `hello` against a token budget.*

*Inputs: [the M3 plan](2026-11-24-m3-kit-v0-plan.md) and the leaf's notes (the later note wins), [the data-tools Dream Code](2026-11-24-data-tools-dream-code.md), `kit/lower/environment.d.ts`, `kit/dialects/fields/`, `kit/dialects/dmg/index.js`, the proposal's §8.*

> **Corrected 2026-11-24, after dogfood trial 1** ([findings](2026-11-24-definition-api-trial-1.md)). Three fresh agents (two Opus, one Sonnet) kept the shape below and converged on one skeleton, but **decision 2 is insufficient**: `environment(program)` sees only the record (lambda source text, before lowering), so a table whose columns change at every step cannot type the lambda after a `derive` without the author writing the derived type. Pass 2 adds **threaded construct state** (an initial state from the opening, a step function that receives each lowered lambda's inferred type) and **namespaces scoped to that state**, specifies `ref.on`, `ref.index` and opener keys (decision 4 left them open), and makes a lambda an argument spec, `lambda(convention)`, usable in any declaration and inside shapes, which also gives a value-or-lambda argument (`.limit(10)` or `.limit(() => $.topN)`) and a map of lambdas (`agg({ … })`). **Decision 3 changes accordingly: two slot kinds (declaration, unit), not three.** Dates are a Dialect-declared nominal scalar (`scalar("f64")`; Ben ruled a core scalar, backing recommended as f64 milliseconds since the epoch, UTC). The revised draft is in the trial packet. The checker (`check` v0) found nothing in 14 runs because it runs none of the hook, checks or lowering; it must before a second trial.

## The shape in one paragraph

Two calls, both taking plain data with a few functions in it. `defineDialect({...})` is the static part: types, Iteration Spaces, objects, globals, intrinsics with each target's spelling and a reference implementation, the Library, targets with their compare mode, slot conventions; plus one hook, `environment(program)`, that returns what one Program adds. `defineGrammar(dialect, {...})` is the program-shaped part: constructs (the root is the Program; children open from a parent), each with slots of three kinds (declaration, unit, Runtime Lambda), from which the kit generates the builder, its diagnostics, the record it returns, and the lowering of every lambda. Both definitions are checked when called (`D…` codes); the generated builder reports `B…` codes; lambda bodies keep lowering's `L…` codes.

## Decisions

Each is made here as a two-way door unless marked for Ben. The trial may overturn any of them; that is what it is for.

1. **Data, not a fluent chain.** The proposal sketched `Dialect("fields").type(…).intrinsic(…)`. An object literal is the same information, is typed by one `.d.ts`, can be checked whole (a fluent chain reports a missing target only at the end anyway), and is what an agent generates most reliably. The fluent form returns only if the trial asks for it.
2. **Static part plus one hook, not a Dialect half and a Grammar half.** An Environment cannot exist without a Program's declarations (fields turns params into `Uniforms` members; DMG builds every component object from its attributes), so the Dialect carries `environment(program)`, which receives the record the generated builder produced and returns `{ objects, globals }` to merge. Slot conventions may be functions of `(ref, program)` for the same reason (DMG's `self` is `ref.on`; a data row's type is its table's columns at that step). This is today's shape made generic, as the leaf's note asks.
3. **Three slot kinds; nesting by `parent`, not by a fourth kind.** Declaration (`name`, `ref`, `data`, `rest` arguments), unit (`fn` or `const`, today's helper path) and Runtime Lambda (after any leading declaration arguments). A child construct names its `parent` and is opened by calling its name on the parent's builder; its builder forwards every parent method, so calling one ends the child. That is how DMG chains `component(…)` after `component(…)`, and it lets a data table be a construct whose slots are its steps without a build-time lambda. A child and parent sharing a method name is D010.
4. **The record is a by-product, with two layouts.** By slot (named declarations as an object, the rest as lists, units in one list) or, with `record: "calls"`, one ordered list of `{ slot, args }` so a pipeline keeps its order. `as` renames a key, so the generated `field()` returns today's `FieldProgram` deep-equal with no hook. The program record (`RJtpuF`) stays parked: this is whatever falls out.
5. **The lambda form: both, read as text.** A function is read with `String(fn)`, a string as is; neither is ever called. DMG, the Dream Code and every fresh agent write functions; fields' tests, survey sketches and the H3 kit write strings and must stay unchanged. Accepting both costs one `typeof`. The function must be an arrow, which is what `kit/parse` reads; a `function` expression or a method shorthand is B007. (Pass 1's draft first said `function` expressions were accepted; the checker's author found the parser refuses them, and the draft was corrected before the trial.) **This changes one fields refusal** (fields refuses a function value today); recorded below for H4.
6. **The free-name rule (the capture policy).** Free names in a lambda: its own parameters and locals; Dialect globals, intrinsics and Library entries; the Program's units; `$` where the Dialect declares a global of that name (a per-program object built by the hook, as fields builds `Uniforms`). Anything else is refused at the call with B008 and a fix (declare a `.const`, or make it a param). A top-level `const` in the author's file is not captured: it goes through `.const(name, src)`, today's helper-const path. Counting the Dream Code by hand (row and group lambdas, not the outer `t =>` ones, the commented fixit excluded): of its 31 runtime lambdas, 8 read `$` (examples 3, 5, 10); 4 call `wb.fn.*` (examples 4, 5, 10), which needs `wb` declared as a global or the date functions declared as plain intrinsics; and 6 capture a local of an enclosing fragment or component (`column`, `q`, `lo`, `hi`, `at`, `bucket`, `user`, in examples 7 and 10), all inside the macro meaning of fragment, which is out of v0. The build-time lambdas (`wb.build`, `wb.arg.build`, `select({ from })`, in examples 3, 6 and 10) are out of v0 too.
7. **Errors: throw only when the chain cannot continue.** An unknown method throws B001 at once (there is no builder to return). Everything else is collected with the call site's `loc` (from the stack at the call); `.check()` returns them and `.build()` throws one `BuildError` holding all of them. Diagnostics reuse `kit/parse`'s shape (`code`, `severity`, `message`, `tip`, `loc`, `range`, `edits`), so one renderer serves parser, lowering and builder. **This moves fields' Library-clash refusal from the `.fn(…)` call to `.build()`**, with the same `loc`; recorded below.
8. **Code namespaces.** `P`/`S` parser, `L` lowering, `D` a definition, `B` the generated builder, `C` the trial checker (which becomes `check` v0), and one letter per Dialect for its own `check` hooks (fields: `F`).
9. **Deliberate refusals are declared.** A construct's `rejected: { name: { message, tip } }` turns "no such method" into the reason and the builder form. It carries the reject-with-fixit list: layout and views, Vega-Lite rendering, agent permissions, fragments, pivot and describe, `addStep` and the other program-editing mutations, SQL text.
10. **The tolerance lives on the target.** `targets.glsl.compare: tolerance(1e-3)`; `exact()` for JS. The per-case override with a reason is the harness's (leaf `JsWK1s`).
11. **Effects are deferred; every space is pure.** `EffectVerb` in `kit/ir/ir.d.ts` and `VERBS` in `kit/emit/glsl/capabilities.js` are DMG-shaped, so opening them is core surgery; fields and the data lambdas are pure. A space must say `pure: true` (D012); intrinsics have no `effects`. Declared purity replaces today's inference, as the M2 findings asked. The loop-bound rule (L007) stays core-wide and is not declared per Dialect in v0.
12. **No integer, no date, nulls through `opt`.** The core has `f32`, `f64`, `bool`, `str`, enums and `opt`. The draft says so and asks the trial to report the need rather than invent a type. Recommendation for the data Dialect (leaf `5eeJED`, not settled here): a nullable column is `opt(T)` so that L008 forces a check and `dropNulls` narrows it; `int` columns are `f64` with a recorded loss (`count()` is a whole f64); dates need either a core nominal scalar or comparison intrinsics, and that choice is the first likely change to the core for H2. **Open for Ben once the trial reports.**
13. **Names.** The Dream Code's live "Environment" (a session an agent mutates) is renamed **Session**, the lab API's word (M4); the glossary's Environment keeps its meaning.
14. **Out of v0, each named so it is not rebuilt by accident:** build-time slots (the Dream Code's `wb.build`, proposal §8.2's `bake`); fragments in **both** meanings, the DMG mixin (`.with(fragment)` adding methods and attributes to a construct) and the Dream Code macro (`wb.fragment(kind, methods)`, `wb.component(name, { expand })`, which writes new grammar in terms of old); Dialect imports (the composition note's B-with-C); effect verbs; the pass manager; the DMG builder rewrite.
15. **The two plan decisions.** *Foreign slots* dissolved with Ben's SQL ruling: there is no slot in another language, and SQL text is a declared rejection. *The program DAG* stays parked in the backlog: the record of decision 4 and Kernel effects are enough for v0, and lineage waits for a client (`dynUhe`). Neither needs a leaf.

## Every Environment field, mapped

The Environment (`kit/lower/environment.d.ts`) is what lowering reads, and the API must yield it unchanged. Fields and DMG side by side; "hook" means `environment(program)` or a slot function, which is code.

| Environment field | Definition API | fields | DMG |
|---|---|---|---|
| `name` | `name` | declared | declared |
| `objects` (static) | `objects` | — | `Input`, `Bg`, `Rng`, `Grid`, `Cell`, `At`, `Math`: declared |
| `objects` (per Program) | hook | `Uniforms` members from params, with `size` from a capped `max` | every component (built-ins, `baked`, attributes with store rules, methods), `World` (attributes, methods, keyed `param`/`spawn`/`pool`/`all`/`one`/`sfx`, aliases, `board`, `grid`), `Board` |
| `objects` (intrinsics) | generated from `intrinsics` (an object with `call`, and a global) | generated | — |
| Member `value` with `store` | object member `{ value, store }` | — | attributes: **needs `store` in the member form**, which the draft omits because no pure Dialect writes |
| Member `value` with `effect` | — | — | **not expressible**: effects deferred (decision 11) |
| Member `fn`, `keyed` | `{ fn: … }`, `{ keyed: … }` | — | declared shapes, keys from the hook |
| Member `emit` | — | — | **not expressible** (an effect) |
| Member `method` | — | — | **not expressible**: inferred methods need a unit-like slot on a construct (`.method(name, fn)`), a small addition once DMG needs it |
| `list`, `queries` | `list`, `queries` | empty | `{ length }`, five queries |
| `globals` | `globals` plus intrinsics | intrinsics only | `Math` |
| `vectors` | `types` | four | none |
| `componentAliases` | `vector(…, { aliases })` | `color: r g b` | none |
| `numberType` | `numberType` | `f32` | absent (defaults to `f64`); the draft makes it required, so DMG writes `f64` |
| `conversions` | `conversions` | `{}` | absent |
| `slot(ref)` | `slots` (static or a function), plus generated `helper` and `const` conventions | `pixel` static | a function of `ref` and the declarations: `self` from `ref.on`, ten kinds, `forbid` lists, the `drawResult` union |

**Not expressible in the draft, all from DMG:** effects on members and slots (`effect`, `emit`, `forbid`, `forbidWhy`), store rules on members, and inferred program methods. Each is a deliberate omission (decisions 11 and 14), and together they are why H4 is not tested against DMG.

**One generated field differs from fields today.** The generated `const` convention forbids every effect, as DMG's does (a constant is computed once); fields' hand-written one forbids none. Fields has no effects, so nothing lowers differently, but the structural Environment test must say so or fields' convention must change to match. Decide in `38WI7z`.

### DMG as Definition API calls (pseudocode)

No executable DMG definition (the leaf's revised note): DMG's builder lives in the original HTML and stays out of M3. The mapping, to check expressiveness:

```js
defineDialect({
  name: "dmg", numberType: "f64",
  spaces: { tick: …, render: … },          // ✗ DMG spaces are not pure: refused by D012 in v0
  objects: { Input: {…}, Bg: {…}, Rng: {…}, Grid: {…}, Cell: {…}, At: { call: … }, Math: {…} },
  globals: { Math: "Math" }, list: { length: "f64" }, queries: ["filter", "find", "some", "every", "reduce"],
  targets: { js: { accepts: "*", compare: exact() } },
  slots: (ref, program) => slotOf(ref, program),   // today's slotOf, unchanged, with forbid lists ✗
  environment(program) {                    // today's dmgEnvironment minus the static objects
    return { objects: { ...components(program), World: world(program), Board: … } };
  },
});
```

Everything DMG declares fits the shape, but about 80% of `dmgEnvironment` moves into the hook as code, and the hook needs `effect`, `store`, `emit`, `method` and `forbid`, which v0 refuses. The API's declarative part covers DMG's static handles and nothing else. That is the finding H4 records against DMG.

## The Dream Code's ten examples against the draft

"Fits" means a v0 data Grammar can express it with the draft's three slot kinds and child constructs; the gaps are named.

| # | Example | Where it lands |
|---|---|---|
| 1 | Load a CSV and look at it | **Partly.** `source` is a declaration slot. Schema inference needs the Dialect to read the file at build, which v0's synchronous hook cannot: the schema is declared (`{ csv, schema }`) or this is the first case for an async hook. `.view` is a declared rejection (layout belongs to the Workbench Declaration, G3). |
| 2 | Clean, with a runtime lambda and a proxy diagnostic | **Fits, with gaps.** `table` is a child construct with `record: "calls"`; `rename`, `cast`, `trim`, `replace`, `dropNulls`, `dedupe` are declaration slots whose column checks are the Dialect's `check` hooks; `derive` is a lambda slot whose `row` convention is a function of the step. `row.revnue` is L002 with a suggestion today. Gaps: `int` and `date` in `cast` (decision 12); `dropNulls` needs `opt` columns. |
| 3 | Params driving runtime lambdas | **Fits, with gaps.** `param` is a declaration slot; `$` is a global object the hook builds; `$.minUnit` is L002, `row.region > $.minUnits` is L003. Gaps: `wb.date` (no date type); `select({ from: t => t.sales.distinct(…) })` reads data at build, refused with a fix (literal `options`); `wb.controls` and the view are rejected. |
| 4 | Group, aggregate and chart | **Mostly.** `groupBy`, `sort` are declarations; each `agg` reducer `g => g.sum("revenue")` is a lambda in a `group` space where `sum` is a keyed member whose keys are the columns (existing core). `chart` is a child construct whose encodings are declarations checked against the inferred columns (E-ENC-COLUMN is a Dialect check). Out: `.y(() => $.metric)` and `.title(() => …)` are host-JS lambdas re-run when a param moves (the fourth lambda kind), refused with a fix (a param-keyed encoding). `wb.fn.truncMonth` needs dates. |
| 5 | A query over two tables, and pasted SQL | **Fits, with gaps.** `join` with `{ on, take }`, `sort("-total")`, `limit` taking a number or `ref("param")` are the data Dialect's declarations, not the kit's (the Dream Code's "Builder gaps"). E-TABLE-UNKNOWN is B003; E-JOIN-TYPE a Dialect check. SQL text in a lambda slot fails to parse (C002/B007) and `wb.sql` is a declared rejection. Gap: `wb.fn.year` needs dates. |
| 6 | Build-time lambdas | **Out.** `wb.build`, `charts`, `describe`, `pivot` are declared rejections; E-PHASE has nothing to check in v0. |
| 7 | Fragments | **Out** (both meanings, decision 14). `winsorize`, `zscore`, column attributes and chart `rule` are rejected or simply absent. |
| 8 | Inspect, list, diff, lineage | **Out.** `.build()` returns the record and lowering returns Kernels; `listing`, `lineage`, `downstreamOf` and `diff` wait for the program record and queries (`RJtpuF`, `dynUhe`). |
| 9 | An agent mutating a Session | **Out**: the lab API, M4. |
| 10 | A custom component and an agent hook | **Out**: `wb.component` with `expand` is the macro meaning of fragment; `.agent(…)` permissions are rejected. `semiJoin` and `keepGroups` fit as data declarations (the latter with a group-space lambda); `wb.book.note` is the Book's (M4). |

So examples 2 to 5 carry the v0 data Dialect, as leaf `5eeJED` already assumes; 1 needs a decision on schema inference; 6 to 10 are refusals.

## H4 and H2, stated now

**H4, narrowed wording** (the leaf's note): "Not tested against DMG. Built: Dialect data plus a generated builder for single-construct Grammars (fields, data), fields figures unchanged." The data Grammar uses child constructs (decision 3), so "single-construct" should read "small Grammars"; pass 2 fixes the wording with the trial's evidence.

**H2 fails if** data-specific logic lands in `kit/ir` or `kit/lower`, or if any DMG or fields output moves (the M1 survey and goldens, the M2 harness figures and planted-fault tally). A core change for dates or integers is allowed if it is Dialect-neutral (a nominal scalar any Dialect could declare) and is counted.

**What the IR carries of the data Dialect:** only the lambdas. Over examples 2 to 5 there are 21 table steps; 9 carry a lambda (7 `derive` or `filter` steps, and 2 `agg` steps holding 5 reducers), and the other 12 (`rename`, `cast`, `trim`, `replace`, `dropNulls`, `dedupe`, `groupBy`, `join`, `sort`, `limit`) are the Dialect's own operations, run by its runtime, outside the IR. Most reducers are a single keyed call. H2's verdict must say this: the core carries the per-row meaning and none of the relational meaning.

## What changes for fields (for H4's note)

- A function value passed to `.pixel`, `.fn` or `.const` is accepted and read as text (decision 5). Today it is refused.
- The Library-clash and duplicate-name refusals move from the call to `.build()` (decision 7), with the same `loc`; `review2.test.js`'s three `assert.throws(() => field("c").fn(…))` gain a `.build()`.
- Refusals gain codes (`B002`, `B005`, `B006`, `F001`, `F002`) where today they are bare `Error` messages.
- The generated `const` convention forbids every effect (above).
- *(Added after the build, 38WI7z.)* The generated `field()` also refuses what the hand-written one let through to lowering: a param of the wrong shape (B004), a free name such as `Math` at the call (B008), and unparseable source at the call (B007). A Program's name is a label (any non-empty string, so `domain-warp` stays legal); other names must be identifiers. Kernel ids drop `#index` for a `once` slot, so fields' Kernels keep their names (`swirl.pixel`).

## For pass 2

- Revise the draft from the trial's reports; the size of the massage needed on the agents' output is itself a finding.
- Settle with Ben: integers, dates and nulls (decision 12) and schema inference (example 1), with the trial's evidence.
- Write START.md, API.md and `hello` from the revised draft, with a token budget and the command that measures it.
