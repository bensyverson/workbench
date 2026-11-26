# Seams: how languages written apart are used together (draft)

*Draft reference. A **workbench** can use several small languages at once, each from its own **package**. The packages are usually written by different people at different times, and none knows the others exist. This page covers what crosses between them: what a language **offers** (its outputs), what it **accepts** (its inputs), the coordinate spaces it measures in (its **frames**), and the **glue program** that connects two packages. Packaging itself is in `packaging.md`; a language's own definition is in its package's files.*

## The idea

Each language describes its own world and nothing else. To be usable with strangers, it declares **ports** in a small shared vocabulary, the **seam types**:

- an **output** is a value or a stream of events the language offers, read from its run's state;
- an **input** is a value or a stream of events it accepts, and what it does with it is its own business.

A **glue program** builds one part from each package, **wires** an output of one to an input of the other, and says how their **frames** relate. Every fact that involves two languages lives in the glue program. A package never mentions another package.

The kit converts values on the wire. If the glue program says how one language's grid cells relate to another's pixels, a position crossing the wire is converted for you. You never write the conversion by hand, and you never multiply by a cell size.

## Seam types

| Seam type | Written | Means |
|---|---|---|
| scalar | `f64`, `bool`, `str` | a plain number, truth value or string |
| quantity | `f64@<frame>` | a number measured in a frame's unit: a length, a radius, a duration |
| point | `point2@<frame>`, `point3@<frame>` | a position in a frame |
| vector | `vec2@<frame>`, `vec3@<frame>`; or untagged `vec2`, `vec3` | a displacement, a velocity, a size: a difference of two points |
| enum | `'coin' \| 'key'` | one string from a closed set |
| record | `{ at: point2@cell, kind: 'coin' \| 'key' }` | named fields, each a seam type |
| list | `list<T, 8>` | at most 8 values of type `T` |
| `Event<R>` | `Event<{ at: point2@cell }>` | records of type `R` produced during one step; usually none |

`<frame>` is the name of one of **your own** frames (Frames, below).

- Every output that is not an `Event` is a **signal**: a value of its type that is fresh after each step.
- **A point and a vector are different.** A point is a place; a vector is a difference between places (a velocity, an offset, a size). A point converts between frames with a scale and an offset; a vector and a quantity with the scale only. Choose the one that says what the value is: the player's position is a `point2`, its velocity a `vec2`, a blast radius an `f64@px`.
- **Untagged numbers never convert.** `f64` and `vec2` cross unchanged, and only into an untagged port.

### Pairing with your own types

Your language has its own types (`vec2: vector(2, "f64")`, `struct({ … })`). At each port the kit checks that your type has the seam type's shape:

| Seam type | Your type must be |
|---|---|
| `f64`, `f64@frame`, `bool`, `str` | `"f64"`, `"f64"`, `"bool"`, `"str"` |
| `point2@frame`, `vec2@frame`, `vec2` | a `vector(2, "f64")` type (`point3`, `vec3`: `vector(3, "f64")`) |
| an enum | `enumOf([...])` with the same strings |
| a record | `struct({ … })` with the same field names, each paired by these rules |
| `list<T, max>` | `list(T, max)` with the same max or less |
| `Event<R>` | a `list` of `R`'s struct in your run's `state` (any max: it bounds one step's events) |

A type that does not fit is refused when the Dialect is defined, with the port's name.

## Ports, for a language's author

Ports go in `defineDialect`, beside `state`.

### Outputs

```js
types: { cell2: vector(2, "f64") },
state: {
  t: "f64",
  player: struct({ at: "cell2" }),
  picked: list(struct({ at: "cell2" }), 8),   // the host refills it each step
},
ports: {
  out: {
    picked: { seam: "Event<{ at: point2@cell }>", from: "picked", note: "a coin picked up during this step, at its cell" },
    player: { seam: "point2@cell", from: (s) => s.player.at, note: "the player's cell" },
    t:      { seam: "f64", from: "t" },
  },
},
```

- **An output reads your run's state** (the `state` your Dialect declares): `from` is a path into it (`"player.at"`) or a lambda `(s) => …` written as a UI value lambda is (no loops over lists). An `Event` output's `from` is always a path. The kit reads outputs from the state your host commits after each step.
- **An `Event` output is a state list your host refills each step** with what happened during that step, and empties at the start of the next. Say so where your host's behavior is described.
- **`note`** is required for a tagged port and an `Event` port. Write what a stranger needs to wire it: what the value is, in which frame, and when it changes.

### Inputs

```js
ports: {
  in: {
    burst:  { seam: "Event<{ at: point2@px }>", note: "fires every emitter whose trigger is 'burst', once per record, at the record's position" },
    radius: { seam: "f64@px", default: 40, note: "how far a burst spreads" },
    aim:    { seam: "point2@px", required: true, note: "where the jets point" },
  },
},
inputs: { object: "In", name: "inp" },          // value inputs read in lambdas as inp.radius
objects: { …, In: { label: "the inputs (inp)", members: {} } },   // filled from ports.in by the kit
globals: { …, inp: "In" },
```

- **A value input** (anything but an `Event`) is read in your lambdas through one object you name, the way params are read through `$`. Declare it with `inputs: { object, name }`, an empty object of that name and a global. Each member's type is your type paired with the port's seam type, so `inp.radius` is an `f64`. When your Dialect has more than one vector type of a point's or vector's dims, say which with `type` on the port (`aim: { seam: "point2@px", type: "vec2", … }`). A value input has a `default` (read when nothing is wired) or `required: true` (the glue program must wire it).
- **An `Event` input goes to your host**, not your lambdas: before each step your host receives the records produced since its last step, already converted into your frames. What it does with them is up to your language.
- **Your Grammar can name an input** with `ref("in")`: for example, an emitter's `{ trigger: ref("in") }` option is checked against the inputs you declared, with a did-you-mean.
- **An input takes one wire.** `note` is required for a tagged input and an `Event` input.

## Frames

A **frame** is a coordinate space or a unit your language measures in.

```js
frames: {
  cell: { dims: 2, note: "grid cells; x right, y down; (0, 0) is the center of the top-left cell",
          extent: (record) => ({ min: [-0.5, -0.5], max: [record.grid[0].length - 0.5, record.grid.length - 0.5] }) },
},
edges(record) {                       // optional: edges between your own frames, from the built Program
  return [{ from: "cell", to: "px", scale: 16, offset: 8 }];
},
```

- `dims`: 1 for a unit (seconds), 2 or 3 for a space. In a 2-D or 3-D frame, a quantity (`f64@cell`) is a length.
- `note` (required): which way the axes point and where the origin is. A composer reads this to relate your frame to someone else's.
- `extent(record)` (optional): the box your frame's content fills for a built Program, as `{ min: [x, y], max: [x, y] }` (three numbers each in 3-D). For grid cells centered on whole numbers, a 10 × 8 grid is `{ min: [-0.5, -0.5], max: [9.5, 7.5] }`. It lets a composer write `"fit"`.
- `edges(record)` (optional) relates your own frames to each other. You cannot relate your frame to another package's: you don't know it.

Frames of different packages are different frames, even when they have the same name: `maze.cell` and `tiles.cell` are unrelated until a glue program relates them.

An **edge** is `{ scale, offset }`: a value in `from` becomes `value * scale + offset` in `to`, for a point (a vector or quantity: `value * scale`). `scale` and `offset` are numbers (every axis) or arrays (per axis). A negative scale flips an axis, as between y down and y up. There is no rotation.

## The glue program, for a composer

```js
// workbench.js
import { compose } from "kit/compose";
import { maze } from "maze";              // a package's name: its Grammar entry module, so this is its Grammar export
import { particles } from "particles";

const GRID = ["#####", "#c..#", "#.#c#", "#####"];
const steer = (pl, pad) => { … };

export default ($) => {
  const level = maze("level").grid(GRID).start({ x: 1, y: 1 }).control(steer);
  const fx = particles("fx").bounds({ width: 320, height: 256 }) /* … */;

  return compose("coin-bursts")
    .part(level)
    .part(fx)
    .frame(level.frame.cell, fx.frame.px, "fit")
    .wire(level.out.picked, fx.in.burst)
    .show(fx);
};
```

A glue program is not a package: it may import `kit/compose`, `kit/define` and each package it composes by the package's `name`, which resolves to the module the manifest's `entry.grammar` names.

| Call | Does |
|---|---|
| `compose(name)` | starts the composition; `name` is the workbench's name |
| `.part(builder)` | adds a part: a Program built with one package's Grammar, exactly as it would be on its own. Its opening name (`maze("level")`) is the part's name, unique in the workbench |
| `.frame(a, b, edge)` | relates frame `a` of one part to frame `b` of another, with an edge `{ scale, offset }` from `a` to `b` |
| `.frame(a, b, "fit")` | the same, with the edge computed so `a`'s extent box fits inside `b`'s, centered, with one scale for every axis. Both frames must declare `extent` |
| `.wire(out, in)` | connects an output of one part to an input of another |
| `.show(part)` | the part whose stage the page shows; the others still run |

**Handles.** Every part's builder has `.out.<port>`, `.in.<port>` and `.frame.<name>`. A handle is not a value: pass it only to `.wire` and `.frame`. Using one in arithmetic or a condition is S301.

**Records meet by field name.** An output's record may have fields the input does not take; they are dropped on the wire. Every field the input takes must be in the output, with a matching kind.

**The kit converts on the wire.** For each tagged field of the output's type, the kit finds a path of edges from its frame to the input's frame (edges compose, and run backward too) and converts by kind: a point with scale and offset, a vector and a quantity with the scale.

**Each part keeps its own params**, named after the part in the page (`level.$.speed`).

## Diagnostics

Each diagnostic about a wire or a frame names both sides:

```
workbench.js:14: S251 level.out.picked cannot feed fx.in.burst: the field 'at' is a point in maze.cell, burst takes a point in particles.px, and no frame path joins them
  from: level.out.picked  Event<{ at: point2@cell }>  (maze 0.2.0)
  to:   fx.in.burst       Event<{ at: point2@px }>    (particles 0.3.0)
  fix: write .frame(level.frame.cell, fx.frame.px, "fit"), or give the edge: .frame(level.frame.cell, fx.frame.px, { scale: 32, offset: 16 })
```

| Code | When |
|---|---|
| S101 | two parts with one name |
| S102 | a glue call given the wrong thing: an input where an output goes, a part not added with `.part`, a bad name |
| S111 | an output, input or frame the part does not have (the message lists what it has) |
| S112 | an input wired twice |
| S113 | a required input with no wire |
| S114 | a part wired to itself |
| S201 | the kinds differ: an `Event` into a value input, a record into a scalar |
| S202 | a field the input takes is missing from the output's record, or is of another kind |
| S203 | an enum value the input does not accept |
| S204 | a list longer than the input's max |
| S251 | both sides tagged, and no frame path joins them |
| S252 | one side tagged, the other not |
| S253 | two frame paths between the same frames disagree |
| S254 | a quantity across an edge whose scale differs per axis |
| S255 | a point into a vector, or a vector into a point |
| S256 | `"fit"` with a frame that has no `extent`, or with frames of different `dims` |
| S257 | a malformed edge, a `.frame` between two frames of one part, or an edge between frames of different `dims` |
| S301 | a handle used as a value at build time |

A port or frame your Dialect declares badly is refused when it is defined, with the port's name (a D code; the message says what is wrong).

## What does not exist yet

There is no way to read another part's output inside a lambda, to transform a value on a wire, to merge two wires into one input, or to pass grids, images or meshes. If you need one, report it as a gap; don't invent it.
