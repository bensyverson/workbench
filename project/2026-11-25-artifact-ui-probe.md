# Artifact UI probe: can a DSL-built UI with Web Components as an opt-in upgrade run in a Claude artifact?

*2026-11-25 · findings · extends [M0](2026-11-23-m0-platform-probe.md) and tests the representation recommended in [the UI survey](2026-11-25-workbench-ui-survey.md) (a kit UI DSL, Web Components as the escape hatch, properties in and events out)*

**Bottom line: a DSL-built UI with Web Components as an opt-in upgrade runs in a Claude artifact.** 40 of 41 checks pass in one run (Ben, 2026-11-25, WebKit, Safari 27.2 UA, macOS, mouse; read with `ArtifactData get`, collection `uiprobe`, doc `results`, version 7). Custom elements, Shadow DOM, slots, adopted sheets, `::part` and theme variables all work. A fallback renders until its component is defined and stays when it never is, so a low-end path costs nothing. Components load from a sibling module, a `blob:` module and `new Function` text. A four-line reactive DSL drives a slider and a canvas. Properties go in and composed events come out. The one failure is programmatic `focus()` on load (`activeElement is not the pad`), while focus by a real click passes: the frame does not take focus until the viewer interacts, so a game stage needs one click before it gets keys. Untested: Chromium, the mobile apps, touch input (`maxTouchPoints` 0) and a real gamepad (the API is present, with no pad connected).

## Method

- **Probe page:** [`scripts/m0-probe-ui/`](../scripts/m0-probe-ui/): `index.html` plus one sibling module, `wb-sibling.js`. Published with capability `db` as https://claude.ai/artifact/7TX52MhMB9YUuiozRubEvc (private to Ben).
- **Run:** Ben opens the page. The automatic checks run on load. Eight "Real input" rows need him to click the pad, hold Right arrow for a second, then press and drag the pad outside its box with the mouse or a finger.
- **Read back:** the page writes `uiprobe/results` in its own database (`ArtifactData` `get`, collection `uiprobe`, doc `results`). Each result is `{ok, detail}` with the error text when `ok` is false; `ok: null` is a manual row never exercised.
- **Not retested:** `new Function`, `eval`, sibling and `blob:` module `import()`, Workers, WebGL2/WebGPU. M0 settled them. This probe only reuses `new Function` and `blob:` imports as part of its DSL and definition checks.
- **Scope limits:** synthetic events prove delivery, not device behavior, so key repeat, pointer capture and focus are checked by real input. Gamepad is checked only for the API's presence. One viewer, one run; other hosts untested.
- **Naming:** every tag has a `wb-` prefix, because `customElements` is one global registry.

## What each check tests

| Key | Tests |
|---|---|
| `ce.define` | `customElements.define` of an autonomous element; `createElement` and `get` |
| `ce.lifecycle` | order of `attributeChangedCallback`, `connectedCallback`, `disconnectedCallback` |
| `ce.upgradeExistingMarkup` | markup parsed before the definition is upgraded when defined |
| `shadow.attach`, `shadow.slot` | open shadow root; `<slot>` projection (`assignedNodes`) |
| `shadow.adoptedStyleSheets` | constructable stylesheet applied inside a shadow root |
| `shadow.part` | page stylesheet's `::part(label)` reaches into a shadow root |
| `shadow.cssVarsInherit` | page custom properties cross the boundary (theme tokens) |
| `upgrade.fallbackFirst` | an undefined `<wb-late>` matches `:not(:defined)` and its light-DOM fallback child is rendered |
| `upgrade.afterDelay` | after a 300 ms delay, `define` plus `whenDefined` upgrades in place and the fallback stops rendering (shadow root with no slot) |
| `upgrade.neverDefined` | an element that is never defined keeps its fallback visible |
| `upgrade.cssFallbackSelector` | `:not(:defined)` and `:defined` selectors flip on define |
| `module.siblingDefinesElement` | a sibling ES module defines an element (shadow DOM, attributes) |
| `module.blobDefinesElement`, `module.blobUpgradesExistingMarkup` | a `blob:` module defines an element, including one that upgrades markup already on the page |
| `module.dynamicDefineViaNewFunction` | an element defined from `new Function` text |
| `input.gamepadApi`, `input.pointerEventApi` | `navigator.getGamepads` and `PointerEvent` exist |
| `input.syntheticPadEvents` | synthetic `KeyboardEvent` with `repeat` reaches the D-pad custom element |
| `input.focusApi` | a `tabindex` host takes programmatic focus |
| `input.syntheticSetPointerCaptureRejectsFakeId` | `setPointerCapture` exists; a fake id gives `NotFoundError` (expected) |
| `manual.focus`, `.keydown`, `.keyRepeat`, `.keyup` | real keyboard on the focused pad, including auto-repeat |
| `manual.pointerdown`, `.setPointerCapture`, `.captureOutside`, `.pointerup` | real pointer on the D-pad element: capture works and moves outside it still arrive |
| `dsl.compile` | four DSL lines (`cell`, `param`, `view`) compile with `new Function` into cells, a `wb-slider` and a canvas view |
| `dsl.sliderDrivesCanvas` | a slider input updates a cell, a derived cell, and redraws the canvas (lit pixels counted) |
| `dsl.fallbackWithoutDefinition` | a component tag with no definition still renders its plain `<input type=range>` child |
| `dsl.errorSpan` | a DSL syntax error is reported with its DSL line number |
| `contract.propertyIn` | an object property round-trips by identity and renders |
| `contract.eventOut` | a click in the shadow root surfaces as a composed `CustomEvent` on an ancestor |
| `contract.propertyBeforeUpgrade` | a property assigned before the definition loads is re-applied on upgrade (the lazy-property pitfall) |

