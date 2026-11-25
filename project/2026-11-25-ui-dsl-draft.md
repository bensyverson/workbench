# Draft: the kit UI DSL

*2026-11-25, leaf `vp27OC` (M4 Composition, `SPPLaM`), the draft half. A design for a trial, not built. It follows [Ben's M4 UI decision](2026-11-25-m4-ui-decision.md), which binds it, and draws on [the UI survey](2026-11-25-workbench-ui-survey.md), [the artifact UI probe](2026-11-25-artifact-ui-probe.md) and the compiler workbench's `ui` (its `corpus/reference.md` § "UI DSL", read through `gh api` on 2026-11-25). The agent-facing form, with signatures, one worked example and pitfalls, is [`scripts/ui-trial/docs/ui-draft.md`](../scripts/ui-trial/docs/ui-draft.md); the trial that tests it is [`scripts/ui-trial/`](../scripts/ui-trial/README.md). Where this doc and the packet differ, the packet is what agents saw.*

## In one paragraph

A package's UI is one more call beside `defineDialect` and `defineGrammar`: `defineUI(builder, decl)`, plain data in `<lang>.ui.js`, checked with `U…` codes that carry fixes and did-you-means. Most of a Workbench is **generated** from the definition and the run (params, IR, graph, code, events, traces, diagnostics, text view, reference, presets, the on-screen pad), and a package only refers to those views by id: it places tiles beside them and annotates two of them. What it declares is small: the **state** the host hands every view (typed with the Grammar's shapes), the **stage** (a contract: state and params in, `wb-` events out, `text(state)` the required fallback), the **inputs** (buttons a host lowers onto a Dialect object), its **tiles** (stat, check, table, plot, runs, text, row, col) and **annotations**. Any component, and the stage, may name a custom element under the package's prefix; the component's own form is always the fallback. Values are paths into the state or pure Bench lambdas `(s, $) => …`.

## Why data, not a fluent builder

The compiler workbench's `ui` is a fluent JavaScript API (`ui.tile('bounds').place({ splitRight: 'ir' }).body(ui.col(…))`) whose cells are closures it runs. The kit already declares languages as data (`defineDialect`, `defineGrammar`) and checks lambdas it never calls, so the UI does the same:

- a checker reads the whole declaration without running it, and every mistake has a path and so a line;
- one component per line reads like OpenUI's line-per-component syntax, cheap for an agent;
- the generated reference (API.md-style) and the agent's prompt come from the declaration, as they will for a Dialect.

What the compiler workbench gets from running closures (async queries, cells that depend on cells, tasks with progress) is out of the draft: a UI value here is a pure function of one tick's state and the params.

## Generated views, and how a package refers to them

