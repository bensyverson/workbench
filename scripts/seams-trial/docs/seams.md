# Seams: using languages written apart, together

*A **workbench** can run several small languages at once, each from its own **package**. The packages are usually written by different people, and none knows the others exist. This page covers what crosses between them: what a language **offers** (its outputs), what it **accepts** (its inputs), the spaces and units it measures in (its **frames**), and the **glue program** that joins packages. How a package runs is in `runtime.md`; the package format is in `packaging.md`.*

The examples on this page come from two made-up packages. `drums` is a step sequencer: lanes of notes struck on the steps of a looping pattern. `board` is a scoreboard's strip of lamps that light up and fade. Their glue makes each drum hit light the lamps under its step.

## The idea

Each language describes its own world and nothing else. To be usable by strangers, it declares **ports** in a shared vocabulary, the **seam types**:

- an **output** is a value or a stream of events the language offers;
- an **input** is a value or a stream of events it accepts. What it does with them is its own business.

A **glue program** builds one part from each package, **wires** an output of one to an input of another, and says how their frames relate. Every fact that involves two languages lives in the glue. A package never mentions another package, so its author can't know what its ports will be wired to.

The kit converts values on the wire. If the glue says how drum steps relate to lamps, a position crossing the wire is converted for you. Nobody multiplies by a step width by hand.

## Seam types

| Seam type | Written | Means |
|---|---|---|
| scalar | `f64`, `bool`, `str` | a plain number, truth value or string |
| quantity | `f64@<frame>` | an amount measured in a frame's unit: a length, a radius, a duration (`f64@s`) |
| point | `point1@<frame>`, `point2@<frame>`, `point3@<frame>` | a position in a frame. `point1` is a position on one axis: an instant `point1@s`, a temperature, a step of a pattern |
| vector | `vec2@<frame>`, `vec3@<frame>`; untagged `vec2`, `vec3` | a displacement, a size: a difference of two points |
| rate | `f64@<frame>/s`, `vec2@<frame>/s`, `vec3@<frame>/s` | a quantity or vector per second: a speed, a velocity |
| enum | `'kick' \| 'snare'` | one string from a closed set |
| record | `{ when: point1@step, loud: f64 }` | named fields, each a seam type |
| list | `list<T, 8>` | at most 8 values of type `T` |
| `Event<R>` | `Event<{ when: point1@step }>` | the records of type `R` that one step produced; usually none. Only at a port's top |

`<frame>` is one of **your own** frames (below), or `s`.

- **Seconds are the kit's.** The frame `s` (1-D, seconds) exists in every package without being declared: `f64@s` is a duration, `point1@s` an instant, `f64@px/s` a speed. Don't declare a frame named `s`. Rates are written per second only.
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

A type that does not fit is refused when the Dialect is defined, naming the port (a D code).

## Ports, for a language's author

Ports go in `defineDialect`, beside `state`. Every tagged port and every `Event` port needs a `note` (D024): what the value is, in which frame, and when it changes. The note is what a stranger reads to decide what to wire.

### Outputs

```js
// drums.dialect.js
state: { step: "f64", tempo: "f64", playing: "bool" },
ports: {
  out: {
    hit: { seam: "Event<{ lane: str, when: point1@step, loud: f64 }>", note: "one record per note struck this step: its lane's name, the step it falls on, and how loud it is, 0 to 1" },
    tempo: { seam: "f64@step/s", from: "tempo", note: "how fast the pattern plays, in steps per second" },
    playing: { seam: "bool", from: "playing", note: "false while muted" },
  },
},
```

- **A value output reads your run's `state`**: `from` is a path (`"tempo"`, `"player.x"`) or a lambda `(s) => …`, written as a UI value lambda is. A lambda may build a point or vector from scalars as an array literal of exactly its dims: `from: (s) => [s.ball.x, s.ball.y]` for a `point2`.
- **An `Event` output has no `from`** (D026). Your runtime pushes its records during a step (`runtime.md`), so nothing about it lives in your state.

### Inputs

```js
// board.dialect.js
ports: {
  in: {
    flash: {
      seam: "Event<{ pos: point1@lamp, strength: f64 }>",
      note: "lights the lamp nearest pos; glow lambdas read the record as hit, and strength is 0 to 1",
      delivery: "reliable",                       // the default; or { keepLast: 8 }
      record: { name: "hit", slots: ["glow"] },   // glow lambdas read hit.pos and hit.strength
    },
    drift: { seam: "f64@lamp/s", default: 0, note: "how fast the lit pattern scrolls right, in lamps per second" },
    fade: { seam: "f64@s", default: 0.5, note: "how long a lit lamp takes to go dark" },
  },
},
inputs: { object: "In", name: "inp" },            // value inputs, read in lambdas as inp.drift
objects: { …, In: { label: "the inputs (inp)", members: {} } },   // declared empty: the kit fills it
globals: { …, inp: "In" },
```

