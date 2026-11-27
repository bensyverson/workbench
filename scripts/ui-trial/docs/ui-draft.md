# The UI API (draft)

*2026-11-25, revised for the second UI trial. It adds one call, `defineUI`, to the Definition API, and one key, `state`, to `defineDialect`: you already have a Dialect and a Grammar; the Dialect says what the run's state is, and `defineUI` declares the UI that rides with them.*

A package (a Dialect, its Grammar and its UI) runs in a Workbench: a page with an editor, a stage, panels and an agent. **Most of the page is generated** from the definition and the run; you write none of it. Your Dialect declares the **state** the host hands the views; `defineUI` declares only what is left: the **stage**, the **inputs**, your own **tiles** (readouts, checks, tables, plots, charts of runs) and **annotations** on the generated views. It is plain data, checked like a Dialect: every mistake is a code with a fix.

## The file

```js
// <lang>.ui.js
import { defineUI } from "kit/define";
import { orbits } from "./orbits.grammar.js";   // your package's own Grammar builder

export const orbitsUI = defineUI(orbits, { stage, inputs, tiles, annotate });
```

`defineUI(builder, decl)`: `builder` is what your `defineGrammar` returned. Its Dialect's `name` is the **package name** (`orbits`), and its Dialect must declare `state` (below). Every key of `decl` is optional.

## Generated views (you do not write these)

Each has an id. You place tiles beside them and annotate some of them; you cannot replace or remove them.

| Id | What | Derived from |
|---|---|---|
| `stage` | the run, drawn; always present, so always a `place` target | your `stage` element, else the text view's string |
| `text` | the run as characters | the Dialect's `text(state)` (required) |
| `params` | a control per param, with reset; an edit is written back into the Program's source | the Program's params |
| `traces` | a time series per number in the state (not inside a list) | the Dialect's `state` |
| `pad` | an on-screen button per input | `inputs` |
| `events` | a log: input presses, param edits, picks | the run |
| `ir`, `graph` | the lowered lambdas as a listing and a dependency graph | the IR |
| `code` | the emitted code per target | the emitters |
| `diagnostics` | every code the kit gave | the checks |
| `reference` | the language's reference, this UI's included | the definition |
| `presets` | the package's example Programs | the package |
| `editor`, `agent`, `book` | the page's own (not per package) | the page |

## The state: declared in your Dialect

The host computes the run's state after each tick and hands the same value to `text(state)`, the stage and every lambda below. Its shape is part of what the language means, so it is declared in **the Dialect**, as `state` beside `text`, in the Dialect's own types: `"f64"`, `"bool"`, `"str"`, a vector or scalar declared in `types`, `enumOf([...])`, `opt(type)`, `struct({ … })` for an object, `list(type, max)` for a list of at most `max` items, and `list(type)` for a list with no max (only in the state: a lambda reads its `length` and an item by index, and never loops over it).

```js
// orbits.dialect.js
import { defineDialect, struct, list, exact } from "kit/define";

export const orbitsDialect = defineDialect({
  name: "orbits",
  // … types, objects, spaces, targets, slots …
  state: {
    t: "f64",
    bounds: struct({ width: "f64", height: "f64" }),
    bodies: list(struct({ name: "str", x: "f64", y: "f64", speed: "f64" }), 64),
    energy: "f64",
  },
  text(state) { /* … reads state.t, state.bodies … */ },
});
```

- A nested object is `struct({ … })`, never a bare `{ … }`; the top level is the one plain object.
- `text(state)` is checked against it: a host that hands `text` a value of another shape gets an error naming each path that does not fit.
- `state` here is the **run's** state. It has nothing to do with a Grammar construct's `state` (its `init` and `step`), which is build-time.
- A bad `state` is refused by `defineDialect` itself, with a `D` code and a fix.

A **path** names a part of the state as a string: `"t"`, `"bounds.width"`, `"bodies"`. A path stops at a list (`"bodies"`); inside a list, a table's columns name the row's keys. A number is an `"f64"` (or `"f32"`, or a scalar), a string a `"str"`, a boolean a `"bool"`.

## Values: a path or a lambda

Wherever a component takes a value, give a path or a lambda. A **lambda** is a Runtime Lambda in the Runtime Subset (as in your Dialect), **pure** (it assigns only its own `let` locals), and sees its parameters, its locals, the Dialect's globals, intrinsics, library and vector types (`vec2(x, y)`), and nothing else:

