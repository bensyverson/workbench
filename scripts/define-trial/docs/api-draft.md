# The Definition API (draft)

*Draft for review, 2026-11-24, third revision: the API as built. Everything here is built except what "Not built" lists at the end, and the checker runs your files through the real thing: the definitions, every example's builder calls, and the lowering of every lambda. You are being asked to use it and say where it fails you.*

A **Domain Language** is a fluent JavaScript chain that people write Programs in, such as `field("swirl").param("angle", { value: 2.4 }).pixel((uv, u) => …).build()`. The functions inside it that run per pixel, per row or per entity are **Runtime Lambdas**: the kit does not run them as JavaScript. It reads their source, type-checks it against what the language declares, and compiles it for each target (JavaScript, GLSL).

You define a Domain Language with two calls:

- `defineDialect({...})` says what the language **means**: its types, the operations a lambda may call, where lambdas run, and the targets.
- `defineGrammar(dialect, {...})` says how a Program is **written**: the builder calls, what each one takes, and which of them carry a Runtime Lambda. The kit generates the builder from it, with error messages.

Both take plain data (plus a few functions where noted). Both are checked when they are called: a bad definition is refused with a `D…` diagnostic naming the declaration and the fix.

## Types

Wherever a definition names a type, write its name as a string:

| Name | Meaning |
|---|---|
| `"f32"`, `"f64"` | numbers (single and double precision) |
| `"bool"`, `"str"`, `"null"`, `"void"` | the obvious |
| a declared vector, e.g. `"vec2"` | see `types` below |
| a declared object, e.g. `"Uniforms"` | a handle with members (see `objects`) |
| a single capital letter, `"T"` | a type variable in an intrinsic's signature, bound per call |

Build compound types with helpers from `kit/define`: `list(t, max)` (a list of at most `max` items), `opt(t)` (may be null; a lambda must check it before use, in a `const`: `if (d != null)`, which keeps a 0 or a date at the epoch present and matches undefined too, or `if (d)`, JavaScript's truthiness, which does not; `d !== null` does not narrow, since the kit itself gives undefined for some empty values, such as `find` with no match), `struct({ x: "f64", y: "f64" }, { optional: ["y"] })`, `union(a, b, …)`, `enumOf(["a", "b"])` (one of these strings; nominal: two enums with the same values are different types; a type enum holds strings only, though a data shape's `enumOf` may hold numbers), and `object(label, members)`, an object type made on the spot (see "Construct state").

**Everything `kit/define` exports:** `defineDialect`, `defineGrammar`, the helpers `vector`, `scalar`, `exact`, `tolerance`, `list`, `opt`, `struct`, `union`, `enumOf`, `object`, `name`, `ref`, `data`, `lambda`, `rest`, `oneOf`, `recordOf`, `listOf`, `didYouMean` (a " Did you mean 'x'?" suffix for your own messages: `didYouMean(value, candidates)`), and `DefinitionError`, `BuildError`, `DEFINE_CODES`, `BUILD_CODES`. Importing anything else is refused (D011).

**There is no integer type.** A whole number is a number. If your language needs integers, say so in your report rather than inventing one.

**Dates and other named scalars.** A Dialect may declare a **nominal scalar** in `types`: a named type stored as a number, which lambdas can compare (`<`, `===`) with its own kind only, and which no arithmetic operator accepts. `date: scalar("f64", { note: "milliseconds since 1970-01-01, UTC" })`. Its name may be used wherever a type is named (slot params and returns, members, globals, intrinsic signatures, conventions). It is **not a constructor**: a value of it enters a lambda through a parameter, a member or an intrinsic, and a lambda that calls `date(…)` is refused (B008). To let a lambda make one, declare an intrinsic that returns it, such as `dateOf(y, m, d)` with `returns: "date"`. Operations on it (`year(d)`, `truncMonth(d)`) are intrinsics. The only backing is `"f64"` (another is D002), the only option is `note` (others are D011), and `scalar(…)` written inline where a type is named, instead of declared in `types`, is D002. A lambda that returns one hands the scalar's name (`"date"`) to a construct's `step`.

## `defineDialect`

```js
import { defineDialect, vector, scalar, exact, tolerance } from "kit/define";

export const myDialect = defineDialect({
  name: "…",
  numberType: "f32" | "f64",     // the type of a bare number literal where nothing else gives one
  types: { … },                  // vector and scalar types
  spaces: { … },                 // where Runtime Lambdas run
  objects: { … },                // handles with members, fixed for every Program
  globals: { … },                // free names every lambda may use, and their types
  intrinsics: { … },             // operations a lambda calls by name
  library: { … },                // operations written in the Runtime Subset itself
  conversions: { … },            // optional: calls that convert f64 ↔ f32
  list: { … }, queries: [ … ],   // optional: members and callback methods on lists
  targets: { … },                // what each target accepts and how it is compared
  slots: { … },                  // the calling convention of each kind of Runtime Lambda
  constants: { calls: "pure" },  // optional: a constant may call a pure helper (default "none")
  params: { object, name, runtime }, // optional: how lambdas read the Program's params (see "Params")
  environment(program) { … },    // optional: what one Program adds (see below)
  text(state) { … },             // the text view: your screen and state as characters (see below)
});
```

