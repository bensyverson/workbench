# The Definition API

Two calls define a language. `defineDialect` says what it **means**: types, the operations a lambda may call, and how each kind of lambda is called. `defineGrammar` says how a Program is **written**: the builder methods and their arguments. The functions passed into a Program (`(row) => row.price * 2`) are **Runtime Lambdas**: the kit never calls them. It reads their source, type-checks it against the Dialect, and compiles it.

Import only from `"kit/define"` (anything else is D011): `defineDialect defineGrammar vector scalar exact tolerance list opt struct union enumOf object name ref data lambda rest oneOf recordOf listOf didYouMean DefinitionError BuildError`.

The topic pages in [docs/](docs/) hold the detail; each line below that points to one says when to read it.

## Types

A type is a string: `"f64" "f32" "bool" "str" "null" "void"`, a declared vector, scalar or object, or one capital letter (a type variable in an intrinsic). Compound: `list(t, max)`, `opt(t)`, `struct({ x: "f64" }, { optional: ["x"] })`, `union(a, b)`, `enumOf(["a", "b"])`, `object(label, members)`. **There is no integer type.**

## `defineDialect`

```js
export const myLang = defineDialect({
  name: "my",                                    // required
  numberType: "f64",                             // required: the type of a bare number literal
  types: {
    vec2: vector(2, "f64"),                      // built in a lambda as vec2(x, y); read .x .y; nominal
    day: scalar("f64", { note: "days since 1970-01-01" }),  // nominal: compares with itself only, no arithmetic
  },
  spaces: { row: { pure: true } },               // required: where lambdas run (docs/effects.md for the other kind)
  objects: {                                     // handles a lambda reads members from
    Math: { label: "Math", members: {
      min: { fn: { params: ["f64", "f64"], rest: "f64", returns: "f64" } },
    } },
    Params: { label: "the params ($)", members: {} },   // filled per Program by environment()
  },
  globals: { Math: "Math", $: "Params" },        // free names every lambda may use; even Math must be declared
  intrinsics: {                                  // functions a lambda calls by name
    dayOf: { params: ["f64", "f64", "f64"], returns: "day",
             ref: (y, m, d) => Date.UTC(y, m - 1, d) / 864e5,           // required: the meaning, in plain JS
             spell: { js: { call: "dayOf($0, $1, $2)", prelude: "const dayOf = (y, m, d) => Date.UTC(y, m - 1, d) / 864e5;" } } },
  },
  library: { half: { fn: "(x) => x / 2" } },     // operations written as lambda source
  targets: { js: { accepts: "*", compare: exact() } },   // required; every accepting target spells every intrinsic
  slots: {                                       // required: the calling convention of each kind of lambda
    score: { params: ["f64", "day"], returns: "f64", space: "row" },
    step: (ref, program, state) => ({ params: [object(`a row of ${ref.on}`, state.columns)], returns: "infer", space: "row" }),
  },
  params: { object: "Params", name: "$" },       // which object lambdas read the Program's params through
  environment(program) {                         // what one Program adds; runs before any lambda is lowered
    const members = {};
    for (const n of Object.keys(program.params ?? {})) members[n] = "f64";
    return { objects: { Params: { members } } };
  },
  text(state) { … },                             // required: your host's screen as characters, for a model
});
```

