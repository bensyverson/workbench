# What UI rides with a Dialect: a survey of nine Workbenches

*2026-11-25, leaf `CwuGpd` (the survey part). These are findings and a recommendation. Nothing here is decided or built. The package format is leaf `Uld5D0`; this doc does not design it. The inputs are Ben's list. Six are single-page Workbenches in `local/` (gitignored, so only the main checkout has them). One is the public [compiler workbench](https://github.com/wesen/2026-11-24--compiler-workbench), shallow-cloned and read but never run. The other two are this repo's DMG Workbench and the kit's fields, data and particles Dialects. Every page was read with targeted `grep`/`sed` (element ids, view registries, `function …View`, param renderers, event handlers). No page was opened in a browser.*

## The result in one paragraph

Every Workbench has the same backbone: an editor, a stage, a params panel, a docs pane and an agent pane. Most add an IR or graph view, a log and a transport. The pieces that recur are generic. More than that, they are *derivable from the Dialect's definition*: declared params become controls in all nine (Plads, DMG, Skate, Plenum and the compiler workbench generate them from param records), the IR becomes a listing and a dependency graph (five Workbenches), typed signals become traces (Skate derives its channel list from `ir.signals`), and emitted events become a filterable log. Only the stage renderer is domain code in every case: WebGL meshes, drafting sheets, a DMG screen, a zoomable map, a pixel grid. Domain inspectors such as DMG's Tiles view or Loom Wilds' interaction matrix are also domain code. Supporting code is JavaScript everywhere: run loops, solvers, renderers, exporters, intrinsic bodies. GLSL appears for shaders, and C only as an emit target. One Workbench already has a UI DSL of exactly the kind option 3 describes: the compiler workbench's `ui` with cells, components, placed tiles, annotations on built-in views, fragments and tasks. No surveyed page uses Web Components (`customElements.define` matches nothing in any of the six HTML files). **Recommendation, for Ben to decide:** keep three layers. First, generate the generic panels from the definition, with no authored UI. Second, add a small kit UI DSL modeled on the compiler workbench's `ui` for the rest of the catalog (option 3). Third, make Web Components (option 4) the one escape hatch for domain renderers, behind a fixed contract (properties in, events out). Woodcase and OpenUI are better as inspiration than as the representation.

## The Workbenches

### Lastwork Foundry (`local/lastwork-foundry-1.0.0.html`, a YAML language for sneakers)

Searched: the body markup (lines 199–300), `const SCHEMA`, `renderFoot`/`renderPhysics`, and the `addEventListener` handlers around line 3045.

| UI beyond the editor | Generic or domain | What drives it, and how it binds |
|---|---|---|
| Tabs: Code, Collapse, Foot, Physics, Method | generic shell | static markup |
| Language reference (`<details id=refText>`), Method pane | generic (docs) | the constants `REFERENCE` and `METHOD_HTML` |
| Examples picker | generic | `EXAMPLES`; a click writes the YAML into the textarea |
| Status line (`#ystatus`) | generic (diagnostics) | the result of applying the YAML |
| Sliders and segmented buttons for foot, last and gait (`#footCtl`, `#gaitCtl`) | generic in kind, hand-wired | Hand-written per field (`sl('fSize', 'Size EU', 34, 50, 0.5, …)`) even though `SCHEMA` carries the ranges (`N(34, 50, 42)`, `E([...], 'D')`). Bound by doc path (`data-doc="foot.width"`, the `SL` table), they **write back into the YAML** (`specToDoc` → `writeDoc`) |
| KV readouts (foot measured, last solved, one stance simulated, build sheet with World Athletics legality) | generic (readouts) | derived from the built model |
| 3D stage (`canvas#gl`) with display, motion and view segments, HUD stats, title block | renderer domain, chrome generic | WebGL from `buildModel(spec)` |
| Four drafting sheets: plan, foam section, upper pattern, force under stance | domain | 2D canvas, one `draw*` per sheet |
| WFC solver panel: archetype, seed, run/next, slot trace, solver log | domain logic, generic log | `solveDesign`, `designRules` |
| Foundry mode: an infinite grid of generated designs, breed and mutate, a wildness slider | domain (generative gallery) | `synthDoc`; a card's "open" loads its YAML into the editor |

