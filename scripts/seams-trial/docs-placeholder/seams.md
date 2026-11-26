# Seams: using languages written apart, together

*A **workbench** can run several small languages at once, each from its own **package**. The packages are usually written by different people, and none knows the others exist. This page covers what crosses between them: what a language **offers** (its outputs), what it **accepts** (its inputs), the spaces and units it measures in (its **frames**), and the **glue program** that joins packages. How a package runs is in `runtime.md`; the package format is in `packaging.md`.*

**Reading the snippets.** In the code on this page, a word in angle brackets is a name you choose: `<port>`, `<field>`, `<frame>`, `<part>`, `<slot>`, `<name>`. A digit tells two of a kind apart (`<frame1>`, `<frame2>`), and `<…>` stands for text or calls you write. Everything outside angle brackets is literal: keys such as `seam`, `note`, `from`, `delivery`, `record`, `rename` and `delay`, the handles `.out`, `.in` and `.frame`, the seam type spellings, and all punctuation. Don't type the angle brackets.

## The idea

Each language describes its own world and nothing else. To be usable by strangers, it declares **ports** in a shared vocabulary, the **seam types**:

- an **output** is a value or a stream of events the language offers;
- an **input** is a value or a stream of events it accepts. What it does with them is its own business.

A **glue program** builds one part from each package, **wires** an output of one to an input of another, and says how their frames relate. Every fact that involves two languages lives in the glue. A package never mentions another package, so its author can't know what its ports will be wired to.

The kit converts values on the wire. If the glue says how one part's frame relates to another's, a position crossing the wire is converted for you. Nobody scales a position by hand.

## Seam types

| Seam type | Written | Means |
|---|---|---|
| scalar | `f64`, `bool`, `str` | a plain number, truth value or string |
| quantity | `f64@<frame>` | an amount measured in a frame's unit: a length, a radius, a duration (`f64@s`) |
| point | `point1@<frame>`, `point2@<frame>`, `point3@<frame>` | a position in a frame. `point1` is a position on one axis: an instant `point1@s`, a temperature, a step of a pattern |
| vector | `vec2@<frame>`, `vec3@<frame>`; untagged `vec2`, `vec3` | a displacement, a size: a difference of two points |
| rate | `f64@<frame>/s`, `vec2@<frame>/s`, `vec3@<frame>/s` | a quantity or vector per second: a speed, a velocity |
| enum | `'<value1>' \| '<value2>'` | one string from a closed set |
| record | `{ <field1>: point1@<frame>, <field2>: f64 }` | named fields, each a seam type |
| list | `list<T, 8>` | at most 8 values of type `T` |
| `Event<R>` | `Event<{ <field>: point1@<frame> }>` | the records of type `R` that one step produced; usually none. Only at a port's top |

`<frame>` is one of **your own** frames (below), or `s`.

- **Seconds are the kit's.** The frame `s` (1-D, seconds) exists in every package without being declared: `f64@s` is a duration, `point1@s` an instant, `f64@<frame>/s` a speed. Don't declare a frame named `s`. Rates are written per second only.
- Every output that is not an `Event` is a **signal**: a value that is fresh after each step.
- **Points, vectors and quantities are different kinds.** A point converts with a scale and an offset; a vector, a quantity and a rate with the scale only. A point never feeds a vector, and a rate never feeds a non-rate. Choose the kind that says what the value is: a position is a point, a velocity a rate, a size a vector, a radius a quantity.
- **Untagged numbers never convert.** `f64` and `vec2` cross unchanged, and only into an untagged port.

### Pairing with your own types

At each port the kit checks that your Dialect's own type has the seam type's shape:

| Seam type | Your type |
|---|---|
| `f64`, `f64@frame`, a rate of a quantity, `point1@frame`, `bool`, `str` | `"f64"` (`"bool"`, `"str"`) |
| `point2@frame`, `vec2@frame`, `vec2`, `vec2@frame/s` | a `vector(2, "f64")` type (the 3-D kinds: `vector(3, "f64")`) |
| an enum | `enumOf([...])` with the same strings |
| a record | `struct({ … })` with the same field names, each paired by these rules |
| `list<T, max>` | `list(T, max)` with the same max or less |

A type that does not fit is refused when the Dialect is defined, naming the port (a D code). A vector type is declared once, in the Dialect's `types`, and then named wherever it is used (a port, a member, a `state` field); writing `vector(…)` inline in `state` is D023:

```js
// <package>.dialect.js
import { defineDialect, vector } from "kit/define";

types: { <vec>: vector(2, "f64") },        // then "<vec>" in members and state: { <path>: "<vec>" }
```

## Ports, for a language's author

