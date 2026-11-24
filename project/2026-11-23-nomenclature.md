# Nomenclature: the kit's terms

*2026-11-23 · decision, with Ben · the living list is [kit/glossary.md](../kit/glossary.md); this doc records the ruling and why.*

**Ruling.** Ben locked in the terms in the glossary, and asked that they be capitalized when used as terms. **Dream Code** is now an official term, not a notional one. Earlier project docs (the proposal, the M1 plan and findings) are point-in-time records and are not rewritten. Where they use a word loosely, the glossary wins.

## What changed, and why

| Was | Now | Why |
|---|---|---|
| "Domain" for both the subject area and what a kernel runs over (proposal §5.2, the `Kernel.domain` field, `.domain(…)` in §8.1) | **Domain** = the subject area; **Iteration Space** = what a Kernel runs over | Both senses appeared in the same sentences |
| `Dialect`, lowering's description object (`kit/lower/dialect.d.ts`) | **Environment** | It holds one Program's components and attributes, so it is per Program, not the Dialect |
| The DMG's "IR" | **DMG Spec** | Keeps "IR" for ours alone |
| "Grammar" for the construct declarations and for a whole language ("the DMG grammar") | **Grammar** = construct and slot declarations only; the whole is the **Domain Language** | |
| "Workbench" for the product and for the `Workbench(…)` file | The file is the **Workbench Declaration** | |
| No name for the kit's builders that define a language | **Definition API** | Nobody writes Programs in it, so "API" rather than "language" |
| No name for a Dialect plus Grammar | **Language Definition**: Dialect + Grammar + Library | It is the artifact one Domain Language comes from |
| "Core IR" and "lower IR stages" | **IR** and **LIR** | LIR is the conventional name for a low-level IR (SpiderMonkey's MIR → LIR) and does not collide with LLVM, whose levels are LLVM IR and MIR. Avoid MIR (LLVM's and Rust's), HIR (Rust's) and MLIR |

The Runtime Subset keeps its name.

## The flow, in these terms

```
Dream Code ──designer derives──▶ Language Definition (Dialect + Grammar + Library)
    │                                    │  written with the Definition API
    └── becomes ──▶ Programs ────────────┴──▶ IR ──▶ (LIR) ──▶ JS · GLSL · wasm · …
```

## Follow-up

The two code renames (`Dialect` → `Environment` in `kit/lower`, and `Kernel.domain` → an Iteration Space field) are filed in `job` as one leaf. Until they land, the glossary notes the old names.
