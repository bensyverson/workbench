# Plan: building defineUI, and the run's state in the Dialect

*2026-11-25, leaf `J7Uzdr` (M4 Composition, `SPPLaM`). Builds the trialed UI draft ([the draft](2026-11-25-ui-dsl-draft.md), [the agent-facing packet](../scripts/ui-trial/docs/ui-draft.md), [the trial findings](2026-11-25-ui-trial-findings.md)) under Ben's nine rulings (the draft's closing block). Ben was away; the calls marked **(call)** below were made without him, are two-way doors before the dogfood check, and are reported in the handoff.*

## The rulings this builds on

1. The run's state shape is declared in the **Dialect**, not the UI. `text(state)` is checked against it; the UI's paths and lambdas read it. Headless runs, `runs`, traces, the text view and M4's seams need it with no UI loaded.
2. Buttons stay as drafted: the Dialect declares only the object of booleans its lambdas read (`Pad`); roles, labels and the key mapping are UI.
3. Program-level UI is deferred (backlog).
4. `defineUI` lives in `kit/define`.
5. `runs` stays in the language; its host waits on clocks (`f2dMku`).
6. `U` is reserved for the UI's codes; api-pilot's reference grammar renames its `U001`.
7. `stat` takes `max?` ("value / max" or a bar, red past it).
8. No derived values.
9. Cross-package annotation reads go to the seam work (`hjdIRt`).

## Decisions made here

- **(call) The key is `state` on `defineDialect`, optional, a plain object of member types written in the Dialect's own type vocabulary**: `"f64"`, `"bool"`, `"str"`, a declared vector or scalar, `enumOf`, `opt`, `struct({…})` for a nested object, `list(of, max)` for a list. Not the Grammar's data shapes (`"number"`, `listOf`), which the trial used: the state is what UI lambdas are lowered against, so it must resolve to core Types, and a Dialect author already writes this vocabulary for objects. A nested plain object is not shorthand for `struct`, so there is one way to write it. The dogfood check (below) tests whether agents trip on the switch. The word `state` also names a Grammar construct's build-time state; the docs must say plainly that the Dialect's `state` is the **run's** state, the value `text(state)` and the views are handed.
- **(call) Optional, not required.** The data Dialect's state is a table whose columns are known only per Program, so it has no static shape; fields' is a frame. A Dialect with no `state` keeps today's untyped `text(state)`, and `defineUI` refuses it (`U013`). Making it required can come once every Dialect can say it.
- **(call) "`text(state)` is checked against it" means at run time:** a Dialect that declares `state` gets a `checkState(value)` that lists every mismatch by path, and its `text` checks the value before calling the author's function and throws on a mismatch, since a host handing the wrong shape breaks the contract. A static check of what `text`'s source reads is not built (`text` is host-side JavaScript, not a Runtime Lambda).
- **(call) `U006` is retired**, as D016 was: its job (a bad state shape) moves to `defineDialect` as a `D` code. A `state` key given to `defineUI` is `U001` with a tip that says where the state went.
- **(call) The trial checker becomes a thin consumer of the kit's `defineUI`** (library plus thin executable), so the dogfood check runs against the real build. Recorded runs and verdicts are history and are not rescored.
- **UI lambdas are checked twice, as the Grammar's are.** `defineUI` checks what it can without a Program (parse, subset, arity, purity, reads of the state, free names: the trial's `U007`). Their types need the Program's params (`$` is typed by the Dialect's `environment(program)`), so a separate `lower` on the UI value lowers every UI lambda through kit/lower against one Program, with the state as `s`, and reports `L…` codes, including a result of the wrong type for its key. This is the draft's "lowered like any lambda".

## Order

State in the Dialect first (everything reads it), then `defineUI`'s checks, then lowering. The agent-facing packet and the dogfood check follow the checks, not the lowering: the changed parts are the state's move and its vocabulary, and they need only the checker.

Imported into `job` on 2026-11-25 under `J7Uzdr`; the tracker is the live plan.