Ports go in `defineDialect`, beside `state`. Every tagged port and every `Event` port needs a `note` (D024): what the value is, in which frame, and when it changes. The note is what a stranger reads to decide what to wire.

### Outputs

```js
// <package>.dialect.js
state: { <path1>: "f64", <path2>: "bool", … },
ports: {
  out: {
    <port1>: { seam: "Event<{ <field1>: str, <field2>: point1@<frame>, <field3>: f64 }>", note: "<what one record means: each field, its frame and its range>" },
    <port2>: { seam: "f64@<frame>/s", from: "<path1>", note: "<what the value is, in which frame, and when it changes>" },
    <port3>: { seam: "bool", from: "<path2>", note: "<what true and false mean>" },
  },
},
```

- **A value output reads your run's `state`**: `from` is a path (`"<path>"`, `"<path>.<path>"`) or a lambda `(s) => …`, written as a UI value lambda is. A lambda may build a point or vector from scalars as an array literal of exactly its dims: `from: (s) => [s.<path>.x, s.<path>.y]` for a `point2`.
- **An `Event` output has no `from`** (D026). Your runtime pushes its records during a step (`runtime.md`), so nothing about it lives in your state.

### Inputs

```js
// <package>.dialect.js
ports: {
  in: {
    <port1>: {
      seam: "Event<{ <field1>: point1@<frame>, <field2>: f64 }>",
      note: "<what a record does, each field's frame and range>; <slot> lambdas read the record as <record-name>",
      delivery: "reliable",                                  // the default; or { keepLast: 8 }
      record: { name: "<record-name>", slots: ["<slot>"] },  // <slot> lambdas read <record-name>.<field1> and <record-name>.<field2>
    },
    <port2>: { seam: "f64@<frame>/s", default: 0, note: "<what the value does, in which frame>" },
    <port3>: { seam: "f64@s", default: 0.5, note: "<what the value does, in seconds>" },
  },
},
inputs: { object: "<Object>", name: "<inputs-name>" },     // value inputs, read in lambdas as <inputs-name>.<port2>
objects: { …, <Object>: { label: "<…>", members: {} } },   // declared empty: the kit fills it
globals: { …, <inputs-name>: "<Object>" },
```

- **A value input** (anything but an `Event`) has a `default`, read when nothing is wired, or `required: true` (the glue must wire it). A vector `default` is an array. Lambdas read value inputs through the one object `inputs` names, the way params are read through `$`: `<inputs-name>.<port3>` is an `f64`. A point or vector input reads as your one `vector` type of its dims; if you have several, say which with `type: "<type>"`. Your runtime gets them too (`runtime.md`).
- **An `Event` input** delivers, before each of your steps, the records produced since your last step, in order, already converted into your frames. It takes no `default` or `required`.
  - **A field of its record may declare a default**, `<field>: <type> = <value>` (a number, `true` or `false`, a `'<string>'`, or a list such as `[0, 1]` for a vector): `seam: "Event<{ <field1>: point2@<frame>, <field2>: f64 = 1 }>"`. A wire from a producer whose record lacks the field fills your default into every record; a producer that has the field gives its own value. A field with no default must come from the producer (S202). Only a top-level field of an Event input's record takes a default; one elsewhere, or one that does not fit its type, is D028.
  - `delivery: "reliable"` (the default) keeps every record. The composition checks that the queue can't overflow (S116, from the maxes in `runtime.md`). `delivery: { keepLast: n }` keeps the newest `n` and drops older ones, counting the drops.
  - `record: { name, slots }` lets lambdas read the record: lambdas of the listed slot conventions read its fields through the global `name` (`<record-name>.<field2>`). It is null when your runtime calls such a lambda without a record, so a lambda checks it first: `if (<record-name> != null) { … <record-name>.<field2> … }` or `if (<record-name> == null) return;` (an unchecked read is L008). No other lambda may read it (L004). Your runtime sets `name` before calling such a lambda, once per record (`runtime.md`). Without `record`, only your runtime sees the records.
- **A Grammar can name an input** with `ref("in")`, as an argument or inside a `data({ … })` shape, checked against the inputs you declare, with a did-you-mean (B003). `ref("in", { kind: "event" })` accepts only Event inputs and `ref("in", { kind: "value" })` only value inputs. Then a Program can say, for example, which of its parts an input drives: `.<call>("<name>", { <option>: "<port>" })`. Your runtime reads the name from the record and the records from that input.
- **One wire per input.** Two outputs cannot feed one input.

## Frames

A **frame** is a coordinate space or a unit your language measures in. Frames are declared in the Dialect's `frames`, and the edges between your own frames in the Dialect's `edges`, a key beside `frames` (not inside a frame):