- **A value input** (anything but an `Event`) has a `default`, read when nothing is wired, or `required: true` (the glue must wire it). A vector `default` is an array. Lambdas read value inputs through the one object `inputs` names, the way params are read through `$`: `inp.fade` is an `f64`. A point or vector input reads as your one `vector` type of its dims; if you have several, say which with `type: "vec2"`. Your runtime gets them too (`runtime.md`).
- **An `Event` input** delivers, before each of your steps, the records produced since your last step, in order, already converted into your frames. It takes no `default` or `required`.
  - `delivery: "reliable"` (the default) keeps every record. The composition checks that the queue can't overflow (S116, from the maxes in `runtime.md`). `delivery: { keepLast: n }` keeps the newest `n` and drops older ones, counting the drops.
  - `record: { name, slots }` lets lambdas read the record: lambdas of the listed slot conventions read its fields through the global `name` (`hit.strength`). It is null when your runtime calls such a lambda without a record, so a lambda checks it first: `if (hit != null) { … hit.strength … }` or `if (hit == null) return;` (an unchecked read is L008). No other lambda may read it (L004). Your runtime sets `name` before calling such a lambda, once per record (`runtime.md`). Without `record`, only your runtime sees the records.
- **A Grammar can name an input** with `ref("in")`, as an argument or inside a `data({ … })` shape, checked against the inputs you declare, with a did-you-mean (B003). `ref("in", { kind: "event" })` accepts only Event inputs and `ref("in", { kind: "value" })` only value inputs. Then a Program can say, for example, which of its parts an input drives: `.lamp("big", { on: "flash" })`. Your runtime reads the name from the record and the records from that input.
- **One wire per input.** Two outputs cannot feed one input.

## Frames

A **frame** is a coordinate space or a unit your language measures in. Frames are declared in the Dialect's `frames`, and the edges between your own frames in the Dialect's `edges`, a key beside `frames` (not inside a frame):

```js
// board.dialect.js
frames: {
  lamp: {
    dims: 1,
    note: "lamps from left to right; lamp 0's center is at 0, lamp 1's at 1",
    extent: (record) => ({ min: [-0.5], max: [record.lamps - 0.5] }),
  },
  cm: { dims: 1, note: "centimeters along the strip, from lamp 0's center to the right" },
},
edges: () => [{ from: "lamp", to: "cm", scale: 2.5, offset: 0 }],
```

- `dims`: 1, 2 or 3. A 1-D frame holds positions (`point1@lamp`) and amounts (`f64@lamp`).
- `note` (required): which way each axis points, where the origin is and what one unit is. A composer reads it to relate your frame to someone else's.
- `extent(record)` (optional): the box your frame's content fills in a built Program (the record `.build()` returns), as `{ min, max }`, one number per dim each. A 2-D box is `{ min: [0, 0], max: [record.width, record.height] }`. It lets a composer write `"fit"`.
- A frame has only these three keys. Edges are not a frame's key: they are the Dialect's `edges(record)` above (D030 if you put `edges` inside a frame).

`edges(record)` (optional, a key of the Dialect beside `frames`): `[{ from, to, scale, offset }]` between **your own** frames, here one lamp is 2.5 cm. You can't relate your frame to another package's: you don't know it.

Frames of different packages are different frames, even with the same name: `drums.step` and `board.lamp` are unrelated until a glue program relates them.

An **edge** `{ scale, offset }` takes a point `v` in one frame to `v * scale + offset` in the other (a vector, quantity or rate to `v * scale`). `scale` and `offset` are a number (every axis) or an array (one per axis). A negative scale flips an axis, as between y down and y up. There is no rotation.

## The glue program, for a composer

```js
// workbench.js
import { compose } from "kit/compose";
import { drums } from "drums";        // a package by its name: its Grammar's export
import { board } from "board";

export default ($) => {
  const beat = drums("beat").length(16).tempo(8).lane("kick", [0, 4, 8, 12]).lane("snare", [4, 12]);
  const strip = board("strip").lamps(32).glow((l) => { if (hit != null) { l.level = hit.strength; } });

  return compose("light-show")
    .part(beat)
    .part(strip)
    .frame(beat.frame.step, strip.frame.lamp, "fit")
    .wire(beat.out.hit, strip.in.flash, { rename: { when: "pos", loud: "strength" } })
    .wire(beat.out.tempo, strip.in.drift)
    .wire(strip.out.full, beat.in.mute, { delay: true })
    .show(strip);
};
```