| Id | Derived from |
|---|---|
| `stage` | the package's `stage` element, else `text(state)` |
| `text` | `text(state)` (D020: already required) |
| `params` | the Program's params; edits write back into the source (DMG ↵, Lastwork) |
| `traces` | every number in the declared `state` that is not inside a list (as Skate derives channels from `ir.signals`) |
| `pad` | the declared `inputs` |
| `events` | input presses, param edits, picks (a Dialect's own `emit` is not built) |
| `ir`, `graph` | the lowered Kernels and [kit/query](../kit/query/README.md) |
| `code` | the emitters, per target |
| `diagnostics` | every code the kit gave |
| `reference` | the definition, the UI included |
| `presets` | the package's example Programs |
| `editor`, `agent`, `book` | the page's own, not a package's |

A package **places** a tile against any of them (`place: { splitRight: "stage" }`: exactly one of `splitRight splitLeft splitAbove splitBelow tabWith`, plus `size` for a split), **annotates** `traces` (by state path) and `params` (by param name or `"*"`) with a `note`, a `badge` or a `tone`, and cannot replace or remove one. The compiler workbench's richer annotation targets (`ir` statements, `source` gutters) are left out until a package here needs them; particles, maze and DMG's surveyed views do not (the compiler workbench's `bounds-lab` does, for a compiler).

## The state, and values

The decision's stage contract takes "the run's state and params" in. Today `text(state)` takes an untyped `state` described in a comment, so the draft declares its shape in the UI with the Grammar's shapes: `"number" "string" "boolean"`, objects, `listOf(shape)`. Every view gets the same value. This is what makes the rest checkable: a path (`"bounds.width"`) is resolved and typed against it, and a lambda's reads of `s` are too.

A value is a **path** or a **lambda**. A lambda is a Runtime Lambda in Bench, in an implied pure space with the convention `(s, $) => T` (a table column's is `(row, s, $) => T`): it sees the Dialect's globals, intrinsics, library and vector types and nothing of the run but its arguments. Built, the kit lowers these like any lambda, with the state's shape as an object type, so the UI reaches every backend and a type error is an `L…` code; the trial's checker approximates (parse, subset, arity, purity, reads, free names) and cannot type a result.

## Authored tiles

| Kind | From | Shows |
|---|---|---|
| `stat` | `ui.stat` (`.badIf`, `.unit`), Blueprint's `hud:` | a readout, red while `badIf` |
| `check` | Blueprint's `checks: [{ name, expect }]` | pass or fail, live |
| `table` | `ui.table(rows).columns(…)` | one row per item of a list in state |
| `plot` | Blueprint's `plots:` | a number over the last `window` seconds |
| `runs` | `ui.task` plus `ui.chart` (`regalloc-lab/ui/spill-curve.js`), Skate's Experiments | a chart of fresh headless runs across one param, each `seconds` long at the Program's own tick; `$` in its `y` is that run's params; a Program without the param shows an empty chart |
| `text` | `ui.text` | Markdown, or a lambda's string |
| `row`, `col` | `ui.row`, `ui.col` | layout |

Left out, deliberately: buttons and other controls (param controls are generated; game actions are inputs), `tabs` and `when` (a tile's `tabWith` covers tabs), `tree`, `diff`, `list`, `json`, `code` (no use case in particles, DMG or maze), fragments, `ui.component` (the Web Component extension takes its place), `ui.live` and `ui.selection()` (an agent edits the declaration like any file; selection is a `wb-select` event and is not yet readable by a tile).

## The Web Component extension

- **A DSL element names an optional custom element.** Any component (but `row` and `col`) and the stage take `element: "<package>-<name>"` and `module: "./<file>.js"`. The component's DSL form is the fallback: a host that runs no custom elements, or one waiting for the module, renders it, as the probe's `upgrade.fallbackFirst` and `dsl.fallbackWithoutDefinition` showed in an artifact. A stage's fallback is `text(state)`.
- **The prefix is the package name.** `customElements` is one global registry, and the package name is already unique in a page (it qualifies the Grammar's names), so `particles-field` needs no separate `prefix` key. `wb-` is the host's.
- **The module is a declared foreign JS module** (decision §1): trusted, not lowered, accepted only where a webview runs. It calls `customElements.define` for its tag and imports nothing.
- **The contract.** In: the host sets the properties `state`, `params` and `text` after every tick, plus `value` (what the component resolved to) on a component. Out: `CustomEvent`s with `bubbles` and `composed`, only those declared in `emits`: `wb-pick { x, y }`, `wb-select { path, index }`, `wb-param { name, value }`. The probe's `contract.propertyBeforeUpgrade` pitfall (a property set before the module loads) is the element's to handle, and the trial fixture shows the idiom.

## Inputs

The decision: input is declared events a host lowers, never key handling inside a package. Draft:

```js
inputs: { object: "Pad", buttons: { left: { role: "dpad.left" }, …, a: { role: "a", label: "Dash" } } }
```

- A **button** is held or not. The host samples every button at the start of each tick into the Dialect object `inputs.object` names, whose members are exactly the buttons, each `"bool"`; a lambda reads `pad.left`. That keeps the run's view of input inside the Dialect (checked, lowered) and the device mapping inside the host.
- A `role` from a fixed list (`dpad.up dpad.down dpad.left dpad.right a b start select`) lets a host map keys, its generated on-screen `pad` view and a gamepad's standard buttons without per-package config; a button without one still gets an on-screen button.
- **Focus:** the probe found programmatic `focus()` refused until the viewer interacts. So the host, not the package, shows "click to play" over the stage until it has focus; the on-screen pad needs none. A package never calls `focus()`.
- **DMG** is the worked case in the design: its D-pad and A/B become six buttons with the six roles, onto a `Pad` object its lambdas read. The trial uses a smaller game with the same six buttons (maze, below), since DMG's lambdas predate kit/define.
- Not built: axes, pointer input, picks as input (a pick is a stage event, which the host logs; a Dialect reading it would need an input object of its own).

## The stage contract

- **In:** `state` (the declared shape), `params` (`{ name: value }`), `text` (the text view's string), set once per tick with `state` last, so an element draws on `state`. The host may set them before the module defines the tag. The element fills the box the host gives the view.

> **Changed after the trial (2026-11-25):** `runs` took `ticks`, which no UI can turn into run time because it cannot read the Program's tick; all three agents reported it. It now takes `seconds`. The property order, early properties and sizing were added because each agent had to guess them. See [the trial findings](2026-11-25-ui-trial-findings.md).
- **Out:** `wb-pick`, `wb-select`, `wb-param`, as declared in `emits`.
- **Required:** `text(state)`. With no `stage`, a host that runs no custom element, or a text-only agent, the stage is the text view.

## Two packages in one page

As the Grammar does (synthesis §3.4, `tables.table`), every per-package view and tile has a qualified id `<package>.<id>`: `particles.stage`, `maze.score`. Inside a package's own UI a bare id is its own. A `place` or an `annotate` key may name another package's view in full (`place: { splitRight: "particles.stage" }`), so package B can sit beside, and mark, package A's views. The page's own views (`editor`, `agent`, `book`) are unqualified and shared. Tags cannot collide because each is prefixed by its package name; two packages with one name are already a page error under the Grammar's qualification. The trial's page holds one package, so a qualified id there is `U003`; composition is asked in prose (task item 14).

## Diagnostics

`U` is free: the kit reserves `B C D L P S V` for its own codes and tells Dialect authors to pick another letter, so building this means adding `U` to that list (kit/API.md, "Your checks"). Each code carries a fix; unknown names carry a did-you-mean.

| Code | Refused when |
|---|---|
| U001 | an unknown key, or a required key missing (a misspelled required key is reported once) |
| U002 | a component kind that does not exist |
| U003 | a `place` or `annotate` that names no view or tile, or tiles placed in a cycle |
| U004 | a `place` without exactly one direction, or a bad `size` |
| U005 | a path that names nothing in state, reads into a list, or is the wrong type for its key; a table column that is not a row key |
| U006 | a state shape that is not a shape, or an empty state |
| U007 | a lambda that does not parse, leaves the subset, takes too many parameters, assigns anything but its own `let` locals, reads an undeclared member, or a free name the Dialect does not give |
| U008 | a custom element without the package prefix or a valid tag, without a module, with a module that is not a package file or does not define the tag, or a tag used twice |
| U009 | an `emits` event outside `pick select param`, or `emits` without an element |
| U010 | inputs whose object is not a Dialect object, whose buttons are not exactly its `bool` members, or with an unknown or repeated role |
| U011 | a tile id that is not an identifier or is a generated view's id |
| U012 | a value of the wrong form (labels, ranges, columns, empty lists) |
| U013 | `defineUI` given something other than the package's Grammar builder, or a Dialect without `text(state)` |

## Not in the draft (on purpose)

Program-level UI (the data Dream Code's `.view(…)`), buttons and form controls, async queries and cells that depend on cells, tasks with progress beyond `runs`, IR and source annotations, styling and themes, a saved layout, the agent's generated tool list, axis or pointer inputs. Each is a gap an agent may report; none is needed by particles, maze or DMG as surveyed.

## The trial

[`scripts/ui-trial/`](../scripts/ui-trial/README.md): each agent writes `particles.ui.js` (with the reference particles package) and `maze.ui.js` (with a small D-pad game written for the trial, `scripts/ui-trial/packages/maze/`), from `ui-draft.md`, `rules.md` and `task.md` alone, checked by `node scripts/ui-trial/check.js <dir> --lang <name>` (13 U codes, C001, C006, LOAD). The brief keeps the H5 paragraph: what the draft cannot express goes under Gaps, not into a workaround. One Opus, one Sonnet and one Haiku run, per the leaf; the integrator runs them.

## Open questions for Ben

1. **Where does the state's type live?** The draft declares it in the UI, because `text(state)` is untyped today. Declared in the Dialect instead, `text(state)` itself would be checked against it and the host contract would sit with the semantics. Move it after the trial?
2. **Where do inputs live?** The decision says "a Dialect declares its inputs"; the draft declares the buttons and their roles in the UI and ties them to a Dialect object by name (`U010`). Should `defineDialect` own the buttons (and the UI only the on-screen labels)?
3. **May a Program add UI?** The draft is package-level only, so a tile cannot name a Program's own params except through `$.name` lambdas and `runs.param`, which show nothing for a Program without that param. The data Dream Code wanted `.view(…)` in the Program.
4. **One import or two?** The draft adds `defineUI` to `kit/define`. A separate `kit/ui` would keep the Definition API's import list as it is.
5. **Is `runs` in scope now?** It presumes a host that runs fresh headless copies for N ticks, which waits on clocks (`f2dMku`). Keep it in the draft (it was on the decision's list as "charts of runs") or defer it?
6. **Reserve `U`.** Building this means adding `U` to the letters a Dialect's own checks may not use (kit/API.md); `api-pilot`'s reference grammar already uses `U001` for its own check.

> **After the trial (2026-11-25):** the [findings](2026-11-25-ui-trial-findings.md) do not settle 1 or 2 (agents follow whatever the draft says), and add three:
>
> 7. **A readout against a maximum.** A `stat` with `max?` (shown as "value / max", red past it) would make "live against the cap" one readout; today it is two stats (two of six agents named it).
> 8. **Named derived values.** A `derive: { live: (s) => s.particles.length }` usable as a path, and traced like a number in state. It saves repetition and puts the most-watched number in `traces`.
> 9. **Whose state a cross-package annotation reads.** A lambda in maze's `annotate["particles.params"]` sees maze's `s` and `$` under today's convention, which is rarely wanted; and `defineUI` cannot check another package's paths without its declaration. This belongs with the seam work (`hjdIRt`).

> **Ruled (Ben, 2026-11-25), on all nine:**
>
> 1. **The state's shape moves to the Dialect.** It is the run's output, which `text(state)` reads, and headless runs, `runs`, traces, the text view and M4's seams need it with no UI loaded. `text(state)` is checked against it; the UI refers to paths in it.
> 2. **Buttons stay as drafted.** The Dialect declares only the object of booleans its lambdas read (`Pad`); roles, labels and the key mapping are UI.
> 3. **Program-level UI is deferred** until a workbench needs it (data-tools would be first); see the backlog.
> 4. **`defineUI` goes in `kit/define`.**
> 5. **`runs` stays in the language; its host waits on clocks** (`f2dMku`).
> 6. **`U` is reserved** for the UI's codes; api-pilot's reference grammar renames its `U001`.
> 7. **`stat` takes `max?`:** shown as "value / max" or a bar, red past it. A value against a limit recurs: DMG's Budget view, the compiler workbench's `.compareTo`, Blueprint's checks.
> 8. **No derived values:** with the state in the Dialect, a number such as `live` is part of the state, and traced like any other.
> 9. **Deferred to the seam work** (`hjdIRt`).
