# Plan: building the seams (kit/define ports and frames, kit/compose)

*2026-11-26, under leaf `wwG0JR` (M4 Composition, `SPPLaM`). The spec is [the seams draft](2026-11-25-seams-draft.md) as ruled on 2026-11-26 (its rulings block, at the top), with [the clocks draft](2026-11-25-clocks-draft.md)'s rulings where they touch ports. The `tasks:` block below was imported on 2026-11-26 with `--parent wwG0JR`. From then on the tracker holds the plan, and this block is history.*

## Goal

Make the seams real. A Dialect written by a stranger declares ports in seam types and frames for its spaces. A glue program built with `kit/compose` wires parts and relates frames. The kit checks every wire, plans each conversion as data, and names both sides when something is wrong. This build is what the runtime and scheduler (`ZH4KWX`) will run, and what `IhJ35P`'s playable workbench is made of.

## The reference to port

`scripts/seams-trial/checker/` (about 2,200 lines, with tests) implements the draft as it stood for the relay trial, as stand-ins wrapped around the real kit/define. Its README explains each file. Port its logic into the kit; don't wrap the kit:
- The handles (`.out`, `.in`, `.frame`) and the `in` namespace go **inside kit/define**. The trial needed a stack filter only because it wrapped the builder ([gotchas](gotchas.md), 2026-11-25).
- Its D024–D031 and S codes are the starting catalog. Keep codes stable where the meaning is unchanged, so the trial's records still read.
- `seam.js`, `frames.js`, `ports.js`, `port-lower.js`, `compose.js` and `glue-scan.js` map onto `kit/seam` (or a module inside kit/define), kit/define and `kit/compose`.

## What changed from the trialed draft (the rulings)