A glue program is not a package. It may import `kit/compose`, `kit/define` and each package it composes by the package's `name`, which resolves to the module the manifest's `entry.grammar` names. Nothing else: no relative path, no other bare name, no dynamic import (K007).

| Call | Does |
|---|---|
| `compose(name)` | starts the composition; `name` is lowercase letters, digits and `-` |
| `.part(builder)` | adds a part: a Program built by one package's Grammar, exactly as it would be on its own. Its opening name (`drums("beat")`) is the part's name, unique in the workbench |
| `.frame(a, b, edge)` | relates frame `a` of one part to frame `b` of another, by an edge `{ scale, offset }` from `a` to `b` |
| `.frame(a, b, "fit")` | the same, with the edge computed so `a`'s extent fits inside `b`'s, centered, one scale for every axis. Both frames need an `extent`, and the same `dims` |
| `.wire(out, in, options?)` | connects an output of one part to an input of another. Options: `rename`, `delay`, `overflow` (below) |
| `.show(part)` | the part whose stage the page shows (one); the others still run |

- **Handles.** Every builder has `.out.<port>`, `.in.<port>` and `.frame.<name>`. A handle only names a port or frame: pass it to `.wire` and `.frame`, and nothing else. Reading a property of one, using one in arithmetic, or testing one in a condition is S301.
- **Records meet by field name.** Every field the input takes must be in the output's record, with a matching kind. The output's other fields are dropped on the wire (above, `lane`).
- **`rename: { outputField: "inputField" }`** renames record fields on this wire, as data: above, the drums' `when` arrives as the board's `pos`. It works on an Event's records, a record value and a list of records. A wire cannot compute or transform a value; the glue has no lambdas.
- **`delay: true`** makes the input read what the output held when the instant began, instead of what it holds after this instant's step. Two parts that feed each other make a loop, refused as S115 unless one wire in the loop is delayed. Above, the strip feeds the beat back, so that wire is delayed.
- **The kit converts on the wire.** For each tagged field, the kit finds a path of frame edges from the output's frame to the input's (edges compose, and run backward too), and converts by kind. Above, `"fit"` puts 16 steps on 32 lamps: a step `s` lands on lamp `2s + 0.5`, and the tempo in steps per second arrives as lamps per second, ×2.
- **`overflow: "keepLast"` or `overflow: "keepFirst"`** is for an Event wire whose records can outrun the input (S116). With it, each step of the input's part takes at most the input's max: the newest records, or the first, and the rest are dropped and counted (the run's `stats().overflow`, and one N001 warning per wire). S116 then is a warning that names the policy. The input's max never changes. Use it when losing records is fine (a held button, a burst of sparks); when every record matters, raise the max in the input's runtime instead. A package's `reference.md` gives each Event port's max per step and its delivery, so you can see S116 coming.
- **The page's controls are a part.** `page` (`import { compose, page } from "kit/compose"`) is a built-in part whose Event outputs are the controls: `page.out.pad` (`Event<{ up: bool, down: bool, left: bool, right: bool }>`, a record each time the held directions change) and `page.out.a`, `page.out.b`, `page.out.start`, `page.out.select` (`Event<{ held: bool }>`, a record on press and on release). Wire one like any output: `.wire(page.out.<control>, <part>.in.<input>)`, with `rename` when the input's fields have other names. You don't `.part(page)`; a wire from it adds it. For S116 the page counts as sending at most one record per control per display frame, so an input that keeps only the latest state takes `{ overflow: "keepLast" }` or declares `delivery: { keepLast: 1 }`.
- **Each part keeps its own params**, as it would on its own.

## Diagnostics

Each diagnostic about a wire or a frame names both sides. Without its `rename`, the light show's first wire prints:

```
workbench.js:14: S202 beat.out.hit cannot feed strip.in.flash: the record has no field 'pos', which the input takes (pos: point1@lamp)
  from: beat.out.hit    Event<{ lane: str, when: point1@step, loud: f64 }>  (drums 1.0.0)
  to:   strip.in.flash  Event<{ pos: point1@lamp, strength: f64 }>          (board 1.0.0)
  fix: wire an output whose seam is Event<{ pos: point1@lamp, strength: f64 }>, or an input that takes Event<{ lane: str, when: point1@step, loud: f64 }>; a wire may rename record fields ({ rename: { from: "to" } }) but does not transform values
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
| S202 | a field the input takes is missing from the output's record (after any rename), or is of another kind |
| S203 | an enum value the input does not accept |
| S204 | a list longer than the input's max |
| S205 | a rename naming a field either side lacks, two fields into one, or a rename on a wire with no record |
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
