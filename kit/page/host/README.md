# kit/page/host: the workbench page

One HTML page, a thin host on the kit ([the draw-list draft](../../../project/2026-11-26-draw-list-draft.md), Ben's ruling of 2026-11-26): load Dialect packages and a glue workbench, play it, inspect it. Every decision is the kit's (kit/package loads, kit/compose checks and builds, kit/run runs, [kit/page](../README.md) draws); the modules here hold the page's own glue and are tested without a DOM. No new dependency.

Serve the **repository root** and open the page (ES modules do not load from `file://`):

```
python3 -m http.server 8765        # from the repo root
# http://127.0.0.1:8765/kit/page/host/index.html?workbench=/scripts/draw-trial/massaged/2026-11-26-compose/workbench.js
```

![the page running the draw trial's compose leg](screenshot.png)

## Loading

| Way | |
|---|---|
| `?workbench=<glue>` | the glue file, fetched; its packages are the folders beside it named by its imports (`import { maze } from "maze"` is `<glue dir>/maze/`) |
| `&packages=<dir>,<dir>` | the package folders instead; each one's `wb-package.json` is fetched, then each file it lists (a `.js` file and the manifest as text, every other file as bytes, so PNGs work) |
| `&profile=canvas\|gameboy` | the renderer profile the composition is checked against (S401, and H001 at draw time) |
| `&preset=<package>/<example>` | one package's example, run alone as a one-part composition |
| Folder | a picker: every folder holding a `wb-package.json` is a package; the `.js` file outside them (`workbench.js` when there are several) is the glue |
| Bundle | a `wb-bundle` JSON file, one package (`scripts/pkg/bundle.js`), through kit/package's `readBundle` |
| Glue file | a glue `.js` file |

Paths in the query resolve against the page's URL, so start them with `/` for a path from the repo root. A missing file is a diagnostic naming its URL.

Packages load through `rewriteSpecifiers` and blob URLs (`kit/define` and `kit/compose` become the real modules' URLs, so one instance of each is shared); the glue's bare package names become each package's Grammar module. A Program file (the glue, an example) gets the module scope epilogue (kit/define's `withScope`), and its build options are kit/define's `moduleScope`. A preset is kit/page's `examplePreset`: a build-time read of `$` gets the declared value, and an edit of such a param rebuilds the part (`Loaded.rebuild`, passed to the run as `build`).

**Diagnostics are never swallowed.** The right column lists every K, S, U, H, N and J diagnostic with the kit's own text, grouped by source (package, glue, composition, page, run, host), and anything the page itself catches (`error`, an unhandled rejection) is a `LOAD` entry. A halted frame loop (H004) says so, and Resume restarts it.

## The page

- **Stage.** The shown part's Draw output on a canvas through `createPage`, scaled with `image-rendering: pixelated`. A shown part with no Draw output (H002) shows its UI's custom element stage when the module loads, else the Dialect's text view. Keys go through `page.key` (`preventDefault` when it returns true); the on-screen D-pad, A, B, Start and Select send the same keys.
- **Run control.** Pause, Step (one instant) and a time scrubber: moving it rewinds through `run.rewind`, and runs forward as far as the furthest point reached.
- **Per part.** Its UI's input buttons (a `control` input named by the UI's `control`, kit/define), its tiles (`stat`, `check`, `table`, `plot`, `runs`, `text`, `row`, `col`: the values from kit/define's `ui.compile(record).evaluate(state, $)`, the part's UI Kernels, each ~0.1 s; [ui-eval.js](ui-eval.js) shows them as text and keeps the plot histories; a `runs` tile sweeps on a click, through kit/page's `sweepRuns`), its params (editable: a `param` input, with the compiled UI's annotations), its generated traces (a series per number outside a list) and its state.
- **Why** is `page.why()`. **Source** is the glue (or the preset's example) read-only with line numbers. **Presets** are each package's `examples`, loaded alone.

## Files

`index.html` and `host.css` (the one inline script holds the page's only dynamic import: the kit's modules may not hold one, `kit/test/browser-safe.test.js`), `main.js` (DOM wiring), `views.js`, `dom.js`, and the tested logic: `load.js` (packages, glue, preset, diagnostics), `sources.js` (query, fetch, upload, bundle), `session.js` (page + scrubber + inputs + snapshot), `ui-eval.js` (formatting, plot histories, traces). Tests are in `test/`; the page itself is checked by hand.

## Known limits

- A param edit that build-time code reads rebuilds a preset's part (kit/page's `examplePreset`), but not a glue's: kit/compose's part records carry no `reads` (kit/page's README, "Presets and sweeps"). The UIs are compiled once, against the loaded records.
- `checkExamples` is not run; a preset that does not build shows its diagnostic.
- Blob URLs of a replaced workbench are not revoked.
- No editor, in-page agent or book; no Game Boy pixel renderer.
