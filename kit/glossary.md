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
