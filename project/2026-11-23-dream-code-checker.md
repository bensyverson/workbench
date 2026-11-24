# A dream-code checker

*2026-11-23 · design idea, with Ben · input to M3 (the kit and its workflow). Nothing is built yet.*

**The idea.** In the kit's workflow ([proposal §13](2026-11-23-workbench-kit-proposal.md)), phase 1 writes example programs in the language the model intends: the "dream code." Phase 2 then derives the dialect and grammar from them. The fastest iteration is on the dream code itself, but today nothing checks it until a dialect exists. A dream-code checker closes that gap. It checks the examples against *themselves*, in seconds, so the model (or Ben) can iterate with the checker in the loop.

## What it can and cannot verify

| Question | Who answers it |
|---|---|
| Is it valid JS, inside the runtime subset? | The checker, mechanically |
| Is it consistent with itself: names, shapes, types, how constructs are used? | The checker, mechanically |
| Does it read well, and is it the right design? | A person or a reviewing model. This is the only part left to judgment |

## Evidence that consistency is the common failure

Ben's first dream code for the whack-a-mole language (the program `whack-fluent` was imagined for, from which the DMG presets descend) has these, all findable without a dialect:

- **`Mole.bake` sets `self.stay`, which no `.attr` declares**, and `pop` reads it. It is unclear whether this is an undeclared attribute or a build-time-only field.
- **The board is reached three ways:** `w.board.moles.filter(…)`, `w.board.at(e.cell)` and `ctx.grid.step(…)`.
- **`emit` means two things:** `ctx.emit("whack", { cell })` raises an event, and `w.emit("sfx", "hit")` plays a sound, which is never declared.
- **`const m = w.board.at(e.cell); if (m.up)` uses a lookup that can miss without checking it** (L008).
- **One object has two names:** component lambdas take `ctx`, the game's take `w`.

## How it would work, from existing parts

1. **Parse and check the subset.** `checkSubset` needs no types; it works on dream code today.
2. **Harvest the grammar.** The fluent chain is executed, not parsed, so the examples can be run against a recording proxy that accepts any call and logs it. That yields every construct, slot, argument shape and lambda arity. The checker reports where examples disagree. This is Candela's symbolic-proxy trick ([passes, queries and several IRs](2026-11-23-passes-queries-and-several-irs.md)) applied to the grammar instead of the math.
3. **Build a provisional environment from the examples' own declarations.** `.attr("ttl", { type: "u8" })` is a real type, so an undeclared `self.stay` or a typo `self.tll` is caught.
4. **Lower every runtime lambda in an "open world" mode.** An unknown member on the world or context is recorded rather than rejected. The record becomes an **intrinsics wishlist**, with signatures inferred across call sites by joining them (for example `grid.step(u8, f64, f64)`, used twice, consistent; `emit(str, struct)` against `emit(str, str)`, a conflict).
5. **Report fast enough to run on every edit.**

The wishlist then turns phase 2 into implementing a list that has been checked, rather than designing the dialect from memory.

## What is new

One capability: lowering against a partial, growable environment rather than a complete dialect. The parser, the subset check, lowering and the call-site join exist or are planned. The harvesting proxy is new but small.

## Where it fits

M3, alongside H4 (declaring the DMG grammar as constructs and slots): the harvested grammar skeleton is the starting point a dialect author fills in. It may be the strongest argument for the kit's workflow over the DMG's: dream code that talks back. Parked in [the backlog](backlog.md) until M3 is planned.
