# Per-slot effects

Read this when a lambda must change something: write a member, destroy its object, draw a random number or add to a total.

A slot that says nothing may change nothing. To let a lambda change **the one object it is handed**, run its slot in an **instance space** and list what it may do in `may`:

```js
spaces: { weather: { pure: true }, plant: { instance: "Plant" } },   // each plant lambda gets one Plant, changes only it
objects: {
  Plant: { label: "a plant (pl)", members: {
    height: { value: "f64", write: true },                            // writable; "f64" alone is read-only (L013)
    wilt: { fn: { params: [], returns: "void" }, effects: ["destroy Plant"] },   // a verb: call it as a statement
  } },
  Rng: { label: "rng", call: { params: [], returns: "f64" }, effects: ["rng"] }, // a callable object: rng()
  Totals: { label: "totals", members: { grown: { value: "f64", bump: true } } }, // a total: only `+= <any f64 expression>` and ++ statements
},
slots: {
  rain: { params: ["f64"], returns: "f64", space: "weather", may: ["read Totals"] },
  grow: { params: ["Plant", "f64"], returns: "void", space: "plant", may: ["write Plant", "destroy Plant", "bump Totals"] },
},
helpers: { may: ["read Plant"] },   // the default: helpers only read instance objects
```

- **Effects** are `read Obj.m` (of a writable member or total), `write Obj.m`, `destroy Obj`, `rng`, `bump Obj.m`. A pattern covers what is inside it: `"write Plant"` allows `write Plant.height`. Reading a read-only member is no effect. A slot in an instance space may always read its own instance.
- **Only instance spaces change anything.** A `write` or `destroy` of `Obj` belongs only in a slot of the space `{ instance: "Obj" }`, which takes one `Obj` parameter, once, and in the `effects` of `Obj`'s own verbs. Nothing else in the Dialect may hold or return an `Obj` (D022). A helper may still take one as a parameter: `helpers.may` says what it may do with it. A pure space's slots and `helpers` list reads only (D021).
- **A total is never read and bumped in one slot** (D021), so the order instances run in cannot show. In an f32 Dialect a total is still an f64: `totals.n += f64(p.x)`.
- **`environment(program)` may add writable members and totals**; they are checked when the Program is lowered.
- **A helper's effects count at every call**, and a helper beyond `helpers.may` is one L004, at the helper.
- **Intrinsics are pure** (`effects` on one is D021).
- **Your runner implements verbs, `rng()` and totals.** The kit only checks that each lambda stays inside its slot's `may`.

Codes: L004 an effect the slot's `may` lacks, L013 a write to a read-only member, L017 a total changed other than by `+=` or `++`, D021 a bad effect declaration, D022 an instance reachable another way.
