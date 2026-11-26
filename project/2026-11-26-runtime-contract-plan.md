# Runtime contract: building the relay rerun's rulings

*2026-11-26, session 3. Ben ruled on the seven calls in `Vv3lQY` (the note on that leaf; six from [the rerun findings](2026-11-26-seams-relay-rerun-findings.md), "For Ben", and a seventh, S116, from [the placeholder findings](2026-11-26-placeholder-docs-findings.md)). This plan builds them. The `tasks:` block below was imported on 2026-11-26 under `SPPLaM`; the tracker is the plan from then on.*

## The rulings

1. **Kernels by name.** `ctx.kernels["<instance>.<slot>.<name>"]` for a call that declares a name (`.force("gravity", …)`). The positional `<instance>.<slot>#<n>` id stays the stable id.
2. **Per-Program state.** A Dialect may mark one state member extensible. A Program's declarations (particles' `.field`s) add typed fields to it, checked against the built record, the way `environment(program)` already extends objects. N003 (memory outside state) still holds, and there's no cap.
3. **An Event's instant.** The kit stamps each delivered Event record with its producer's T: read-only `$T`, beside `$rev`.
4. **Optional input fields.** An Event input's field may declare a default (`<field>: <type> = <value>`), and the wire fills it when the producer's record lacks it. A wire still never computes a value.
5. **Controls are a page part.** The page is a built-in part whose Event outputs are the controls, wired like any port (`.wire(page.<control>, <part>.<input>)`). This replaces polling `ctx.controls` by host convention.
6. **A record global outside a record call reads as null.** A lambda tests `<record> != null`, which lowers to `present` and fits boolean-only conditions.
7. **S116 gets a composer-side fix.** A wire may take `{ overflow: "keepLast" | "keepFirst" }`. With a policy, S116 becomes a warning that names it, and drops are counted in `stats()` and noted once per wire, as a stopped part's are. The consumer's max never changes. `reference.md` shows each Event port's max and delivery. Program-derived maxes go to the backlog until a trial needs them.

## Order and why

Every ruling except 2 and 4 lands in `kit/run/scheduler.js` or `kit/run/part.js`. The scheduler (about 590 lines) is also due a split (`p4IYui`), and its latest change (`883c7b0`) is under review. So the order is: the review of `883c7b0` and its fixes, then the split, then rulings 1, 3, 5, 6 and 7 by one agent in that file. Rulings 2 and 4 are mostly `kit/define` (the record, shapes, ports) plus wire filling. A second agent takes them in parallel, and touches `kit/run` only where state is allocated and checked.

The relay that tests all of this, run on a language whose Programs declare their own data and on a second package pairing, comes after both.

