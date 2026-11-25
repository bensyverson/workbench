# The Definition API

You define a Domain Language with two calls from `kit/define`. `defineDialect` says what the language **means**: its types, the operations a lambda may call, and how each kind of lambda is called. `defineGrammar` says how a Program is **written**: the builder methods and their arguments. The kit generates the builder from it, with diagnostics. The functions passed into a Program (`(row) => row.price * 2`) are **Runtime Lambdas**. The kit never calls them: it reads their source, type-checks it against the Dialect, and compiles it.

Imports, all from `"kit/define"` (anything else is D011): `defineDialect defineGrammar vector scalar exact tolerance list opt struct union enumOf object name ref data lambda rest oneOf recordOf listOf didYouMean DefinitionError BuildError`.

## Types

A type is named by a string: `"f32" "f64" "bool" "str" "null" "void"`, a declared vector, scalar or object, or one capital letter (a type variable in an intrinsic, bound per call). Compound: `list(t, max)`, `opt(t)`, `struct({ x: "f64" }, { optional: ["x"] })`, `union(a, b)`, `enumOf(["a", "b"])`, `object(label, members)` (an object type made on the spot). **There is no integer type.**

## `defineDialect`

```js
export const myLang = defineDialect({
  name: "my",                                    // required
  numberType: "f64",                             // required: the type of a bare number literal
  types: {
    vec2: vector(2, "f32"),                      // built in a lambda as vec2(x, y); read .x .y; nominal
    day: scalar("f64", { note: "days since 1970-01-01" }),  // nominal: compares with itself only, no arithmetic
  },
  spaces: { row: { pure: true } },               // required: where lambdas run; every space must be pure
  objects: {                                     // handles a lambda reads members from
    Math: { label: "Math", members: {
      min: { fn: { params: ["f64", "f64"], rest: "f64", returns: "f64" } },  // a method; minArgs: n for optional args
    } },
    Params: { label: "the params ($)", members: {} },   // filled per Program by environment()
  },
  globals: { Math: "Math", $: "Params" },        // free names every lambda may use, with their types
  intrinsics: {                                  // functions a lambda calls by name
    dayOf: { params: ["f64", "f64", "f64"], returns: "day",
             ref: (y, m, d) => Date.UTC(y, m - 1, d) / 864e5,           // required: the meaning, in plain JS
             spell: { js: { call: "dayOf($0, $1, $2)", prelude: "const dayOf = (y, m, d) => Date.UTC(y, m - 1, d) / 864e5;" } } },
  },
  library: { half: { fn: "(x) => x / 2" } },     // operations written as lambda source; no spelling needed
  targets: { js: { accepts: "*", compare: exact() } },   // required; every accepting target spells every intrinsic
  slots: {                                       // required: the calling convention of each kind of lambda
    score: { params: ["f64", "day"], returns: "f64", space: "row" },   // a fixed convention
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

- **Intrinsics.** `params`, `returns`, `ref` (required), `spell` per target (a string with `$0 $1 …`, or `{ call, prelude }`). Optional: `minArgs`, `rest`, `numeric: "number" | "vector"` (what a type variable may be), `componentwise: true`.
- **A slot convention** is `{ params, returns, space }` (`returns: "infer"` takes the body's type), or a function `(ref, program, state) => convention` called once per lambda at lowering. `ref` is `{ id, kind, on, index, key }`, where `on` is the instance's name and `index` the call's position. `state` is the construct's state just before this call. Return a string instead to refuse the lambda (B011, with your string as the reason).
- **The text view.** `text(state)`: you decide what `state` is (say it in a comment), for example a rendered frame or a computed table. Print what a person would see, sized for a model's context.

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
      check(record, ctx) { … },                  // the construct's own check, at .check()/.build()
    },
    table: {
      parent: "program",                         // opened by calling .table(…) on the program's builder
      required: true,                            // a program with no table is B005
      opens: [name(), ref("source", { as: "from" })],   // .table("big", "sales")
      record: "calls",                           // keep its calls as one ordered list
      state: {
        init(opened, { program, stateOf }) { return { columns: { ...program.source[opened.from].columns } }; },
        step(state, call, inferred, ctx) {       // after each call; returns the next state
          if (call.slot === "derive") return { columns: { ...state.columns, [call.args[0]]: inferred } };
          return state;
        },
        names: { column: (state) => Object.keys(state.columns) },   // ref("column") resolves here, per step
      },
      slots: {
        derive: { kind: "decl", args: [data("string"), lambda("step")] },   // .derive("double", (r) => r.price * 2)
        filter: { kind: "decl", args: [lambda("step")] },
        sort:   { kind: "decl", args: [rest(ref("column"))] },
        limit:  { kind: "decl", args: [data("number")], check(call, ctx) { if (call.args[0] < 1) ctx.error("T001", "limit takes at least 1", { arg: 0 }); } },
      },
    },
  },
});
```

