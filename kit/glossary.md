# Glossary

The kit's terms, as ruled on 2026-11-23 ([nomenclature decision](../project/2026-11-23-nomenclature.md)). They are capitalized when used as terms. Earlier project docs predate this list and use some words loosely; where a doc and this list disagree, this list wins.

## The languages

- **Domain Language**: the language a Workbench's Programs are written in, such as the DMG Language. It is a fluent JavaScript chain (`Game("whack").attr(…).timer(…).build()`) with Lambdas in its slots. One per Workbench.
- **Runtime Subset**, or **Bench** (Ben, 2026-11-24): the restricted JavaScript inside Runtime Lambdas. There is one Runtime Subset, shared by every Domain Language, and each Dialect may narrow it. Lambdas in it are lowered to Kernels.
- **Definition API**: the kit's builders for writing a Language Definition: `Dialect(…)`, `.type`, `.intrinsic`, `.target`, `.check`, `.construct`, and so on. It is the same for every Workbench. Nobody writes Programs in it, only definitions.

## Defining a Domain Language

- **Dream Code**: example Programs written in a Domain Language before it exists (phase 1 of the workflow). It is the input from which a Language Definition is designed. Once the definition exists, Dream Code becomes the first Programs and tests.
- **Language Definition**: the artifact that defines one Domain Language, written with the Definition API. It contains:
  - **Dialect**: what the language means: types, Iteration Spaces, intrinsics (with how each target spells them), forbidden calls, targets and domain checks. The DMG Dialect is `kit/dialects/dmg/`.
  - **Grammar**: the constructs (`Game`, `component`, `fragment`) and their slots, each slot a declaration, a Build-time Lambda or a Runtime Lambda. "Grammar" never means a whole Domain Language.
  - **Library** (`lib/`): intrinsics written in the Runtime Subset itself, so they reach every backend.
- **Workbench**: a Language Definition plus a Workbench Declaration, a Skin, a Book and Programs, running as one page.
- **Workbench Declaration**: the `Workbench(…)` file. It declares what the tool does (views by role, commands, the lab scope), not how it looks.
- **Skin**: the `Skin(…)` file. It declares how the tool looks.

## Seams and composition

