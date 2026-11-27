# kit/page: a composed run on a canvas

The library a workbench page stands on ([the draw-list draft](../../project/2026-11-26-draw-list-draft.md), Ben's ruling of 2026-11-26, leaf `hca0YM`). Given a composed record, its runtimes and its loaded packages, `createPage` creates the run ([kit/run](../run/README.md), a display run under the real-time driver), advances it on the frames the host gives it, draws the shown part's Draw list (or a shown layer's, kit/compose's "Layers") each frame on a Canvas 2D context ([kit/draw](../draw/README.md)'s `drawCanvas`) with the packages' decoded images, turns key events into the page's controls (kit/compose's `PAGE_CONTROLS`), runs the draw-time profile check where it draws and reports a refusal as a page diagnostic, and exposes what a host UI shows next. It builds no UI and touches no DOM: the context, the frame source, the image decoder and the key events are the host's, so Node tests drive it by hand. No Node built-ins.

```js
import { createPage } from "./kit/page/index.js";

const page = createPage({
  composed,                                   // composition.build({ runtimes, profile? })
  runtimes,                                   // each package's defineRuntime result
  packages,                                   // each package's loadPackage result (kit/package)
  context: canvas.getContext("2d"),
  requestFrame: (cb) => requestAnimationFrame(cb),
  decode: (bytes) => createImageBitmap(new Blob([bytes], { type: "image/png" })),
});
if (page.size) { canvas.width = page.size.width; canvas.height = page.size.height; }
await page.ready;                             // the images are decoded (or reported, H003)
page.start();
addEventListener("keydown", (e) => { if (page.key(e)) e.preventDefault(); });
addEventListener("keyup", (e) => { if (page.key(e)) e.preventDefault(); });
// each frame, or on a timer: show page.status() and page.why() in the host's own UI
```

## API

| Export | Does |
|---|---|
| `createPage(options)` | the page (below); throws when `requestFrame` is not a function, when `keys` maps a key to something that is not a control, and whatever `createRun` throws (kit/run: N006, N007, S116, a part with no runtime) |
| `examplePreset(name, programFn, build?, { wirePage? })` | one package example run alone (below): `{ composition, build, diagnostics }` |
| `sweepRuns(options)` | a `runs` tile's fresh runs (below): `{ points, error? }` |
| `runTests(loaded, options)` | a package's manifest tests, run (below): `{ results, diagnostics, cancelled? }` |
| `DEFAULT_KEYS` | the DMG host's key map, by `KeyboardEvent.code`: arrows and `KeyW` `KeyA` `KeyS` `KeyD` → the pad; `KeyX`, `KeyK` → `a`; `KeyZ`, `KeyJ` → `b`; `Enter` → `start`; `ShiftLeft`, `ShiftRight` → `select` |
| `KEY_TARGETS` | what a key may map to: `"pad.up"`, `"pad.down"`, `"pad.left"`, `"pad.right"`, `"a"`, `"b"`, `"start"`, `"select"` |
| `PAGE_CODES` | the H codes (below) |
| `MAX_PAGE_DIAGNOSTICS` | how many page diagnostics the list keeps (100) |

**Options.**

| Key | |
|---|---|
| `composed` | kit/compose's built record. Its `show` and `view` say what is drawn; its `profile` (kept from `build({ profile })`) is the draw-time check's; none, and nothing is checked |
| `runtimes` | kit/define's `defineRuntime` results, matched to parts by Dialect name |
| `packages` | kit/package's `loadPackage` results (optional): each image file's bytes (`data`), and the content keys kit/run gives the parts. A package is matched to a part by its name, the part's Dialect's |
| `context` | a Canvas 2D context: the calls `drawCanvas` makes, and `clearRect` |
| `requestFrame(callback)` | asks for one display frame; `callback(ms)` is called with a time in milliseconds (`requestAnimationFrame` passes one). A test passes its own and calls the callbacks |
| `decode(bytes, info)` | optional: a PNG's bytes (a `Uint8Array`) to a `drawImage` source, or a promise of one. `info` is `{ name, path, width, height }`: the carried name (`<part>.<image>`), the package path, and the size kit/package read and checked. Without it every image draws as its box |
| `keys` | optional: a key map, `{ <KeyboardEvent.code>: <KEY_TARGET> }`, which replaces `DEFAULT_KEYS` (it is not merged) |
| `run` | optional: more of `createRun`'s options (`seed`, `params`, `inputs`, `catchUp`, `checkpointEvery`, `build`). `frames` is always `"display"` |

**The page.**

| Member | |
|---|---|
| `page.ready` | a promise that settles when every image with a file is decoded or reported (H003); drawing before it settles draws boxes for the images not yet decoded |
| `page.start()`, `page.stop()` | start asks for frames: each frame advances the run by its wall time through the driver (`driver.frame`, which caps a frame at the run's catch-up, 1/15 s by default, so a slow machine runs in slow motion and drops nothing), then draws, then asks for the next. The first frame after a start only draws. Stop asks for no more; the run stays where it is. Starting again does not run the stopped time |
| `page.draw()` | draws now: clears the stage box, draws the shown list, runs the check. Returns kit/run's `pageView` result, or null when there is nothing to draw. Frames call it; a host calls it after it moves the run itself (a step while paused, a rewind) if it wants the canvas current before the next frame |
| `page.key(event)` | a key event, `{ type: "keydown" \| "keyup", code }` (a `KeyboardEvent` will do), as a page input: true when the key is in the map (the host may `preventDefault`), false for a key the map lacks, any other event type, or a key whose control no wire takes from the page part (such a key sends and logs nothing; before, every mapped key was true once any page part existed, so the host would `preventDefault` keys the composition ignores, which was wrong). A direction sends a `pad` record each time the held directions change; a button sends `{ held: true }` when its first key goes down and `{ held: false }` when its last key comes up; a key repeat sends nothing. Each input goes into the run's log (`run.input`, stamped at the next instant), and kit/run delivers every one in order, so a tap made between two frames reaches the wired part as its press and its release. The page is sized for two changes per control per frame (kit/compose's `PAGE_CHANGES_PER_FRAME`); this page does not hold the person to it. Past the consumer's max, the wire's overflow policy trims, or with none kit/run folds the excess into the latest record, the held state, so the last release always arrives; it counts and notes what it folded (N001) and never stops the part. **Reversed 2026-11-26:** this said a page wire with no policy past its size had its consumer's step refused (N002) |
| `page.status()` | what a host UI shows next: `{ T, seconds, paused, halted, size, view, diagnostics, page }`. `halted` is the H004 diagnostic that stopped the frame loop, or null (`start()` clears it). `T` is the run's time as rational text (`"1/8"`), `seconds` the same as a number; `paused` the driver's; `view` `{ part, port, ops, check }` (the shown part and output, how many ops its list holds, the draw-time check or null) or null; `diagnostics` the run's N diagnostics; `page` the page's H ones |
| `page.why(part?, since?)` | the run's why text (kit/run's `run.why`) |
| `page.diagnostics` | the H diagnostics, in the order they arose: `{ code, severity, message, T, part?, check? }`. At most `MAX_PAGE_DIAGNOSTICS` (100, exported): past it the oldest are dropped in place (the array stays the same object), so a long run cannot grow it without bound |
| `page.size` | `{ width, height }` of the shown output's frame (its extent for the built record; for a shown layer, its bottom producer's, so an upper picture's ops outside it fall off the canvas), or null when it has none (size the canvas yourself then) |
| `page.sources` | the decoded images by carried name, as `drawCanvas` takes them |
| `page.run`, `page.driver` | the kit/run run and its driver, for run control: `driver.pause()`, `driver.resume()`, `driver.step()`, `driver.paused`; `run.rewind(t)`, `run.state(part)`, `run.log`, `run.record()` |
| `page.options` | the options it was given |