```yaml
tasks:
  - title: "The run's state in defineDialect: state, checkState, text checked, U reserved"
    ref: state
    desc: |
      Why: Ben ruled (2026-11-25) that the run's state shape is declared in the Dialect, not the UI, because the text view, headless runs, traces and M4's seams need it with no UI loaded. defineUI (next leaf) reads it. Plan and the calls made: project/2026-11-25-defineui-build-plan.md.

      What: defineDialect takes an optional `state`: a plain object of member types in the Dialect's own type vocabulary ("f64", "bool", "str", declared vectors and scalars, enumOf, opt, struct, list(of, max)); a nested plain object is refused with a tip to write struct({…}). A malformed state is a new D code (empty state, a non-type, a bad list max), collected with every other problem as defineDialect does. The Dialect value gains the declared state, its resolved core Type, and checkState(value) listing every mismatch by path; when state is declared, the value's text checks its argument first and throws a clear error naming the paths. Without state, nothing changes.

      Also: add U to the reserved letters (kit/define/codes.js RESERVED_LETTERS; kit/API.md "Your checks"), and rename the api-pilot reference grammar's own U001 to a free letter, keeping its scorer and records consistent.

      Seams: kit/define (validate-dialect.js, dialect.js, types.js, codes.js, define.d.ts, README.md), kit/API.md and the topic pages that describe defineDialect's keys, kit/glossary.md if it defines State. Out of scope: defineUI itself; declaring state on fields or data (optional; data cannot).
    criteria:
      - "Tests show a Dialect with state resolves it, and checkState and text refuse a mismatched value by path"
      - "Tests show each malformed state is the new D code with a fix, beside other problems in one DefinitionError"
      - "U is reserved: ctx.error with a U code throws; api-pilot's reference no longer uses U001 and its tests pass"
      - "kit/define/README.md, kit/API.md and define.d.ts describe state as the run's state, distinct from a construct's state"
  - title: "defineUI in kit/define: the U checks, from the trial checker"
    ref: checks
    blockedBy: [state]
    desc: |
      Why: a package's UI is one more call beside defineDialect and defineGrammar (Ben, 2026-11-25: it goes in kit/define). The trial (project/2026-11-25-ui-trial-findings.md) validated the draft with a checker in scripts/ui-trial/checker/; this builds those checks into the kit.

      What: `defineUI(builder, decl)` exported from kit/define. It takes the package's Grammar builder and the declaration (stage, inputs, tiles, annotate; no state), checks everything, throws one DefinitionError with every U problem (path, message, tip, did-you-mean), and returns a frozen UI value. The codes are the packet's (scripts/ui-trial/docs/ui-draft.md, "Codes") with these changes: U006 retired (state lives in the Dialect); U013 also refuses a Dialect that declares no state; a `state` key is U001 with a tip pointing at defineDialect; stat takes `max?` (a number), a ruling. Paths and lambda reads resolve against the Dialect's state Type (a path stops at a list; a list has length and items; a vector's components). The checker's module-file checks (U008: a module that is a package file and defines its tag) need file text the kit cannot read: take what the trial checker's moduleText gave as an option, and say in the README what a host must pass.

      Then make scripts/ui-trial/checker a thin consumer of the kit's defineUI, keep its CLI and test fixtures working with the state moved into each package's Dialect (maze, and the particles reference the fixtures use), and update its README. Recorded runs are history: do not rescore them.

      Seams: new files under kit/define (keep each under ~400 lines), index.js, define.d.ts, codes.js (a UI_CODES table beside the others, every code exercised by a test), README.md. Out of scope: lowering UI lambdas (the next leaf), the agent-facing packet scripts/ui-trial/docs/ui-draft.md (the integrator updates it for the dogfood check), cross-package qualified ids beyond what the draft says (one package per page; a qualified id is U003).
    criteria:
      - "Every U code has a test that triggers it through defineUI, and a valid particles and maze UI pass"
      - "scripts/ui-trial's checker uses kit/define's defineUI; its tests pass with state declared in each fixture's Dialect"
      - "kit/define/README.md documents defineUI, its codes, and what a host passes for module files"
  - title: "Lower UI lambdas against a Program: types, L codes, results per key"
    ref: lower
    blockedBy: [checks]
    desc: |
      Why: the draft promises that UI value lambdas `(s, $) => …` (and a table column's `(row, s, $) => …`) are lowered like any lambda, so the UI reaches every backend and a type error is an L code; defineUI alone cannot type them because `$` depends on the Program's params, which the Dialect's environment(program) declares.

      What: the UI value gets a lower step that takes one Program's record and lowers every UI lambda through kit/lower in an implied pure space, with `s` the Dialect's state Type, `$` from the Dialect's environment(program), a row the item Type of the table's list, and the result Type each key requires (badIf, expect: bool; value, y: a number; badge: str or null; tone: one of good warn bad dim; a stat's value a number or str). It returns the Kernels by id and the diagnostics, each tied to the tile and key it came from. Do not add a reserved slot-convention name to Dialects: build the conventions inside the UI's own environment wrapper.

      Seams: kit/define (the UI files from the previous leaf, lower.js as the model), kit/lower only if a gap forces it (say so). Out of scope: a host that runs them; runs' headless runs (waits on f2dMku).
      Risks: kit/lower may not type struct and list reads from a parameter the way UI lambdas need (s.bodies.length, row.speed); find out first and report before working around it.
    criteria:
      - "Tests lower a particles and a maze UI against a Program, and a wrong-typed badIf, an unknown $ param and a bad row read each give an L code tied to its tile and key"
      - "kit/define/README.md documents the lower step"
  - title: "Dogfood the moved state: update the packet, three blind agents on the changed parts"
    ref: dogfood
    blockedBy: [checks]
    desc: |
      Why: the AGENTS.md ruling says to dogfood a design before freezing it; Ben's Q1 ruling moved the state into the Dialect and this build switched its vocabulary to the Dialect's types, the two parts agents have not seen.

      What: update scripts/ui-trial/docs/ui-draft.md (and rules.md, task.md as needed) so state is declared in the Dialect with its types, stat has max?, U006 is gone; run one Opus, one Sonnet and one Haiku agent through scripts/ui-trial/run.sh on a task that makes them declare a state in a Dialect and write a UI against it; record the runs and a short findings doc; change the design if they trip, then rerun.
    criteria:
      - "Runs are recorded under scripts/ui-trial/runs/ and a dated findings doc in project/ says what they tripped on and what changed"
```
