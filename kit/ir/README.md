# kit/ir: the core IR

The typed IR that runtime lambdas lower to and backends read (proposal §5). No dependencies and no Node built-ins, so it runs in the page.

```js
import { printKernel, formatJSON, showType, assignable, verify } from "./kit/ir/index.js";

formatJSON(kernel);   // the diffable JSON form: standard JSON, short nodes on one line
printKernel(kernel);  // a listing for people: one statement per line, effects as comments
verify(kernel);       // [] when the kernel keeps every invariant below; never throws (see "Verifying a kernel")
```

- **A kernel** ([`ir.d.ts`](ir.d.ts)) is a function plus its iteration space (`entity Mole`, `tick`, `render`): parameters, locals, a body of statements, the effects the body has, and the lambda's source.
- **Every node has a `span`**, `[start, end]` offsets into the kernel's `src`, the parser's `range`. Every expression has a type `t`; every statement has `effects` (`read Mole.ttl`, `write World.next`, `rng`, `emit whack`, …), and the kernel sums them.
- **Types:** `f64`, `f32`, `bool`, `str`, `null`, `void`, vectors (below), enums of strings (a dialect's carries `declared: true`; see below), entity references, optionals, lists with a maximum length (an array literal also records its exact length, `len`), structs, unions, and dialect handles (`{ obj: "World" }`). A number is an `f64` or an `f32`, and the two never mix; a sized integer is a store rule on a place, never a value type. Why, and how it matches the DMG runtime: [the M1 plan](../../project/2026-11-23-m1-game-slice-plan.md), "Integer semantics in the IR". M1's kernels hold only `f64`.
- **Evaluation is left to right**; `cond`, `and` and `or` are lazy. Statements that cannot sit inside an expression (stores, a query's loop) come before it, so the IR is never ambiguous about order.
- **Loops are bounded:** `for` names its bound (`param burst`, `const 4`), and `each` runs over a list of at most `max` items (a query's loop, or a `for…of`).
- **`array`** is an array literal, typed `{ list, max, len }` with both its length (`len` is what makes a constant index below it non-empty: `itemAt` in `types.js`); `strictJoin` (next to `join` in `types.js`) is the closed-list join used for its items and for call-site parameters.
- **Enums come in two kinds**, told apart by `declared`. `{ enum: [...], declared: true }` (`dialectEnum` in `types.js`) is a dialect's closed set (sprite names, a choice param's options, buttons, an entity's `kind`) and is nominal. A plain `{ enum: [...] }` is what a string literal has, or the join of several. Both are assignable by membership, and either is assignable to `str`; they differ in `strictJoin`: two literal enums give the enum of every member, a literal enum joins a dialect enum only when all its members belong (giving the dialect enum), and two dialect enums join only when their members are the same.
- **`index`** is `of[index]`, typed `{ opt }`: out of range gives JavaScript's `undefined`, and a C backend would bounds-check it. **`helper`** calls one of the program's top-level helper functions by name; a helper has its own kernel, slot kind `helper`, named for the helper.

## f32 and vectors (M2)

The one change M2 makes to the core ([the M2 plan](../../project/2026-11-23-m2-shader-slice-plan.md), "Rulings"): `f32` and fixed-size vectors are value types.

- **`f32`** is a single-precision number. An `f32` `num` holds a value that is already an f32 (`Math.fround(v) === v`), so the JSON form says exactly what the kernel means; the listing prints it as the shortest decimal that rounds to it (`f32Text` in `print.js`: `0.1`, not `0.10000000149011612`). Arithmetic on two f32s gives an f32, rounded each time. **Conversions are explicit** ops: `f32` rounds an f64 to the nearest f32, `f64` widens an f32 exactly. There is no implicit conversion anywhere: an operator never takes one of each.
- **A vector** is `{ vec: n, of, name? }`: `n` (2, 3 or 4) components of `f32` or `f64`, read as `.x`, `.y`, `.z`, `.w` (a `field` node; no swizzles, which the [sketch survey](../../project/2026-11-23-uncommon-math-sketches.md) found no use for). A `vec` node builds one from its components, in order. There are no integer or bool vectors.
- **Operators on them:** `add`, `sub`, `mul`, `div`, `neg`, `pos` are componentwise over one vector type; `mul` also takes a scalar of the vector's scalar type on either side, and `div` a vector then a scalar. `rem` and `pow` take two of one scalar type (f64 or f32). Compares take two numbers of one type. The bitwise operators take f64s only. Vectors are not compared, ordered, or tested for truthiness. M1's rules for f64 operands are unchanged.

**Choice: operators are typed `op` nodes, not intrinsic calls.** `uv + k * q` lowers to `add(uv, mul(k, q))` with vector types, and the listing shows them as `add.vec2(…)`. Why: the IR already resolves operators on their operand types (`lt` and `eq` take numbers or strings), and f32 arithmetic needs the same overloaded `add` anyway; this is what D1 means (an operator's meaning comes from its operands' types); a GLSL backend maps it one to one; and the verifier's `OPS` table stays the one place an operator's typing is stated. The cost is that a backend must look at types, not just at the op: the JS backend refuses f32 and vector ops (and `vec` nodes) with an error rather than emit JavaScript's `+` on them, until job ZDCBUt teaches it.

**Choice: a dialect's vector type is the structural vector plus a `name`.** `dialectVector("color", 3, "f32")` (in `types.js`) is `{ vec: 3, of: "f32", name: "color" }`, nominal like a `declared` enum. Types compare by their fields, in any key order (`sameType`), so `color`, `vec3` and the structural `f32x3` are three different types: none is assignable to another, `strictJoin` joins none of them, and no operator mixes them (the general `join` makes a union of them, as of any two types, but a Kernel never holds a union that mixes number types, an f32 or a vector among them, at any depth: V003, and lowering reports the mix as L003 first). Why a field and not a wrapper type: the shape a backend needs is right there in every vector type, a backend that does not care about names ignores one field, and `strictJoin` needed no new rule (it stays a closed list). A vector without a `name` is structural and prints by its shape (`f32x3`); lowering gives every vector a dialect declares its name.

The listing of preset 04's `Mole.onFrame`:

```
kernel Mole.onFrame#0(self: Mole) -> void  ; entity Mole
  ; effects: read Mole.up, read Mole.ttl, write Mole.ttl, write Mole.up
  if self.up {                             ; read Mole.up
    let t0: f64 = sub(self.ttl, 1)         ; read Mole.ttl
    store.u16 self.ttl, t0                 ; write Mole.ttl
    if eq(t0, 0) {
      store.bool self.up, false            ; write Mole.up
    }
  }
```

Goldens for it and the spawn timer are in [`scripts/dmg-lower/test/golden/`](../../scripts/dmg-lower/test/golden/).

## Verifying a kernel

[`verify.js`](verify.js) checks a kernel against the invariants above, reading the kernel alone (no environment, no dialect). It is the safety net after every stage that makes or rewrites a kernel: a diagnostic is a bug in the kit, never in the author's program.

```js
verify(kernel);                     // [{ code, message, path, span }], [] when clean
verify(kernel, { partial: true });  // a kernel lowered alone, or before inference settles: `unknown` may stand for a type not yet inferred
```

`path` locates the node (`body[0].then[1].value`); `span` is its span when it has a valid one. Lowering runs it (partial) on every kernel it makes when `switches.verify` is on ([kit/lower](../lower/README.md)); `npm test` turns it on. A finished program's kernels are verified without `partial`: `scripts/dmg-lower/test/verify-corpus.test.js` checks every kernel of every preset and the goldens.

| Code | Invariant broken |
|---|---|
| V001 | A node of no known kind, or missing a field its kind has (checked first; when it fails nothing else is) |
| V002 | A type that disagrees with the node's operands or its kind |
| V003 | A type no kernel may hold: `unknown` (unless partial), a type variable, a list without a whole-number `max`, `len` past `max`, an empty enum, a one-member union, a nested or empty optional, a vector of other than 2–4 components of `f32` or `f64` or with an empty `name`, a union that mixes number types, or holds an f32 or a vector beside members that do not (at any depth: `[f32] | [f64]` and `{a: vec2} | {a: color}` count; two lists of one item type that differ only in length do not) |
| V004 | A name used where nothing binds it, or a binder whose name is not among the kernel's locals |
| V005 | A name bound twice, or declared twice among parameters and locals |
| V006 | A `set` or `push` of a parameter or `const`, or a `store` to a place without a store rule |
| V007 | A statement whose recorded effects miss what it does; an effect with no known verb |
| V008 | Kernel effects other than its statements', deduplicated in first-seen order (depth first) |
| V009 | A loop that is not bounded |
| V010 | A `break` or `continue` outside a loop |
| V011 | An expression, statement or kernel span that is not integer `[start, end]` inside `src` |
| V012 | A kernel whose JSON form does not read back the same (`Infinity`, `NaN`, `-0`, a function, a cycle) |

**Readings.** Where the spec above is silent, the verifier takes what lowering produces:

- **f32 and vectors.** A `num` is finite and never negative zero (write the negation of 0), and an `f32` `num` holds an f32 value. A `vec` node has one item per component, each of the vector's scalar type, and a vector type. A component read is `x`…`w` up to the vector's size, typed by its scalar. Operators follow `OPS` (see "f32 and vectors" above); a vector operator's result is its vector operand's type, name included. In a partial kernel an `unknown` operand yields to the other (an `unknown` times an f32 may give that f32 or a vector of f32s).
- **Types agree** exactly for literals (a string is the enum of its value), a load (its place's type), `index` (`itemAt`), `array` (`{ list, max: n, len: n }` of the items' strict join), `cond` (the `join` of its arms), `field`, and a place's store rule (`bool`, `enum` with the same values, the `f32` rule on an f32 place, any other numeric rule on `f64`). A `let` has its value's type, except that a `let` local may widen a string literal to `str`; `set`, `store`, `push` and `return` take any assignable value. A `local` has its binding's type, or the binding's type made non-empty (narrowing).
- **Effects** are what the IR shows: a call's recorded effects, `call Owner.name` for a method and `call name` for a helper, `read Owner.name` for loading a writable place (a place with a store rule is state), and `write Owner.name` for a store. A statement's effects cover its own expressions', not its nested statements'. A read of a read-only place (`read frame`) is the dialect's to decide and is not in the IR, so it is not checked; nor are a call's argument and result types, whose signatures live in the environment.
- **Bound before use** is block scoping: a `let` binds to the end of its block, `for` binds its counter for its test, update and body, `each` its item for its body, and each branch of an `if` is a block. A `let` with a null value counts as bound; definite assignment is not checked.
- **Bounded loops.** A `for` counts from an integer literal (maybe negated) or a param, in the type of its start (an f64, or an f32 where the Dialect's number type is f32), tests `counter < bound` or `<=`, steps by exactly `counter = counter + 1`, and nothing in it changes the counter. Its `bound` names what its test compares against: `const N` (within the counter type's exact range: 2^53 - 1 for an f64 counter, 2^24 - 1 for an f32 one, since an f32 `i + 1` stops changing `i` at 2^24; the start is held to the same range), `param name`, `size ≤ max` (a list's length), or `size name` (a read-only place its Dialect declares a size with `Member.size`, such as the DMG grid's rows and cols, or a fields param with a `max` of at most 2^24 - 1; a read-only place alone is not a size, since `w.frame` grows for the whole run). An `each` runs a whole number of times equal to its list type's `max`. Recursion spans kernels, so lowering checks it (L007).
- **`unknown`** marks an expression that failed to lower, and lowering makes no kernel then. But a lambda lowered without its program's signatures (`lowerLambda` alone, or `lowerProgram` before inference settles) gets `unknown` for a method's or helper's result, so lowering verifies with `partial`.

**Extending.** A new expression or statement kind adds an entry to `EXPR` or `STMT` in `verify.js` and to the shapes in `verify-shape.js`; a new operator or value type adds to `OPS` or `typeProblem` in `verify-rules.js`. A stage below the IR gets its own entry point beside `verify`.
