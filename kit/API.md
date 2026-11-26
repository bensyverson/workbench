# The Definition API

Two calls define a language. `defineDialect` says what it **means**: types, the operations a lambda may call, and how each kind of lambda is called. `defineGrammar` says how a Program is **written**: the builder methods and their arguments. The functions passed into a Program (`(<row>) => <row>.<field> * 2`) are **Runtime Lambdas**: the kit never calls them. It reads their source, type-checks it against the Dialect, and compiles it.

**Reading the snippets.** A word in angle brackets is a name or number you choose, with the rule for choosing it beside it: `<field>`, `<frame>`, `<part>`, `<slot>`, `<max>`. A digit tells two of a kind apart (`<frame1>`, `<frame2>`), and `<…>` stands for text or code you write. Everything outside angle brackets is literal: the kit's keys, handles, functions and seam spellings, and all punctuation. Don't type the angle brackets, and don't reuse a name from a snippet unless your spec says it.

Import only from `"kit/define"` (anything else is D011): `defineDialect defineGrammar vector scalar exact tolerance list opt struct union enumOf object name ref data lambda rest oneOf recordOf listOf didYouMean DefinitionError BuildError`.

The topic pages in [docs/](docs/) hold the detail; each line below that points to one says when to read it.

## Types

A type is a string: `"f64" "f32" "bool" "str" "null" "void" "sampler"` (a handle onto an image, only passed to a call; see kit/ir), a declared vector, scalar or object, or one capital letter (a type variable in an intrinsic). Compound: `list(t, <max>)` (`list(t)` with no max only in a Dialect's `state`; `<max>` is the most items your spec allows), `opt(t)`, `struct({ <field>: "f64" }, { optional: ["<field>"] })`, `union(a, b)`, `enumOf(["<a>", "<b>"])`, `object(label, members)`. **There is no integer type.**

## `defineDialect`

```js
export const <dialect> = defineDialect({
  name: "<name>",                                // required: your language's name
  numberType: "f64",                             // required: the type of a bare number literal
  types: {
    <vec>: vector(<dims>, "f64"),                // built in a lambda as <vec>(x, y); read .x .y; nominal. <dims>: how many components your spec needs
    <unit>: scalar("f64", { note: "<what it measures>" }),  // nominal: compares with itself only, no arithmetic
  },
  spaces: { <space>: { pure: true } },           // required: where lambdas run (docs/effects.md for the other kind)
  objects: {                                     // handles a lambda reads members from
    Math: { label: "Math", members: {
      min: { fn: { params: ["f64", "f64"], rest: "f64", returns: "f64" } },
    } },
    <Params>: { label: "the params ($)", members: {} },   // filled per Program by environment()
  },
  globals: { Math: "Math", $: "<Params>" },      // free names every lambda may use; even Math must be declared
  intrinsics: {                                  // functions a lambda calls by name
    <fn>: { params: ["<type1>", "<type2>"], returns: "<type>",
            ref: (<a>, <b>) => <plain JS>,       // required: the meaning, in plain JS
            spell: { js: { call: "<fn>($0, $1)", prelude: "const <fn> = (<a>, <b>) => <plain JS>;" } } },
  },
  library: { <fn>: { fn: "(<a>) => <body>" } },  // operations written as lambda source
  targets: { js: { accepts: "*", compare: exact() } },   // required; every accepting target spells every intrinsic
  slots: {                                       // required: the calling convention of each kind of lambda
    <slot>: { params: ["<type1>", "<type2>"], returns: "<type>", space: "<space>" },
    <slot2>: (ref, program, state) => ({ params: [object(`a row of ${ref.on}`, state.<members>)], returns: "infer", space: "<space>" }),
  },
  params: { object: "<Params>", name: "$" },     // which object lambdas read the Program's params through
  environment(program) {                         // what one Program adds; runs before any lambda is lowered
    const members = {};
    for (const n of Object.keys(program.params ?? {})) members[n] = "f64";
    return { objects: { <Params>: { members } }, state: { <decl>: "<type>" } };   // state: optional, one field per declaration (below)
  },
  state: { <field>: "<type>" },                  // optional: the run's state, what text(state) is handed
  text(state) { … },                             // required: your host's screen as characters, for a model
});
```

- **A condition is a bool, always.** An `if`, ternary or loop test, and an operand of `!`, `&&` or `||` in a test, must be a bool: a number, string, vector or optional there is L003, and its tip writes the explicit form (`m == null` / `m != null` for an optional, `n !== 0` for a number, `s !== ""` for a string). There is no option to turn this off, and no `conditions` key (an unknown Dialect key).
- **Most other strictness is off until you turn it on.** Your spec probably refuses things the kit accepts by default. The options: `vector(…, { multiply: "scalar" })` (vector × vector is L003), a convention's `body: "block"` (L012), an object's `rejected: { member: { message, fix } }` (L002), and `helpers: { check: "all" }` (otherwise a helper nobody calls is not checked at all). Always on: a value-returning lambda returns on every path. Read [docs/strictness.md](docs/strictness.md) whenever your spec refuses something in a lambda: it also lists what the kit cannot refuse, which you report as a gap.
- **Helpers and Library entries are typed by their calls.** Each parameter takes the one type every call passes; two types is L014. An uncalled helper's parameters have no type, so what it does through them is never checked.
- **Intrinsics** need `ref` and a `spell` per target. At run time a vector is a plain array (`[x, y]`). Read [docs/intrinsics.md](docs/intrinsics.md) when you write one.
- **A convention function** may be called several times per lambda, so it must be pure. Return a string from it to refuse the lambda (B011). Read [docs/state.md](docs/state.md) when a lambda's types depend on what the Program declared before it.
- **`environment(program)`** returns objects whose members merge into the declared ones; repeating a declared member is D007. It may also return `state`: the fields a Program's declarations add to the run's state (next).
- **`text(state)`** prints what a person would see, sized for a model's context. You decide what `state` is; declare it with `state` (next).
- **`state`** (optional) is the shape of the **run's** state: the value `text(state)` and a UI's views are handed while a Program runs. It is not a Grammar construct's `state` (that is build-time, and a different thing). Write a plain object of member types in this Dialect's vocabulary: `state: { <f1>: "f64", <f2>: "bool", <f3>: "<vec>", <f4>: enumOf(["<a>", "<b>"]), <f5>: opt("f64"), <f6>: struct({ <x>: "f64" }), <f7>: list(struct({ <x>: "f64" }), <max>), <f8>: list("str") }` (`<max>`: the most items your spec allows): a state list may leave out its max (a UI reads its `length` and an index, never loops over it), a list elsewhere may not. A nested object must be `struct({ … })`, not a bare `{ … }` (D023). The Dialect value then has `checkState(value)` (every mismatch by path) and its `text` throws on a value that does not fit.
- **Data a Program declares goes in the state.** When a Program declares its own data (a field every `<item>` carries), mark one state struct extensible and have `environment(program)` return a field for each declaration:

  ```js
  state: { <items>: list(struct({ <field>: "f64", <own>: struct({}, { extensible: true }) }), <max>) },   // or the struct itself, with fields of its own
  environment(program) {
    const state = {};
    for (const n of Object.keys(program.<decls> ?? {})) state[n] = "<type>";
    return { …, state };                       // each becomes a field of <own>: <items>[i].<own>.<n>
  },
  ```

  One struct may be extensible (more is D023). A Program field named like one of the struct's own is D007, so keep the Program's fields in a struct of their own, as above. The run checks each state against the Program's fields: one missing or of the wrong type is N002, and a field the Program does not declare is N003 (memory outside the state). There is no cap but the Program's own declarations. A UI and a value output still read only the Dialect's own fields.
- **A slot that says nothing may change nothing.** A lambda changes only the one object it is handed, in an instance space, with each effect listed in its slot's `may`. Read [docs/effects.md](docs/effects.md) when a lambda must write, destroy, draw a random number or add to a total.

## `defineGrammar`

```js
export const <builder> = defineGrammar(<dialect>, {
  root: "<root>",                                // the root construct's name
  params: { slot: "<param>" },                   // the root slot that declares params
  constructs: {
    <root>: {
      opens: [name()],                           // <builder>("<name>")
      slots: {
        <param>:  { kind: "decl", args: [name("<param>"), data({ value: "number", "min?": "number", "max?": "number" })], as: "params" },
        <slot1>:  { kind: "decl", args: [name("<ns>"), data({ <field>: recordOf("string") })] },
        fn:       { kind: "unit", unit: "fn" },    // .fn("<name>", (<x>) => <body>): a Program helper
        const:    { kind: "unit", unit: "const" }, // .const("<NAME>", "<value>")
        <slot2>:  { kind: "decl", args: [data("string")], once: true, required: true },
      },
      rejected: { <word>: { message: "<why refused>", fix: "<what to write instead>" } },
      check(record, ctx) { … },                  // at .check()/.build(); the root's also sees `units`
    },
    <child>: {
      parent: "<root>",                          // opened by calling .<child>(…) on the root's builder
      required: true,                            // a program with none is B005
      opens: [name(), ref("<ns>", { as: "from" })],   // .<child>("<name>", "<ref>")
      record: "calls",                           // keep its calls as one ordered list; needed for state
      state: {
        init(opened, { program, stateOf }) { return { <members>: { ...program.<ns>[opened.from].<members> } }; },
        step(state, call, inferred, ctx) {
          if (call.slot === "<slot3>") return { <members>: { ...state.<members>, [call.args[0]]: inferred } };
          return state;
        },
        names: { <ns2>: (state) => Object.keys(state.<members>) },   // ref("<ns2>") resolves here, per step (in the opening arguments: against init's state)
      },
      slots: {
        <slot3>: { kind: "decl", args: [data("string"), lambda("<convention>")] },
        <slot4>: { kind: "decl", args: [lambda("<convention>")] },
        <slot5>: { kind: "decl", args: [rest(ref("<ns2>"))] },
        <slot6>: { kind: "decl", args: [data("number")], check(call, ctx) { if (call.args[0] < <min>) ctx.error("<code>", "<message>", { arg: 0 }); } },
      },
    },
  },
});
```

**Arguments.**

- `name(ns)` declares a name. It is unique across the **whole Program** (B002), unless `name(ns, { within: "<construct>" })` makes it unique within each `<construct>` instance ([docs/names.md](docs/names.md)). It must be a JavaScript identifier (`_x` and `h$t` pass; `9jet` is B004), and no option narrows that. The root's opening name, the Program's own, may be any non-empty string.
- `ref(ns)` names a declared one, earlier or later (B003, with a did-you-mean).
- `data(shape)` is a value of a shape (B004). Shapes: `"number" "string" "boolean" "string[]" "number[]"`, an object of shapes (`"key?"` optional), `oneOf(…)`, `enumOf([...])`, `recordOf(shape)`, `listOf(shape)`, with `ref` and `lambda` allowed inside. A number takes bounds, also inside a shape: `data("number", { min: <min>, max: <max>, whole: true })` (bounds from your spec). `Infinity` and `NaN` are B004.
- `lambda(convention)` is a Runtime Lambda. It also accepts a top-level helper's name or source text; nothing requires an arrow written in place.
- `opt(spec)` and `rest(spec)` go last. `rest(spec)` is for a decl slot only: an opening argument is one value under one record key, so `opens` refuses it (D019). An opening argument's spec takes `{ as: "key" }` last to name its record key.

**Slot options:** `once`, `required`, `as` (the record key), `check(call, ctx)`. Your checks report with `ctx.error(code, message, { tip, arg, suggest, fix })`; the code is one letter of your own and three digits (not `B C D L N P S U V`, which the kit keeps; `ctx.error` with one throws). `fix` prints as `fix: write <fix>`, so put advice in `tip`. Read [docs/codes.md](docs/codes.md) before you write checks, or when a code is new to you.

**The record** is what `.build()` returns, and what checks, `environment`, `init` and conventions read. The Program below builds to a record of this shape:

```js
{ name: "<name>", params: { <param>: { value: <v>, min: <min>, max: <max> } }, <slot2>: "<text>",
  <slot1>: { <name1>: { <field>: … } },
  <child>: [{ name: "<name2>", from: "<ref>", calls: [{ slot: "<slot3>", args: ["<text>", "(<r>) => …"] }, …] }],
  units: [ /* top-level helpers and constants the lambdas read */ ] }
```

Three traps: a `once` slot with one argument holds the bare value, not an array; a child list is present and empty when there are no children; a `record: "calls"` construct keeps only `calls`, no key per slot. Read [docs/record.md](docs/record.md) before any code reads the record.

## `defineUI`

```js
export const <ui> = defineUI(<builder>, {      // <builder>: what defineGrammar returned
  stage: { element: "<tag-name>", module: "./<file>.js", emits: ["<event>"] },
  inputs: { object: "<Pad>", buttons: { <button>: { role: "<role>" }, … } },
  tiles: { <tile>: { title: "<title>", place: { splitLeft: "stage", size: <fraction> }, body: [   // <fraction>: the share of the width, 0 to 1
    { kind: "stat", label: "<label>", value: (s) => s.<list>.length, max: "<state field>" },
    { kind: "table", label: "<label>", rows: "<list>", columns: ["<field>", { label: "<label>", value: (row) => row.<field> }] },
  ] } },
  annotate: { traces: { <trace>: { note: "<what it shows>" } } },
}, { moduleText });                           // moduleText(path): a package file's text, for the stage's module checks (optional)
```

The UI reads the **run's state your Dialect's `state` declares** (above): a path is `"bounds.width"` and stops at a list; a lambda is `(s, $) => …` (a table column's `(row, s, $) => …`). A UI has no `state` key (`U001`), and a Dialect with no `state` is `U013`. The refusals are `U` codes with a fix, collected in one `DefinitionError`; the full list is `UI_CODES` in [define/codes.js](define/codes.js), and the keys and rules are in [define/README.md](define/README.md#defineui).

`defineUI` checks the lambdas without a Program; `<ui>.lower(record)` types them against one (the record `run` or `.build()` gives), as your Grammar's `lower` does a Program's lambdas. `$` has the params that Program declares (so `$.<param>` is `L002` in a Program without that param), and each key's result must be its type: `badIf` and `expect` a bool; `max` and `y` a number; a stat's or column's `value` a number or string; a text's `value` a string; `badge` a string or `null`; `tone` one of `"good" "warn" "bad" "dim"` or `null`. A lambda may have no effect (`L004`). It returns `kernels` by id (`tiles.<tile>.body[0].value`) and `diagnostics`, each an `L` code carrying the `id`, `tile` and `key` of its lambda.

## Seams: ports, frames and inputs

A package that others may compose with declares what it **offers** and **accepts**, in seam types every package shares ([seam/README.md](seam/README.md)): `f64` `bool` `str`, a quantity `f64@<frame>`, a point `point2@<frame>` (or a 1-D position `point1@<frame>`, such as a temperature), a vector `vec2@<frame>` (or untagged `vec2`), a rate per second `vec2@<frame>/s` or `f64@<frame>/s`, an enum `'<value1>' | '<value2>'`, a record `{ <field>: point2@<frame> }`, `list<T, <max>>`, and `Event<{ … }>` (the records one step produced). `<frame>` is one of your own frames, or the kit's `s` (seconds). You never name another package: a composer wires your ports to a stranger's.

```js
frames: {                                         // the spaces and units you measure in; different packages' frames never unify by name
  <frame1>: { dims: <dims>, note: "<what the axes are and where the origin is>",
          extent: (record) => ({ min: [<…>], max: [<…>] }) },   // optional: one number per dim
},                                                // the kit's s (seconds) needs no declaring: f64@s
edges: (record) => [{ from: "<frame1>", to: "<frame2>", scale: <scale>, offset: <offset> }],   // optional: between your own frames; numbers from your spec
ports: {
  out: {
    <event-port>: { seam: "Event<{ <field>: point2@<frame1> }>", note: "<what one record means>" },   // no from: a runtime pushes it
    <port1>: { seam: "point2@<frame1>", from: (s) => [s.<x>, s.<y>], note: "<what it is>" },
    <port2>: { seam: "f64", from: "<state field>", note: "<what it is>" },        // from: a path into state, or a value lambda
  },
  in: {
    <event-in>: { seam: "Event<{ <field>: point2@<frame2> }>", note: "<what receiving one does>",
              delivery: "reliable",                       // the default; or { keepLast: <n> }
              record: { name: "<name>", slots: ["<slot>"] } }, // those slots' lambdas read the record as <name>.<field>; no other lambda may
    <event-in2>: { seam: "Event<{ <field>: point2@<frame2>, <field2>: f64 = <v> }>", note: "<…>" },   // <field2> has a default (below)
    <value-in>: { seam: "f64@<frame2>", default: <v>, note: "<what it controls>" },   // or required: true
  },
},
inputs: { object: "<Inputs>", name: "<name>" },   // value inputs, read as <name>.<value-in>: declare objects.<Inputs> empty and globals.<name>: "<Inputs>"
```

- **A note is required** on a tagged or Event port: it is what a composer reads to decide what to wire (D024).
- **Pairing.** A port's local type must have its seam's structure: a `point2@<frame>` output's state is a `vector(2, "f64")`, a record a `struct` with the same fields (D027). An output lambda may build a point or vector as an array literal of exactly its dims. A `point1` pairs with a plain `f64`. An input's point or vector reads as your one `vector` type of its dims; with several, say which with `type: "<vec>"`.
- **A default for an Event input's field.** Write `<field>: <type> = <value>` in the input's record (a number, `true` or `false`, a `'string'`, or a list such as `[0, 1]` for a vector) when a producer may not have the field. A wire from a producer whose record lacks it fills your default into every record, already in your frame; a producer that has the field gives its own value. A field with no default must come from the producer (S202). Only a top-level field of an Event input's record takes a default; one elsewhere, or one that does not fit its type, is D028.
- **Triggers.** A Grammar names an input with `ref("in")`, checked by name (B003, with a did-you-mean); `ref("in", { kind: "event" })` takes only Event inputs, `{ kind: "value" }` only value inputs.
- **Handles.** Every builder has read-only `.out.<port>`, `.in.<port>` and `.frame.<frame>`, which a composer passes to kit/compose ([compose/README.md](compose/README.md)). So no slot or child construct may be named `out`, `in` or `frame` (D031).
- An output lambda's result, `extent(record)` and `edges(record)` are checked when an example lowers (D027, D030), at your `defineDialect` line.
- **Composing** packages is a glue program's job, with `kit/compose`: read [compose/README.md](compose/README.md) when you wire parts, relate frames, rename record fields or break a cycle.

## A runtime: `defineRuntime`

A package that runs (alone or composed) names a runtime module in its manifest's `entry.runtime`: plain JavaScript over your Dialect's `state`, which the kit's scheduler ([run/README.md](run/README.md)) steps.

```js
import { defineRuntime } from "kit/define";
import { <builder> } from "./<file>.grammar.js";

export const <runtime> = defineRuntime(<builder>, {
  clock: (record) => ({ tick: <seconds> }),                 // or { frame: true }, or { demand: true }. <seconds>: the step length your spec wants
  init: (record, ctx) => ({ <field>: <initial>, … }),       // a state that fits your Dialect's state
  step(state, { dt, kernels, controls, inputs, events, rng }) {
    kernels.<slot>(<instance>, controls.<pad>);               // the part's own lambda by slot; any by id: kernels["<construct>.<slot>"]
    // …
    for (const <rec> of <records>) events.<event-port>.push(<rec>);   // an Event output is pushed, never kept in state
    return { ...state, <field>: <next> };                     // a new state: never change the one you are handed
  },
  events: { out: { <event-port>: <max> } },                 // each Event port's most records per step: count what your step can push at most
});
```

- **`step` returns the next state** and keeps no other memory: no module-level variables, no `Math.random` (use `ctx.rng`), no clock. The state must fit your Dialect's `state`, with the fields the Program declares (N002). A field the Program does not declare in the extensible struct is N003, in any run. A development run also freezes the state and runs each step twice to check (N003). Read a Program's declarations from `record` (`record.<decls>`) to carry its fields from step to step.
- **`ctx.inputs`** holds each value input converted into your frames, and each Event input's records since your last step, in order; `ctx.globals` is what your lambdas' globals read (set an Event record's name, `ctx.globals.<name> = record`, before calling a lambda that reads it).
- **Every Event port needs its max** in `events` (D033). The composition sizes each queue from the maxes and the clocks, and refuses a reliable wire that could overflow (S116).

## A Program

```js
import { <builder> } from "../<file>.grammar.js";
const <helper> = (<x>) => <body>;                // a top-level arrow: lambdas may call it
const <CONST> = <value>;                         // top-level plain data: lambdas may read it

export default ($) => <builder>("<name>")
  .<param>("<p>", { value: <v>, min: <min>, max: <max> })
  .<slot2>("<text>")
  .<slot1>("<name1>", { <field>: … })
  .<child>("<name2>", "<ref>")
    .<slot3>("<text>", (<r>) => <helper>(<r>.<field>))
    .<slot4>((<r>) => <r>.<field> > <CONST> && <r>.<field> < $.<p>)   // $.<p> in a lambda: read at run time
    .<slot5>("<column>")
    .<slot6>($.<p>);                             // $.<p> at build time: the param's plain number
```

The exported function runs once, at build time; its lambdas run later. Read [docs/params.md](docs/params.md) when your language has params or build-time code branches.

A lambda sees only its parameters and locals, the Dialect's globals, intrinsics and library, `.fn` and `.const` units, `$`, and the file's top-level `const` arrows and plain data. The Runtime Subset has `if`, ternaries, bounded `for` loops, strings, arrays (`[...a, ...b]` concatenates lists, the max being the sum) and `**`, but no `while`, `new`, template literals, `?.` or spread anywhere else. Read [docs/lambdas.md](docs/lambdas.md) when a lambda or helper is refused for a name or construct, or your spec limits what a lambda may write.

## Pitfalls

These cost earlier authors time.

1. **A child construct has every method of its parent** (calling one ends the child) and inherits its `rejected` names. So a child and its parent may not both declare a slot named `fn` (D010).
2. **State needs `record: "calls"` (D015), and exists only at lowering.** Checks never see it.
3. **A slot's `check` runs at the call**, so the instance being built is the last in its list, this call included. Exclude it when you look for duplicates.
4. **A nominal scalar is not a constructor.** A lambda gets one from a parameter, member or intrinsic.
5. **Params need both halves:** the Grammar's `params: { slot }` and the Dialect's `params: { object, name }`, plus a `$` global whose object `environment` fills.
6. **A param value has one form:** `.<slot6>($.<p>)`. `.<slot6>(() => $.<p>)` is B004.
7. **Intrinsics exist only inside lambdas.** `const <NAME> = <intrinsic>(…)` at the top level fails when the file loads.
8. **A name may mean one thing only:** a top-level binding named like a Dialect name, a library entry or a `.fn` is B002.
9. **`state` means two things.** A Dialect's `state` is the run's, what `text(state)` and a UI are handed; a Grammar construct's `state` (`record: "calls"`) is its build-time record. Write each where it belongs.
10. **An Event output has no `from`**: your runtime pushes its records in `step`, and declares how many at most (`events`).

## Not built

Spawning an instance from a lambda, writes outside the handed instance (other than a bump), `emit`, effectful intrinsics, fragments, build-time slots that return grammar, Dialect imports, lambdas or `rest()` in a construct's opening arguments, a composed page that layers parts, sampling modes (`lerp`). Report a need for one as a gap; don't invent API.
