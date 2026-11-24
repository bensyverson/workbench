# What the IR can guarantee, and how a Workbench is tested

*2026-11-23. A discussion note from the M2 session, answering Ben's questions about proofs, Lean and testing. It records reasoning and recommendations; nothing here is ruled yet. LIR does not exist yet, so claims about it follow from the IR, the verifier and the M2 plan, not from running code.*

## Assertions on a lowered Program

The useful frame is **abstract interpretation**: lattice theory applied to programs. It fits because the Runtime Subset is small, so each analysis is cheap.

- **Termination and cost are grammar properties.** Every `for` has a literal or derived bound (the verifier's V009 checks this) and helpers cannot recurse, so every Kernel terminates within a computable step count. A backend can refuse a Kernel whose worst-case cost is too large.
- **Value ranges (an interval lattice).** The [backlog](backlog.md)'s range analysis. It can prove an index is in bounds, a divisor is never zero, an f32 never overflows, an output color stays in [0, 1]. A violation is a diagnostic that names the path, not a failed test.
- **Effects form a lattice already.** They are sets that join. A slot's `forbid` list is a subset check, and so are purity, determinism and "touches only this entity".
- **Definite assignment and nullability** are small dataflow lattices; V004 and V005 cover part of the first.
- **Translation validation** is the cheapest strong proof. We do not prove the compiler correct; we check that each emitted program agrees with the reference interpreter. The DMG differential run is an instance. The input space is finite (a pixel grid, a seeded run), so agreement is close to exhaustive.

Topology adds little. Continuity of a shader across a branch is better served by intervals and Lipschitz bounds.

## What to take from Lean

Not proofs: verifying the compiler is a large project against an IR that is still moving. The lessons are structural.

- **A small trusted kernel.** Here that is the verifier and the interpreter, which must stay small and obviously correct. The backends are the untrusted part and the oracle checks them. The review's silent-union finding (job 4RDskO) was the verifier failing to be that kernel.
- **Illegal states unrepresentable.** The typed IR, and the verifier run on every lowering.
- **Specifications as data.** A Dialect intrinsic such as `ihash` with a reference implementation is a specification; each backend spelling is checked against it.
- **Later, perhaps:** a Lean model of the IR's semantics, derived from the interpreter. Not scheduled.

## Why owning the DSL helps

Guarantees are cheap in proportion to what the language cannot express. Termination, bounded cost, purity and no aliasing come from a Dialect forbidding things, not from analysis. A Dialect can also state domain properties directly ("a pixel Kernel is pure, total, and returns a color"). The price is that authors meet the limits; H3 tests whether they accept them.

## Testing

A workbench still needs tests, in a different shape from unit tests.

- **Example tests of a Kernel are mostly tautological**: the program is the specification, so an agent restating its output repeats it. The exception is an expected value from an independent source (the book's original sketch, a hand computation, a reference implementation).
- **Properties over a domain** are better: output in [0, 1] for every `uv`; swirl with angle 0 is the identity; deterministic under a seed; two backends agree within tolerance. The interpreter runs them over a whole grid or seed set.
- **Scenarios** for whole Programs: scripted runs with assertions on world state, which an agent can write from the game's rules without reading the code.
- **Declared invariants** could replace many tests: a Grammar construct such as `invariant: health >= 0`, checked at run time and targeted by range analysis, so intent is stated once and checked three ways.

Proposed agent-writable test kinds: a property over a domain, an expected value from a named independent oracle, and a scripted scenario. The kit should flag a test whose expected value was produced by running the code under test.

## Open for M3

- Whether a Grammar construct for invariants and properties belongs in the Definition API.
- Whether range analysis (backlog) moves up once LIR exists; it is the first analysis that turns these guarantees into diagnostics.