- **Strictness is off until you turn it on.** Your spec probably refuses things the kit accepts by default. The options: `conditions: "bool"` (a number as a condition is L003), `vector(…, { multiply: "scalar" })` (vector × vector is L003), a convention's `body: "block"` (L012), an object's `rejected: { member: { message, fix } }` (L002), and `helpers: { check: "all" }` (otherwise a helper nobody calls is not checked at all). Always on: a value-returning lambda returns on every path. Read [docs/strictness.md](docs/strictness.md) whenever your spec refuses something in a lambda: it also lists what the kit cannot refuse, which you report as a gap.
- **Helpers and Library entries are typed by their calls.** Each parameter takes the one type every call passes; two types is L014. An uncalled helper's parameters have no type, so what it does through them is never checked.
- **Intrinsics** need `ref` and a `spell` per target. At run time a vector is a plain array (`[x, y]`). Read [docs/intrinsics.md](docs/intrinsics.md) when you write one.
- **A convention function** may be called several times per lambda, so it must be pure. Return a string from it to refuse the lambda (B011). Read [docs/state.md](docs/state.md) when a lambda's types depend on what the Program declared before it.
- **`environment(program)`** returns objects whose members merge into the declared ones; repeating a declared member is D007.
- **`text(state)`** prints what a person would see, sized for a model's context. You decide what `state` is; say it in a comment.
- **A slot that says nothing may change nothing.** A lambda changes only the one object it is handed, in an instance space, with each effect listed in its slot's `may`. Read [docs/effects.md](docs/effects.md) when a lambda must write, destroy, draw a random number or add to a total.

## `defineGrammar`

```js
export const program = defineGrammar(myLang, {
  root: "program",
  params: { slot: "param" },                     // the root slot that declares params
  constructs: {
    program: {
      opens: [name()],                           // program("sales")
      slots: {
        param:  { kind: "decl", args: [name("param"), data({ value: "number", "min?": "number", "max?": "number" })], as: "params" },
        source: { kind: "decl", args: [name("source"), data({ columns: recordOf("string") })] },
        fn:     { kind: "unit", unit: "fn" },    // .fn("twice", (x) => x * 2): a Program helper
        const:  { kind: "unit", unit: "const" }, // .const("K", "0.5")
        title:  { kind: "decl", args: [data("string")], once: true, required: true },
      },
      rejected: { sql: { message: "SQL text is not an input language", fix: ".table(…).filter(…)" } },
      check(record, ctx) { … },                  // at .check()/.build(); the root's also sees `units`
    },
    table: {
      parent: "program",                         // opened by calling .table(…) on the program's builder
      required: true,                            // a program with no table is B005
      opens: [name(), ref("source", { as: "from" })],   // .table("big", "sales")
      record: "calls",                           // keep its calls as one ordered list; needed for state
      state: {
        init(opened, { program, stateOf }) { return { columns: { ...program.source[opened.from].columns } }; },
        step(state, call, inferred, ctx) {
          if (call.slot === "derive") return { columns: { ...state.columns, [call.args[0]]: inferred } };
          return state;
        },
        names: { column: (state) => Object.keys(state.columns) },   // ref("column") resolves here, per step
      },
      slots: {
        derive: { kind: "decl", args: [data("string"), lambda("step")] },
        filter: { kind: "decl", args: [lambda("step")] },
        sort:   { kind: "decl", args: [rest(ref("column"))] },
        limit:  { kind: "decl", args: [data("number")], check(call, ctx) { if (call.args[0] < 1) ctx.error("T001", "limit takes at least 1", { arg: 0 }); } },
      },
    },
  },
});
```

**Arguments.**

- `name(ns)` declares a name. It is unique across the **whole Program** (B002), unless `name(ns, { within: "account" })` makes it unique within each `account` instance ([docs/names.md](docs/names.md)). It must be a JavaScript identifier (`_x` and `h$t` pass; `9jet` is B004), and no option narrows that. The root's opening name, the Program's own, may be any non-empty string.
- `ref(ns)` names a declared one, earlier or later (B003, with a did-you-mean).
- `data(shape)` is a value of a shape (B004). Shapes: `"number" "string" "boolean" "string[]" "number[]"`, an object of shapes (`"key?"` optional), `oneOf(…)`, `enumOf([...])`, `recordOf(shape)`, `listOf(shape)`, with `ref` and `lambda` allowed inside. A number takes bounds, also inside a shape: `data("number", { min: 1, max: 120, whole: true })`. `Infinity` and `NaN` are B004.
- `lambda(convention)` is a Runtime Lambda. It also accepts a top-level helper's name or source text; nothing requires an arrow written in place.
- `opt(spec)` and `rest(spec)` go last. An opening argument's spec takes `{ as: "key" }` last to name its record key.

