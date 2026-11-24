# The Definition API (draft)

*Draft for review, 2026-11-24, second revision. Nothing here is built yet. You are being asked to use it on paper and say where it fails you.*

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

Build compound types with helpers from `kit/define`: `list(t, max)` (a list of at most `max` items), `opt(t)` (may be null; a lambda must check it before use), `struct({ x: "f64", y: "f64" }, { optional: ["y"] })`, `union(a, b, …)`, `enumOf(["a", "b"])` (one of these strings or numbers; nominal: two enums with the same values are different types), and `object(label, members)`, an object type made on the spot (see "Construct state").

**There is no integer type.** A whole number is a number. If your language needs integers, say so in your report rather than inventing one.

**Dates and other named scalars.** A Dialect may declare a **nominal scalar** in `types`: a named type stored as a number, which lambdas can compare (`<`, `===`) with its own kind only, and which no arithmetic operator accepts. `date: scalar("f64", { note: "milliseconds since 1970-01-01, UTC" })`. Operations on it (`year(d)`, `truncMonth(d)`) are intrinsics.

## `defineDialect`

```js
import { defineDialect, vector, exact, tolerance } from "kit/define";

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
  environment(program) { … },    // optional: what one Program adds (see below)
});
```

Every key is optional except `name`, `numberType`, `spaces`, `targets` and `slots`. An unknown key is refused (D001).

### `types`

```js
types: {
  vec2: vector(2, "f32"),
  color: vector(3, "f32", { aliases: { r: "x", g: "y", b: "z" } }),
}
```

A vector type is built by name in a lambda, `vec2(x, y)`, and read as `.x .y .z .w` (or its aliases). Vector types are **nominal**: `vec3` and `color` both hold three f32s and never mix. Operators work on them component by component (`a + b` on two `vec2`s; `v * 2` scales). `scalar(of, { note })` declares a nominal scalar (see "Types" above).

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

A convention may also be a function `(ref, program, state) => convention`, for languages where a lambda's parameter types depend on the Program or on where the lambda sits. `ref` is `{ id, kind, on, index, key }`:

- `id`: the lambda's id, `<on>.<slot>#<index>`;
- `kind`: the convention's name;
- `on`: the **name** of the construct instance the lambda sits on (`"monthly"`), or the Program's name;
- `index`: the call's position among that instance's calls, from 0, counting every slot;
- `key`: the map key, when the lambda is one value of a `recordOf(lambda(…))` argument; otherwise absent.

`state` is the construct's state just before this call (or `undefined` if the construct declares none). Return a string instead of a convention to refuse the slot, with the string as the reason.

Helpers and constants (`fn` and `const` units, below) get their conventions from the kit; do not declare them.

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

## `defineGrammar`

```js
import { defineGrammar, name, ref, data, lambda, opt, rest, oneOf, recordOf, listOf, enumOf, object } from "kit/define";

export const program = defineGrammar(myDialect, {
  root: "program",
  constructs: { … },
});
```

The result is the root builder function: `program("name")` starts a Program.

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
| `name(ns)` | a string that declares a name in Program namespace `ns` | it is an identifier, and not already declared in `ns` (B002) |
| `ref(ns)` | a string naming something in namespace `ns` | it exists, with a "did you mean" (B003) |
| `data(shape)` | a value of this shape | the shape (B004) |
| `lambda(convention)` | a Runtime Lambda, lowered with that slot convention | its form (B007) and free names (B008); lowering checks its body |
| `opt(spec)` | the spec, or nothing; only at the end of the list | as the spec, when given |
| `rest(spec)` | any number of the same; only last | each one |

Any spec takes `{ as: "key" }` as a last argument, naming its record key: `ref("table", { as: "from" })`.

**Namespaces.** A Program namespace is any string: names declared with `name("table")` anywhere in the Program are what `ref("table")` accepts. A `name()` with no namespace is the construct's own name, declared in the namespace named after the construct (`name()` on `table` declares into `"table"`). A namespace may instead belong to a construct's **state** (see below): then `ref` resolves against the state just before the call, so `.groupBy("month")` is checked against the table's columns at that step.

**Shapes:** `"number"`, `"string"`, `"boolean"`, `"string[]"`, `"number[]"`, an object of shapes (a key ending in `?` is optional: `{ value: "number", "min?": "number" }`), `oneOf(a, b, …)`, `enumOf([...])` (strings or numbers), `recordOf(shape)` (an object with any keys, each value of the shape), `listOf(shape)`. A shape may also hold `ref(ns)` (a string that must name something) and `lambda(convention)` (a Runtime Lambda), anywhere inside it:

```js
limit: { kind: "decl", args: [data(oneOf("number", lambda("scalar")))] },   // .limit(10) or .limit(() => $.topN)
agg:   { kind: "decl", args: [data(recordOf(lambda("group")))] },           // .agg({ total: g => g.sum("amount") })
join:  { kind: "decl", args: [ref("table"), data({ on: recordOf("string"), "take?": listOf("string") })] },
```

### Construct state

Some constructs change as they are built: a table's columns change at every step, and the lambda in one step must be typed against the columns the steps before it left. A construct with `record: "calls"` may declare a **state** that the kit threads through its calls in order:

```js
state: {
  // The state before the first call. `stateOf(name)` is another construct instance's final state.
  init(opened, { program, stateOf }) {
    const source = program.source?.[opened.from];
    return { columns: source ? { ...source.columns } : { ...stateOf(opened.from).columns } };
  },
  // The state after one call. `inferred` is the inferred type of each lambda in the call: one type
  // name (or compound type) for a lone lambda, an object of them for a recordOf(lambda(…)).
  step(state, call, inferred) {
    if (call.slot === "derive") return { columns: { ...state.columns, [call.args[0]]: inferred } };
    if (call.slot === "agg") return { columns: { ...pick(state.columns, state.keys), ...inferred } };
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

`object(label, members)` makes an object type on the spot, with members as in `objects`. A `stateOf` that would loop (a table built from itself) is refused (B010). `environment(program)` runs before all of this and does not see state.

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
4. `$`, if the Dialect declares it: the Program's parameters.

Nothing else is free, not even `Math`, `NaN` or `Infinity`, unless the Dialect declares it. Anything else is refused at the call (B008), with a fix: declare it with `.const(…)`, or make it a parameter and read it from `$`. A top-level `const K = 3` in your file is **not** visible; declare it with `.const("K", "3")`. In the same way, `$.topN` written outside a lambda (`.limit($.topN)`) means nothing: write `.limit(() => $.topN)` where the slot accepts a lambda.

The body must be in the **Runtime Subset**: `const`/`let`, arithmetic, comparisons, `if`, ternaries, `for` loops with a bound the kit can check, calls to the names above. No `new`, no `this`, no closures that escape, no `async`, no template literals or other string building beyond what the Dialect declares.

### The record

`.build()` returns the Program as plain data, the **record**. It is what `environment(program)`, `state.init` and your checks receive, and what the kit lowers. A lambda appears in it as its source text, wherever it was passed (the grammar says which arguments are lambdas, so a check can tell).

- The opening arguments, each under its `as`, else its namespace, else `name`: `field("swirl")` gives `{ name: "swirl" }`; `.table("monthly", "sales")` with the opens above gives `{ name: "monthly", from: "sales" }`.
- A declaration slot whose first argument is `name(…)`: an object from each name to the rest (one value, or an array of several): `{ params: { angle: { value: 2.4 } } }`.
- A declaration slot without a name: its arguments (one value, or an array of several) with `once`; otherwise a list of them, in call order.
- Unit slots: one list, `units: [{ name, kind: "fn" | "const", src }]`, in call order.
- Child constructs: a list of their records under the child's name. A child's calls are in its own record, never in its parent's.
- With `record: "calls"`, a construct's slots are instead one ordered list, `calls: [{ slot, args }]`, so that steps of different kinds keep their order. `ref.index` is a position in this list.

### Errors

The generated builder reports with the kit's diagnostic: `{ code, severity, message, tip, loc, range, edits? }`. `loc` is the builder call's place in the author's file. `edits`, when present, is the mechanical fix.

- A misuse that leaves nothing to continue with throws at once: an unknown method (B001).
- Everything else is collected. `.check()` returns the list; `.build()` throws a `BuildError` carrying all of them if any is an error, and otherwise returns the record.
- A lambda's type errors (an unknown column, comparing a string with a number) come from the kit's lowering, with their own `L…` codes, a "did you mean" where one applies, and the span inside the lambda.

| Code | Reported when |
|---|---|
| B001 | a method the construct does not have, with a "did you mean" |
| B002 | a `name()` already declared in its namespace |
| B003 | a `ref()` that names nothing, with a "did you mean" |
| B004 | a value that does not fit its shape, naming the part that does not |
| B005 | `.build()` on a construct missing a `required` slot |
| B006 | a second call to a `once` slot |
| B007 | a lambda that is not an arrow function or its source text, or does not parse |
| B008 | a free name the free-name rule does not allow |
| B009 | a call to a `rejected` name: its message and tip |
| B010 | a construct state that depends on itself through `stateOf` |

### Refusing what the language does not do

A construct may list names it deliberately does not offer, so that a person who tries one gets a reason and a fix (B009) instead of "no such method". A child construct inherits its ancestors' rejections.

```js
rejected: {
  sql: { message: "SQL text is not an input language", tip: "build the query with table methods: .join, .groupBy, .agg" },
}
```

### Your own checks

A slot's `check(call, ctx)` runs when the slot is called; a construct's `check(record, ctx)` runs at `.build()`. `call` is `{ slot, args }`. `ctx.program` is the record so far, with the construct being built last in its list; `ctx.state` is that construct's state before the call, when it has one. Report with `ctx.error(code, message, { tip, arg, suggest, fix })`: `arg` is the argument's position, or a path into it (`[1, "on", "customer_id"]`); `suggest` a list of candidates for a "did you mean"; `fix` the replacement text. Your codes start with the Dialect's own letter (pick one; not `B`, `C`, `D`, `L`, `P` or `S`).

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
// B001  bad.js:1:43  field has no method "pixle"; did you mean "pixel"?
//   edits: replace "pixle" with "pixel"

const K = 0.5;
field("bad").pixel((uv, u) => color(uv.x * K, 0, 0)).build();
// B008  bad.js:2:14  the pixel lambda reads "K", which it cannot see: only its text is compiled.
//   tip: declare it on the Program, .const("K", "0.5"), or make it a param and read u.K

field("bad").pixel((uv, u) => color(u.tme, 0, 0)).build();
// L002  bad.js:1:38  the uniforms (u) has no member "tme"; did you mean "t"?
```