Every key is optional except `name`, `numberType`, `spaces`, `targets`, `slots` and `text`. An unknown key is refused (D001); a missing `text`, or one that is not a function, is D020.

### `types`

```js
types: {
  vec2: vector(2, "f32"),
  color: vector(3, "f32", { aliases: { r: "x", g: "y", b: "z" } }),
}
```

A type may not be named like a built-in (`f32`, `f64`, `bool`, `str`, `null`, `void`, `unknown`) or a type variable (one capital letter) (D007). A vector type is built by name in a lambda, `vec2(x, y)`, and read as `.x .y .z .w` (or its aliases). Vector types are **nominal**: `vec3` and `color` both hold three f32s and never mix. Operators work on them component by component (`a + b` on two `vec2`s; `v * 2` scales). `scalar(of, { note })` declares a nominal scalar (see "Types" above).

### `spaces`

An **Iteration Space** is what a Runtime Lambda runs over: each pixel, each row, each entity per frame.

```js
spaces: { pixel: { pure: true } }
```

`pure: true` means a lambda in this space may read and compute but never change anything; the kit enforces it. In this draft, **every space must be pure**: effects (writes, sounds, spawning) are not part of the API yet.

### `objects` and `globals`

An object is a handle a lambda reads members from, like `u.t` or `row.price`.

```js
objects: {
  Uniforms: { label: "the uniforms (u)", members: { t: "f32", aspect: "f32" } },
}
```

A member is a type name (a read-only value), or one of:

- `{ value: "f64", size: true }`: a read-only number that stays small for the whole run, so a loop may count up to it.
- `{ fn: { params: ["f64", "f64"], returns: "f64" } }`: a method. Add `minArgs: n` for optional trailing arguments.
- `{ keyed: { what: "column", keys: { revenue: { params: [], returns: "f64" }, … } } }`: a method whose first argument must be a string literal naming one of `keys`; the rest of its signature depends on which. `g.sum("revenue")` is a keyed call. An unknown key gets a "did you mean".

`globals` names what a lambda may use without receiving it, with its type: `globals: { Math: "Math" }` (with a `Math` object declared). If a global named `$` is declared, lambdas may read `$.name`; that is how a language gives every lambda the Program's parameters (see the free-name rule below). Declare it statically, `globals: { $: "Params" }` with `objects: { Params: { label: "the params ($)", members: {} } }`, and let `environment(program)` add one member per parameter.

### `intrinsics`

An intrinsic is an operation a lambda calls by name, implemented by each target.

```js
intrinsics: {
  floor: {
    params: ["T"], returns: "T", numeric: "number", componentwise: true,
    ref: Math.floor,
    spell: { js: "Math.floor($0)", glsl: "floor($0)" },
  },
  smoothstep: {
    params: ["f32", "f32", "f32"], returns: "f32",
    ref: (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); },
    spell: {
      js: { call: "smoothstep($0, $1, $2)", prelude: "const smoothstep = (a, b, x) => …;" },
      glsl: "smoothstep($0, $1, $2)",
    },
  },
}
```

- `params`, `returns`: the signature, in type names. `minArgs` and `rest` (a type for extra arguments) as for methods.
- `numeric`: what a type variable may be: `"number"` (a number or any vector) or `"vector"` (a vector only).
- `ref`: the **reference implementation** in plain JavaScript, on numbers. The kit's interpreter runs it to decide what a lambda means; each target's output is compared with it. Required.
- `componentwise: true`: `ref` is applied to each component of vector arguments.
- `spell`: how each target writes the call. `$0`, `$1` are the arguments. Either a string or `{ call, prelude }`, where `prelude` is text the target needs defined once. **Every target that accepts a space must spell every intrinsic** (D003).
- Intrinsics are pure. There is no `effects` field in this draft.

### `library`

Operations written in the Runtime Subset, as source text. They are compiled like any lambda, so they reach every target without a spelling. A Program gets the ones it uses.

```js
library: {
  pmod: { fn: "(x, n) => x - n * floor(x / n)" },
  OCTAVE_COS: { const: "cos(0.5)" },
}
```

### `targets`

```js
targets: {
  js:   { accepts: "*",       compare: exact() },
  glsl: { accepts: ["pixel"], compare: tolerance(1e-3) },
}
```

`accepts` is `"*"` or the spaces a target can compile. `compare` is how the target's output is checked against the reference implementation: bit for bit, or within one stated figure.

### `slots`

A **slot convention** says how one kind of Runtime Lambda is called: what it receives, what it returns, and where it runs.

```js
slots: {
  pixel: { params: ["vec2", "Uniforms"], returns: "color", space: "pixel" },
}
```

`returns: "infer"` takes the type of what the body returns; a construct's state can read that type (see "Construct state").