- **Seam type**: a type in the small closed vocabulary every package's ports are written in (`point2@cell`, `vec2@px/s`, `Event<{ at: point2@cell }>`; [kit/seam](seam/README.md)). Not a second type system for lambdas: a Dialect pairs each port's seam type with its own types.
- **Port**: a Dialect's declared output (`ports.out`) or input (`ports.in`). Values cross between parts only through ports. An **Event** port carries the records one step produced; any other port is a value, read each step.
- **Frame**: a coordinate space (2 or 3 dims) or unit (1 dim) a Dialect measures in. Frames of different Dialects are different frames even when named alike. The kit declares one shared unit, `s` (seconds).
- **Edge**: a diagonal affine map `{ scale, offset }` per axis between two frames: a Dialect's own (`edges(record)`) or a composer's (`.frame`), which may be derived from the two frames' extents (`"fit"`, or an anchored edge, `{ scale, anchor }`). A path of edges plans each conversion on a wire, and kit/run plans them again when a rebuild changes a record.
- **Glue program**: the workbench's own file (`workbench.js`) that builds each part with its package's Grammar and composes them with `kit/compose`: `.part`, `.frame`, `.wire`, `.show`. It owns every fact that spans two parts, and holds no lambdas.
- **Part**: one Program in a composition, named by its root's opening name (`maze("level")` is the part `level`).
- **Handle**: `part.out.<port>`, `part.in.<port>` or `part.frame.<name>` on any builder: a read-only name of one part's port or frame, passed to kit/compose's `.wire` and `.frame`. Not a value.
- **Control**: a named source of records a person makes, declared in a package's UI with a kind from the kit's closed list, and bound by its name to the Dialect's Event input of that name (or, with `to`, to a param or an argument). In a composition, a Control with an input is `page.out.<control>`.
- **Grip**: a draggable object on the stage, declared in a package's UI, placed by the Dialect from state, and bound to one Target. It is not a Handle, which names a port.
- **Target**: `param.<name>` or `arg.<address>`, what a Grip, a Control with `to`, a custom element's `wb-edit` or an action's edit changes.
- **Argument address**: one argument of one builder call: the call's Ref id, `:<i>`, and a path (`.<key>`, `[<i>]`).
- **Write-back**: a release, an action's edits or an applied edit, written into the Program's text as literals, one undo step each.
- **Runtime**: a package's runtime module (`defineRuntime`): its `clock`, `init` and `step`, plain JavaScript over the Dialect's state. Not a Runtime Lambda, which is lowered; a runtime is trusted and calls the Program's compiled lambdas.
- **Workbench time** (`T`): the one clock a composed workbench runs on, in seconds from 0, in exact rationals ([kit/run](run/README.md)).
- **Instant**: a value of `T` at which at least one part is due (a tick part's multiple of its period, a display frame). Within an instant, parts step in wire order.
- **Snapshot**: a part's committed state after a step, with its outputs and revision; nobody sees a part halfway through a step. A consumer reads its producer's latest snapshot (a delayed wire, the one before the instant).
- **Revision**: which build of a part a snapshot came from, in one run (`level@3`): it starts at 1 and bumps only when the part's content key changes. Consumers see it as `inputs.$rev`.
- **Content key**: the hash of what determines a part's built record and Kernels (the kit version, its package's key, the canonical record; [kit/build](build/README.md)); a package has its own (kit/package's). What a cache would reuse a result by; comparable across runs, where revisions are not.
- **Input log**: every outside input of a run (a pad, a param, a rebuild, a display frame), stamped with `T`. A run is a pure function of the composed record, its params and its input log.

## Programs and compiling them

- **Program**: text written in a Domain Language. Running its fluent chain builds the program; its Runtime Lambdas are lowered.
- **Lambda**: a function in a slot.
  - A **Build-time Lambda** is full JavaScript, run once while the Program is built; its result is folded in as data.
  - A **Runtime Lambda** is in the Runtime Subset and is lowered to a Kernel.
- **Default number type**: the type a Dialect gives a number literal where nothing else does (`numberType` on the Environment): `f64` for the DMG Dialect, `f32` for fields. A literal elsewhere takes the type of the value it meets.
- **Environment**: what lowering resolves names and types against: a Dialect plus one Program's declarations (its components, attributes, events). In code it is `Environment` (`kit/lower/environment.d.ts`).
- **Kernel**: a lowered Runtime Lambda: a typed function in the IR, plus the Iteration Space it runs over.
- **Iteration Space**: what a Kernel runs over: per entity, per pixel, once per tick. ("Domain" means the subject area, as in Domain Language, never this.) In code it is the `space` field of a Kernel.
- **IR**: the core intermediate representation (`kit/ir`): types, Kernels, effects, declarations and spans. Every front end lowers into it and every backend reads it. Say "core IR" only when contrasting it with another form.
- **LIR**: the lower IR, for backends that are not JavaScript. Its first stage ([kit/lir](lir/README.md)) is the one GLSL takes: no f64, explicit conversions, intrinsics bound to their spellings. A later stage makes a store's integer rule explicit wrap and clamp operations. A form a Dialect adds above the IR gets a descriptive name, such as "the DMG entity form," not another acronym.
- **Reference interpreter**: the small, slow interpreter over the IR that says what a Kernel means (`kit/interp`). Emitted JavaScript is compared with it exactly and emitted GLSL within a tolerance, so it is the oracle where a Dialect's operators leave no runnable closure. The pixel debugger steps it.
- **DMG Spec**: what the DMG Workbench's own `.build()` produces. The DMG's code calls it "IR"; in ours it is always the DMG Spec.