## Results

Ben's run, 2026-11-25 (`uiprobe/results`, version 7).

| Area | Result | Detail |
|---|---|---|
| Custom elements (3 checks) | 3/3 pass | |
| Shadow DOM, slots, adopted sheets, `::part`, theme vars (5) | 5/5 pass | |
| Fallback then upgrade (4) | 4/4 pass | |
| Definitions from sibling and `blob:` modules (4) | 4/4 pass (sibling, blob, late blob upgrading markup, `new Function`) | |
| Input, automatic (5) | 4/5: `input.focusApi` fails, programmatic focus refused before any interaction | |
| Input, real: keys, repeat, capture, focus (8) | 8/8 pass (mouse; pointer capture held outside the pad, key repeat seen, click focus works) | |
| Reactive-cell DSL end to end (4) | 4/4 pass (slider to cell to canvas; a syntax error names its DSL line) | |
| Properties in, events out (3) | 3/3 pass (including a property set before the definition loads) | |

## The compiler workbench's UI DSL, from inspection only

Inspected without running it: `site-src/dsl.js` (1,702 lines), its imports, the page's `index.html`, `src/workbench/projects.ts` and `tools/build-site.mjs` of the clone at `/Users/ben/.claude/jobs/3d093c96/tmp/ui-survey/cw`. The clone is untrusted and nothing from it was run.

| Need | What the code shows | Covered by M0 or this probe? |
|---|---|---|
| Runtime code generation | `compileBody` (`projects.ts:89`) uses `new Function(...names, '"use strict";\n' + body + '\n//# sourceURL=…')` for user scripts; the page's CSP carries `'unsafe-eval'` for it | M0: `new Function` works. The `//# sourceURL` suffix is not tested |
| CSP | The site ships a strict meta CSP (`default-src 'self'`, `connect-src 'none'`, no frames or objects). That is the site's own, and the DSL needs only `'unsafe-eval'` from it. The artifact has its own CSP, which this probe has not read | Covered in effect: M0 shows `new Function` allowed in the artifact |
| Build step | `dsl.js` imports `./ui.js`, `./wb.js` and, through `wb.js`, the TypeScript in `src/workbench/index.ts`. `tools/build-site.mjs` bundles them with `esbuild` into one `app.js` (IIFE) beside vendor scripts. Run as source, the files would not load: `.ts` import and no bundle | Not a platform gap. A kit DSL is plain ES modules, which M0 shows load as siblings. A page that took this DSL as is would need its built `app.js` published as a file |
| Network | None found in `dsl.js` (no `fetch`, `XMLHttpRequest`, `WebSocket`, dynamic `import()`); the CSP forbids connections | Nothing needed |
| Storage | `ui.js` uses `localStorage` (get and set); no IndexedDB in `dsl.js` | M0: `localStorage` and IndexedDB work. Not durable across viewers: a saved layout must go in the artifact's data files or `db` |
| DOM | `dsl.js` builds elements with `innerHTML` for `html` and markdown values (lines 329, 465, 1164) and SVG through the SVG namespace; no Web Components, shadow DOM or `customElements` | Plain DOM, which any host renders. The Web Component hatch is this probe's job |
| Workers, wasm | Candela's compiler vendor scripts load lazily with integrity hashes, for the compiler view only, not the DSL | M0: Workers, wasm and sibling script loads work. Subresource-integrity on script tags is untested |

Net: nothing in the DSL needs a platform feature M0 or this probe has not covered, apart from two small untested items (`//# sourceURL` on `new Function` output, and SRI on lazily loaded vendor scripts) and the esbuild bundle, which is a packaging matter.