**Slot options:** `once`, `required`, `as` (the record key), `check(call, ctx)`. Your checks report with `ctx.error(code, message, { tip, arg, suggest, fix })`; the code is one letter of your own and three digits. `fix` prints as `fix: write <fix>`, so put advice in `tip`. Read [docs/codes.md](docs/codes.md) before you write checks, or when a code is new to you.

**The record** is what `.build()` returns, and what checks, `environment`, `init` and conventions read. The example Program below builds to:

```js
{ name: "sales", params: { topN: { value: 10, min: 1, max: 50 } }, title: "Top sales",
  source: { orders: { columns: { price: "f64", units: "f64" } } },
  table: [{ name: "big", from: "orders", calls: [{ slot: "derive", args: ["value", "(r) => …"] }, …] }],
  units: [ /* top-level helpers and constants the lambdas read */ ] }
```

Three traps: a `once` slot with one argument holds the bare value, not an array; a child list is present and empty when there are no children; a `record: "calls"` construct keeps only `calls`, no key per slot. Read [docs/record.md](docs/record.md) before any code reads the record.

## A Program

```js
import { program } from "../my.grammar.js";
const twice = (x) => x * 2;                      // a top-level arrow: lambdas may call it
const CUT = 10;                                  // top-level plain data: lambdas may read it

export default ($) => program("sales")
  .param("topN", { value: 10, min: 1, max: 50 })
  .title("Top sales")
  .source("orders", { columns: { price: "f64", units: "f64" } })
  .table("big", "orders")
    .derive("value", (r) => twice(r.price) * r.units)
    .filter((r) => r.value > CUT && r.units < $.topN)   // $.topN in a lambda: read at run time
    .sort("value")
    .limit($.topN);                              // $.topN at build time: the plain number 10
```

The exported function runs once, at build time; its lambdas run later. Read [docs/params.md](docs/params.md) when your language has params or build-time code branches.

A lambda sees only its parameters and locals, the Dialect's globals, intrinsics and library, `.fn` and `.const` units, `$`, and the file's top-level `const` arrows and plain data. The Runtime Subset has `if`, ternaries, bounded `for` loops, strings, arrays and `**`, but no `while`, `new`, template literals, `?.` or spread. Read [docs/lambdas.md](docs/lambdas.md) when a lambda or helper is refused for a name or construct, or your spec limits what a lambda may write.

## Pitfalls

These cost earlier authors time.

1. **A child construct has every method of its parent** (calling one ends the child) and inherits its `rejected` names. So a child and its parent may not both declare a slot named `fn` (D010).
2. **State needs `record: "calls"` (D015), and exists only at lowering.** Checks never see it.
3. **A slot's `check` runs at the call**, so the instance being built is the last in its list, this call included. Exclude it when you look for duplicates.
4. **A nominal scalar is not a constructor.** A lambda gets one from a parameter, member or intrinsic.
5. **Params need both halves:** the Grammar's `params: { slot }` and the Dialect's `params: { object, name }`, plus a `$` global whose object `environment` fills.
6. **A param value has one form:** `.limit($.topN)`. `.limit(() => $.topN)` is B004.
7. **Intrinsics exist only inside lambdas.** `const START = dayOf(2026, 1, 1)` at the top level fails when the file loads.
8. **A name may mean one thing only:** a top-level binding named like a Dialect name, a library entry or a `.fn` is B002.

## Not built

Spawning an instance from a lambda, writes outside the handed instance (other than a bump), `emit`, effectful intrinsics, fragments, build-time slots that return grammar, Dialect imports, lambdas in a construct's opening arguments. Report a need for one as a gap; don't invent API.