```yaml
tasks:
  - title: 'Runtime contract: kernels by name, $T on Event records, a record global that reads as null'
    ref: rc-run
    desc: |
      Why: the relay rerun's authors guessed and stalled at the runtime contract, not the seams (project/2026-11-26-seams-relay-rerun-findings.md, "Gaps"). Ben ruled 2026-11-26 (note on Vv3lQY; project/2026-11-26-runtime-contract-plan.md). This leaf builds the three rulings that change what a runtime and its lambdas are handed.

      What: (1) ctx.kernels also keys each call that declares a name by "<instance>.<slot>.<name>"; the positional "<instance>.<slot>#<n>" id stays the stable id, and both reach the same kernel. (3) Every Event record delivered to a part carries a read-only $T, its producer's T at the instant it was sent, beside $rev; a runtime can't write it and replay reproduces it. (6) A record global (a Dialect port's `record: { name, slots }`) reads as null in a listed slot called without a record (a spawn by rate), instead of throwing; lambdas test `<name> != null`, which lowers to `present` under boolean-only conditions (kit/lower/README.md).

      Seams: kit/run (scheduler.js after p4IYui's split, part.js, compile.js), kit/compose/queues.js for the stamp, kit/define/ports.js for the record's type (the global becomes optional). Docs: kit/run/README.md, kit/define/README.md, and the runtime section of kit/API.md; the docs use <placeholder> snippets, never worked examples (memory placeholders-not-examples).

      Out of scope: per-Program state and input defaults (sibling rc-define); controls and overflow (rc-wire).

      Risks: making the record global optional changes lowering for every listed slot, and existing lambdas that read it unguarded become L003. Survey the repo's packages and fixtures (scripts/seams-trial) and say what changed.
    criteria:
      - 'A test shows ctx.kernels["<instance>.<slot>.<name>"] and the positional id are the same kernel for a repeated named slot, and that an unnamed call has only the positional id.'
      - 'A test shows a delivered record carries $T equal to the producer instant, that writing it throws or is refused, and that replay of a run that reads $T is clean.'
      - 'A test shows a listed record slot called without a record sees null and that a lambda reading it without a null check is refused at lowering with a tip naming the check.'
      - 'npm test and npm run typecheck pass; kit/run/README.md and kit/API.md say all three.'
  - title: 'Runtime contract: controls as a page part, and an overflow policy on a wire for S116'
    ref: rc-wire
    blockedBy: [rc-run]
    desc: |
      Why: a composer can't say which part the D-pad drives (ctx.controls.pad is a host convention), and when two strangers' Event maxes don't fit (S116) no glue can fix it: relay D stopped there (project/2026-11-26-placeholder-docs-findings.md). Ben ruled 2026-11-26 (note on Vv3lQY; project/2026-11-26-runtime-contract-plan.md, rulings 5 and 7).

      What: (5) The page is a built-in part whose Event outputs are the controls. A glue wires them like any port, `.wire(page.<control>, <part>.<input>)`, with the usual frames, rename and S diagnostics. A part reads controls as Events, not by polling ctx.controls. Decide and document what the page part offers (at least the D-pad and buttons the DMG host has) and what a display run and a headless run feed it. (7) A wire may take `{ overflow: "keepLast" | "keepFirst" }`. With a policy, S116 is a warning naming the policy instead of an error; at run time the records past the consumer's max are dropped per the policy, counted in stats() and noted once per wire, as a stopped part's drops are (kit/run/README.md). The consumer's declared max never changes. The package reference (kit/package/reference.js) shows each Event port's max and delivery so S116 isn't a surprise.

      Seams: kit/compose (compose.js, analyze.js, queues.js, codes.js), kit/run (scheduler, part.js, driver.js), kit/package/reference.js, scripts/seams-trial fixtures if they poll ctx.controls. Docs: kit/compose/README.md, kit/run/README.md, the seams doc a composer reads.

      Out of scope: Program-derived Event maxes (backlog them in project/backlog.md with what would un-park them: a trial where a policy loses events a composer needed).

      Open: whether ctx.controls goes away or stays for a part that runs alone. The agent's call; say which and why. Determinism: page Events must be recorded and replayed like inputs.
    criteria:
      - 'A test wires a page control to a part and shows the part receives it as an Event in a headless run, and that replay reproduces it.'
      - 'A test shows S116 as an error without a policy and a warning naming the policy with one, and a run that overflows drops by keepLast and keepFirst as named, counted in stats() with one note per wire.'
      - 'A generated reference.md lists each Event port with its max and delivery.'
      - 'npm test and npm run typecheck pass; the docs say both.'
  - title: 'Runtime contract: per-Program state, and defaults for optional Event input fields'
    ref: rc-define
    desc: |
      Why: a Program's own data (particles' `.field("<name>", …)`) has no place in a state the Dialect declares once. Relay authors packed fields into capped name/value lists or dropped them, so a field reset every step and no check noticed; it is the rerun's largest runtime gap. And every field an Event input declares must come from the producer, so authors kept inputs to the position alone and a composer can't pass more. Ben ruled 2026-11-26 (note on Vv3lQY; project/2026-11-26-runtime-contract-plan.md, rulings 2 and 4).

      What: (2) A Dialect may mark one state member extensible; a Program's declarations add typed fields to it, checked against the built record, the way environment(program) already extends objects (kit/define/README.md). The runtime gets the extended shape, N003 (memory outside state) still holds over it, and there is no cap beyond the Program's own declarations. Replay and the content key cover the extension. (4) An Event input's field may declare a default, `<field>: <type> = <value>`; the wire fills it when the producer's record lacks the field, and a wire still never computes a value. A field without a default must still come from the producer (S diagnostics as today).

      Seams: kit/define (dialect.js, record.js, shapes.js, ports.js, validate-dialect.js), kit/compose (wire analysis and filling), and in kit/run only where state is allocated and N003 is checked (part.js). Another agent owns kit/run/scheduler.js and the rest of part.js in parallel (rc-run): keep part.js edits small and say exactly what you changed there. Docs: kit/define/README.md, kit/START.md and kit/API.md in <placeholder> style (memory placeholders-not-examples).

      Open: how a Dialect marks the extensible member and how a declaration maps to a field type. The agent's call, but run the shape past the dogfood rule (AGENTS.md "Dogfood our own designs") by keeping it close to environment(program); the runtime relay after this leaf is the dogfood.

      Risks: the particles fixture in scripts/seams-trial must move off its name/value workaround (or the starting package must show the new way); say what changed.
    criteria:
      - 'A test declares an extensible state member, a Program adds two fields, and a runtime reads and writes them across steps; a write outside the extended shape is N003.'
      - 'A test shows the content key and replay change when a declared field changes.'
      - 'A test wires a producer whose record lacks a defaulted field and the consumer sees the default; a missing field with no default is still refused.'
      - 'npm test and npm run typecheck pass; kit/define/README.md, kit/START.md and kit/API.md say both.'
  - title: 'Runtime relay: a language whose Programs declare their own data, and a second package pairing'
    ref: rc-relay
    blockedBy: [rc-run, rc-wire, rc-define]
    desc: |
      Why: the dogfood for the runtime contract (AGENTS.md "Dogfood our own designs"; project/2026-11-26-seams-relay-rerun-findings.md, "What this changes in the plan"). The seams are settled; don't re-test them.

      What: run the relay harness (scripts/seams-trial) in placeholder style with authors given a language whose Programs declare their own per-entity data, and a second pairing of packages so the `pos` priming is tested too. Record difficulty, guesses and gaps in a dated findings doc under project/, and file what the design must change.
    criteria:
      - 'A findings doc under project/ records each leg (model, difficulty, checks, turns, cost) and the gaps, with the commands that reproduce it.'
```