Supporting code, all in JavaScript and all in the page: a hand-written YAML parser (`const YAML`), `compileSpec`, geometry builders (`buildFoot`, `buildLast`, `buildUpper`, `buildKnit` …), gait and foam physics, a WFC solver, WebGL shaders (`R_VS`, `R_FS`) and 2D drawing.

### Plads (`local/plads-1.0.0.html`, a whiteboard as a JS builder program)

Searched: the body markup (lines 411–495), the `.slider` preset, `renderParams`, `inferParam`, `renderIR`, `renderGraph`, `window.claude.use`, the agent tool names and `^K\.`.

| UI beyond the editor | Generic or domain | What drives it, and how it binds |
|---|---|---|
| **Params panel** (`#params`) | **generic, generated** | `rt.prog.paramDefs` of type slider, number, toggle, choice, color or text. The program declares `.slider("rough", 1.3, {min,max,step})` and lambdas read `c.p.rough`. `inferParam` also turns plain values into controls (a number in 0..1 gives a 0–1 slider, a `#rrggbb` string gives a color input, an array gives a choice) |
| Status and console (`#status`, `#console`) | generic | compile errors with line numbers; stats (nodes, bindings, expanders, ms); `rt.logs` |
| View tabs: Canvas, **IR**, **Graph** | generic | IR: a tree of `rt.ir` nodes, each bound prop shown with its deps, click to reveal the source line. Graph: three columns (inputs, derived, nodes that read them) built from `rt.bindings` and `rt.expanders`, with hot edges on update |
| Grammar tab (`#doc`) | generic (reference) | a table of signatures (line 6192) |
| Agent tab | generic | `window.claude.use('sample')` and 12 tools: `read_board`, `get_code`, `set_code`, `edit_code`, `set_params`, `create_shapes` … |
| Presets (24 `<script type="text/plain" class="preset">`) | generic | grouped by `data-group`, with a blurb |
| Peers, cursors, persistence | generic (artifact runtime) | `window.claude.use('room')`, `'user'`, `'db'`, `'downloads'`, falling back to `localStorage` |
| Canvas, toolbar, style panel, zoom, tour mode, run mode ("buttons, votes and sliders respond to clicks") | domain | the board renderer |

Supporting code: about 20 runtime modules in JavaScript (`K.rough`, `K.physics`, `K.motion`, `K.flow`, `K.automata`, `K.dither`, a sandboxed `K.bytebeat` audio compiler …), all in the page.

### Plenum Studio (`local/plenum-studio-1.0.0.html`, zoomable maps of state)

Searched: the body (lines 262–330), the four script heads, the personas, `vp-params`/`renderParams`, the agent `tools`.

| UI beyond the editor | Generic or domain | What drives it, and how it binds |
|---|---|---|
| Tabs: Scene, Graph (a DAG/IR switch), Reference | generic | Graph: DAG nodes tagged source, build (rerun when inputs change) or frame (rerun every frame); the IR as text; a detail pane. Reference: an embedded Markdown grammar (`<script type="text/markdown" id="ref-src">`) |
| Params overlay (`.vp-params`) and **sweeps** (`.vp-sweeps`) | generic, generated | `compiled.params` of kind slider, toggle, choice or sweep. A param passed into a slot wires a DAG edge. A sweep is a slider with a play button: an animated param |
| Dock: Agents (four personas: Composer, Cartographer, Critic, Debugger) and Console with an error badge | generic | the personas are `<script type="text/x-persona">` prompts; tools `read_scene`, `inspect_view`, `set_view`, `set_param`, `write_scene` |
| Viewport: shader head (WebGL), overlay, camera, minimap, readout, detail card, route follow (prev/next stop), legend | renderer domain, chrome generic | `scene(…)` compiled to projections and layers |
| **Semantic head** (`.vp-sem`) | generic (text view) | "the same state as a list"; arrow keys move through it. An accessible text view of the stage |
| Auto-run, FPS, Run | generic | |