| Where | Convention | Gives |
|---|---|---|
| `value`, `y`, `expect`, `badIf`, `tone`, `badge` | `(s, $) => …`: `s` the state, `$` the params | per key, below |
| a table column's `value` | `(row, s, $) => …`: `row` one item of the table's list | a number or string |

A list's length is `s.bodies.length`; its items are read by index (`s.bodies[0].mass`); a string has no `length`, and a vector is read by component name (`s.center.x`), not by index. Every member chain starts at a parameter (`s`, `$`, `row`), a global such as `Math`, or a **const set to exactly one member chain from a parameter**: `const b = s.bodies[0]`, `const w = s.bounds`, `const p = b.pos`. Such a const has the Type of its chain, and `b.mass` is checked against it like `s.bodies[0].mass`. A chain never starts at a conditional, a call or an array. Anything else that holds state in a local is U007: a `let` set to a struct, list or optional (`let b = s.bounds`), a const set to `c ? s.a : s.b`, `const t = s` (the state is never used whole), `const { w } = s.bounds`, a `for…of` binding over state. A local holding a plain value is fine: `const k = 2`, `let n = 0; n += s.t`, `let m = s.t * 2`. A UI lambda never loops over a list with no declared max, or filters one. A list index or an optional (`opt`) read is possibly empty, and the kit reports it as L008 unless it is checked with `!= null` first, and the kit narrows only a local: **read a list item or an optional through a const and test it**, `(s) => { const b = s.bodies[0]; return b != null ? b.mass : 0; }`; `s.bodies[0].mass` alone is L008. For every item, use a table (a column's `row` is never empty). `$.name` reads a param; a package does not know which params a Program declares, so a lambda that reads `$.mass` shows nothing for a Program without `mass`.

Where the components table below says a key takes "a number", "a boolean" or "a string", give a path to one or a lambda that gives one. A lambda computes numbers and booleans; the only strings it gives are literals (`"hot"`) or a string read from the state. It cannot join or format strings.

## `stage`: the contract

```js
stage: { element: "orbits-sky", module: "./orbits-sky.js", emits: ["select"] }
```

- **In:** the host sets the element's properties `state` (the declared state), `params` (`{ name: value }`) and `text` (the text view's string) after every tick, `state` last (`params`, `text`, `state`). Draw when `state` is set. The host may set them before your module has defined the tag, so read any already set when the element upgrades.
- **Size:** the element fills the box the host lays out for the view; the host sets no size. A custom element is inline by default, so give it `:host { display: block }` in its own shadow root. Watch your own box (a `ResizeObserver`) if you draw to it.
- **Out:** the element dispatches `CustomEvent`s with `bubbles: true, composed: true`, only those named in `emits`:
  - `wb-pick`, `detail: { x, y }`: a point, in state coordinates;
  - `wb-select`, `detail: { path, index }`: an item of a list in state (`{ path: "bodies", index: 2 }`);
  - `wb-param`, `detail: { name, value }`: a param edit (the host clamps and writes it back).
- **Required:** the text view. With no `stage`, or on a host that runs no custom elements, the stage is `text(state)`.
- The element draws; it never handles keys for inputs (below) and never calls `focus()`.

## Custom elements (optional, on any component but `row` and `col`)

Any component (below) but `row` and `col`, which are layouts and draw nothing of their own, and the stage may name a custom element that draws it instead. The component's own form is always the **fallback**: a host that runs no custom elements, or before the module loads, shows the plain form.

- `element`: a custom element tag `<package>-<name>`, lowercase, with a hyphen (`orbits-sky`; digits, `.` and `_` are fine too, as in HTML's custom element names). `customElements` is one global registry, so the package name is the prefix. `wb-` is the host's.
- `module`: `"./<file>.js"`, one of your package's files, an ES module that calls `customElements.define` for that tag (and imports nothing).
- `emits`: as for the stage.
- A component's element gets, besides `state`, `params` and `text`, the property `value`: what the component resolved to (a stat's number, a table's rows, a plot's points).

## `inputs`: declared events a host lowers

```js
inputs: {
  object: "Pad",                                  // the Dialect object lambdas read the buttons from
  buttons: {
    up:    { role: "dpad.up" },    down:  { role: "dpad.down" },
    left:  { role: "dpad.left" },  right: { role: "dpad.right" },
    a:     { role: "a", label: "Dash" },
    b:     { role: "b", label: "Wait" },
  },
}
```