```js
// <package>.dialect.js
frames: {
  <frame1>: {
    dims: 1,
    note: "<which way the axis points, where 0 is, and what one unit is>",
    extent: (record) => ({ min: [-0.5], max: [record.<slot> - 0.5] }),
  },
  <frame2>: { dims: 1, note: "<which way the axis points, where 0 is, and what one unit is>" },
},
edges: () => [{ from: "<frame1>", to: "<frame2>", scale: 2.5, offset: 0 }],
```

- `dims`: 1, 2 or 3. A 1-D frame holds positions (`point1@<frame>`) and amounts (`f64@<frame>`).
- `note` (required): which way each axis points, where the origin is and what one unit is. A composer reads it to relate your frame to someone else's.
- `extent(record)` (optional): the box your frame's content fills in a built Program (the record `.build()` returns), as `{ min, max }`, one number per dim each. A 2-D box is `{ min: [0, 0], max: [record.<slot1>, record.<slot2>] }`. It lets a composer write `"fit"`.
- A frame has only these three keys. Edges are not a frame's key: they are the Dialect's `edges(record)` above (D030 if you put `edges` inside a frame).

`edges(record)` (optional, a key of the Dialect beside `frames`): `[{ from, to, scale, offset }]` between **your own** frames; above, one unit of `<frame1>` is 2.5 units of `<frame2>`. You can't relate your frame to another package's: you don't know it.

Frames of different packages are different frames, even with the same name: `<part1>.<frame>` and `<part2>.<frame>` are unrelated until a glue program relates them.

An **edge** `{ scale, offset }` takes a point `v` in one frame to `v * scale + offset` in the other (a vector, quantity or rate to `v * scale`). `scale` and `offset` are a number (every axis) or an array (one per axis). A negative scale flips an axis, as between y down and y up. There is no rotation.

## The glue program, for a composer

```js
// workbench.js
import { compose } from "kit/compose";
import { <package1> } from "<package1>";   // a package by its name: its Grammar's export
import { <package2> } from "<package2>";

export default ($) => {
  const <part1> = <package1>("<part1>").<call>(<…>).<call>(<…>);
  const <part2> = <package2>("<part2>").<call>(<…>);

  return compose("<name>")
    .part(<part1>)
    .part(<part2>)
    .frame(<part1>.frame.<frame1>, <part2>.frame.<frame2>, "fit")
    .wire(<part1>.out.<port1>, <part2>.in.<port2>, { rename: { <field1>: "<field2>" } })
    .wire(<part1>.out.<port3>, <part2>.in.<port4>)
    .wire(<part2>.out.<port5>, <part1>.in.<port6>, { delay: true })
    .show(<part2>);
};
```

A glue program is not a package. It may import `kit/compose`, `kit/define` and each package it composes by the package's `name`, which resolves to the module the manifest's `entry.grammar` names. Nothing else: no relative path, no other bare name, no dynamic import (K007).

| Call | Does |
|---|---|
| `compose(name)` | starts the composition; `name` is lowercase letters, digits and `-` |
| `.part(builder)` | adds a part: a Program built by one package's Grammar, exactly as it would be on its own. Its opening name (`<package1>("<part1>")`) is the part's name, unique in the workbench |
| `.frame(a, b, edge)` | relates frame `a` of one part to frame `b` of another, by an edge `{ scale, offset }` from `a` to `b` |
| `.frame(a, b, "fit")` | the same, with the edge computed so `a`'s extent fits inside `b`'s, centered, one scale for every axis. Both frames need an `extent`, and the same `dims` |
| `.wire(out, in, options?)` | connects an output of one part to an input of another. Options: `rename`, `delay`, `overflow` (below) |
| `.show(part)` | the part whose stage the page shows (one); the others still run |

