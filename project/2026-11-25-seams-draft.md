# Draft: seams — seam types, ports and frames, and diagnostics that name both sides

*2026-11-25, leaf `MajmbQ` (under `hjdIRt`, M4 Composition, `SPPLaM`). A design draft for Ben, not built and not ruled; written while he was away, so every choice is a recommendation (questions at the end). Inputs: [the architecture synthesis](2026-11-24-architecture-synthesis.md) §3.4, §3.5; [the composition trial](2026-11-24-composition-trial.md) and its draft (`scripts/compose-trial/docs/composition-draft.md`); [the package trial](2026-11-25-package-trial-findings.md), whose three agents could not say "a burst where the actor reaches the goal"; [the package format](2026-11-25-package-format-draft.md); the Definition API as built (`kit/API.md`). Clocks and the scheduler (`f2dMku`) and the build record (`HKNInI`) are separate leaves; this draft says only what it needs from them.*

> **Tested 2026-11-25 ([the relay trial](2026-11-25-seams-relay-trial-findings.md)):** nine blind legs (three relays of maze author, particles author and composer) all checked clean. All three composers wired the strangers' packages with no package edit and no hand conversion, but the reference's example was the task's own pairing, so whether strangers' field names meet unprompted is still untested. The trial adds four design items (questions 8 to 11 below) and moves the host contract to `f2dMku` and the composed page to its own leaf.

## What changed since the composition trial

The composition trial's three dialects were written together: `tiles` knew `cave`'s cells and supplied `tile()`, and the references' examples showed every seam. Ben's pattern is different: "I have a DSL at `bensyverson/mydsl` and one on disk; use both to do XYZ." The two packages were written in separate sessions, and **neither author knew the other existed**. The package trial showed what that costs: maze has no event out, particles no trigger in, the two have different coordinate spaces, clocks, `$`s and `t`s, and nothing in either can name the other.

So the design has to work when no dialect knows any other. Three consequences drive everything below:

1. **A dialect can only declare what it offers and what it accepts, in a vocabulary it shares with strangers.** That vocabulary is the seam types. A dialect cannot read "the other part's output" in its lambdas, because its author could not have typed one.
2. **The composer owns every fact that spans two dialects:** which output feeds which input, and how one dialect's frame relates to another's. Those go in the glue program, not in either package.
3. **Conversions happen at the seam, not in lambdas.** If the kit knows `maze.cell → particles.px`, it converts a position on the wire. Nobody writes `* 16`, and a length converts with the scale alone (the trial's `* 8` finding).

## The shape in one example

The maze author, in their own session, adds an output: an event each time the player picks up a coin. The particles author, in theirs, adds an input: an event that fires a burst emitter. A third session composes them.

```js
// maze/maze.dialect.js (excerpt): the maze author's ports
types: { cell2: vector(2, "f64") },
frames: { cell: { dims: 2, note: "whole grid cells; x right, y down; (0, 0) is the top-left cell's center" } },
state: { …, player: struct({ at: "cell2" }), picked: list(struct({ at: "cell2" }), 8) },   // the host refills it each tick with this tick's pickups
ports: {
  out: {
    picked: { seam: "Event<{ at: point2@cell }>", from: "picked", note: "a coin picked up this tick, at its cell" },
    player: { seam: "point2@cell", from: (s) => s.player.at },
  },
},
```

```js
// particles/particles.dialect.js (excerpt): the particles author's ports
frames: { px: { dims: 2, note: "pixels in bounds; x right, y down; origin top-left" } },
ports: {
  in: {
    burst: { seam: "Event<{ at: point2@px }>", note: "fires every emitter whose trigger is 'burst', once per record, at its position" },
    radius: { seam: "f64@px", note: "how far a burst spreads, in pixels", default: 40 },
  },
},
inputs: { object: "In", name: "inp" },   // value inputs read in lambdas as inp.radius
```

```js
// workbench.js: the composer's glue program
import { compose } from "kit/compose";
import { maze } from "maze";                // the packages, by the names the workbench's lock gives them
import { particles } from "particles";

export default ($) => {
  const level = maze("level").grid(GRID).start({ x: 1, y: 1 }).control(steer);
  const fx = particles("fx").bounds({ width: 320, height: 320 })
    .emitter("pop", { trigger: "burst", count: 24 }).spawn(sparkle);

  return compose("coin-bursts")
    .part(level).part(fx)
    .frame(level.frame.cell, fx.frame.px, { scale: 32, offset: 16 })   // or "fit": see Frames
    .wire(level.out.picked, fx.in.burst)                                // converts `at` from cell to px
    .show(fx);
};
```

Everything else is the seam: the kit checks the wire's types, finds the frame path, plans the conversion (`at`: a point, so `at * 32 + 16`), and reports a mistake by naming both sides.

## Seam types

A small closed set, defined by the kit (`kit/seam`), that every dialect's ports are written in. It is a **vocabulary for crossings**, not a second type system for lambdas: each dialect keeps its own types and pairs them with seam types at its ports.

| Seam type | Written | Crosses as |
|---|---|---|
| scalar | `f64`, `bool`, `str` | itself |
| quantity | `f64@<frame>` | a number measured in a frame's unit: a length, a duration. Converts by the scale only |
| point | `point2@<frame>`, `point3@<frame>` | a position. Converts by scale and offset |
| vector | `vec2@<frame>`, `vec3@<frame>`; `vec2` untagged | a displacement or a velocity. Converts by the scale only, sign kept |
| enum | `'rock' \| 'open'` | a string from a closed set |
| record | `{ at: point2@cell, kind: 'coin' \| 'key' }` | fields of seam types |
| list | `list<T, max>` | at most `max` values; the max is part of the type, as in the Definition API |
| `Event<R>` | `Event<{ at: point2@cell }>` | the records produced during one step of the producer, in order; empty most steps |

Every output is a signal: its type is fixed at build time, and its value arrives each step. There is no separate `Signal<T>`: a non-Event output **is** a signal of its type. `Grid`, `Image`, `Mesh`, `Field` and `Ids` from the synthesis are **not in v0**: no dialect of ours offers or accepts one yet, and each adds a shape rule (a `Grid`'s size, an `Image`'s resolution) that should be designed against a real pair. They are the first extensions, each when a dialect needs it.

**Points and vectors are different types** (the trial's length finding, generalized). A position converts with the offset, a displacement or a size does not. Passing a `vec2@cell` where a `point2@px` is expected is a seam error, not a silent conversion, because a velocity is not a place. This is the classic affine split, and it is the smallest change that makes the trial's `$.reach * 8` checkable: `reach` is an `f64@cell` quantity, and its conversion to `f64@px` is the edge's scale.

**Untagged numbers do not convert.** `f64` and `vec2` cross unchanged, and only into an untagged port. An untagged output into a tagged input (or the reverse) is S252: the kit cannot know the frame, and guessing is the `* 8` problem again.

**Pairing with the dialect's own types.** At a port, the kit checks that the dialect's local type has the seam type's structure: a seam `point2@cell` needs a local `vector(2, "f64")`, a record a `struct` with the same fields, an `Event<R>` a state `list` of the record (any max: the list's max bounds one step's events). Scalars, enums, records and lists match structurally. A local type that does not fit is a definition error (D-code) at `defineDialect`, with the port's path, before any composition exists.

## Ports

A Dialect declares its ports in `defineDialect`, next to `state`. They are the only way values cross between parts.

### Outputs

```js
ports: { out: {
  picked: { seam: "Event<{ at: point2@cell }>", from: "picked" },   // a path into the run's state
  player: { seam: "point2@cell", from: (s) => s.player.at },         // or a value lambda over it
  score:  { seam: "f64", from: "score", note: "coins picked so far" },
} }
```

- **An output reads the run's state**, the one the Dialect's `state` declares, `checkState` checks and the UI's views read. `from` is either a path (as the UI's paths are) or a value lambda `(s) => …`, lowered and typed exactly as a UI value lambda is (same rules, same L codes, no list queries). Reusing the UI's machinery means a port adds no new runtime contract: the host already commits that state after each step.
- **An Event output is a state list the host refills each step** with what happened during it, and clears at the start of the next. The kit snapshots the list when the host commits. This is the one rule a host author must know; the Dialect's reference prints it beside the port.
> **See also 2026-11-25:** [the clocks draft](2026-11-25-clocks-draft.md) (question 3) proposes that a runtime pushes Event records in its `step` instead of refilling a state list, so an Event output would have no `from`.

- `note` is required for a tagged or Event port and optional otherwise. It is what a composer reads to decide what to wire, and the package reference prints it.

### Inputs

```js
ports: { in: {
  burst: { seam: "Event<{ at: point2@px }>" },
  radius: { seam: "f64@px", default: 40 },
  aim:   { seam: "point2@px", required: true },
} },
inputs: { object: "In", name: "inp" },
```

- **A value input** (anything but an Event) is read in the Dialect's lambdas through one object the Dialect names, as params are read through `$`: `inputs: { object, name }`, plus a global, as for params. Its member types are the local types paired with the ports, so `inp.radius` is an `f64` in a particles lambda. An unwired value input reads its `default`. A value input has either a `default` or `required: true` (neither is a D-code), and a required one with no wire is S113.
- **An Event input is delivered to the host**, not to lambdas: each step the host receives the records the producer committed since its own last step, already converted into its frames. What it does with them is the Dialect's business (particles fires every emitter whose `trigger` names the input). A Grammar refers to an input by name with `ref("in")`, a namespace the kit fills from `ports.in`, so `.emitter("pop", { trigger: "burst" })` is checked (B003 with a did-you-mean) before any composition exists.
- **An input may have one wire.** Two wires into one input is S112; merging two event streams is a glue concern for later (open question 6).

### What a port is not

- **Not a reach into another part.** No lambda reads another part. The composition trial's direct reads (`game.out.player` inside a `glow` lambda) worked because the dialects were designed together; with strangers, a lambda's types cannot name a foreign output. Direct reads are parked, not refused forever (Parked, below).
- **Not a build-time value.** A wire connects at build time; values flow only at run time. A part's builder methods take data and lambdas as before; nothing in a Program reads `level.out.picked` as a value (S301 carries over: a handle used in arithmetic or a condition at build time).

## Frames

A **frame** is a coordinate space or unit a dialect measures in. Each dialect declares its own, by name, and **frames of different dialects are different frames** even when named alike: `maze.cell` and `tiles.cell` are unrelated until someone relates them. This is what makes strangers safe: no accidental unification by name.

```js
frames: {
  cell: { dims: 2, note: "…", extent: (record) => ({ min: [-0.5, -0.5], max: [record.grid[0].length - 0.5, record.grid.length - 0.5] }) },
  s:    { dims: 1, note: "seconds" },
},
```

- `dims` is 1 (a unit: seconds, metres) or 2 or 3 (a space). A 2-D or 3-D frame's quantity (`f64@cell`) is a length in it.
- `extent` (optional) gives the box the frame's content fills, `{ min, max }`, from the record at build time: what `"fit"` uses.

**Edges** relate two frames: `{ scale, offset }`, per axis, so an edge is a diagonal affine map. A negative scale flips an axis (y up against y down). Rotation is not in v0; no pair of ours needs it.

- **Within one dialect** the author knows the edges: `edges(record) → [{ from: "cell", to: "px", scale: [s, s], offset: [s / 2, s / 2] }]`, computed from the record at build time (a tile size, say).
- **Across dialects** only the composer knows: `.frame(a, b, { scale, offset })`, or `.frame(a, b, "fit")`, which maps `a`'s extent onto `b`'s (both frames must declare `extent`; uniform scale, centered). A scalar scale or offset applies to every axis.
- **The kit composes edges and their inverses** into a path. Two paths between the same frames that disagree are S253 at `.frame`, naming both paths. No path is S251.

**Conversion at a wire.** For each tagged field of the producer's type, the kit finds the path from its frame to the consumer's and plans a conversion by kind: a point by scale and offset, a vector by scale, a quantity by the scale, which must be uniform (a non-uniform scale on a length is S254). The plan is data in the composed record (`wires[i].convert`), applied by the scheduler when it delivers a snapshot, and printable: `at: maze.cell → particles.px, point, ×32 +16`.

## The glue program

`kit/compose` is a kit module, written once like `kit/define`. A glue program builds parts with each package's own builder, and composes them:

| Call | Does |
|---|---|
| `compose(name)` | starts a composition; its name is the workbench's, in addresses (`lab:<name>#level.out.picked`) |
| `.part(builder)` | adds a part: a dialect Program, built by its own Grammar. Its opening name (`maze("level")`) is the part's name, unique in the composition (S101) |
| `.frame(a, b, edge \| "fit")` | relates a frame of one part to a frame of another |
| `.wire(out, in)` | connects an output handle to an input handle |
| `.show(part)` | which part's stage the page shows (the others run; their tiles still show) |
| `.build()` / `.check()` | the composed record, or every S diagnostic at once |

**Handles.** Every generated builder gains three read-only members: `.out.<port>`, `.in.<port>` and `.frame.<name>`. A handle is a small typed object (part, dialect, package and version, port, seam type), not a value: it can only be passed to `.wire` and `.frame`. Misspelling one is S111 with the part's ports listed. Handles, not strings, because the composition trial's agents wrote them without a single mistake.

**Params.** Each part keeps its own params; in the page and in addresses they are qualified by part (`level.$.speed`). A glue-level `$` shared across parts is parked (open question 5).

**Each part is a whole Program.** It is built, checked and lowered by its own Grammar exactly as if it stood alone; composition adds wires and frames around it and changes nothing inside. A part that does not build stops the composition with its own diagnostics, prefixed with the part's name.

## Diagnostics that name both sides

Every S diagnostic about a wire or an edge carries **both sides**: for each, the part, its dialect and package version, the port or frame, and its seam type. It prints at the glue program's line, then one line per side, then the fix:

```
workbench.js:14: S251 level.out.picked cannot feed fx.in.burst: the record field 'at' is a point in maze.cell; burst expects a point in particles.px, and no frame path joins them
  from: level.out.picked  Event<{ at: point2@cell }>  (maze 0.2.0)
  to:   fx.in.burst       Event<{ at: point2@px }>    (particles 0.3.0)
  fix: write .frame(level.frame.cell, fx.frame.px, { scale: 32, offset: 16 }), or .frame(level.frame.cell, fx.frame.px, "fit")
```

The object form (for the page and the agent) is `{ code, message, file, line, from: { part, dialect, version, port, seam }, to: { … }, fix }`.

| Code | When |
|---|---|
| S101 | two parts with one name |
| S111 | an output, input or frame the part does not have (lists what it has, with a did-you-mean) |
| S112 | an input wired twice |
| S113 | a required input with no wire |
| S114 | a part wired to itself (a cycle inside a part is that dialect's business) |
| S201 | seam kinds differ: an Event into a value input, a record into a scalar |
| S202 | a field the consumer takes is missing from the producer's record, or of another kind (names the field, both sides); extra producer fields are dropped on the wire |
| S203 | an enum the consumer does not accept (`'key'` is not one of `'coin'`) |
| S204 | a list longer than the consumer's max |
| S251 | tagged on both sides, no frame path |
| S252 | tagged on one side only |
| S253 | two frame paths disagree (names both, and the edges on each) |
| S254 | a quantity across a non-uniform scale |
| S255 | a point into a vector, or a vector into a point |
| S256 | `"fit"` with a frame that has no `extent`, or with dims that differ |
| S301 | a handle read as a value at build time (arithmetic, a condition) |

The kit already reserves S. The composition trial's codes were a draft's and are renumbered here; nothing built uses them.

## What the host must do (for `f2dMku`)

This draft assumes four things from the scheduler leaf and fixes none of their mechanics:

1. Each part steps on its own clock, and after each step the host commits its run state; the kit reads every output from that snapshot.
2. A consumer sees each producer's last committed snapshot; Events are delivered once each, in order, to the consumer's next step.
3. The scheduler applies `wires[i].convert` on delivery.
4. A reload of one part (a new revision, the composition trial's double descent) happens at a defined point in the consumer's step. That point, and how a consumer sees a revision, is `f2dMku` and `HKNInI`.

Two package-trial items belong to the host, not the seams: two versions of one package in a page need a guarded `customElements.define`, and each part's `t` and `$` are its own (qualified in the page).

## Parked

- **Direct reads of another part's output in a lambda** (the composition trial's model). Un-park when two dialects designed together want it, and the kit can type a foreign output in a reader's lambda through the reader's seam pairing.
- **Glue lambdas** (a wire that transforms: `wire(a, b, (p) => p + vec2(0, -1))`). They need a kit-owned seam subset for lambdas. Un-park when a relay trial's composer needs one that a frame edge cannot express.
- **`Grid`, `Image`, `Mesh`, `Field`, `Ids`**, rotations in frame edges, and merging event streams: each when a dialect pair needs it.

> **Revised 2026-11-25, from building the relay trial's checker (leaf `C0nNGy`):** a producer record's extra fields are dropped on the wire rather than refused (strict matching left a composer of strangers' packages no way forward); `extent` returns a box `{ min, max }`, not a size, since a grid of cell centers spans half a cell past them; an input may name its local type with `type` when the Dialect has several vector types of its dims; an Event output's `from` is a path; and S102 (a glue call given the wrong thing) and S257 (a malformed or same-part edge) are added. The example diagnostic above was mislabeled S202; it is S251.

## Questions for Ben

1. **Strangers by default: no direct reads, only declared ports and glue wires.** The composition trial tested direct reads and they were easy; this draft parks them because a dialect written alone cannot type a foreign output. Recommended: ports and wires only, for v0.
2. **Points, vectors and quantities as three seam kinds** (`point2@cell`, `vec2@cell`, `f64@cell`), so conversions follow from the kind. Recommended. The alternative, one `vec2@cell` with the kind inferred, cannot tell a position from a velocity.
3. **Conversions are automatic on a wire** once a frame path exists, and planned as data in the composed record. Recommended. The alternative (the consumer names a conversion, as `tiles.tile()` did) needs the consumer to know the producer.
4. **Outputs read the run's state**, by a path or a UI-style value lambda, and Event outputs are a state list the host refills each step. Recommended: it adds no runtime contract beyond `state`.
5. **Each part keeps its own params**; a shared glue `$` is parked. Recommended.
6. **One wire per input**; no merging of Events in v0. Recommended.
7. **Ports live in the Dialect, not the manifest**; the package's generated reference prints them, so a composer reads them without running code. Recommended, as for `elements`, which kit/package checks against the UI rather than duplicating.

8. **A kind filter on `ref("in")`** (`ref("in", { kind: "event" })`), since all three particles authors needed a `trigger` that cannot name a value input. Recommended.
9. **Event records reach lambdas.** An Event input names the lambda slots that see its record and the name it is read by (particles' `spawn` reads `ev.at`), instead of the host placing particles by prose. Recommended. All three particles authors asked for it.
10. **Kit-wide units and rates:** a few 1-D frames the kit declares for every package (`s`), and rates written `vec2@px/s` that convert by both the space edge and the unit. Recommended, as the smallest form covering the trial's three rate findings and the per-package seconds.
11. **Output lambdas may build a vector** from scalar state (`(s) => [s.player.x, s.player.y]`). Recommended. All three maze authors duplicated state without it.

## Next

The relay trial (`Qw03tp`), as the dogfood ruling asks, before any of this is built: for each of a few relays, one fresh agent adds ports to maze knowing nothing of particles, a second adds ports to particles knowing nothing of maze, and a third composes the two from the packages alone, to make the burst. The design passes if the composer's wiring checks clean with no edits to either package, and every frame fact lives in the glue.