- A **button** is held or not. The host samples every button once at the start of each tick, and a lambda reads `pad.left` as `true` while it is held. The object's members are exactly the buttons, each `"bool"`, declared in your Dialect.
- `role` (optional) is one of `dpad.up dpad.down dpad.left dpad.right a b start select`, each at most once; a host maps a role to its keys, its on-screen pad and a gamepad's standard buttons. A button with no role gets an on-screen button and a key the host picks. `label` is what the on-screen button says.
- **Focus:** keys reach the page only after the viewer clicks it, so the host shows "click to play" over the stage until then. The on-screen `pad` works without a click. Do not try to take focus.
- Only buttons exist; an axis, a pointer or a pick as input are not built.

## `tiles`: your panels

```js
tiles: {
  bodies:  { title: "Bodies", place: { splitLeft: "stage", size: 0.25 }, body: [ /* components */ ] },
  drift:   { title: "Energy", place: { splitBelow: "bodies" }, body: [ … ] },
}
```

- The key is the tile's id: an identifier, not a generated view's id.
- `place`: exactly one of `splitRight splitLeft splitAbove splitBelow tabWith`, naming a generated view or another of your tiles (no cycles). `size` (0.1 to 0.9, the new tile's share) goes with a split, not `tabWith`.
- `title` (a string) and `body` (a list of components) are required.

### Components

Each is an object with a `kind`. `label` is a string.

| `kind` | Keys | Shows |
|---|---|---|
| `stat` | `label`, `value` (a number or string), `unit?`, `max?` (a number: a path or a lambda, like any value), `badIf?` (a boolean) | a readout; with `max`, shown as "value / max" and red once `value >= max` (at max or past it); also red while `badIf` holds, so red if either does |
| `check` | `label`, `expect` (a boolean) | pass or fail, live |
| `table` | `label`, `rows` (a path to a list), `columns`, `limit?` (whole, 1 to 1000) | one row per item; `columns` lists row keys (`"name"`) or `{ label, value: (row, s, $) => … }` |
| `plot` | `label`, `y` (a number), `window` (seconds, more than 0) | `y` over the last `window` seconds of the run |
| `runs` | `label`, `param` (a param's name), `from`, `to`, `steps` (whole, 2 to 50), `seconds` (more than 0, at most 3600), `y` (a number) | a chart of runs: `steps` fresh runs with `param` spread evenly from `from` to `to` (`from < to`, both ends included, each value clamped to the param's range as an edit is), each run `seconds` of run time at the Program's own tick, `y` read from its last state. Inside `y`, `$` is that run's params, with `param` at its swept value. A Program without `param` shows an empty chart. |
| `text` | `value` (a Markdown string, or a lambda giving a string) | text |
| `row`, `col` | `items` (a list of components) | layout |

## `annotate`: marks on the generated views

```js
annotate: {
  traces: { energy: { note: "kinetic plus potential", tone: "warn" } },
  params: { mass: { badge: (s, $) => ($.mass < 1 ? "light" : null) }, "*": { tone: "dim" } },
}
```

- Views that take annotations: `traces` (keyed by a path to a number in state) and `params` (keyed by a param name, or `"*"` for every param). A key a Program does not have is skipped.
- Each annotation has one or more of: `note` (a string), `badge` (a string, or a lambda giving a string or `null` for none), `tone` (`"good" "warn" "bad" "dim"`, or a lambda giving one or `null` for none).

## Two packages in one page

Each package's views and tiles are named by the package: `orbits.stage`, `orbits.bodies`. Inside your own UI a bare id is your own. Another package's view is named in full (`fields.stage`) in a `place` or an `annotate` key. (This trial's page holds one package, so a qualified id is an error here, your own package's included: write `stage`, not `orbits.stage`.)

## A worked example: orbits

A package that is not in your task: bodies circling a sun, with a `mass` param on the sun. Its Dialect's `state` is the one above plus `startEnergy: "f64"`. Its Dialect gives `Math` as a global, so its lambdas may call `Math.abs`; yours may call only what your Dialect gives.

```js
import { defineUI } from "kit/define";
import { orbits } from "./orbits.grammar.js";

// The state is orbits.dialect.js's (above): t, bounds, bodies, energy, startEnergy.
export const orbitsUI = defineUI(orbits, {
  stage: { element: "orbits-sky", module: "./orbits-sky.js", emits: ["select"] },
  tiles: {
    bodies: {
      title: "Bodies",
      place: { splitLeft: "stage", size: 0.25 },
      body: [
        { kind: "stat", label: "bodies", value: (s) => s.bodies.length, max: (s) => 64 },
        { kind: "table", label: "Bodies", rows: "bodies", columns: ["name", { label: "km/s", value: (row, s, $) => row.speed / 1000 }], limit: 20 },
      ],
    },
    drift: {
      title: "Energy",
      place: { splitBelow: "bodies" },
      body: [
        { kind: "col", items: [
          { kind: "stat", label: "drift", value: (s) => s.energy - s.startEnergy, badIf: (s) => Math.abs(s.energy - s.startEnergy) > 1 },
          { kind: "check", label: "energy kept", expect: (s) => Math.abs(s.energy - s.startEnergy) <= 1 },
        ] },
        { kind: "plot", label: "energy", y: "energy", window: 60 },
      ],
    },
  },
});
```

## Pitfalls

1. **The state lives in the Dialect.** `defineUI` takes no `state` key (U001); declare it in `defineDialect`, in the Dialect's types (`"f64"`, not `"number"`), with `struct` and `list(type, max)` (or `list(type)` when there is no max to declare).
2. **A path stops at a list.** `"bodies.speed"` is U005: a table over `"bodies"` with the column `"speed"` is how you show it.
3. **A lambda gets the whole state**, not a part: `(s) => s.bodies.length`, never `(bodies) => bodies.length`; and it reads through `s` each time, with no alias (`const b = s.bodies[0]`) or destructuring (`const { t } = s`).
4. **Lambdas are pure.** `s.t = 0` or a `$` write is U007; a view never changes the run. A param edit is the `params` view's job, or a `wb-param` event.
5. **The fallback is the component.** An `element` sits on a component (or the stage), never alone; the component's keys are still required.
6. **Inputs are not key handlers.** Declare buttons; the host maps keys, the on-screen pad and a gamepad to them.
7. **`text` is two things.** The generated view `text` (`place: { tabWith: "text" }`) and the component kind `text` (`{ kind: "text", value: … }`) share a word and nothing else.
8. **The checker cannot type a lambda's result** (it checks paths' types, purity, arity and what a lambda reads from `s`); the kit will.