Supporting code: the core (grammar, IR and DAG, "No DOM in this file"), a datasets module, a viewport module with GLSL, and the studio itself. All JavaScript, plus `acorn@8.11.3` from jsDelivr for parsing.

### Blueprint Mech (`local/blueprint-mech-1.0.0.html`, a YAML language for mechanisms)

Searched: the element ids in the body (lines 234–465) and the docs sections `d-params`, `d-out` and `d-export`.

| UI beyond the editor | Generic or domain | What drives it, and how it binds |
|---|---|---|
| Inspector sections: **Parameters, Health, Checks, Plots, Parts, Problems**, each with a count badge | generic | **Declared in the DSL itself**: `params: a: {value: 30, range: [10, 60], unit: mm, label: crank}` gives a slider (a plain number gives none, `=expr` makes it derived); `hud:`, `plots: [{title, y: torque(), unit}]`, `checks: [{name, expect: dof() == 1}]` |
| Transport: play, scrub over the driver input with a strip canvas, readout, speed | generic (time) | the drive and sweep |
| Sheet stage (`canvas#cv`) with view bar, HUD, title block (sheet, title, mobility, scale, view) | renderer domain, chrome generic | `sheets:` (assembly or part, projection, size) |
| Export drawer: SVG, DXF, STL, CSV | domain exporters | "from the same display list as the screen" |
| Docs pane (14 sections) and file tabs | generic | static |

Supporting code, in JavaScript: a YAML reader, an expression evaluator, a constraint solver, quasi-static loads, a drafting display list and four exporters.

### Loom Wilds (`local/loom-wilds-1.0.0.html`, a game with no text language)

Searched: the body ids (lines 168–364), `CFG_DEF`, `TUNE`, `MX_RULES`, and the tab renderer around line 3095. A search for a grammar, a parser or a textarea editor found none: the "language" here is tuning tables.

| UI beyond the editor | Generic or domain | What drives it, and how it binds |
|---|---|---|
| Tuning tabs Feel and Chemistry: generated sliders and toggles with a default marker, presets, reset, **share as JSON** | generic, generated | the `TUNE` table `[key, label, min, max, step, unit, note]` over `CFG_DEF`. A 0..1 range with step 1 becomes a toggle |
| X-ray tab: layers, click a cell to inspect | generic (inspector) | the sim grid |
| Interaction matrix ("A cell fills the first time that element changes that material") and Ledger | domain matrix, generic log | `MX_RULES` and sim events |
| Replay track: scrub, play, live, marks, "act in the past to branch" | generic (time travel) | the recorder (`REC.marks`) |
| HUD: goal steps, stamina, minimap; Design notes (a book pane) | domain HUD, generic notes | |

Supporting code: physics and chemistry simulation, a recorder and a WebGL renderer, all in JavaScript.

### Form Skate Workbench (`local/form-skate-workbench.html`, 3.7 MB)

Searched: script boundaries; the `// app/…` module markers (17 modules); the `function [A-Z]…(` components; the view list at line 7134; `ParamsView`, `TracesView`, `EventsView`, `ExperimentsView`, `ReplayBar` and `Inspector`; `channels()`; `window.claude.use`. Line 2363 is a single 3.3 MB `window.FS_DATA` object (`files`, `stage`, `book`), read only for its keys.

