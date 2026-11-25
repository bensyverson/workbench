# Particles and per-slot effects: the plan

*2026-11-24. Imported into `job` under `As6TAt` (M3: Kit v0) the same day; the tracker holds the live state.*

## Why

The stateful fresh-agent run (`3Cd9hb`, the real H5 test) needs a domain whose lambdas have effects, since the data Dialect's lambdas are all pure. **Ben ruled (2026-11-24): particles.** But the Definition API has no effects: every space must be pure (`D012`), and "effects, store rules, `emit`" are listed as not built in `kit/define/README.md`. The M3 plan deferred effect verbs to this domain.

## The framing (Ben, 2026-11-24)

Manuel's prompt splits a workbench in two: build-time composition, a fluent builder of components with an IR, and runtime behavior that "can be more direct (say, mutations)". For particles, a component's runtime owns the particle arrays, and a lambda is a callback that mutates the particle it is handed and calls verbs on it (`p.kill()`). So effects are not a general effect system to design. They are what a runtime callback may touch, set per slot by the component:

- writes to its own object's members (`p.vel = …`)
- a destroy verb (`kill()`)
- spawn
- rng

The Dialect says, per slot convention, which of these its lambda may have ("`update` may write `p` and kill it; `rate` is pure"), and lowering refuses anything else (a write to another particle or a global). That lifts "every space must be pure" only as far as particles need, reusing the effect kinds the IR already records for the DMG (`read`, `write`, `rng`, `emit`, `call`). Fragments stay out unless the trial asks for them.

**Ben ruled (2026-11-24): draft, dogfood, build, then run**, the path the rest of the API took (the AGENTS.md dogfood ruling).

## Order

1. **The particles Dream Code sheet**, written like the budget sheet (`scripts/api-pilot/docs/dream-code.md`) by an agent that knows what the kit can express; its readers are blind. It is the fixed spec for both the trial and the H5 run, so the hidden programs can be written blind from it early.
2. **The draft**: per-slot effects as a short addition to the draft API, from the IR's effects and the DMG lowering's store rules.
3. **The dogfood trial**: three fresh agents, one per tier, build particles from the draft; review by hand, change the design, rerun if needed.
4. **Build and document**: kit/define, then API.md (the pair stays under 8,000 tokens).
5. **The H5 run** (`3Cd9hb`), on particles, with the blind hidden set.

```yaml
tasks:
  - title: Particles Dream Code sheet and blind hidden programs
    ref: sheet
    desc: |
      Why: the fixed spec for the per-slot effects trial and for the H5 run (3Cd9hb). Ben ruled particles as the stateful domain (2026-11-24); project/2026-11-24-particles-effects-plan.md.

      What: scripts/particles/docs/dream-code.md, a one-page sheet in the budget sheet's style (scripts/api-pilot/docs/dream-code.md): the builder surface (a particle system, emitters with rate and spawn lambdas, forces, an update lambda, bounds, params as sliders), what each lambda may mutate (its own particle; kill; spawn; rng), the meaning, and the refusals (a write to another particle or a global, a kill from a pure slot, a non-number velocity …). Written by an agent with no kit knowledge (copy only the budget sheet into a scratch dir outside the repo, per project/gotchas.md "a subagent launched in the repo cannot be blind"). Then a second agent that saw only the sheet writes hidden accept and reject programs, and a third lists what the sheet leaves open; one revision settles it, as the budget sheet was.

      Out of scope: the reference implementation (it needs the built API).
    criteria:
      - The sheet exists and both blind readers' open questions are settled in one revision
      - Hidden accept and reject programs exist, each reject naming its expected refusal
  - title: Draft per-slot effects for the Definition API
    ref: draft
    blockedBy: [sheet]
    desc: |
      Why: particles' lambdas mutate their particle and kill it; the Definition API forbids every effect (D012). Ben ruled draft, dogfood, build, run (2026-11-24); the framing is in project/2026-11-24-particles-effects-plan.md.

      What: a short addition to the draft API (the define-trial packet style, scripts/define-trial/docs/api-draft.md) that lets a slot convention declare which effects its lambda may have: writes to its own object's members, a destroy verb, spawn, rng. Lowering refuses any other effect with a fixit. Reuse the IR's effect kinds (kit/ir/README.md: read, write, rng, emit, call) and the DMG lowering's store rules (kit/lower) rather than inventing new ones; say what the IR already carries and what it lacks. Include how the particles sheet would be written with it, as a sketch, and the rules a checker can enforce.

      Open: whether spawn is a verb in a lambda or a component's own job (an emitter's rate); whether a write to own members needs per-member permission. The draft agent's call, stated with the reason; anything architectural goes to Ben.
    criteria:
      - A draft doc and a particles sketch exist, naming every new D, B or L code
  - title: Dogfood trial of per-slot effects on particles
    ref: trial
    blockedBy: [draft]
    desc: |
      Why: the AGENTS.md dogfood ruling: fresh agents use the draft before it is frozen. Ben ruled draft, dogfood, build, run (2026-11-24).

      What: three fresh agents, one per tier (Opus, Sonnet, Haiku), each build particles from the draft and the sheet, under a strict rule set a checker enforces where it can. Review their output by hand; record difficulty, what misled them, what they guessed, and the size of the massage. Change the design, then rerun if the change is large. Findings go in a dated doc like project/2026-11-24-definition-api-trial-3.md.
    criteria:
      - The findings doc records each agent's tier, difficulty, guesses and massage, and the design changes made
  - title: Build per-slot effects in kit/define and document them in API.md
    ref: build
    blockedBy: [trial]
    desc: |
      Why: the H5 run (3Cd9hb) builds particles from START.md and API.md alone.

      What: the revised design, built with strict TDD in kit/define and kit/lower, the fields and data Dialects unchanged; a reference particles implementation that passes every hidden program; API.md and START.md updated, the pair under 8,000 tokens (count_tokens, scripts/api-pilot/count-tokens.js). Independent review before the H5 run builds on it.
    criteria:
      - The reference passes every hidden particles program with the scorer
      - START.md + API.md measure under 8,000 tokens, with the command stated
      - A fresh reviewer's findings are fixed or filed
```
