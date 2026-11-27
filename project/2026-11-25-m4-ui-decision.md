# Decision: what rides with a Dialect package, and how UI is represented

*2026-11-25, leaf `CwuGpd` (M4 Composition, `SPPLaM`), criterion 5gd. Ruled by Ben on 2026-11-25. Inputs:*
- *[the UI survey of nine Workbenches](2026-11-25-workbench-ui-survey.md);*
- *[the artifact UI probe](2026-11-25-artifact-ui-probe.md), 40 of 41 checks passed (`scripts/m0-probe-ui/`);*
- *the host-implementation ruling of 2026-11-24 ([effects groundwork handoff](2026-11-24-handoff-effects-groundwork.md), "Rulings").*

*This decision comes before the package format (`Uld5D0`), which must have a place for each part below.*

## The decision

**A package carries its Dialect and Grammar, its supporting code, and its UI.**
- **Supporting code** is written in Bench, or declared as a foreign JavaScript module.
- **UI** is written in a small UI DSL built with the kit. Web Components are an optional extension inside that DSL, always with a fallback.
- **Controls** are declared input events.
- **Stages** are a contract with a required text fallback.

### 1. Supporting code

The code behind a builder method, a verb, a solver or an exporter lives in one of two forms. This restates Ben's ruling of 2026-11-24.

- **Bench** (the Runtime Subset): lowered and checked like any lambda, so it reaches every backend. This is the default. The backlog's Lean entry assumes the same thing: a Dialect's run semantics are writable in Bench, and foreign code is the exception.
- **A declared foreign JS module**: trusted, not lowered, and accepted only by the JS and in-page wasm targets. A target that cannot run it refuses with a capability diagnostic, as GLSL refuses today. The survey found the exceptions in practice: renderers, exporters (SVG, DXF, STL) and backtracking solvers, which do not fit the subset's bounded loops.

Nothing is handwaved: every host behavior a package relies on lives in one of these two forms. Precedent: form-skate's `Form.plugin` (`local/form-skate-workbench.html`).

### 2. The UI representation

- **A small kit UI DSL** (the survey's option C), declared and checked with the same tools as a Dialect: a builder with codes, did-you-mean and spans, documented by a generated reference, and composed across packages through the Grammar's qualified names.
  - **Its model** is the compiler workbench's `ui`: cells, components, placed tiles, annotations on built-in views, fragments and tasks. Blueprint Mech's in-language `hud:`, `plots:` and `checks:` add to it.
  - **Dogfooding:** per the AGENTS.md ruling, fresh agents use it before it is frozen.
- **Built-in views are generated, not authored.** *(Carried over from the survey's recommendation; Ben's direction did not rule on it separately.)* The kit derives these from the definition and the run:
  - param controls with write-back;
  - the IR listing and dependency graph;
  - emitted code;
  - the event log;
  - trace channels;
  - diagnostics;
  - the text view;
  - the reference;
  - presets.

  The DSL is for what is left: readouts, declared plots and checks, tables, charts of runs, annotations on built-in views.
- **Web Components are an optional extension inside the DSL**, not a replacement and not a separate path.
  - **Fallback:** a DSL element may name a custom element that upgrades it, and the element's DSL form is always the fallback. A host that cannot or will not run custom elements renders the fallback, and the Workbench still works.
  - **Webview:** a host that wants the custom UI must be able to show a webview.
  - **Tags:** a package's custom tags carry its prefix, since `customElements` is one global registry.
  - **Proven in an artifact:** the probe showed fallback-then-upgrade, shadow DOM and module-loaded components all running inside a Claude artifact.
- **OpenUI and Woodcase are inspiration, not formats.**
  - From Woodcase: a role vocabulary with default states, and a read, write, verify editing loop.
  - From OpenUI: an agent prompt generated from the component library, and a compact, line-per-component syntax.

### 3. Controls

Input is declared as **events a host lowers**, never as raw key handling inside a package. A Dialect declares its inputs, for example DMG's D-pad and A/B buttons. Each host maps them to what it has: keys, an on-screen pad or a gamepad. The probe drove the same declared events from keys and from an on-screen D-pad in an artifact. Programmatic focus needs one click from the viewer first, so a host shows a "click to play" state until it has focus.

> **Corrected 2026-11-27 (declared Controls, leaf `FhnOhO`; [the controls draft](2026-11-27-controls-draft.md)):** the Dialect's inputs are now declared as **Controls in the package's UI**, each named by the Event input it plays and checked against its seam; the kit knows no control of its own (the DMG pad and buttons, `PAGE_CONTROLS`, retired, and the DMG pad is the DMG package's own declaration). Write-back is built (kit/page's `writeBack`, from kit/define's `siteOf`), and the "click to play" state is requirement 13's one gesture: a page whose Controls take keys, MIDI or a gamepad is created locked, and one click focuses, runs every unlock hook and starts the run.

### 4. Stages

Stages differ more than any other part: DMG's pixel screen, shaders, particles, tables, drafting sheets, maps. So a stage is a **contract**, not a component:
- **In:** the run's state and params.
- **Out:** events (selection, param edits, picks).
- **Required:** `text(state)`, the fallback every Dialect already must provide (D020).

A stage's renderer is domain code by nature. Every surveyed stage is, so it is the main use of the Web Component extension, behind this contract. A host that renders no custom stage still shows the text view.

## Why

- **Generated views:** the survey found the generic panels in all nine Workbenches, derivable from what the Dialect already declares. Four Workbenches built them by hand.
- **One DSL for everything else:** it keeps one toolchain. Agents author the DSL the same way they author a Dialect, it composes across packages through names that already exist, and it needs no new dependency and no build step.
- **Fallbacks:** making Web Components optional with a fallback keeps low-end hosts working. A text-only agent, a CLI or a future native host never needs a webview to use a package.
- **Controls and stages as contracts:** this keeps packages independent of the host's input devices and rendering stack.

## What follows

- **`Uld5D0` (packages)** gives each part a place in the package format: definitions, Bench modules, declared foreign modules, the UI declaration, and custom elements under a prefix.
- **A new leaf: design the UI DSL draft**, then dogfood it with fresh agents on three tiers, before it is built. It is the first M4 piece to follow the AGENTS.md ruling.
- **Input events and the stage contract** belong in the DSL draft's scope. The first test cases are DMG's D-pad and particles' text view.