| UI beyond the editor | Generic or domain | What drives it, and how it binds |
|---|---|---|
| **Dock**: tiled splits with draggable tabs (`Dock`, `Split`, `Tile`) | generic shell | |
| Views: Stage, Code, **Graph** (dataflow between systems by phase), **IR**, **Traces**, **Events**, **Params**, **Experiments**, Notes, Docs, **Book**, Agent, Reference | mostly generic | listed with `about` and badges (the Params badge counts params changed from their defaults) |
| Params | generic, generated | `rt.ir.params`; library code declares them with `$.param(k, p)` |
| Traces: pinned channels drawn over a time window, with freeze and filter | **generic, derived** | `host.channels()` lists every `ir.signals` and `ir.states` entry typed number, bool, vec2 or vec3 |
| Events: type filters with counts, search | generic | `rt.events.log`; library code calls `.emit('pop', {…})` |
| Inspector: a node's type, expression, value, source `file:line`, "pin trace" | generic | `exec.describe(id)`, `rt.read(id)` |
| Experiments: headless parameter sweeps with progress, then `ResultTable` and `Scatter` | generic | `experiments.js` in the project, `exp.collect({budgetMs, signal, onProgress})` |
| ReplayBar: clip replay, speed, "Compare" draws the same frame with a second strategy side by side | generic (time) | clips |
| Stage: axo, front, side and plan drafting views | domain | `rasterize`, the depth-order strategy |
| Book (KaTeX, export) | generic | `FS_DATA.book` |
| Agent | generic | `window.claude.use('sample')`, `'downloads'` |

Supporting code: `@form/core` ("a component graph, an expression DAG, a phase scheduler and a mutable runtime. Runs in the page and in node (no DOM)"), `host.js`, and an editable library in `FS_DATA.files` (`skate/*.js`, `lab/*.js`, `experiments.js`). All JavaScript. React 18.3.1 and KaTeX come from cdnjs.

### Compiler workbench (github.com/wesen/2026-11-24--compiler-workbench, a typed language compiled to RV32)

Searched: `site-src/` (the `ALL` list in `dock.js`, the header of `dsl.js`), `corpus/reference.md` § "UI DSL", the `ui/*.js` files of three projects, `params-demo`, `package.json`. Nothing was run.

| UI beyond the editor | Generic or domain | What drives it, and how it binds |
|---|---|---|
| Dock with 22 built-in views: projects, files, editor, scripts, source, ir, cfg, lineage, facts, pipeline, strategies, timeline, checks, rv32, run, candela, console, agent, book, compiler, reference, code | generic for a compiler | the compiler framework's IR and revisions; a Step or Run button in the header applies passes |
| **Project UI scripts** (`ui/*.js`): custom tiles placed beside built-in views | **generic, authored in a UI DSL** | see below |
| Script params: `wb.param.choice/int/bool` in `scripts/*.js` | generic | "Moving one reruns the script" (`params-demo/project.json`) |
| Book, reference | generic | `corpus/book/*.md`, `corpus/reference.md` |

**The UI DSL** (`site-src/dsl.js`, 1,702 lines; `corpus/reference.md` § "UI DSL"):

- **Cells** that rerun when what they read changes: `ui.query`, `ui.from(script)`, `ui.state`, `ui.derive`, `cell.map`, `ui.param.int/float/bool/choice/set`, `ui.selection()`.
- **Components**: text (Markdown), code, json, stat (`.badIf`, `.compareTo`), badge, table (`.columns`, `.onRow`, `.highlight`, `.cellStyle`), list, tree, diff, chart (line, bar, scatter, two axes), slider, toggle, select, multiselect, input, button (`.on` may change the program; a query may not, `sideEffectInQuery`), row, col, section, tabs, when.
- **Tiles**: `ui.tile(id).title(…).place({ splitRight: 'ir' | tabWith | replace … }).body(…)`.
- **Annotations** on built-in views: `ui.annotate('ir').stmt(fn)`, `ui.annotate('source').gutter(fn)` (`bounds-lab/ui/bce-marks.js` adds badges and nothing else).
- **Extension**: `ui.fragment('heat').on('Table').method(…)`, plus `ui.use` and `ui.component(name)…register()`.
- **Long work**: `ui.task(async (ctx, {signal, progress, partial}) => …).restartOn(cells)` (`regalloc-lab/ui/spill-curve.js` sweeps 1–24 registers and charts the rows as they arrive).
- **Agent**: the same `ui` sits in the agent's scope, where `ui.live` changes the screen one call at a time.

