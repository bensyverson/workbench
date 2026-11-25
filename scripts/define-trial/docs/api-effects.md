# Per-slot effects (draft addition)

*Draft for review, 2026-11-25. An addition to `api-draft.md`: where the two disagree, this page wins. **Nothing on this page is built yet**; the checker will run it once it is. You are being asked to use it and say where it fails you.*

`api-draft.md` says every space is pure: a Runtime Lambda may read and compute, never change anything. This page lifts that as far as a lambda that is **handed one object and may change only that object** needs, and no further: a particle's update that moves its particle and kills it, a plant's grow step that changes its height. The Dialect says, per slot convention, which effects its lambda may have; lowering refuses every other effect, naming it.

Three rules hold everything below:

1. **A lambda changes only the instance it is handed.** It writes that object's members and calls its verbs (`p.kill()`). It never reaches another instance: the kit refuses a Dialect where it could.
2. **Shared state is the host's.** A lambda may *bump* a shared total (`counters.hits++`), which commutes, and nothing else shared. The host owns everything else that is shared and runs it.
3. **Every effect is declared.** An effect is in the slot's `may` list, or the lambda is refused.

## Effects

An **effect** is one of these, written as a string. They are the effect kinds the kit's IR already records, plus `bump`:

| Effect | What | Written by a lambda as |
|---|---|---|
| `read Obj.member` | reads a member that something can change (writable or bumped) | `p.vel`, `counters.hits` |
| `write Obj.member` | replaces a writable member | `p.vel = …`, `p.size += 1` |
| `destroy Obj` | calls a verb declared with this effect | `p.kill();` |
| `rng` | draws a random number from the host's seeded stream | `rng()` |
| `bump Obj.member` | adds to a shared total | `counters.hits += 2`, `counters.hits++` |

Reading a read-only member (one nothing can change, like `p.age` or a uniform) is no effect at all.

In a `may` list, a pattern matches every effect with its verb whose target is the same or inside it: `"write Plant"` matches `write Plant.height` and `write Plant.water`; `"read"` matches every read; `"rng"` matches `rng`.

## `spaces`

A space is now one of two kinds. Each has exactly one of these keys (D012):

```js
spaces: {
  weather: { pure: true },           // reads and computes; may read what its slots' `may` lists, changes nothing
  plant: { instance: "Plant" },      // each lambda here is handed one Plant, and may change that Plant only
}
```

- **`pure: true`**: as before. A slot in a pure space may list only reads in `may` (D021).
- **`instance: "Obj"`**: an **instance space**. Every slot in it takes an `Obj` as a parameter, exactly once (D022), and may read every member of that `Obj` without listing it. `write Obj…` and `destroy Obj` may appear only in the `may` of a slot in a space whose instance is `Obj` (D022): that is how "only the instance it is handed" is enforced.
- **Nothing else can hand a lambda an `Obj`** (D022): no member, method result, global, list item, struct field or intrinsic result anywhere in the Dialect has type `Obj`, and only instance spaces' slots take one. A helper may take one, because the only `Obj` it can be given is its caller's. So a lambda cannot reach a second instance to change it, and aliasing (`const q = p`) cannot widen anything.

## Objects: writable members, verbs, totals

```js
objects: {
  Plant: { label: "a plant (pl)", members: {
    height: { value: "f64", write: true },                      // writable: a slot may write it if its `may` says so
    water:  { value: "f64", write: true },
    age:    "f64",                                              // read-only, as before: never written by a lambda
    wilt:   { fn: { params: [], returns: "void" }, effects: ["destroy Plant"] },   // a verb
  } },
  Rng: { label: "the random stream (rng)", call: { params: [], returns: "f64" }, effects: ["rng"] },
  Totals: { label: "the garden's totals", members: {} },         // environment(program) adds { value: "f64", bump: true } per total
},
globals: { totals: "Totals" },
```