**Arguments:** `name(ns)` declares a name in namespace `ns` (an identifier, unique: B004, B002); a namespace spans the **whole Program**, unless `name(ns, { within: "account" })` makes it unique only within each `account` instance (the construct declaring it or an ancestor; a `state` construct's names stay Program-wide, so they cannot repeat). `ref(ns)` names a declared one, earlier or later (B003, did-you-mean), within the enclosing instance when `ns` has `within`; a `ref` outside every such instance is D011. `data(shape)` is a value of a shape (B004); `lambda(convention)` is a Runtime Lambda; `opt(spec)` (last only); `rest(spec)` (last only). Any spec takes `{ as: "key" }` last to name its record key. **Shapes:** `"number" "string" "boolean" "string[]" "number[]"`, an object of shapes (`"key?"` optional), `oneOf(…)`, `enumOf([...])`, `recordOf(shape)`, `listOf(shape)`, plus `ref` and `lambda` anywhere inside. A number takes bounds, `data("number", { min: 1, max: 120, whole: true })`, also inside a shape (`{ opening: data("number", { min: 0 }) }`): outside them is B004. A number is finite: `Infinity` or `NaN` anywhere is B004.

**Slot options:** `once`, `required`, `as` (the record key), `check(call, ctx)`. **Your checks** report with `ctx.error(code, message, { tip, arg, suggest, fix })`: your code is one letter of your own and three digits (not B C D L P S V), `arg` an argument's position or a path into it, and `fix` the text to write instead.

**The record** (what `.build()` returns, and what `environment`, `init` and checks see): a construct's opening arguments under their `as`, else a `name(ns)` under `ns` (a bare `name()` under `name`); any other opening argument lands under `arg1`, `arg2` …, so give it an `as`. A decl slot whose first argument is a `name()` becomes an object by name (`{ param: { topN: { value: 10 } } }`). Any other decl slot becomes a list of its calls' arguments (the bare arguments when `once`). Unit slots go under `units: [{ name, kind, src }]`, children are a list under the child's name (an empty list when there are none), and a `record: "calls"` construct keeps **only** `calls: [{ slot, args }]`, in order, instead of a key per slot. A lambda appears as its source text. The example Program below builds to:

```js
{ name: "sales", params: { topN: { value: 10, min: 1, max: 50 } }, title: "Top sales",
  source: { orders: { columns: { price: "f64", units: "f64" } } },
  table: [{ name: "big", from: "orders", calls: [{ slot: "derive", args: ["value", "(r) => …"] }, …] }],
  units: [ /* top-level helpers and constants the lambdas read */ ] }
```

## A Program, and running it

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

The host calls `run(programFn, { values })`, which hands the function a `$` that answers each declared param and records the read. Build-time code (outside lambdas) may branch and loop on params, and a block body that returns the chain is fine; opening the root twice is B016, and returning anything but the chain once it is open is B017. Changing a param read at build time reruns the function.

**The free-name rule.** A lambda sees only its own parameters and locals, the Dialect's globals, intrinsics and library, the Program's `.fn` and `.const` units, `$`, and the file's top-level `const` arrows and plain data. Nothing else is free, not even `Math` or `NaN` unless the Dialect declares it. **A handle** (a parameter or global of object type: `p`, `$`) is used only as `h.member`, `h.method(…)`, `h(…)` when callable, or passed whole as any call's argument; a callable one is only called. Anything else (`const q = p`) is L018. **The Runtime Subset:** `const`/`let`, arithmetic, comparisons, `if`, ternaries, bounded `for` loops and calls to the names above. No `new`, `this`, `async`, template literals or closures that escape.

## Pitfalls

These cost earlier authors time. The rest, you can infer.

1. **A child construct has every method of its parent** (calling one ends the child) and inherits its `rejected` names. So a child and its parent may not both declare a slot named `fn` (D010).
2. **`init` reads other declarations from the record** by their record key: `program.source[opened.from]` above is the `source` slot's object by name. Another instance's final state is `stateOf(name)`, available to both `init` and `step` (`ctx.stateOf`).
3. **State needs `record: "calls"` (D015 without it), and exists only at lowering.** `.check()` and slot checks never see it (`ctx.state` is undefined). Anything that depends on the state at a step belongs in `state.names`, a convention function or `step`'s `ctx.error`.
4. **A slot's `check` runs at the call**, and `ctx.program` is the record so far: the instance being built is last in its list (`ctx.program.table.at(-1)`), with this call already in it. Exclude it when you look for duplicates.
5. **`suggest` appends its own "Did you mean 'x'?"** to your message. Don't write one yourself.
6. **A nominal scalar is not a constructor.** A lambda gets one through a parameter, a member or an intrinsic that returns it (`dayOf` above).
7. **Params need both halves:** the Grammar's `params: { slot }` and the Dialect's `params: { object, name }`, plus a `$` global whose object `environment` fills.
8. **A value from a param has one form:** `.limit($.topN)`. `.limit(() => $.topN)` is B004. Build-time code reads a param only after its `.param` call, and only by name (no `in`, spread or `Object.keys` on `$`: B015).
9. **A lambda is checked only once its Program builds.** Fix the `B…` errors first. A lambda's type errors (`L…`) then show at its exact place.
10. **A top-level helper must be an arrow its own `const` writes, and a top-level constant must be plain data.** Intrinsics exist only inside lambdas, so `const START = dayOf(2026, 1, 1)` fails when the file loads. A helper made by another function (`const f = make(3)`) loses what it closes over and is refused (B012). A name declared only inside build-time code is B013.
11. **A name may mean one thing only:** a top-level binding named like a Dialect name, a library entry or a `.fn` is B002.

## Codes you will meet

`D…` is a bad definition (D001 an unknown key, D002 an unknown type, D010 a method-name clash). `B…` is a Program the builder refuses (B001 no such method, B002 a duplicate name, B003 a ref to nothing, B004 a bad value, B005 a required slot or child missing, B006 a second `once` call, B008 a free name not allowed, B009 a rejected name). `L…` is a lambda's type error. Every diagnostic carries a tip or a fix: read it before guessing.

## Not built

Effects (every space is pure), fragments, build-time slots that return grammar, Dialect imports, and lambdas in a construct's opening arguments. If you need one, report it as a gap; don't invent API.
