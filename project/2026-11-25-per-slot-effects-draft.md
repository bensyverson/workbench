# Per-slot effects: the draft

*2026-11-25, leaf `EZex6F`. The packet the dogfood trial (`Tc0QRH`) hands agents is [`scripts/define-trial/docs/api-effects.md`](../scripts/define-trial/docs/api-effects.md), an addition to `api-draft.md`. This page holds what the packet leaves out on purpose: why each choice was made, what the IR already carries and what it lacks, the particles sketch (kept out of the packet, since the trial builds particles), the rules a checker can enforce, where the particles sheet asks for more than the draft gives, and the host-import shape for Ben to confirm. The framing is [the particles effects plan](2026-11-24-particles-effects-plan.md) plus the rulings on `EZex6F`.*

## The design in five lines

1. A space is **pure** or an **instance space** (`instance: "Particle"`): each lambda in it is handed one instance and may change that one only.
2. A slot convention lists its allowed effects in **`may`**, as IR effect strings with prefix match (`"write Particle"`, `"destroy Particle"`, `"bump Counters"`, `"rng"`, `"read Counters"`). Every other effect is L004.
3. **Own-instance is enforced by reachability, not by tracking instances:** the Dialect is refused (D022) if anything but an instance space's slot parameter can give a lambda a value of the instance type. Then every `write Particle.x` a lambda can make is to its own particle, and the IR's type-level effects (`write Particle.vel`) are enough.
4. **Shared state is the host's**, with one exception a lambda may touch: a **total** (`bump: true`), changed only by `+=` / `++` statements, never read and bumped in one slot (D021). That is the particles sheet's counter.
5. **Verbs are host objects' members** with declared `effects` (`p.kill()` is `destroy Particle`, `rng()` is `rng`). Intrinsics stay pure, and the Dialect author vouches for that.

## Decisions, with the reason