A convention may also be a function `(ref, program, state) => convention`, for languages where a lambda's parameter types depend on the Program or on where the lambda sits. It is called once per lambda, when the Program is lowered, and what it returns is checked as a static convention is (an unknown type name is D002, an undeclared space D005). `ref` is `{ id, kind, on, index, key }`:

- `id`: the lambda's id, unique within the Program: `<on>.<slot>#<index>`; a `once` slot has no `#<index>` (`swirl.pixel`); inside a `recordOf(lambda(…))` the key follows (`monthly.agg#4.total`); when several lambdas of one call share a key, or all lack one, their place follows in brackets (`x.k#0[0]`, `x.k#0[1]`, `x.k#0.a[1]`); when two instances have one name, the second and later get `~2`, `~3` in the id (`t~2.k`), while `on` keeps the real name;
- `kind`: the convention's name;
- `on`: the **name** of the construct instance the lambda sits on (`"monthly"`), or the Program's name (a string, not the record; see "Construct state" for how an instance is named);
- `index`: the call's position among that instance's calls, from 0, counting every slot (in a construct without `record: "calls"`, counted in the order the slots are declared, since that record keeps no order across slots);
- `key`: the map key, when the lambda is one value of a `recordOf(lambda(…))` argument; otherwise absent.

`state` is the construct's state just before this call (or `undefined` if the construct declares none). Return a string instead of a convention to refuse the lambda, with the string as the reason (B011, at the call).

Helpers and constants (`fn` and `const` units, below) get their conventions from the kit; do not declare them. A constant is computed once and may read or change nothing; it may call a helper only if the Dialect declares `constants: { calls: "pure" }` (any other value of `calls` but `"none"` is D011). A Dialect may not name a convention `helper`, `const` or `method` (D007).

### `environment(program)`

The part of a language that depends on one Program. It receives the record the generated builder produced (see "The record") and returns what that Program adds: `{ objects, globals }`, merged into the static declarations. Members merge into an existing object; a name declared twice is refused.

```js
environment(program) {
  const members = {};
  for (const [name, p] of Object.entries(program.params)) members[name] = paramType(p);
  return { objects: { Uniforms: { members } } };
}
```

This is plain JavaScript and may compute anything from the record. It runs **before** any lambda is lowered, so it cannot know a lambda's inferred type: anything that changes from one call to the next (a table's columns after each step) belongs in a construct's state, not here.

### `text(state)`

Every Dialect has a **text view**: a function from what your language's host shows (its screen and state) to characters a model can read, sized for a model's context. A model working in the workbench sees your language through it, so make it say what a person would see: a picture as characters, a table as rows. You decide what `state` is; say it in a comment. The fields Dialect takes a rendered frame, `{ width, height, pixels }`, and draws it as at most 64 by 32 characters, dark to light; the data Dialect takes one table, `{ name, columns, rows }`, and prints its columns with their types and its first 20 rows. A Dialect without `text`, or with one that is not a function, is refused (D020).

```js
text(table) {
  const names = Object.keys(table.columns);
  return [`${table.name}: ${table.rows.length} rows`, names.join(" | "), ...table.rows.slice(0, 20).map((r) => names.map((c) => String(r[c])).join(" | "))].join("\n");
}
```

## `defineGrammar`

```js
import { defineGrammar, name, ref, data, lambda, opt, rest, oneOf, recordOf, listOf, enumOf, object } from "kit/define";

export const program = defineGrammar(myDialect, {
  root: "program",
  params: { slot: "param" },     // optional: the root slot that declares the Program's params (see "Params")
  constructs: { … },
});
```

The result is the root builder function: `program("name")` starts a Program. A Program file exports it as a function of its params, `export default ($) => program("name")…;` (see "Params").

### Constructs

A **construct** is a thing a Program declares, with its own builder methods. The root construct is the Program itself. A construct declares how it opens and which **slots** (builder methods) it has.

```js
constructs: {
  program: {
    opens: [name()],                                   // program("revenue")
    slots: { … },
  },
  table: {
    parent: "program",                                 // opened from the program builder
    opens: [name(), ref("table", { as: "from" })],     // .table("monthly", "sales")
    record: "calls",                                   // keep its calls in order (see "The record")
    state: { … },                                      // see "Construct state"
    slots: { … },
  },
}
```

A child construct (`parent: "…"`) is opened by calling its name on the parent's builder. Its builder also has every method of its parent, so calling a parent method ends the child: `program("p").table("a", "raw").derive(…).table("b", "a")…`. A child and its parent may not have a method of the same name (D010).

### Slots, two kinds

**Declaration slots** take arguments: names, references, values and Runtime Lambdas.

```js
param:  { kind: "decl", args: [name("param"), data(ParamShape)], check: checkParam },
pixel:  { kind: "decl", args: [lambda("pixel")], once: true, required: true },     // .pixel((uv, u) => …)
derive: { kind: "decl", args: [data("string"), lambda("row")] },                   // .derive("revenue", row => …)
sort:   { kind: "decl", args: [rest(ref("column"))] },
```

