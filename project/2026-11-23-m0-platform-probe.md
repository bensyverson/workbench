# M0: what a workbench page can do inside a Claude artifact

*2026-11-23 · findings · settles the proposal's L19 and the storage question in [the delivery decisions](2026-11-23-delivery-decisions.md)*

**Bottom line: everything the kit needs works inside an artifact.** That covers running code built at run time, loading sibling files as modules, Workers, WebAssembly, WebGL2, WebGPU, an in-page Claude with tools, a page that saves its own data files, and a database that the chat and the page share live. The only failures were `data:` URL module imports and `SharedArrayBuffer`, and neither is needed.

## Method

- **Probe page:** [`scripts/m0-probe/`](../scripts/m0-probe/). It is an `index.html` with four sibling files, published with capabilities `sample`, `db`, `user`, `artifact` and `downloads` as https://claude.ai/artifact/DCZRHk2VcEbiPs9MsbxqKS. It is private to Ben.
- **Run:** Ben opened the page once and clicked its three buttons. The page wrote its results to its own database doc, `probe/results`. Claude read that doc with the `ArtifactData` tool (`get`, collection `probe`, doc `results`, document version 5).
- **Scope:** one run, in one viewer, a WebKit build (UA `Version/27.0.1 Safari/605.1.15`, macOS). Chromium and the mobile apps are untested, and WebGPU availability varies most across them.

## Results

| Area | Check | Result |
|---|---|---|
| Code built at run time | `new Function`, indirect `eval` | work |
| | `String(fn)` keeps the source exactly, comments included | works |
| Loading the kit's own files | `fetch("./data/x.json")`, and `.js` as text (`text/javascript`) | 200 |
| | `import("./data/program.js")` of a sibling ES module | works |
| | `import()` of a `blob:` URL module | works |
| | `import()` of a `data:` URL module | **fails** ("Importing a module script failed") |
| | `<script src="blob:…">` | runs |
| Workers | from a sibling file, from a `blob:` URL, and as a module worker | all work |
| | `crossOriginIsolated` / `SharedArrayBuffer` | **no** |
| WebAssembly | `instantiate` of inline bytes, sync `new WebAssembly.Module`, `instantiateStreaming` of a sibling `.wasm` | all work |
| Graphics, audio | WebGL2 (GLSL ES 3.00) | works |
| | WebGPU adapter (21 features) | works |
| | OffscreenCanvas 2D | works |
| | AudioContext (48 kHz) | works |
| Storage | `localStorage`, IndexedDB | work |
| Speed | 10⁷ xorshift iterations | 65 ms |
| `sample` | One call with a page-defined `add` tool, `modelTier: "quick"` | 1 tool call, correct answer (5555), 3.3 s |
| `artifact` (files form) | `publish({"data/saved-by-page.json": …})` | new version, with the other 5 files kept (checked by a file listing) |
| `db` | Claude wrote `probe/fromClaude` from the chat while the page was open | the page's `onSnapshot` received it live |
| `downloads` | `save()` of a text file | saved after the viewer confirmed |
| `user` | `isOwner`, `canEdit` | both true for Ben |

## What this means for the kit

- **Storage is the artifact's own files.** The kit is the fixed page, and the workbench package (dialect, programs, book, config) is its sibling data files. Each side writes a different way:
  - Chat-Claude writes files with an Artifact publish.
  - The page saves a user's edits with `artifact.publish(files)`, and the publishing view keeps running.

  This works in both directions with no database.
- **`db` is the live channel, not the store.** Use it where the chat must reach an open page without a republish:
  - Claude proposes a program and the workbench shows it at once.
  - The page leaves state for Claude to read, such as check results or traces, which is how this probe reported.

  It is optional: a workbench must still work without it, for example when downloaded.
- **User programs can load as real ES modules**, from sibling files or from `blob:` URLs for in-editor edits. That gives line numbers and stack traces without a `new Function` wrapper. `new Function` also works if the builder chain needs it.
- **The in-page agent is in place.** It is `sample` plus page tools, the same shape as the DMG agent's `eval` tool.
- **Backends are open:** the wasm and GLSL/WGSL paths can all be tested in the page (the proposal's D3).
- **No `SharedArrayBuffer`.** Workers must communicate by `postMessage`. That is fine for the check loop and differential runs.
- **Downloaded workbenches.** Opening a page from `file://` blocks sibling `fetch` and module imports in most browsers, so the "download and run locally" path still needs a single-file bundle. The probe did not test this; it is a browser fact to confirm when the bundler exists.