Supporting code: a TypeScript compiler framework (`src/`, built with `tsc` and `esbuild`; `npm run build:site`), vendored `typed-wasm.js` and `rv32-interp.js`, a C scene gallery (`corpus/candela-gallery/*.c`), and per-project analysis scripts in JavaScript against a `wb` API. The site has a build step, and its CSP allows `'unsafe-eval'` for compiling UI scripts in the page.

### This repo's own

| Workbench (file, what was searched) | UI beyond the editor | Generic or domain, and binding | Supporting code |
|---|---|---|---|
| **DMG** (`project/2026-11-23-dmg-workbench.html`, the source of [dmg-oracle](../scripts/dmg-oracle/README.md); searched `view("…")` and `makeParams`) | A dock with 12 views: Code, Stage ("the DMG screen, the pad and the live world"), **Params** ("Sliders from .param(): live or build-time"), **Graph** (the IR as a DAG), **IR** (text with folded constants), **C** (what a GBDK backend would emit), **Budget** (OAM, scanlines, VRAM, WRAM, ROM against DMG limits), **Tiles** (every tile with its 2bpp bytes), **Events** (log plus console), Notes, Reference, Agent (one `eval` tool) | Params are generated from `.param("speed", slider({…, live}))` and grouped live or build-time. A double-click resets one; ↵ **writes the value back into the code** (a regex over `param("name", slider({ value: … }))`). Budget and Tiles are domain views | `whack-fluent`: builders → `compile()` → `Build { ir, report(), emitC(), runtime() }`; the runtime host loop (`tick`, `loop`, `stepOnce`) and audio, in JavaScript; C as an emit target |
| **fields** ([kit/debugger](../kit/debugger/README.md), [kit/dialects/fields](../kit/dialects/fields/README.md)) | A preview page: a WebGL2 canvas from the GLSL backend; click a pixel to trace it; step with Prev/Next, a slider or the arrow keys; the source with the current span marked; a step table of values; the GPU's byte beside the interpreter's | A pixel inspector and a stepping debugger, generic over pixel Kernels; the trace comes from the interpreter's per-node hook | The intrinsic table with each target's spelling (JS, GLSL), the Library, the debugger page (`page.js`, `view.js`, `gl.js`); `text.js` draws a frame as at most 64×32 characters |
| **data** ([kit/dialects/data](../kit/dialects/data/README.md), the [data-tools Dream Code](2026-11-24-data-tools-dream-code.md)) | Built today: only `text(state)`, one table as columns and types plus 20 rows. The Dream Code wanted `.view(c => wb.layout.column(wb.controls(c.$.minUnits, …), t.picked.grid()))`, `.chart(…)`, `wb.book.note(md…)`, `.agent(a => a.can(…))` and `wb.component(…)`. The kit refuses `.layout`, `.controls` and `.component` as B009 | Controls are named by param, layout is declared in the program, charts are a Grammar construct (`chart(name, table)` exists in `grammar.js`); "a view of a chart, and any layout of several, is the page's" (README) | The `environment` hook and intrinsics, in JavaScript; Kernels run in the interpreter or as emitted JS |
| **particles** ([dream-code.md](../scripts/particles/docs/dream-code.md)) | Only the text view: a header `t=2.00 live=143/500 jet=120 mist=23`, counters, a 40×20 density grid | `.param(name, {value, min, max})` "follow[s] the slider without a rebuild": a slider is assumed but not specified | The host's tick (rate, spawn, forces, update, remove, in a fixed order) is specified in prose. I found no implementation in `scripts/particles/reference/` (only the Dialect and the Grammar) |