**Unit slots** declare a helper function or a constant of the Program, by name and source. Lambdas call them by name.

```js
fn:    { kind: "unit", unit: "fn" },      // .fn("ring", (d, r) => …)
const: { kind: "unit", unit: "const" },   // .const("K", "0.5")
```

Options on any slot: `once: true` (at most one call), `required: true` (`.build()` refuses a construct without it), `as: "params"` (the record key; defaults to the slot's name), `check(call, ctx)` (see "Your own checks").

### Arguments

| Spec | Takes | The generated builder checks |
|---|---|---|
| `name(ns)` | a string that declares a name in Program namespace `ns` | it is an identifier (B004), and not already declared in `ns` (B002); a construct's opening `name()` is a label instead, any non-empty string (`field("domain-warp")`) |
| `ref(ns)` | a string naming something in namespace `ns` | it exists, with a "did you mean" (B003) |
| `data(shape)` | a value of this shape | the shape (B004) |
| `lambda(convention)` | a Runtime Lambda, lowered with that slot convention | its form (B007) and free names (B008); lowering checks its body |
| `opt(spec)` | the spec, or nothing; only at the end of the list | as the spec, when given |
| `rest(spec)` | any number of the same; only last | each one |

Any spec takes `{ as: "key" }` as a last argument, naming its record key: `ref("table", { as: "from" })`. Two things of one construct that the record would put under one key are refused (D017): two opening arguments (`name("table"), ref("table")` both land on `table`), an opening argument and a child construct, two slots' names or `as`, `units` beside a unit slot, `calls` in a `record: "calls"` construct. A construct's opening arguments may not hold a `lambda()` (D019: not built).

**Method names.** A slot or construct may not be named `check` or `build` (the builder's own methods, D010), nor like a property that runtimes probe on every object: `then`, `toJSON`, `inspect`, `constructor`, `valueOf`, `toString`, `prototype`, `nodeType`, `asymmetricMatch`, `$$typeof` (D018).

**Namespaces.** A Program namespace is any string: names declared with `name("table")` anywhere in the Program are what `ref("table")` accepts. A `name()` with no namespace is the construct's own name, declared in the namespace named after the construct (`name()` on `table` declares into `"table"`). A namespace may instead belong to a construct's **state** (see below): then `ref` resolves against the state just before the call, so `.groupBy("month")` is checked against the table's columns at that step.

**Shapes:** `"number"`, `"string"`, `"boolean"`, `"string[]"`, `"number[]"`, an object of shapes (a key ending in `?` is optional: `{ value: "number", "min?": "number" }`), `oneOf(a, b, …)`, `enumOf([...])` (strings or numbers), `recordOf(shape)` (an object with any keys, each value of the shape), `listOf(shape)`. A number takes bounds, `data("number", { min: 1, max: 120, whole: true })`, also inside a shape (`{ opening: data("number", { min: 0 }) }`); a value outside them, or not whole, is B004. A shape may also hold `ref(ns)` (a string that must name something) and `lambda(convention)` (a Runtime Lambda), anywhere inside it. In a `oneOf`, among the forms a value fits, the one holding the most lambdas wins (the first on a tie), at any depth: so a string that parses as an arrow function is the lambda and any other string is the ref or text (`.y("() => 1")` is the lambda, `.y("a")` the ref), and `{ f: () => 1 }` against `oneOf({ f: lambda("v") }, { f: "string" })` is the lambda form. Text that looks like an arrow function (it holds `=>`) but does not parse stays text, with a B007 warning that names the parse error:

```js
limit: { kind: "decl", args: [data("number")] },                           // .limit(10), or .limit($.topN): see "Params"
agg:   { kind: "decl", args: [data(recordOf(lambda("group")))] },           // .agg({ total: g => g.sum("amount") })
join:  { kind: "decl", args: [ref("table"), data({ on: recordOf("string"), "take?": listOf("string") })] },
```

### Construct state

Some constructs change as they are built: a table's columns change at every step, and the lambda in one step must be typed against the columns the steps before it left. A construct with `record: "calls"` may declare a **state** that the kit threads through its calls in order:

```js
state: {
  // The state before the first call. `stateOf(name)` is another construct instance's final state.
  init(opened, { program, stateOf }) {
    // `program.source` is the record key of a root slot declared `source: { kind: "decl", args: [name("source"),
    // data(…)] }`: a decl slot's record key is its name (or its `as`), holding each call's data by name.
    const source = program.source?.[opened.from];
    return { columns: source ? { ...source.columns } : { ...stateOf(opened.from).columns } };
  },
  // The state after one call. `call` is { slot, args }: the call's arguments as passed (a rest(...)
  // argument's values in place, flat; a recordOf argument as its object; lambdas as their source text).
  // `inferred` is the inferred type of each lambda in the call: one type
  // name (or compound type) for a lone lambda; an object by key when every lambda of the call has a
  // recordOf key (a key holding several lambdas has the list of their types); otherwise the list of
  // every lambda's type in call order.
  // `ctx` is { program, stateOf, error }: `program` and `stateOf(name)` are init's (stateOf is another instance's
  // final state, so a join reads it here, with no closure in the state), and `error(code, message, { tip, arg, suggest, fix })`
  // (a check's form; a string third argument is the tip) refuses this call with your own code, pinned at the call. The state you return still applies after an error, so later
  // calls still type; the diagnostic is what makes the Program fail. A code with a reserved letter throws.
  step(state, call, inferred, ctx) {
    if (call.slot === "join") {
      const other = ctx.stateOf(call.args[0]);
      if (state.columns.id !== other.columns.id) ctx.error("T001", `cannot join '${call.args[0]}': its id has another type`, "join tables whose id columns have one type");
      return { columns: { ...other.columns, ...state.columns } };
    }
    if (call.slot === "derive") return { columns: { ...state.columns, [call.args[0]]: inferred } };
    if (call.slot === "agg") return { columns: { ...Object.fromEntries(state.keys.map((k) => [k, state.columns[k]])), ...inferred } };
    return state;
  },
  // Namespaces read from the state: ref("column") on this construct resolves here.
  names: { column: (state) => Object.keys(state.columns) },
}
```

The kit builds a construct with state like this: it computes `init`, then for each call in order it checks the call's `ref`s against the current state, lowers the call's lambdas with their conventions (a convention function receives the current state as its third argument), and passes their inferred types to `step`. So a slot convention can type a row by the table as it stands:

```js
// in defineDialect's slots
row: (ref, program, state) => ({ params: [object(`a row of ${ref.on}`, state.columns)], returns: "infer", space: "row" }),
```

`object(label, members)` makes an object type on the spot, with members as in `objects`. A `stateOf` that would loop (a table built from itself), in `init` or in `step`, is refused (B010). `environment(program)` runs before all of this and does not see state.

All of this happens when the Program is **lowered**, not while it is built: `.check()` and `.build()` do not check a state namespace's `ref`s (lowering does, B003 "at this step"), and a slot `check` sees no state (see "Your own checks").

**A construct without state may still name what its refs mean** from other instances' state: `names: { column: (record, { program, stateOf }) => Object.keys(stateOf(record.table).columns) }` on a chart checks `.x(ref("column"))` against its table's columns at that table's last step, when lowered (B003 with a did-you-mean), with no state or `record: "calls"` of its own. `names` beside `state` is D015 (put it in `state.names`). An instance's name is the value of its construct's `name()` opening, under whatever record key that opening has (`name("table")` too), else its construct's name. `stateOf(name)` finds an instance by its name alone, so every instance of every construct with state shares one namespace of names, and a second one with a name already taken is refused (B002).

### Lambdas: the form, and the free-name rule

A Runtime Lambda is passed as a **function** or as its **source text**:

```js
.pixel((uv, u) => color(uv.x, uv.y, 0))
.pixel("(uv, u) => color(uv.x, uv.y, 0)")
```

Both mean the same: the kit reads a function's text (`String(fn)`) and never calls it. Write an **arrow function**; a `function` expression or a method shorthand (`pixel(uv, u) { … }`) is refused (B007).

Because only the text is read, **a lambda cannot see the variables around it**. Inside a lambda, a free name must be one of:

1. the lambda's own parameters and locals;
2. a Dialect global or intrinsic, or a Library operation;
3. a helper or constant the Program declared with a unit slot (`.fn`, `.const`);
4. `$`, if the Dialect declares it: the Program's parameters;
5. a binding at the **top level of the file** (when the host passes the file's module scope, as the checker does): a top-level arrow function `const f = (…) => …` becomes a helper of the Program (only an arrow its `const` declaration writes itself: one another function returns, `const f = make(3)`, is B012, since what it closes over is lost, and so is an arrow held by a `let`, which may have been reassigned), and a top-level `const` holding plain data (a number, string or boolean, or an array or object of them) a baked constant with that value. A helper's own free names follow the same rule.

Nothing else is free, not even `Math`, `NaN` or `Infinity`, unless the Dialect declares it. Anything else is refused (B008), with a fix: move it to the top level, declare it with `.const(…)`, or make it a parameter and read it from `$`. A top-level binding that is neither such an arrow function nor plain data (a `Map`, `null`, a class instance, an object with a getter) is B012; a `function` declaration is B007 (write `const f = (…) => …`). A name your file declares only inside build-time code (a loop variable, a local of a function that builds the Program) is B013: the lambda cannot see it, so move it to the top level or write its value into the lambda's text, `` `(row) => row.units > ${cut}` ``. A top-level binding may not take the name of a Dialect or Library name, or of a `.fn` / `.const` (B002: rename it), so a name in a lambda has one meaning.

**The host's side.** `.check(options)` and `.build(options)` take `{ scope, sources, buildTime }`: `scope` the file's top-level bindings by name, `sources` each top-level declaration's initializer text, `buildTime` the names declared only below the top level. The resolved helpers and constants are added to the root record's `units`. You do not pass these yourself in the trial: the checker does, through `run` (see "Params").

The body must be in the **Runtime Subset**: `const`/`let`, arithmetic, comparisons, `if`, ternaries, `for` loops with a bound the kit can check, calls to the names above. No `new`, no `this`, no closures that escape, no `async`, no template literals or other string building beyond what the Dialect declares.

### Params, and when each is read

A Program's params are declared by a root slot that takes a name and a declaration whose `value` is the default, `.param("topN", { value: 10, min: 5, max: 50 })`. The Grammar names that slot, `params: { slot: "param" }`, and the Dialect says which object lambdas read the params through, the name they read it by, and which of its members exist only while the Program runs: `params: { object: "Params", name: "$" }` (data), `params: { object: "Uniforms", name: "u", runtime: ["t", "aspect"] }` (fields). The kit owns no param construct; the shape of a declaration is yours.

**A Program file exports a function of its params:**

```js
export default ($) => program("top-customers")
  .param("topN", { min: 5, max: 50, value: 10 })
  .param("year", { options: [2024, 2025, 2026], value: 2026 })
  .table("top", "orders")
  .filter((o) => year(o.placed_at) === $.year)    // in a lambda: a Kernel read, a uniform
  .limit($.topN);                                 // at build time: the plain number 10
```

The host calls it with `run(programFn, { values, scope, sources, buildTime })`, which passes a `$` that answers each declared param with the host's value (else its declared `value`) and records the read. A host's value must fit its declaration (its `value`'s type, finite, inside `min..max`, one of `options`), or `run` throws, and the record's declaration carries it. So a param read by **build-time code** (outside any lambda) is an ordinary value, folded into the record (`.limit($.topN)` records `limit` with `10`); build-time code may branch, loop and do arithmetic on it. Changing it means building again: `needsRebuild(record, ["topN"])` is true, and the host reruns the function with the new value, so a folded param still follows its control; it costs a build, not correctness. The same param read **inside a lambda** is a Kernel read, a uniform, which changes without a rebuild. A param may be read in both places. `run` returns `{ record, diagnostics }` (no record when there is an error); the record keeps the reads under `reads` (`{ param, value, by, file, loc }`, `by` the builder call made next after the read, such as `top.limit#5`, which orders the read but does not say which call used the value), and `lower(record)` adds `params`, each param's binding time (`{ build, kernels, live }`), which `bindingText(lowered)` prints:

```
topN   folded at build, read at 05.js:22 (before top.limit#5)
year   uniform, read by top.filter#0
```

There is **one form** for a value a param gives a slot: `.limit($.topN)`. A lambda where the slot takes a value, `.limit(() => $.topN)`, is B004, with the fix `.limit($.topN)`. Reading a param at build time before its `.param` call, or one that is not declared, is B003 (with a did-you-mean). Reading a member that exists only while the Program runs (fields' `u.t`) at build time is B014: read it inside the lambda. A refusal stands even if build-time code catches it: the run still fails with it. A param's declared `value` must fit its own declaration, finite, inside `min..max` and one of `options` (B004 at the `.param` call). Build-time code reads `$` **by name only**, `$.topN` or `const { topN } = $`: `"topN" in $`, a spread, `Object.keys($)`, `JSON.stringify($)` and a rest pattern are B015. A param may not be named like a property runtimes probe on every object (`then`, `toJSON`, `inspect`, `prototype` …; B004 at the `.param` call), except Object.prototype's `constructor`, `valueOf` and `toString`. The function takes exactly one parameter, the params (C001 otherwise; `($ = {}) => …` is one); it may be named as the lambdas read the params (`$` in data, `u` in fields); a lambda's own `$` is the Dialect's global, so the two never clash.

### The record

`.build()` returns the Program as plain data, the **record**. It is what `environment(program)`, `state.init` and your checks receive, and what the kit lowers. A lambda appears in it as its source text, wherever it was passed (the grammar says which arguments are lambdas, so a check can tell).

- The opening arguments, each under its `as`, else its namespace, else `name`: `field("swirl")` gives `{ name: "swirl" }`; `.table("monthly", "sales")` with the opens above gives `{ name: "monthly", from: "sales" }`.
- A declaration slot whose first argument is `name(…)`: an object from each name to the rest (one value, or an array of several): `{ params: { angle: { value: 2.4 } } }`.
- A declaration slot without a name: its arguments (one value, or an array of several) with `once`; otherwise a list of them, in call order.
- Unit slots: one list, `units: [{ name, kind: "fn" | "const", src }]`, in call order.
- Child constructs: a list of their records under the child's name. A child's calls are in its own record, never in its parent's.
- With `record: "calls"`, a construct's slots are instead one ordered list, `calls: [{ slot, args }]`, so that steps of different kinds keep their order, unit slots included. `ref.index` is a position in this list.

A builder used as a string (in a template literal or `String()`) is its description, `[field builder 'swirl']`, not an error.

### Errors

The generated builder reports with the kit's diagnostic: `{ code, severity, message, tip, loc, range, file }`. `loc` is the builder call's place in the author's file. There is no mechanical `edits` fix: the replacement, when there is one, is in `tip` (and in `fix`, from your own check).

- A misuse that leaves nothing to continue with throws at once: an unknown method (B001).
- Everything else is collected. B002, B004, B006, B007, B009 and your slot checks are found at the call; B003 (for a Program namespace), B005, B008, B012, B013, a top-level binding's B002 and construct checks at `.check()` / `.build()`, when every name is known. `.check()` returns the list; `.build()` throws a `BuildError` carrying all of them if any is an error, and otherwise returns the record.
- `grammar.lower(record)` lowers every Runtime Lambda of a record and returns `{ environment, lambdas, helpers, diagnostics, states }`. Its diagnostics are the state ones (B003 at that step, B010, B011), each at its call, and each lambda's type errors (an unknown column, comparing a string with a number), with lowering's own `L…` codes (and `S…` for what is outside the Runtime Subset), a "did you mean" in the tip where one applies, and the span inside the lambda.

| Code | Reported when |
|---|---|
| B001 | a method the construct does not have, with a "did you mean" |
| B002 | a `name()` already declared in its namespace, or a second construct instance with state under a name another one has |
| B003 | a `ref()` that names nothing, with a "did you mean" |
| B004 | a value that does not fit its shape, naming the part that does not; a param whose declared `value` does not fit its own declaration (not finite, outside `min..max`, not one of `options`); a number that is not finite (`Infinity`, `NaN`) anywhere in a value |
| B005 | `.build()` on a construct missing a `required` slot |
| B006 | a second call to a `once` slot |
| B007 | a lambda that is not an arrow function or its source text, or does not parse |
| B008 | a free name the free-name rule does not allow |
| B009 | a call to a `rejected` name: its message and tip |
| B010 | a construct state that depends on itself through `stateOf` |
| B011 | a slot convention function that refused the lambda (it returned a reason string) |
| B012 | a top-level binding a lambda reads that is neither the arrow function its declaration writes (not one made by another function) nor plain data |
| B013 | a free name the file declares only inside build-time code, not at its top level |
| B014 | a member of the params that exists only while the Program runs (fields' `u.t`), read by build-time code |
| B015 | the params read by build-time code other than by name: `in`, a spread, `Object.keys`, `JSON.stringify`, a rest pattern |
| B016 | the Program's code opens the root a second time in one run (a Program file builds one Program) |
| B017 | the Program's code opens the root but returns something other than its builder chain (`{ program: chain }`, what `.build()` returns, nothing) |

### Refusing what the language does not do

A construct may list names it deliberately does not offer, so that a person who tries one gets a reason and a fix (B009) instead of "no such method". A child construct inherits its ancestors' rejections.

```js
rejected: {
  sql: { message: "SQL text is not an input language", tip: "build the query with table methods: .join, .groupBy, .agg" },
  shader: { message: "raw shader text is not an input language", fix: ".pixel((uv, u) => …)" },
}
```

An entry is `{ message, tip?, fix? }`: `fix` is the replacement text, which the B009 carries (its tip is then `write <fix>` unless you give one).

### Your own checks

A slot's `check(call, ctx)` runs when the slot is called (only if the call itself had no error); a construct's `check(record, ctx)` runs at `.check()` and `.build()`. `call` is `{ slot, args }`. `ctx.program` is the record so far, with the construct being built last in its list. `ctx.state` is always `undefined`: a construct's state needs each lambda's inferred type, so it exists only when the Program is lowered, and anything that needs it (a column that exists at this step) belongs in a state namespace or a convention function, not a check. Report with `ctx.error(code, message, { tip, arg, suggest, fix })`: `arg` is the argument's position, or a path into it (`[1, "on", "customer_id"]`); `suggest` a list of candidates, from which the kit appends its own " Did you mean 'x'?" to your message (so do not write one yourself); `fix` the replacement text. Your codes are the Dialect's own letter and three digits (pick one letter; not `B`, `C`, `D`, `L`, `P`, `S` or `V`); `ctx.error` with a reserved letter throws.

## Worked example: the fields Dialect

The whole of an existing language, a small one for per-pixel color. A Program is `field(name)`, with parameters, helpers and one pixel lambda.

```js
import { defineDialect, defineGrammar, vector, exact, tolerance, name, data, lambda, oneOf, enumOf } from "kit/define";

export const fields = defineDialect({
  name: "fields",
  numberType: "f32",
  types: {
    vec2: vector(2, "f32"), vec3: vector(3, "f32"), vec4: vector(4, "f32"),
    color: vector(3, "f32", { aliases: { r: "x", g: "y", b: "z" } }),
  },
  spaces: { pixel: { pure: true } },
  objects: { Uniforms: { label: "the uniforms (u)", members: { t: "f32", aspect: "f32" } } },
  intrinsics: {
    floor: { params: ["T"], returns: "T", numeric: "number", componentwise: true, ref: Math.floor,
             spell: { js: "Math.floor($0)", glsl: "floor($0)" } },
    mix:   { params: ["T", "T", "f32"], returns: "T", numeric: "number", componentwise: true,
             ref: (a, b, t) => a + (b - a) * t,
             spell: { js: { call: "mix($0, $1, $2)", prelude: "const mix = (a, b, t) => a + (b - a) * t;" }, glsl: "mix($0, $1, $2)" } },
    length: { params: ["T"], returns: "f32", numeric: "vector", ref: Math.hypot,
              spell: { js: { call: "length($0)", prelude: "const length = (v) => Math.hypot(...v);" }, glsl: "length($0)" } },
    sin:   { params: ["f32"], returns: "f32", ref: Math.sin, spell: { js: "Math.sin($0)", glsl: "sin($0)" } },
    // … fract, abs, min, max, clamp, cos, sqrt, pow, atan2, smoothstep, ihash, vadd … in the same form
  },
  library: {
    pmod: { fn: "(x, n) => x - n * floor(x / n)" },
    OCTAVE_COS: { const: "cos(0.5)" },
    // … vnoise, OCTAVE_SIN, fbm
  },
  targets: {
    js:   { accepts: "*",       compare: exact() },
    glsl: { accepts: ["pixel"], compare: tolerance(1e-3) },
  },
  slots: { pixel: { params: ["vec2", "Uniforms"], returns: "color", space: "pixel" } },

  // Each param becomes a uniform, read in the pixel lambda as u.name.
  environment(program) {
    const members = {};
    for (const [n, p] of Object.entries(program.params)) {
      const t = "options" in p ? enumOf(p.options) : typeof p.value === "boolean" ? "bool" : "f32";
      const size = typeof p.max === "number" && p.max <= 2 ** 24 - 1;   // a capped number may bound a loop
      members[n] = size ? { value: t, size: true } : t;
    }
    return { objects: { Uniforms: { members } } };
  },
  text: frameText,   // a rendered frame { width, height, pixels } as at most 64 × 32 characters (kit/dialects/fields/text.js)
});

const ParamShape = oneOf(
  { value: "number", "min?": "number", "max?": "number", "step?": "number" },
  { value: "string", options: "string[]" },
  { value: "boolean" },
);

export const field = defineGrammar(fields, {
  root: "field",
  constructs: {
    field: {
      opens: [name()],
      slots: {
        param: {
          kind: "decl", args: [name("uniform"), data(ParamShape)], as: "params",
          check({ args: [n, p] }, ctx) {
            if (n === "t" || n === "aspect") ctx.error("F002", `param '${n}' clashes with the built-in uniform u.${n}`, { arg: 0, tip: "rename the param" });
            if (typeof p.value === "number" && (p.value < (p.min ?? -Infinity) || p.value > (p.max ?? Infinity)))
              ctx.error("F001", `param '${n}': its value ${p.value} lies outside its range`, { arg: 1, tip: "move the value inside min..max" });
          },
        },
        fn:    { kind: "unit", unit: "fn" },
        const: { kind: "unit", unit: "const" },
        pixel: { kind: "decl", args: [lambda("pixel")], once: true, required: true },
      },
    },
  },
});
```

A Program in it, and the record `.build()` returns:

```js
const swirl = field("swirl")
  .param("angle", { value: 2.4, min: 0, max: 6.3 })
  .fn("ring", (d, r) => smoothstep(r - 0.01, r, d) - smoothstep(r, r + 0.01, d))
  .pixel((uv, u) => {
    const p = uv - vec2(0.5, 0.5);
    return mix(color(0, 0, 0), color(1, 0.8, 0.2), ring(length(p), 0.3 + 0.1 * sin(u.t * u.angle)));
  })
  .build();

// {
//   name: "swirl",
//   params: { angle: { value: 2.4, min: 0, max: 6.3 } },
//   units: [{ name: "ring", kind: "fn", src: "(d, r) => smoothstep(r - 0.01, r, d) - …" }],
//   pixel: "(uv, u) => { … }",
// }
```

What a mistake looks like:

```js
field("bad").param("angle", { value: 2.4 }).pixle((uv, u) => color(0, 0, 0));
// throws BuildError:
// B001 bad.js:1:44 field has no method "pixle". Did you mean 'pixel'?
//   tip: its methods are check, build, param, fn, const, pixel

const K = 0.5;
field("bad").pixel((uv, u) => color(uv.x * K, 0, 0)).build();
// throws BuildError:
// B008 bad.js:2:14 the pixel lambda reads "K", which it cannot see: only its text is compiled.
//   tip: declare it on the Program, .const("K", "…")

field.lower(field("bad").pixel((uv, u) => color(u.aspct, 0, 0)).build()).diagnostics;
// [{ code: "L002", message: "the uniforms (u) has no member 'aspct'.",
//    tip: "Did you mean 'aspect'? Members: t, aspect.", loc: 1:20 (inside the lambda), … }]
```

## Not built

Effects, store rules and `emit` (every space is pure); fragments and mixins; build-time slots (functions that run while the Program is built and return grammar); Dialect imports; lambdas in a construct's opening arguments (D019). Anything here that you need is a gap to report, not API to invent.