- **Handles.** Every builder has `.out.<port>`, `.in.<port>` and `.frame.<frame>`. A handle only names a port or frame: pass it to `.wire` and `.frame`, and nothing else. Reading a property of one, using one in arithmetic, or testing one in a condition is S301.
- **Records meet by field name.** Every field the input takes must be in the output's record, with a matching kind. The output's other fields are dropped on the wire.
- **`rename: { <outputField>: "<inputField>" }`** renames record fields on this wire, as data: above, `<part1>`'s `<field1>` arrives as `<part2>`'s `<field2>`. It works on an Event's records, a record value and a list of records. A wire cannot compute or transform a value; the glue has no lambdas.
- **`delay: true`** makes the input read what the output held when the instant began, instead of what it holds after this instant's step. Two parts that feed each other make a loop, refused as S115 unless one wire in the loop is delayed. Above, `<part2>` feeds `<part1>` back, so that wire is delayed.
- **The kit converts on the wire.** For each tagged field, the kit finds a path of frame edges from the output's frame to the input's (edges compose, and run backward too), and converts by kind. For instance, `"fit"` from a 1-D extent `[-0.5, 15.5]` into `[-0.5, 31.5]` has scale 2 and offset 0.5: a point `x` lands on `2x + 0.5`, and a rate arrives ×2.
- **`overflow: "keepLast"` or `overflow: "keepFirst"`** is for an Event wire whose records can outrun the input (S116). With it, each step of the input's part takes at most the input's max: the newest records, or the first, and the rest are dropped and counted (the run's `stats().overflow`, and one N001 warning per wire). S116 then is a warning that names the policy. The input's max never changes. Use it when losing records is fine (a held button, a burst of sparks); when every record matters, raise the max in the input's runtime instead. A package's `reference.md` gives each Event port's max per step and its delivery, so you can see S116 coming.
- **The page's controls are a part.** `page` (`import { compose, page } from "kit/compose"`) is a built-in part whose Event outputs are the controls: `page.out.pad` (`Event<{ up: bool, down: bool, left: bool, right: bool }>`, a record each time the held directions change) and `page.out.a`, `page.out.b`, `page.out.start`, `page.out.select` (`Event<{ held: bool }>`, a record on press and on release). Wire one like any output: `.wire(page.out.<control>, <part>.in.<input>)`, with `rename` when the input's fields have other names. You don't `.part(page)`; a wire from it adds it. For S116 the page counts as sending at most one record per control per display frame, so an input that keeps only the latest state takes `{ overflow: "keepLast" }` or declares `delivery: { keepLast: 1 }`.
- **Each part keeps its own params**, as it would on its own.

## Diagnostics

Each diagnostic about a wire or a frame names both sides. Without its `rename`, the glue above's first wire prints:

```
workbench.js:<line>: S202 <part1>.out.<port1> cannot feed <part2>.in.<port2>: the record has no field '<field2>', which the input takes (<field2>: point1@<frame2>)
  from: <part1>.out.<port1>  Event<{ <field1>: point1@<frame1>, <field3>: f64 }>  (<package1> <version>)
  to:   <part2>.in.<port2>   Event<{ <field2>: point1@<frame2> }>                 (<package2> <version>)
  fix: wire an output whose seam is Event<{ <field2>: point1@<frame2> }>, or an input that takes Event<{ <field1>: point1@<frame1>, <field3>: f64 }>; a wire may rename record fields ({ rename: { from: "to" } }) but does not transform values
```

| Code | When |
|---|---|
| S101 | two parts with one name |
| S102 | a call given the wrong thing: an input where an output goes, a part not added with `.part`, a wire option other than `rename`, `delay` and `overflow` (or an `overflow` on a value input), a bad name |
| S111 | an output, input or frame the part does not have (the message lists what it has) |
| S112 | an input wired twice |
| S113 | a required input with no wire |
| S114 | a part wired to itself |
| S115 | a loop of wires with no delayed wire in it |
| S116 | a reliable Event wire whose queue could hold more records at one step than the input's runtime takes; a warning, not an error, on a wire with `overflow` |
| S201 | the kinds differ: an Event into a value input, a record into a scalar, a rate into a non-rate |
| S202 | a field the input takes, with no default, is missing from the output's record (after any rename), or a field is of another kind |
| S203 | an enum value the input does not accept |
| S204 | a list longer than the input's max |
| S205 | a rename naming a field either side lacks, two fields into one, or a rename on a wire with no record |
| S206 | a **warning**, not an error: the wire drops a field the input does not take and fills one with its default, and the two are of compatible seams, so a `rename` may have been meant. Ignore it when the default is what you want |
| S251 | both sides tagged, and no frame path joins them |
| S252 | one side tagged, the other not |
| S253 | two frame paths between the same frames disagree |
| S254 | a quantity across an edge whose scale differs per axis |
| S255 | a point into a vector, or a vector into a point |
| S256 | `"fit"` with a frame that has no `extent`, or frames of different `dims` |
| S257 | a malformed edge, a `.frame` between two frames of one part, or frames of different `dims` |
| S301 | a handle used as a value in the glue |

A port or frame your Dialect declares badly is a D code when the Dialect is defined (D024 to D032); the message says what is wrong.

## What does not exist

There is no way to read another part's output inside a lambda, to compute or transform a value on a wire (other than renaming fields and converting frames), to merge two wires into one input, to draw one part's stage over another's, or to pass grids, images or meshes. If you need one, report it as a gap; don't invent it.