## Codes

`U…` is a UI declaration the checker refuses. Each comes with a fix.

| Code | Refused when |
|---|---|
| U001 | an unknown key (with a did-you-mean), or a required key missing; a `state` key (the state is the Dialect's) |
| U002 | a component `kind` that does not exist |
| U003 | a `place` or `annotate` that names no view or tile, or tiles placed in a cycle |
| U004 | a `place` without exactly one direction, or a bad `size` |
| U005 | a path that names nothing in the state, or names the wrong type for its key (a table's `rows` that is not a list, a `badIf` that is not a boolean …) |
| U007 | a lambda that does not parse, leaves the Runtime Subset, takes more parameters than its convention, assigns anything but its own locals, reads a member of the state that is not declared, starts a member chain anywhere but at a parameter or a global, holds state in a local other than a const set to exactly a parameter chain, or reads a free name the Dialect does not give |
| U008 | a custom element without the package prefix or not a valid tag, without a `module`, with a module that is not one of the package's files or does not define the tag, or one tag used twice |
| U009 | an `emits` event that is not `pick`, `select` or `param`, or `emits` without an `element` |
| U010 | `inputs` whose `object` is not a Dialect object, whose buttons are not exactly its members (each `"bool"`), or with an unknown or repeated `role` |
| U011 | a tile id that is not an identifier or is a generated view's id |
| U012 | a value of the wrong form: a `label`, `title` or `note` that is not a string, a number out of its range or not whole, a `columns` entry that is neither a key nor `{ label, value }`, an empty `body` or `items` |
| U013 | `defineUI` given something other than the package's Grammar builder, or a Dialect that declares no `state` |
| U014 | a Draw stage, `stage: { draw: "<output>" }`, naming an output the Dialect lacks or one that is not a Draw seam, or a stage with both `draw` and a custom element (added 2026-11-26, leaf `hca0YM`, after the trials) |