## 1. UI kinds worth extracting

"Derivable" means the piece can be generated from what the Dialect already declares, with no authored UI.

| Kind | Where it appears | Data that drives it | Derivable? |
|---|---|---|---|
| **Param controls** (slider, toggle, choice, color, text, date; units; default marker; reset) | all nine (Lastwork, Plads, Plenum, Blueprint, Loom, Skate, compiler, DMG, data; particles assumes it) | param declarations | **yes.** Plads, DMG, Skate, Plenum and the compiler workbench already generate them |
| Write a control's value back into the source | DMG (↵), Lastwork (every move) | param span in the source | yes, given the param's span |
| Animated param (sweep, play) | Plenum | a param flagged sweep | yes |
| **IR listing**, click to source | Plads, Plenum, Skate, DMG, compiler | the IR plus spans | yes (the kit has a listing) |
| **Dependency or phase graph** | Plads (inputs → derived → nodes), Plenum (source, build, frame), Skate (by phase), DMG, compiler (cfg, pipeline, lineage) | the IR's reads and binding times | yes ([kit/query](../kit/query/README.md) answers "who writes", "what reads") |
| Emitted-code view | DMG (C), compiler (rv32), fields (GLSL) | the emitter's output and line map | yes |
| **Event log / console** with type filters and search | Skate, DMG, Plads, Plenum, Loom (ledger), Lastwork (solver log), compiler | emitted events, logs | yes, if events are declared |
| **Traces / time series** (pin a signal) | Skate (channels from `ir.signals`), Blueprint (plots declared), Lastwork (force sheet), compiler (charts, timeline) | typed signals and states | yes for the channel list; plots need a declaration |
| **Inspector** (select → type, expression, value, source, pin) | Skate, Loom (x-ray), Blueprint, Plenum (card), compiler (facts, selection), fields (pixel step table) | a selected IR node or entity | partly: generic for IR nodes, domain for picking on the stage |
| **Stepping debugger** | fields (per pixel), compiler (Step pass) | the interpreter's per-node hook | yes for Kernels |
| **Checks / health / budget / problems** | Blueprint (checks declared), DMG (Budget, diagnostics), Lastwork (WA legality), compiler (checks) | diagnostics plus declared predicates and limits | diagnostics yes; predicates need a declaration |
| **Readouts / HUD / stats** | Lastwork (KV), Blueprint (`hud:`), Loom, Plenum, DMG, compiler (`ui.stat`) | derived values | needs a declaration |
| **Transport / replay** (play, scrub, speed, step, branch, compare) | Blueprint, Loom (branching replay), Skate (replay, compare strategies), DMG, Plenum, Plads (run, tour) | a clock and a recorder | yes, once clocks exist (`f2dMku`) |
| **Experiments / sweeps / batch** (table plus scatter) | Skate, compiler (`ui.task`), Lastwork (Foundry gallery) | a headless run over param ranges | partly: a table and a chart of runs is generic; breeding is domain |
| **Text view** | Plenum (semantic head), fields, data, particles (`text(state)`) | the Dialect's `text` | yes (already required, D020) |
| **Docs / reference / book / notes** | all nine | the definition plus Markdown | reference yes (planned: API.md generated from the definition) |
| **Agent pane with tools or personas** | Plads, Plenum, Skate, DMG, compiler | `window.claude.use('sample')` plus a tool list | the tool list can be generated (set_param, edit_code, read text view) |
| Presets picker | all | presets (which also serve as regression tests, synthesis §3.4) | yes |
| Dock / tabs shell | Skate, DMG, compiler (docks); the rest use tabs | a view registry | page-level: owned by the Workbench, not by a package |
| **Stage renderer** | all | the run's state | **no.** WebGL meshes, drafting sheets, a DMG screen, a map, a shader canvas, a board |
| Domain inspectors | DMG Tiles, Loom interaction matrix, Lastwork pattern sheet, Blueprint export | domain data | no |