- **`write: true`** on a value member makes it writable. A write replaces the whole member: `pl.height = 2`, `pl.height += dt`, and for a vector `p.vel = vec2(0, p.vel.y)` (a component write such as `p.vel.x = 0` is refused, L013). A write to a member without `write: true` is L013, as before.
- **`effects: [...]`** on a `fn` member (a verb), or beside an object's `call` (an object a lambda calls, like `rng()`), lists what calling it does. Each effect must be one the slot's `may` allows. A verb returns `void`; call it as a statement.
- **`bump: true`** on an `f64` value member makes it a **total**. A lambda changes it only with the statement `obj.member += <number>` or `obj.member++` (L017 for `=`, `-=`, `--`, or a bump used as a value: `x = totals.hits++`). No slot may both read and bump one total (D021), so whatever order the host runs instances in, no lambda sees another's bump.
- `write` and `bump` together, or either on a member that is not a `value`, is D021.

Who implements a verb, `rng()` and the totals: **the host**, the program that runs your Programs. These objects are values the host hands each lambda; `p.kill()` asks the host to remove `p`, and the host decides when. The kit records each call's effects, refuses the ones a slot may not have, and the reference interpreter calls the host's objects.

## `slots`: `may`

```js
slots: {
  rain:  { params: ["f64"], returns: "f64", space: "weather", may: ["read Totals"] },
  grow:  { params: ["Plant", "f64"], returns: "void", space: "plant",
           may: ["write Plant", "destroy Plant", "bump Totals"] },
  sow:   { params: ["Plant", "Rng"], returns: "void", space: "plant", may: ["write Plant.water", "rng"] },
}
```

- `may` is a list of effect patterns; absent, it is `[]`. Every effect a lambda has, its own or through a helper it calls, must match one (L004, whose message names the effect and the slot, and whose tip lists the slot's `may`).
- A pattern with an unknown verb, an object or member that does not exist, a `bump` of a member that is not a total, a `write` of one that is not writable, or a `read` and `bump` of one total in one slot is D021. A `write` or `destroy` outside an instance space of that object is D022. A `bump` is allowed only in an instance space (D021): a pure space changes nothing.
- A convention function returns `may` like any other key, so it may depend on the Program or on where the lambda sits.

## Helpers

A helper's effects count at every call, as if its body were written there. By default a helper may only read (`may: ["read"]`), so a verb, a write, `rng()` or a bump inside a helper is L004 at the helper, even when every caller could do it. A Dialect may narrow this:

```js
helpers: { may: ["read Plant"] },   // a helper may read a plant passed to it, and nothing else that changes (not a total)
```

`helpers` takes only `may`, and only reads (D021).

## Intrinsics stay pure

An intrinsic has no `effects` (D021). **You vouch that every intrinsic is pure:** its `ref` and every spelling compute a value from their arguments and change nothing; the kit cannot inspect them, so an intrinsic that writes a file or plays a sound breaks every guarantee on this page unseen. An operation with an effect is a verb on an object the host hands the lambda, declared with `effects`. (Effectful intrinsics that every target can call, host imports, are designed but not in this draft.)

## The order a total is added in

A total is added in the order the host runs the instances, which the reference interpreter follows. Totals of whole numbers come out the same in any order. Totals of fractions may not, by a rounding step: a target compared `exact()` must add them in the reference order; a target compared within a `tolerance()` may add them in any order.

## What is still not built

A lambda that spawns a new instance (instances come from the host or from the Program's constructs, such as an emitter's rate); writes outside the instance the lambda is handed, other than a bump; spaces whose code runs once and may write freely; `emit` (a message to the host); effectful intrinsics. Anything here that you need is a gap to report, not API to invent.

## Codes

| Code | Refused when |
|---|---|
| D012 | a space with neither `pure: true` nor `instance`, or with both (widened) |
| D021 | a malformed effect declaration: an unknown verb, object or member in `may`; a non-read in a pure space's slot or in `helpers`; a `bump` outside an instance space, or of a member that is not a total; a `write` of a member that is not writable; one slot that may both read and bump a total; `write` and `bump` on one member, or on a member that is not a `value`; `effects` on an intrinsic |
| D022 | an instance that could reach a lambda another way, or a change to an object outside its instance space: a member, method result, global, list item, struct field or intrinsic result of the instance's type; a slot outside the instance space that takes one; a slot in it that takes none or two; `write` or `destroy` of an object in a slot whose space's instance is not that object |
| L004 | an effect the slot's `may` does not allow, the lambda's own or through a helper (widened from "a verb the slot forbids") |
| L013 | a write to a member without `write: true`, or to part of a vector member (as before, for a place that is not writable) |
| L017 | a total changed other than by the statement `+= <number>` or `++`, or a bump used as a value |