## Presets and sweeps

**`examplePreset(name, programFn, build?)`** ([`preset.js`](preset.js), leaf `dXp5WO`) composes one example alone as `compose(name).part(<it>).show(<it>)`. `programFn` is the example's default export, `($) => <builder chain>`, and `build` its module scope (kit/define's `moduleScope`). The example is built through kit/define's `run`, so build-time code that reads `$` gets each param's declared value and the read is recorded in the record's `reads` (calling the export with `{}`, as the page host did, gave such code `undefined`). `composition` has `check`, `plan` and `build` as kit/compose's, each with the preset's own build options, and its built record's one part carries `run`'s record, reads included, so kit/run knows which param edits rebuild the part; `build(part, params)` is the rebuild `createRun` takes as its `build` option (pass it in createPage's `run`): it runs the example again with those values and throws, naming the B codes, if that Program does not build. An example whose Program does not build gives its B diagnostics; one whose export is not a function, throws, or returns no builder chain is H005; neither has a composition. Importing the example (and giving it its module scope's epilogue, kit/define's `withScope`) is the host's.

**`sweepRuns({ composed, runtimes, packages?, part, spec, compiled, build? })`** ([`sweep.js`](sweep.js)) is a `runs` tile's chart ([kit/define](../define/README.md#defineui)): `spec` is the tile as kit/define's compiled UI evaluates it, `compiled` that compiled UI (`ui.compile(record)`). It makes `steps` fresh runs (createRun, not the page's) with the param spread evenly from `from` to `to`, both ends included, each value clamped to the param's `min..max`, runs each `seconds`, and reads `y` from the part's last state through `compiled.value`, with `$` that run's params. A param build-time code reads is swept by building the part again for each value with `build` (without one the sweep says so). It is asynchronous and never rejects: `{ points: [{ x, y }] }`, or `error` naming the part without that param, the missing `build`, or the run that failed (with the points before it), or `cancelled` with the points so far when `signal` (an `AbortSignal`) aborts. It runs each run in quarter-second slices and gives the thread back (`yieldFn`, by default a zero-delay timer) once it has held it `budgetMs` (12 ms), reporting the share of the sweep's run time done to `onProgress`; a run is the same however it is chunked (kit/run), so the slices change no point. **Corrected 2026-11-26** (review M3, leaf `sr8Yp1`): it was synchronous, so a sweep at defineUI's limits (50 steps of 3600 s) held a page's main thread for about 42 minutes with the particles preset (`local/rev-host-28/sweep-cost.probe.js`).

**Not built.** Rebuilding a part from edited text: the page has no editor, and a rebuild here runs the example's imported function again. A glue's parts get no rebuild, and need none: a glue has no params, so its build-time code cannot read one (kit/compose's `callGlue` refuses a read of the glue's `$`, S104, since leaf `1Bfx8t`; before it, the host called the glue with an empty `$` and such a read was `undefined`), and a part's own `$` is read only in its lambdas, at run time. A UI compiled against a record a rebuild replaced is not compiled again by the host.

A glue is loaded by kit/compose's `rewriteGlue` and `callGlue`, not here: the glue's contract (what it may import, its `$`, its default export) is compose's, beside `scanGlue`; a preset is here because it is a page's way to run one example alone. A param edit is checked by kit/run when it is logged (N008), so a sweep's clamping is its own: an edit is not clamped. **Corrected 2026-11-26:** `sweep.js` said an edit was clamped as a sweep's values are; it never was.

## Package tests: `runTests`

**`runTests(loaded, { importModule, buildOptions?, signal?, onProgress?, yieldFn?, budgetMs? })`** ([`tests.js`](tests.js); leaf `ceE4ib`) runs a package's manifest `tests` ([kit/package](../package/README.md), "Tests", which holds the form, the semantics and the reasons). It is here because kit/package may not depend on kit/run, and this module already composes one example alone (`examplePreset`) and makes fresh sliced runs (`sweepRuns`). First kit/package's `checkTests(loaded)` (K020, K021; anything there and nothing runs, not even the good tests). Then for each test, in manifest order: its example imported with `importModule` and built by `examplePreset` with the page unwired (`wirePage: false`, scope from `buildOptions`, as `checkExamples` takes them); a headless `createRun` with the test's inputs as `{ kind: "in", … }` entries addressed to the one part, its `seed`, and `taps` on every output an `events` expectation names; run to the test's end (the largest of `until`, every input's `T`, every `at` and `to`) in quarter-second slices that yield as a sweep's do, each `state` and `output` expectation read as the run reaches its `at`; the Events and diagnostic expectations checked at the end; then the run's record replayed (`replay`). Asynchronous, never rejects: `{ results: [{ name, ok, diagnostics, warnings, log, T }], diagnostics }` (one result per test; `diagnostics` is every result's, flattened, each with `test` and, for an expectation, `at`, the instant to open it at; `warnings` the run's warnings, N001, which never fail a test), or `cancelled` with the results so far when `signal` aborts. A package without tests returns at once and imports nothing: tests are optional (Ben's ruling 2, 2026-11-27).

Its codes: **H006** an expectation not met (the test, the kind, the instant, the path or output, expected and actual; for `events`, the first record that differs and both counts; for `diagnostic`, what the run did report), **H007** an error diagnostic the test did not expect, or a replay that diverged (N005), **H008** the test could not run (its example did not import or build alone, or `createRun` refused it). Not built: H008 for a state path naming a Program field the built Program does not declare (such a path reads `null`, so it fails as H006 unless `null` is expected). The host shows them under Presets ("Tests", [the host](host/README.md)) and can open a failed test as a preset whose run takes the test's log, paused at the failing instant.

**`examplePreset` wires the page's controls** (Ben's ruling 1, 2026-11-27, which retired `ctx.controls`; [kit/package](../package/README.md), "Rulings"): for each page control whose seam exactly one of the part's Event inputs takes (kit/seam's `compareSeams`: no problem, nothing dropped, nothing filled), the preset adds `.wire(page.out.<control>, <part>.in.<input>)`, so a part played alone gets the person's keys as page records, with the page wire's fold; the built composition then has the page as a part (a host that lists parts skips it, as kit/page's host does). Two inputs taking one control's seam are ambiguous, and so is one input that several controls fit (the buttons' `{ held: bool }`): none of those is wired, and the preset says so in a warning, **H009**, naming them; a glue chooses. `runTests` builds its preset with `wirePage: false` (an `in` input to a wired input is N011): a test's records go through `in`.

## Invariants

- **The list is drawn as it stands.** A profile's refusal never trims it: the page draws every op on Canvas and reports the refusal (H001), naming the profile, the part, the output, the instant its list was committed at and each of `checkDraw`'s J diagnostics (`check`). One refusal is one diagnostic while it lasts. A refusal is identified by the shown output and the set of J codes the check found, not by the message text: the messages carry live values (a sprite's x, counts, rows, op indices), and the earlier text-keyed dedupe, which this replaces, added a diagnostic for every change of a moving picture and grew without bound. A different set of codes, or the same one after the list was drawn clean, is a new diagnostic; the message kept is the first instant's.
- **Nothing is silent.** A composition with nothing to draw is H002 at creation; an image whose pixels cannot be had is H003 when `ready` settles; a frame that throws is H004.
- **A throwing frame stops the loop.** The frame callback catches what `driver.frame` or the draw throws (a decode result `drawImage` rejects, say), records H004 naming the error, asks for no further frame and sets `status().halted`: a loop that threw every frame would be worse. `page.start()` clears it and runs again. `page.draw()` called by the host still throws to the host. Before, the throw escaped the callback and the loop ended with no diagnostic and `paused` false, which was wrong.
- **The run is kit/run's.** The page logs page inputs and frames through the run's own API, so `run.record()` replays (kit/run's `replay`) like any display run.
- **The stage box.** The list is in the shown frame, one unit a pixel. The page clears `0, 0, width, height` and, when the frame's extent does not start at the origin, translates by minus its corner, so the extent's corner is the canvas's.

## Codes

| Code | When |
|---|---|
| H001 | the composition's renderer profile refuses the shown list at draw time (kit/draw's `checkDraw`, J040–J044); an error, since the target cannot draw it, though Canvas does |
| H002 | the composition shows no part, or the shown part has no Draw output (a custom element stage or the text view); a warning |
| H003 | an image names a file that no loaded package holds, or the host's decoder threw or rejected on it; a warning, and the image draws as its box |
| H004 | a frame threw (`driver.frame` or the draw); an error: the frame loop stopped, `status().halted` is this diagnostic, `page.start()` runs again |
| H005 | an example cannot run alone as a preset (`examplePreset`): its default export is not a function `($) => <builder chain>`, or calling it threw or returned no Program; an error, and there is no composition |
| H006 | a package test's expectation was not met (`runTests`) |
| H007 | a package test's run reported an error diagnostic it did not expect, or its replay diverged |
| H008 | a package test could not run |
| H009 | a part run alone could take a page control in more than one way, so none of those is wired (`examplePreset`); a warning |
| H010 | the shown layer's bottom frame has no extent, so the page has no size and the canvas stays hidden (a layer has no text stage to fall back on, as a shown part with no extent does); a warning, once, at creation |

H is reserved for the kit (kit/define's `RESERVED_LETTERS`).

## Not here

The HTML page (leaf `qnw0Qc`), any UI for tiles, inputs, traces, params or an editor, a Game Boy pixel renderer, clicks and touches on the stage (the draft's "Input through the stage"), releasing held keys on blur (a host that wants it sends the keyups), and a package run alone without a glue (compose it as one part).