- **Allow-list, not deny-list.** The lowering's slot declaration today carries `forbid: EffectVerb[]` (DMG: render forbids every state change). A Definition API Dialect lists what is allowed instead, because the default must stay pure: a slot that says nothing may do nothing, so every Dialect written against the current draft (fields, data) keeps its meaning unchanged. `forbid` stays in the Environment for the hand-written DMG; the define layer generates `may` and lowering checks both.
- **Per-member permission: yes.** The sheet needs it (a force writes `p.vel` only), and it costs nothing: `write Particle.vel` is the effect string the IR already records, so a member-level pattern is the same mechanism as an object-level one. Read-only members (`age`) need no rule at all: no `write: true`, so L013, as a baked constant is today.
- **Spawn is the component's job, not a verb.** The settled sheet has no spawn from a lambda ("particles come only from emitters"), and a lambda that creates an instance changes shared state (the pool, its order, its cap), which breaks rule 1. The IR's `spawn` verb stays for DMG and for a later run-once space. An emitter's `rate` is a pure lambda that returns a number; the host spawns.
- **Reads of state are effects too, and gated.** The IR records `read Owner.name` for a place something can change. The sheet needs this: rate reads counters, update must not. In an instance space the instance's own members are readable without listing (they are its own); anything else that changes (a total) must be in `may`. Read-only places (uniforms, `p.age`) record no read, so fields and data are untouched.
- **A total cannot be read and bumped in one slot (D021).** That is what makes the order the host runs instances in invisible to every lambda, which is the whole point of rule 2; the sheet's "every rate reads the counters as they stood when the tick began" then follows from the host bumping during the tick and the rate reading a snapshot. The kit does not need to know about ticks.
- **Bumps only `+=` and `++`.** `-= x` is `+= -x`; refusing it costs the author nothing and matches the sheet (R23). `=` would make order visible.
- **Helpers are read-only by default**, with `helpers: { may: [...] }` to narrow the reads. A helper's effects count at every call (lowering already adds a callee's effects to the caller's), but the sheet wants a kill in a helper refused even when only update calls it (R6), and a counter read in a helper refused even from a rate (R24). Read-only by default gives R6; `helpers: { may: ["read Particle"] }` gives R24.
- **Intrinsics stay pure in this draft** (`effects` on one is D021). An effectful intrinsic has no honest `ref`: `rng` needs the host's seeded stream, a sound needs a speaker. Those become host imports (below), not built here. Particles needs none: its `rng` is a slot parameter, an object the host hands in, as DMG's `w.rng` is.
- **The float-bump question (handoff, "For Ben's eyes" 1): answered by the target's compare mode.** A total is added in the reference interpreter's order (the space's run order). A target compared `exact()` must keep that order; a target compared within `tolerance()` may reorder. That reuses the existing per-target `compare` instead of inventing an integer type or a whole-number check the kit cannot make statically (`counters.x += p.size`). The sheet's "`+=` any number expression" stands. Two-way door: if a parallel target ever needs exact reordering, add a `bump: "whole"` that the host checks at run time.
- **The fourth shared-state category (a per-key ordered log, the outbox): parked.** The app-DSL probe found it is a property of the host's outbox, not of any lambda, so it needs no slot rule ([app-DSL probe](2026-11-24-app-dsl-probe.md), "What this means for per-slot effects"). It would arrive as `emit`, with the host owning the log.
- **`emit` is not in this draft.** The IR has it (DMG events); no particles lambda needs it, and the app probe's "commands as values" can be modeled later as `emit <channel>` with a payload. Listed under "not built" in the packet.

## What the IR carries, and what it lacks

Carries, unchanged:

- The effect kinds: `EffectVerb` already holds `read`, `write`, `rng`, `destroy`, `spawn`, `emit`, `call` and the DMG-only ones ([`kit/ir/ir.d.ts`](../kit/ir/ir.d.ts)). Every statement records its effects and the kernel sums them; V007 and V008 check that.
- A verb as a method with effects: DMG's `self.destroy()` is `fn([], VOID, ["destroy Mole"])`, exactly the shape `p.kill()` needs.
- A callable object: `ObjectDecl.call` (the HUD's `at(c, r)`) with an `FnSig`, which carries `effects`, so `rng()` on an `Rng` object needs nothing new in the Environment.
- A callee's effects counted at the call (helpers and methods), and L004 for a slot-forbidden effect with a tip.

Lacks:

1. **A bump.** No verb and no statement accumulates. Add the verb `bump` and a statement `bump place, value` (f64 only), recorded `bump Owner.name`; V007 learns it, the interpreter adds into a total the host provides, the JS backend emits `+=` on the host's object. A plain `store` of `read + v` would be wrong: it reads, which D021 forbids, and it makes order visible.
2. **A store rule for a vector place, and one that does not throw.** `Coerce` has no vector type, and its `f64` rule throws on a non-finite value ([`kit/interp/coerce.js`](../kit/interp/coerce.js)), which would stop an update mid-body and lose its later bumps. The sheet removes a particle with a non-finite field after the tick. Add a rule `value`: store unchanged, no check. A define-API `write: true` member gets it; DMG keeps its rules.
3. **Instance identity.** Effects are per type (`write Particle.vel`), not per instance. Nothing new is needed, because D022 makes the type-level effect mean "own instance"; the IR stays as it is.
4. **Run order.** A kernel does not say what order its space runs in. That is the host's (the sheet's "oldest first"); the interpreter follows whatever order the harness gives it, and the compare mode decides whether a target may differ.
5. **An allow-list on the slot.** `SlotDecl` has `forbid` only. Add `may?: string[]` (patterns) to the Environment's `SlotDecl`; lowering checks every effect against it when present.

## The particles sketch

How the settled sheet ([dream-code.md](../scripts/particles/docs/dream-code.md)) would be declared. A sketch: names and shapes follow the packet; the sheet's refusal numbers and text view are left out.

```js
import { defineDialect, defineGrammar, vector, exact, name, ref, data, lambda, listOf } from "kit/define";

export const particlesDialect = defineDialect({
  name: "particles",
  numberType: "f64",
  types: { vec2: vector(2, "f64") },
  spaces: {
    emit: { pure: true },                      // rate: reads counters, changes nothing
    particle: { instance: "Particle" },        // spawn, force, update: one particle each
  },
  objects: {
    Particle: { label: "a particle (p)", members: {
      pos: { value: "vec2", write: true }, vel: { value: "vec2", write: true },
      life: { value: "f64", write: true }, size: { value: "f64", write: true },
      age: "f64",                                                    // the host's alone
      kill: { fn: { params: [], returns: "void" }, effects: ["destroy Particle"] },
    } },                                                            // environment adds each .field as { value: "f64", write: true }
    Rng: { label: "spawn's rng", call: { params: [], returns: "f64" }, effects: ["rng"] },
    Counters: { label: "the counters", members: {} },              // environment adds each .counter as { value: "f64", bump: true }
    Params: { label: "the params ($)", members: {} },
    Math: { label: "Math", members: { min: { fn: { params: ["f64", "f64"], rest: "f64", returns: "f64" } }, /* max, abs, sqrt, floor, sin, cos, PI */ } },
  },
  globals: { counters: "Counters", $: "Params", Math: "Math" },
  intrinsics: { length: { params: ["vec2"], returns: "f64", ref: (v) => Math.hypot(v[0], v[1]), spell: { js: "Math.hypot($0[0], $0[1])" } } },
  targets: { js: { accepts: "*", compare: exact() } },
  slots: {
    rate:   { params: ["f64", "f64"], returns: "f64", space: "emit", may: ["read Counters"] },
    spawn:  { params: ["Particle", "Rng", "f64"], returns: "void", space: "particle", may: ["write Particle", "rng", "bump Counters"] },
    force:  { params: ["Particle", "f64"], returns: "void", space: "particle", may: ["write Particle.vel"] },
    update: { params: ["Particle", "f64"], returns: "void", space: "particle", may: ["write Particle", "destroy Particle", "bump Counters"] },
  },
  helpers: { may: ["read Particle"] },
  params: { object: "Params", name: "$" },
  environment(program) {
    const field = Object.fromEntries(Object.keys(program.field ?? {}).map((n) => [n, { value: "f64", write: true }]));
    const counters = Object.fromEntries(Object.keys(program.counter ?? {}).map((n) => [n, { value: "f64", bump: true }]));
    const params = Object.fromEntries(Object.keys(program.param ?? {}).map((n) => [n, "f64"]));
    return { objects: { Particle: { members: field }, Counters: { members: counters }, Params: { members: params } } };
  },
  text(state) { /* the sheet's header, counters line and 40 x 20 grid */ },
});

export const particles = defineGrammar(particlesDialect, {
  root: "particles",
  params: { slot: "param" },
  constructs: {
    particles: { opens: [name()], slots: {
      param:        { kind: "decl", args: [name("param"), data({ value: "number", min: "number", max: "number" })] },
      bounds:       { kind: "decl", args: [data({ width: data("number", { min: 1, max: 4096 }), height: data("number", { min: 1, max: 4096 }) })], once: true, required: true },
      maxParticles: { kind: "decl", args: [data("number", { min: 1, max: 10000, whole: true })], once: true, required: true },
      tick:         { kind: "decl", args: [data("number", { min: 0.001, max: 1 })], once: true },
      seed:         { kind: "decl", args: [data("number", { min: 0, whole: true })], once: true },
      field:        { kind: "decl", args: [name("field"), data({ value: "number" })] },     // + a check refusing pos, vel, age, life, size, kill
      counter:      { kind: "decl", args: [name("counter")] },
      force:        { kind: "decl", args: [name("force"), lambda("force")] },
      update:       { kind: "decl", args: [lambda("update")], once: true },
    } },
    emitter: { parent: "particles", required: true,
      opens: [name(), data({ x: "number", y: "number", maxRate: data("number", { min: 0 }), "forces?": listOf(ref("force")) })],
      slots: {                                                     // + a construct check: inside the bounds, no force listed twice
        rate:  { kind: "decl", args: [lambda("rate")], once: true, required: true },
        spawn: { kind: "decl", args: [lambda("spawn")], once: true, required: true },
      } },
  },
});
```

The sheet's per-lambda table maps straight onto `may`: rate reads counters; spawn writes `p` (not `age`, which is read-only), draws `rng`, bumps; a force writes `p.vel` only; update writes `p`, kills, bumps. D022 holds: only the three particle slots take a `Particle`, and nothing in the Dialect returns one.

**The host** (the tick loop, the particle store, `kill`, `rng`, the counters and the text view's state) is a foreign JS module in Ben's ruling's terms (2): trusted, JS-only. The Dialect declares its interface (the objects above); the reference interpreter calls it. Writing it in Bench is a later choice, open once host imports exist.

## Where the sheet asks for more than the draft gives

The particles sheet is stricter than safety needs in a few places. Under this draft these refusals have no kit code, and a Dialect cannot add one, because a Dialect's checks see builder calls, not lambda bodies:

- **R2's alias** (`const q = p`, refused even unwritten) and **R7's stored or passed `rng`** (`const r = rng`, `helper(rng)`). Under D022 an alias cannot widen any effect, and a helper handed `rng` cannot call it (helpers are read-only, L004). The safe part is enforced; the "never bind it to a name" part is not.
- **The precedence rules** ("Which number"): the kit gives its own codes (L004, L013, L017 …) and one diagnostic per mistake in its own order. Mapping kit codes to sheet numbers is the implementer's, as in the pilot.
- **R21's syntax list**: the kit's Runtime Subset is wider than the sheet's (it has `for…of`, destructuring, strings). The sheet's narrower subset needs a Dialect-level syntax restriction the API does not have.

Options, for Ben: (a) leave them as the trial's gaps and see whether agents need them; (b) add a Dialect hook that sees a lambda's IR (the app-DSL probe's informed design wanted one for cross-lambda checks too); (c) loosen the sheet to what the kit enforces. **Recommendation: (a)**, and decide after the trial. Loosening the sheet would invalidate hidden programs written blind.

## Rules a checker can enforce

For the trial's rules.md, in its style (each names the codes that enforce it):

- **R4 (widened). Every space is pure or an instance space,** every slot convention names a declared space, every target accepts declared spaces only. (D005, D006, D008, D012)
- **R4b. Every effect is declared and lands only where it may.** Each slot's `may` names real verbs, objects and members; writes and verbs stay in their object's instance space; nothing else can hand a lambda an instance; no slot reads and bumps one total; intrinsics have no effects. (D021, D022)
- **R7 (widened).** Every exported Program lowers clean, effects included: no effect outside its slot's `may`, no write to a member that is not writable, totals changed only by `+=` and `++` statements. (L004, L013, L017, plus the existing codes)
- **R8 (narrowed).** "No effects" becomes "no effects outside this page": no spawn from a lambda, no `emit`, no effectful intrinsic, no write outside the instance. (D021, D022; the rest by hand)
- **C-level, by the checker:** each hidden reject's declared sheet number is printed beside the kit code the candidate gave, so the hand review can see the mapping; it gates nothing (the scorer's declared-code tally, leaf `Mv42ME`).

## New codes

| Code | Kind | Meaning |
|---|---|---|
| D012 | widened | a space with neither `pure: true` nor `instance`, or with both |
| D021 | new | a malformed effect declaration (unknown verb, object or member in `may`; a non-read in a pure space or in `helpers`; `bump` outside an instance space or of a non-total; `write` of a non-writable member; read and bump of one total in one slot; `write` with `bump`, or either on a non-value; `effects` on an intrinsic) |
| D022 | new | an instance reachable other than by its space's slot parameter, or a write or destroy outside that object's instance space |
| L004 | widened | an effect the slot's `may` does not allow (own or through a helper); the tip lists the slot's `may` |
| L013 | unchanged | a write to a member that is not writable, or to part of a vector member |
| L017 | new | a total changed other than by `+= <number>` or `++` as a statement, or a bump used as a value |
| V007 | widened | learns the `bump` verb and statement |

No new `B` code: effects are judged when lambdas are lowered, not while the Program is built.

## Host imports: the shape, for Ben to confirm

Not in the packet and not for the particles trial; the notes on `EZex6F` asked the draft to settle the shape anyway. Proposal:

```js
imports: {
  play: { params: ["str"], returns: "void", effects: ["emit audio"],
          impl: { bench: "(name) => …" } },                     // Bench code: lowered, checked against `effects`, every target
  fetchJson: { params: ["str"], returns: "Request", effects: [],
               impl: { js: "./hosts/net.js" } },                 // a foreign module: trusted, JS and in-page wasm only
}
```

- An **import** is an effectful operation with a declared signature and effects. A lambda calls it by name like an intrinsic; its effects are gated by `may` like a verb's; its spelling on every target is "call import `name`", so no Dialect writes per-target glue.
- **An implementation per target, or one in Bench for all.** A Program that calls an import with no implementation for some target gets a capability refusal for that target, naming the import (as GLSL refuses what it cannot compile today).
- **From the declarations the kit generates** the JS host interface (`.d.ts`), the wasm import table, a C header, and a recording stub for the reference interpreter, so the harness compares the sequence of host calls across targets without real I/O. The interpreter calls a foreign JS module directly, so JS and wasm still compare.
- **Async never enters a lambda:** a network call is a request value (`Request`) a pure builder returns, and the host runs it; its effects are `[]`. Long-running work is the same.
- **A build-time fact** (`.music("song.mid")`) is in the Program record, which the host reads; no import, no codegen.
- Precedent: form-skate's `Form.plugin` declares `.reads`, `.writes` and a `.tick` per system; its World is arbitrary JS, which is why it is JS-only, the gap the Bench implementation closes.

**Open for Ben:** whether `imports` is its own key (as above) or an intrinsic with `effects` and `impl` in place of `ref` and `spell`. The separate key keeps "intrinsics are pure" a one-line rule; the merged form is one less concept. Recommendation: the separate key.

## For Ben's eyes

1. The float-bump answer: the target's compare mode decides whether totals may be reordered (above). A two-way door.
2. The sheet's alias, stored-`rng` and syntax-list refusals have no kit code under this draft; recommendation (a), decide after the trial.
3. Host imports: separate `imports` key or effectful intrinsics; recommendation the separate key. Not needed for particles or H5.