## 2. Supporting code that must ride with a package

| Part | Seen in | Language today | Representable in Bench? |
|---|---|---|---|
| Host / run loop (tick order, state, removal, clocks) | DMG (`tick`, `loop`), Skate (phase scheduler), Plenum (build vs frame), Loom, particles (prose only) | JavaScript | The tick order and per-entity rules, mostly yes (the Lean entry's ruling). The frame loop, `requestAnimationFrame` and input are host plumbing the kit should own once |
| Solvers and simulations (WFC, constraints, physics, chemistry) | Lastwork, Blueprint, Loom, Skate | JavaScript | Some are Kernels; recursive or backtracking solvers (WFC with backtracking) do not fit the subset (total, bounded loops) and would be foreign code |
| Intrinsic bodies per target | fields (JS and GLSL spellings), DMG (C emit) | JS, GLSL, C | foreign by nature: a table per target, as fields has |
| Stage renderer | all | JavaScript (Canvas 2D, WebGL), GLSL | no: a UI escape hatch (§3) |
| Exporters (SVG, DXF, STL, CSV, C) | Blueprint, DMG | JavaScript | no: foreign code |
| Derived-data queries feeding panels (channels, budget, checks) | Skate, DMG, compiler (`scripts/*.js`) | JavaScript | yes, as kit queries over the IR or as Kernels |
| Text view | fields, data, particles | JavaScript | already a required function |
| Agent personas and tool list | Plenum, Plads | Markdown and JavaScript | personas are data; tools can be generated |
| Datasets, presets, book | Plenum, all, Skate | data and Markdown | data |

So the "reference runtime" of synthesis §3.4 is concrete in every Workbench: a host loop, plus domain solvers, renderers and exporters. In all nine it is JavaScript. The foreign-code exception the Lean entry anticipates is, in practice, the renderer, the exporters and any backtracking solver.

## 3. The four representation options

What I found out about the two outside options:

- **Woodcase** is Ben's Swift library and CLI for `.pen` design documents (`/Users/ben/git/Woodcase/README.md`; `Sources/Woodcase/Documentation.docc/PenCodeGen.md`, `PenMetadataNamespace.md`; `CodeGen/ComponentRole.swift`).
  - The annotations are `metadata.woodcase` keys: `role` (button, link, toggle, textInput, select, tabBar), `props`, `states`, `action`. Codegen without an LLM emits React or SwiftUI.
  - Per the doc's own correction of 2026-09-02, bindings and actions "are also collected but never emitted".
  - Agents edit it through the `woodcase` CLI (`tree`, `set --rev`, `js`). That CLI is a macOS binary.
- **OpenUI** comes from [openui.com](https://www.openui.com/) and [the thesysdev/openui README](https://raw.githubusercontent.com/thesysdev/openui/HEAD/README.md); an npm summary came via a web search.
  - "The open standard for generative UI." Its OpenUI Lang is "a compact, streaming-first language", one component per line (`root = Stack([header, chart])`), "not JSON".
  - Components are defined with Zod schemas (`defineComponent`, `createLibrary` in `@openuidev/react-lang`), and the system prompt is generated from the library.
  - Runtimes exist for React (19 is a peer dependency), Vue, Svelte and Angular. `@openuidev/browser-bundle` is a prebuilt no-build bundle that ships React. MIT license.
  - I found no documented syntax for state, data binding or actions.

The four options against the catalog:

| | A. Woodcase with annotations | B. OpenUI Lang (or similar) | C. A kit UI DSL (dogfood) | D. Web Components as is |
|---|---|---|---|---|
| **What it can express from §1** | Static layout and look, well. Controls only through six roles. No live bindings (never emitted), no charts, graphs, traces, logs or stage | Layouts of library components. Whatever the library defines, but binding to a live runtime is undocumented. Built for one-shot, streamed answers, not for 60 fps updates | The whole generic list: the compiler workbench's `ui` already covers params, stat, table, chart, tree, diff, log-like lists, tiles, annotations on built-in views and tasks. Stage renderers are out of reach unless a component takes a draw function | Everything, including stage renderers and domain inspectors. Nothing is checked |
| **How an agent writes it** | Through the `woodcase` CLI on JSON, a good read/write/verify loop, but it needs the macOS binary. The JSON is verbose | Easy: a prompt generated from the library, the same pattern as our generated API.md. Line-per-component syntax is cheap in tokens | Like the Dialects: a builder with B and L codes, did-you-mean and spans, documented by a generated API.md. Needs a dogfood trial (the AGENTS.md ruling) | Easy: plain HTML and JS that every model knows. Mistakes surface only at run time; each package reinvents the params panel |
| **Two Dialects in one page** | Two `.pen` docs merged (Woodcase has merging), but codegen produces separate React packages | One library per page; how two packages' components share a namespace is not documented | Through the same qualified names as the Grammar (synthesis §3.4: `tables.table`). Tiles place relative to built-in or other packages' views (`place({ splitRight: 'ir' })`). Annotations let package B mark package A's views | Tag names share one global `customElements` registry, so packages must prefix tags. Shadow DOM keeps styles apart |
| **Inside a Claude artifact with no build step** | No. The output is a React package to bundle; generation runs on macOS | Possible through the browser bundle (React from a CDN), at the cost of a large new dependency | Yes. Plain ES modules like the rest of `kit/`, no Node built-ins | Yes, natively |
| **New dependencies** | Woodcase (ours, but Swift) plus React | `@openuidev/*`, React 19, Zod | none | none |

**Recommendation (for Ben to decide):**

1. **Generate first.** Most of the catalog needs no UI representation at all. From the definition and the run, the kit can produce param controls with write-back, the IR listing, the dependency graph, the emitted code, the event log, trace channels, diagnostics, the text view, the reference, presets and an agent tool list. Plads, DMG, Skate and Plenum each did this by hand, four times over.
2. **Option C for what must be authored:** a small UI DSL in the kit for custom tiles (readouts, declared plots and checks, tables, charts of experiment runs, annotations on built-in views). Model it on the compiler workbench's `ui`, which is a working proof of the shape, and on Blueprint's in-language `hud:`, `plots:` and `checks:`. It composes through the same names as the Grammar, runs with no build step, and is checked and documented like any Dialect. It needs the dogfood trial before it is frozen.
3. **Option D as the single escape hatch**, for stage renderers and domain inspectors: a package may ship custom elements under a prefixed tag, behind one contract (the run's state and params as properties; selection, param edits and picks as events). Every surveyed stage is domain code, so this hatch will be used by every package with a canvas.
4. **Do not adopt A or B as the representation.** Borrow from them instead: from Woodcase, the role vocabulary with smart default states and the read, write, verify CLI loop; from OpenUI, generating the agent's prompt from the component library and a streaming, line-per-component syntax.

## What this survey could not determine

- **OpenUI's state, binding and action syntax.** Neither page fetched shows it (openui.com, the README; Context7 had only setup). The npm details come from a search-result summary, not the official package README.
- **Whether the compiler workbench's built site runs inside a Claude artifact.** Not run. It is built by `esbuild`, needs `'unsafe-eval'`, and loads `app.js` plus three vendor scripts as separate files.
- **Rendered appearance.** No page was opened in a browser. Everything above comes from the markup and the code.
- **Parts read only by their keys:** Skate's 3.3 MB `FS_DATA` blob (library files, stage data, book), Lastwork's `METHOD_HTML`, and the Woodcase React output.
- **The particles host.** Specified in prose; no implementation was found in this repo.
- **Not surveyed:** `local/uncommon-math-0.1.0.html` is in `local/` but not on Ben's list.
