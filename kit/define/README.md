# kit/define: the Definition API

Declares a Domain Language as data and generates the rest. `defineDialect` says what the language **means** (types, objects, intrinsics with each target's spelling and a reference implementation, the Library, Iteration Spaces, targets, slot conventions); `defineGrammar` says how a Program is **written** (constructs and their slots), and the kit generates the builder, its diagnostics, the record it returns and the lowering of every Runtime Lambda. The spec is [the draft](../../scripts/define-trial/docs/api-draft.md); this page says what is built and where the build departs from it. No Node built-ins.

```js
import { defineDialect, defineGrammar, vector, exact, name, data, lambda } from "./kit/define/index.js";

const d = defineDialect({ name: "tiny", numberType: "f32", types: { vec2: vector(2, "f32") },
  spaces: { pixel: { pure: true } }, targets: { js: { accepts: "*", compare: exact() } },
  slots: { pixel: { params: ["vec2"], returns: "f32", space: "pixel" } } });
const tiny = defineGrammar(d, { root: "tiny", constructs: { tiny: { opens: [name()], slots: {
  pixel: { kind: "decl", args: [lambda("pixel")], once: true, required: true } } } } });

const record = tiny("t").pixel((uv) => uv.x * 0.5).build();   // { name: "t", pixel: "(uv) => uv.x * 0.5" }
const { lambdas, helpers, diagnostics } = tiny.lower(record);  // Kernels, through kit/lower
```

[`examples/fields.js`](examples/fields.js) is the draft's worked example completed: the whole fields Dialect and its `field()` Grammar. Its intrinsics and Library are read from [kit/dialects/fields](../dialects/fields/README.md) so the two cannot drift; the tests prove its Environment, intrinsic table, builder output and Kernels equal to the hand-written ones.

- **A Dialect value** ([`dialect.js`](dialect.js)). `defineDialect(def)` checks the whole definition and throws one `DefinitionError` holding every problem (`{ code, message, tip, path, file, loc }`: `path` is the key path inside the definition, `loc` the define call). It returns `{ name, numberType, def, intrinsics, library, targets, libraryFor(sources), environment(program, states?) }`. `intrinsics` has the shape of fields' table (`{ sig, ref, componentwise?, <target>: { call, prelude? } }`), `library` is `UnitDecl[]`, and `environment(program)` returns an [Environment](../lower/environment.d.ts) exactly as lowering reads it: type names resolved to core Types, each intrinsic a callable object plus a global, the hook's objects and globals merged in (a member it declares twice throws), and `slot(ref)`.
- **Slot conventions.** A static convention is resolved once; a function `(ref, program, state)` is called per lambda, and what it returns is checked as a static one is (`D002`, `D005`). `object(label, members)` in a convention makes an object type on the spot, named by its label (numbered when the same label carries other members). The kit makes the `helper` and `const` conventions; a Dialect may not declare those names, nor `method`, which lowering reads specially (`D007`). Every space is pure and no member can carry an effect, so purity holds by construction and a generated convention's `forbid` is empty; the generated `const` convention forbids every effect, as DMG's does (fields' own forbids none: the one structural difference the tests state).
- **The generated builder** ([`grammar.js`](grammar.js), [`record.js`](record.js), [`shapes.js`](shapes.js)). `defineGrammar(dialect, def)` returns the root builder, with `.lower`, `.dialect` and `.grammar` on it. Each construct instance's builder has its slots, its child constructs and its ancestors' methods (calling one ends the child); builders are mutable, so `b.param(…)` without reassigning works. An unknown method throws `B001` at once with a did-you-mean; everything else is collected with the call's `file` and `loc` (from the stack) and `.check()` returns the list, `.build()` throws a `BuildError` carrying all of them or returns the record. `B002`, `B004`, `B006`, `B007`, `B009` and slot `check`s are found at the call; `B003` (Program-namespace refs), `B005`, `B008` and construct `check`s at `.check()` / `.build()`, when every name is known.
- **The record** is the draft's "The record": openings under `as`, else their namespace, else `name`; a slot whose first argument is `name()` as an object from name to the rest; other slots as one value (`once`) or a list; `units: [{ name, kind, src }]`; children as lists under their construct's name; `record: "calls"` as `calls: [{ slot, args }]`. A lambda is its source text wherever it was passed.
- **The free-name rule** (`B008`) allows a lambda's own names, the Dialect's globals (with those `environment(record)` adds), intrinsics, Library entries, vector constructors and conversions, and the Program's units. The tip names the Grammar's `const` unit slot, and `$.name` when the Dialect declares `$`.
- **Lowering** ([`lower.js`](lower.js)) lives on the grammar, because only the grammar knows where lambdas sit in a record: `grammar.lower(record)` returns `{ environment, lambdas: [{ ref, src, result }], helpers, diagnostics, states }`. Every lambda goes through `lowerProgram` with the Library units it uses and the Program's units, in that order (as `lowerField` does). A lambda's slot id is `<on>.<slot>#<index>`, plus `.<key>` inside a `recordOf`; a `once` slot drops the index (`swirl.pixel`), so Kernel names match the hand-written Dialects'. A construct with `state` is built call by call: `init`, then per call its state-namespace refs are checked against the state at that step (`B003`, with a did-you-mean), its lambdas are lowered with that state (the convention's third argument) and their inferred types (in definition terms: `"f64"`, a vector's name, `enumOf`, `opt` …) go to `step`. A `stateOf` loop is `B010`; a convention that returns a reason is `B011`. Lambda type errors keep lowering's own `L…` codes.

## Codes

`D…` (a definition) and `B…` (a Program) are listed with their meanings in [`codes.js`](codes.js) (`DEFINE_CODES`, `BUILD_CODES`); D001–D015 are [rules.md](../../scripts/define-trial/docs/rules.md)'s, widened where the revised draft added keys. Beyond the draft: **D016** refuses `scalar()` (the nominal scalar is not built yet, leaf `vNfBwn`), and **B011** is a convention's refusal. A Dialect's own check codes take its own letter; `B`, `C`, `D`, `L`, `P`, `S` and `V` are reserved, and `ctx.error` with one throws.

## Where the build departs from the draft

- A `once` slot's lambda id has no `#index` (above); `ref.index` is still passed. In a by-slot record (no `record: "calls"`) `index` counts in slot-declaration order, since the record keeps no order across slots.
- An opening `name()` (`field("domain-warp")`) is a label and takes any non-empty string; other names must be identifiers.
- A slot `check`'s `ctx.state` is always `undefined`: state needs each lambda's inferred type, so it exists only when lowered. State-namespace refs are checked by `lower`, not by `.build()`.
- No `edits` on builder diagnostics: the builder has the call's place but not the file's text, so the replacement goes in `tip` (and `fix` from a check).
- A type `enumOf` holds strings only (the core's enums do); a shape `enumOf` may hold numbers.
- Unit slots in a `record: "calls"` construct go into `calls` like any slot; lowering finds them there.

## Not built

The nominal scalar (`D016`); effects, store rules, `emit` and inferred methods (every space is pure); fragments; build-time slots; Dialect imports; lambdas in a construct's opening arguments (they are recorded, never lowered); a checker that runs this builder (`scripts/define-trial` still validates the first draft with its own copy, leaf `O63kB5`); re-declaring `kit/dialects/fields` through this API (leaf `iJtvVE`).
