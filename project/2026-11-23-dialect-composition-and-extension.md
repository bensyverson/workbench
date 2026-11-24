# Combining and extending Dialects

*2026-11-23. A discussion note from the M2 session, answering Ben's questions "if I create a DSL for path tracing and one for geometric modeling, is there a path to combine them?" and "what if you want to import a Dialect but extend it?". It records reasoning and recommendations for M3; nothing here is ruled, and nothing is built. The proposal, the glossary and the backlog say nothing on either question.*

## What already composes

- **One core underneath.** Every Dialect lowers to the same typed IR, effects and verifier, so code from two Dialects can sit in one program and the verifier checks the whole.
- **A Library is a shared lowering target.** Intrinsics written in the Runtime Subset lower like any helper, so a vector-math or noise Library can serve several Dialects that know nothing of each other.
- **Fragments are mixins** over one Grammar construct, with conflict reports (proposal §8.2). That composes inside a single Dialect.

## What does not exist

Combining path tracing with geometric modeling hits three differences:

1. **Types are nominal.** A modeler's `vec3` and a tracer's `vec3` are different types, deliberately. There is no way to declare that two Dialects share one.
2. **Iteration Spaces differ.** Tracing is per pixel and sample; modeling is per vertex, face or field. A Kernel's `space` already varies by slot, but nothing yet passes a scene from one space to another.
3. **Build-time data feeding runtime lambdas.** The Grammar separates `bake` from `pixel`, but no typed value (a `Scene` handle) crosses between them.

## Importing

Three options:

- **A. One merged Dialect.** No new machinery; does not scale, and the two authors cannot work separately.
- **B. Dialect imports.** A Dialect declares `uses: [geometry]` and receives its types, intrinsics and Library under a namespace. A type is the same type everywhere it is imported.
- **C. Interface types at the seam.** Each Dialect exports and imports only a few named types (`Scene`, `Ray`, `Hit`); everything else is private.

**Recommendation: B with C's discipline.** Imports are allowed, but the crossings are named interface types, never raw shared vectors. Nominal typing survives, and "a type error names both types and the fix" keeps working across Dialects.

## Extending

An extension is an import that adds to what it imports. Four kinds, in rising risk:

1. **Add** types, intrinsics, Library functions or constructs. Safe apart from name collisions.
2. **Add a slot or a domain** (say a `tick` slot on a construct). Old programs stay valid; each backend either handles the new slot or refuses its Kernels, which a target's `accepts` list already allows.
3. **Add an operation to an existing type** (`rotate` on `vec2`, or `mat2 * vec2`). Safe where the operation was previously a type error, because D1 resolves operators by type and no program that compiled can change meaning.
4. **Change or remove** (override an intrinsic, loosen a `forbid`, alter a type's rules). Breaks the guarantees other code relied on.

**Proposed rule: an extension may make more programs legal, never change what a legal program means.** Kinds 1 to 3 satisfy it. Kind 4 is not an extension; it is a fork, a new Dialect with its own name and its own types. The rule keeps proofs, verifier checks and the interpreter oracle valid, because the extension's meaning is a superset of the base's (see [guarantees and testing](2026-11-23-guarantees-and-testing.md)).

### Enforcing it

- **A conservative-extension check.** Run the base Dialect's own tests and goldens against the extended one; every base program must lower to identical IR. The DMG survey and goldens already work this way.
- **Identity.** An extension adds members to the base's nominal type rather than a new type beside it, so base Library functions accept the extended type.
- **Collisions are errors, never shadowing.** Two extensions adding `rotate` to `vec2` conflict, and the diagnostic names both.
- **Every addition arrives with its backend spellings and a reference-interpreter implementation**, or a target refuses it.

### The path tracer and the modeler

Extension answers the original question better than a merged Dialect. A shared geometry Dialect supplies `vec3`; the tracer extends it with `Ray` and `Hit`, the modeler with mesh and SDF types. A combined program imports both extensions, and `vec3` agrees because it has one ancestor.

The risk is the diamond: two extensions of one base, used together. The monotone rule keeps it tractable, since each only adds and their union is well defined unless names collide.

## Other risks

- **Operator meaning.** If two Dialects define `*` on their own `vec3` while nominal, there is no conflict; unifying them forces a ruling on whose rule applies.
- **Backends.** A combined program may span targets (GLSL takes only effect-free `pixel` Kernels), so compiling must split by space. That is the first real use for LIR stages.
- **A Grammar is a language.** Combining Grammars combines fluent builders, diagnostics and agent prompts; the prompt grows and "did you mean" gets less sharp.

## Next steps (none scheduled)

1. **Measure how separable the DMG Dialect is from the core.** The conservative-extension check would show it: an H2 finding M2 has not yet counted.
2. **Try option B in M2's setting**, with a second small Dialect importing the `fields` vector types, to see whether namespaced imports hold.
3. **File a design question under M3** for the Definition API: imports, extension kinds 1 to 3, forks.