1. **Event outputs have no `from`.** A runtime pushes Event records in `step` (clocks question 3). No runtime exists until `ZH4KWX`, so this build declares an Event output by its seam alone and refuses a `from` on one, with a D code whose message says why.
2. **Field renames on a wire:** `.wire(out, in, { rename: { pos: "at" } })`, as data. Each source name must be a producer field and each target a consumer field. A bad name is an S code naming both sides with a did-you-mean.
3. **Cycles:** a cycle of wires is an S error naming the loop, unless one wire in it is marked `{ delay: true }`. Glue order never decides it. The composed record carries each wire's `delay`.
4. **Event delivery:** an Event input declares `delivery: "reliable"` (the default) or `{ keepLast: n }`. This build parses, checks and records it. The queue-bound check needs clocks, so it is `ZH4KWX`'s.
5. **Units and rates:** the kit declares one shared unit, `s`, that every package can name. A rate is written only per second (`vec2@px/s`, `f64@cell/s`) and converts by the space edge alone. A per-package `s` frame is no longer needed, and a rate over any other unit is refused.
6. **`ref("in", { kind })`:** a Grammar can ask for only Event inputs or only value inputs.
7. **Event records reach lambdas** (question 9): an Event input names the lambda slots that see its record and the name it is read by (particles' `spawn` reads `ev.at`). The draft fixes the intent, not the shape. The shape is the builder's call, guided by how params and inputs are already declared. Report it, because the relay rerun will dogfood it.
8. **Output lambdas may build a vector** from scalar state: `(s) => [s.player.x, s.player.y]` for a `point2`.

## Order

Every leaf below writes kit/define or depends on one that does, so one builder takes them in order. `ufTowc` (a kit/define issue in the same files) goes first, as a warm-up with a red probe. The relay rerun is the dogfood, after the build. It reuses the trial's packet, rewritten against the real kit and given a reference example unlike the task's pairing.

```yaml
tasks:
  - title: "Seams in kit/define: seam types, ports, frames, inputs and handles"
    ref: define
    desc: |
      Why: a stranger's Dialect needs a way to declare what it offers and accepts, in a vocabulary every package shares. This is the first half of wwG0JR, and kit/compose (the next leaf) builds on it.

      What: defineDialect accepts `ports` (out, in), `frames`, `edges` and `inputs` as the seams draft describes (project/2026-11-25-seams-draft.md, sections Seam types, Ports and Frames). It judges them with D codes at the Dialect's line. Every generated builder carries read-only `.out.<port>`, `.in.<port>` and `.frame.<name>` handles, built inside kit/define. The `in` namespace is filled from `ports.in` so that `ref("in")` checks a trigger by name. A built Program's output lambdas, extents and edges are lowered and checked when the Program lowers.

      Already decided (the draft's rulings block, 2026-11-26): an Event output has no `from` (a runtime pushes it; refuse a `from` with a D code that says so); an Event input declares `delivery: "reliable"` (the default) or `{ keepLast: n }`; the kit's shared unit `s`, and rates per second only (`vec2@px/s`); `ref("in", { kind: "event" | "value" })`; Event records reach the lambda slots an input names, through a name it gives (the shape is your call: keep it consistent with how `inputs: { object, name }` and params are declared, and report it); output value lambdas may build a vector from scalar state. Points, vectors and quantities stay three kinds. Untagged numbers do not convert. Rotation, Grid, Image, Mesh, Field and Ids are not in v0.

      Seams: port from scripts/seams-trial/checker/ (seam.js, ports.js, port-lower.js, handles.js, define.js; its README says what each does). Its D024–D031 are the starting codes: keep a code where its meaning is unchanged. The seam grammar may live in a new `kit/seam` module or inside kit/define, whichever keeps kit/define's files readable. kit/ must not import Node built-ins. Update kit/define/README.md, kit/API.md, kit/START.md where an agent building a Dialect needs it, and kit/glossary.md (Seam type, Port, Frame, Edge, Handle).

      Out of scope: kit/compose and every S code that needs two parts (next leaf); the runtime, the scheduler and queue bounds (ZH4KWX).

      Risks: the trial's stand-in reached into kit/define's Program object to fill the `in` namespace. Doing it properly may mean giving namespaces a real source in the Dialect. The UI value-lambda lowering may not build a vector from an array literal yet.
    criteria:
      - "A Dialect with the trial's maze and particles ports (minus the Event `from`) defines clean, and each D code has a failing case in kit/define's tests"
      - "A builder's .out/.in/.frame handles exist without wrapping the builder, and a builder diagnostic still points at the author's line (a test)"
      - "ref(\"in\") and ref(\"in\", { kind }) give B003 with a did-you-mean for a wrong or wrong-kind input (tests)"
      - "An output lambda that builds a point2 from two scalars lowers and pairs with its seam (a test)"
      - "kit/define/README.md, kit/API.md and kit/glossary.md describe ports, frames, inputs and handles"
  - title: "kit/compose: the glue program, frame paths, conversion plans, renames, cycles"
    ref: compose
    blockedBy: [define]
    desc: |
      Why: the composer owns every fact that spans two parts. This module is where they are written and checked, and its composed record is what the scheduler (ZH4KWX) will run.

      What: a new kit module, kit/compose, with `compose(name)`, `.part(builder)`, `.frame(a, b, edge | "fit")`, `.wire(out, in, options?)`, `.show(part)`, `.check()` and `.build()`, as the seams draft's "The glue program" section describes. It builds each part with its own Grammar, then builds the frame graph from each Dialect's edges and the glue's `.frame` calls. It judges each wire's seams field by field, plans each tagged field's conversion by kind (a point by scale and offset, a vector or rate by scale, a quantity by a uniform scale), and returns the composed record with every wire's plan as data. Every S diagnostic names both sides, as the draft's "Diagnostics that name both sides" section prints them.

      Already decided (the draft's rulings block, 2026-11-26): wire options `{ rename: { from: to } }` (data only, each name checked against its side, with a did-you-mean) and `{ delay: true }`; a cycle of wires is an S error naming the loop unless one wire in it is delayed, and glue order never breaks one; each part keeps its own params and there is no glue-level `$`; one wire per input; no direct reads between parts; the composed record carries each wire's `convert`, `rename`, `delay`, dropped fields and the consumer's `delivery`. The page's composition is a root part in its own Dialect, so `.show(part)` stays a single part; no layering in kit/compose.

      Seams: port from scripts/seams-trial/checker/ (compose.js, frames.js, glue-scan.js, codes.js). How a glue program's bare package names (`import { maze } from "maze"`) resolve goes through kit/package's loading (the trial's hooks stood in for it); read kit/package/README.md and reuse it rather than writing a second resolver. Write kit/compose/README.md (API, invariants, S codes) and add it to kit/API.md and kit/START.md.

      Out of scope: running anything (ZH4KWX: the scheduler, delivery, queue-bound checks); the composed page's drawing (FqsPVJ).

      Open: whether S301 (a handle used as a value at build time) can be trapped without scanning the glue's text. The trial scanned for conditions. Prefer a trap, and report what you chose.
    criteria:
      - "The trial's valid composition (scripts/seams-trial/fixtures/valid, with the Event `from` removed) checks clean through kit/compose and prints the plan ×32 +[16, 48] for `at`"
      - "Each S code has a failing case in kit/compose's tests, and each prints both sides"
      - "A rename with an unknown field on either side is refused with a did-you-mean; a valid rename lets a `pos` producer feed an `at` consumer (tests)"
      - "A two-wire cycle is refused naming the loop; marking either wire `delay` makes it check clean, and swapping the two `.wire` lines changes nothing (tests)"
      - "kit/compose/README.md exists and kit/API.md and kit/START.md point to it"
  - title: "Package reference prints ports and frames; the relay's hand-ins check clean on the real kit"
    ref: accept
    blockedBy: [compose]
    desc: |
      Why: a composer decides what to wire from a package's generated reference, without running code (seams question 7). The nine recorded relay hand-ins are the acceptance test that the real build matches what the trial agents wrote.

      What: kit/package's generated reference prints each port (seam, note, default or required, delivery) and each frame (dims, note). The nine hand-ins in scripts/seams-trial/runs/ check clean through the real kit/define and kit/compose, after only the massage the rulings force (dropping an Event output's `from`; a per-package `s` frame becoming the kit's). The massage is recorded per run as a finding. Drop the stale "No ports or seams" line in the trial packet's packaging doc.

      Seams: kit/package (reference generation; read its README first), scripts/seams-trial/ (a script or test that runs the hand-ins through the real kit; it may replace the stand-in checker if the real kit now covers it, and the trial's README must say which).

      Out of scope: rewriting the relay packet for a rerun (the next leaf).
    criteria:
      - "A package's generated reference shows its ports and frames (a kit/package test)"
      - "All nine recorded relay hand-ins check clean on the real kit; the per-run massage is listed in the trial README or a findings note"
  - title: "Seams relay rerun on the real kit, with a reference example unlike the task's pairing"
    ref: rerun
    blockedBy: [accept]
    desc: |
      Why: the dogfood ruling (AGENTS.md) asks for fresh agents to use a design before it is frozen. The first relay could not test whether strangers' field names meet, because its reference example was the task's own pairing (project/2026-11-25-seams-relay-trial-findings.md, item 8). This build adds renames, delay, delivery, Event records reaching lambdas and per-second rates, none of which any agent has used yet.

      What: rewrite scripts/seams-trial's packet (docs/, brief.md, run.sh) against the real kit and its references, with a reference example from an unrelated pairing (a sound language and a scoreboard, say). Run at least two relays (maze author, particles author, composer, each blind in a separate session), Sonnet and Haiku at least. Write the findings as a dated doc under project/.

      Who: the integrator (main thread), or an Opus agent it briefs. A trial's judgment stays at the top tiers.
    criteria:
      - "At least two relays run blind on the real kit, and every leg's hand-in is checked by a program"
      - "A dated findings doc says whether strangers' names met, whether `rename` was found and used, and what the agents had to guess"
```
