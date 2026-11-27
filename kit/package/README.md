# kit/package: Dialect packages

A **package** is a folder (or an uploaded bundle of the same files) that carries one Dialect: its definitions, its UI, its supporting code and its examples, so it can be composed later with packages its author never saw. This module turns a set of files the host already holds into a loaded package. It never fetches and never touches a file system: the source is resolved earlier (by an agent or a CLI), and the host passes in the `{ path: text | bytes }` map (bytes a `Uint8Array`, for a binary data file such as a PNG) and an importer. The design is [the package format draft](../../project/2026-11-25-package-format-draft.md) and the rulings at its end. No Node built-ins, so it runs in the page too.

```js
import { loadPackage, readBundle, KIT_VERSION } from "./kit/package/index.js";   // KIT_VERSION is in kit/define
const { files } = readBundle(text);                       // or build { path: text | bytes } from sibling files
const pkg = await loadPackage(files, { importModule: (path) => import(urlOf(path)), kitVersion: KIT_VERSION });
if (pkg.diagnostics.length) show(pkg.diagnostics); else use(pkg.dialect, pkg.grammar, pkg.ui);
```

## The package

```
tiles/
  wb-package.json   the manifest: data, read before any code runs
  tiles.dialect.js  one defineDialect result
  tiles.grammar.js  one defineGrammar builder
  tiles.ui.js       one defineUI value (optional)
  tiles.runtime.js  one defineRuntime result (optional): what makes the package runnable and composable at run time
  …                 lib, foreign, element modules, examples: any layout, named by exact path
```

The manifest (`MANIFEST_PATH = "wb-package.json"`), checked by `checkManifest(text)` → `{ manifest, diagnostics }` (`manifest` is null when there are diagnostics). Unknown top-level keys are an error (K002), so a `dependencies` key is caught, not ignored.

| Field | |
|---|---|
| `name` | required; `^[a-z][a-z0-9]*$`; the Dialect's `name` |
| `version` | required; semver |
| `kit` | required; the Definition API version as `"major.minor"` (`KIT_VERSION` from `kit/define`, now `"0.4"`) |
| `description` | optional string |
| `entry` | required: `{ dialect, grammar }` and optionally `ui` and `runtime`, each an exact path |
| `lib`, `elements`, `examples` | optional arrays of exact paths. **No globs in v0** (K002). `elements` must be exactly the modules the UI's custom elements name (K015, K016) |
| `refusals` | optional array of `{ module, code }`: a module that the kit must refuse, and the diagnostic code (a capital letter and three digits, such as `"L004"`) it must refuse it with. The module is also in `files`, and is not also in `examples` (K002) |
| `tests` | **Draft, not built** (leaf `74YzpH`; checkManifest refuses the key today, K002): optional array of `{ name, example, inputs, expect, until?, seed? }`, each a run of one of `examples` alone, with timed records on its named Event inputs and what to expect. See [Tests (draft)](#tests-draft-2026-11-27-leaf-74yzph) |
| `foreign` | optional array of `{ module, targets, why }`; each is a path in the package |
| `files` | required: `{ path: "sha256-<base64>" }` for every file but the manifest |

Every path is normalized and relative: `/`-separated, no leading `/`, no `.`, `..` or empty part, no backslash, no `:` (so no drive letter), no `?`, `#` or `%` (a URL import reads them as a query, a fragment or an escape: `import "./x.mjs#.js"` once ran an unscanned file), no control character, no space at the start or end of a part. Every path the manifest names must be in `files` (K004). `scripts/pkg/hash.js <dir>` writes `files`.

**A package's modules are exactly its files whose names end in `.js`** (lowercase). `entry`, `lib`, `elements`, `examples`, `refusals` and `foreign.module` must name such files (K002), and a relative import must target one (K007). `files` may also list other files; they are **data**, hashed but never imported. A Dialect names each data file it reads (below).

**Dotfiles are not part of a package.** A path with any part starting with `.` (`.DS_Store`, `.git/config`) is ignored: `checkPackage` drops such keys from the map (an upload may carry them), `scripts/pkg/dir.js` skips them when it reads a folder, and a manifest that lists one is K002.

## Data files

A file whose name does not end in `.js` is data (the format draft's ruling of 2026-11-26 and its "Data files, as built"). A Dialect names each one it reads, in `defineDialect` ([kit/define](../define/README.md)):

```js
files:  { <name>: { kind: "<text | json | csv>", path: "<path>", note: "<what it holds>" } },
images: { <image>: { size: [<w>, <h>], cell: [<cw>, <ch>], file: "<path>.png", note: "<…>" } },
```

An image's `file` is a data file of kind `image`. When the package loads, after the Dialect is imported, `loadPackage` checks each one (kit/define's `dataFiles(dialect)` lists them): its path is a normalized package path that is not a module and is listed in `files` and held (K017; its hash is K006's, like every listed file's); it decodes as its kind (K018: `text`, `csv` and `json` are UTF-8, and `json` parses; an `image` is a PNG, bytes with a PNG signature and IHDR chunk, never text); and a PNG's width and height are the image's `size` (K019). The pixel size is read from the IHDR chunk (`readPngSize`), with no decoder: decoding pixels is the host's ([kit/page](../page/README.md) takes a decode function). The loaded package's `data` holds each file by path: `{ path, kind, from, text }` for the text kinds (`value` too for `json`, parsed) and `{ path, kind, from, bytes, width, height }` for an image; `from` is where the Dialect names it (`files.<name>` or `images.<image>`).

**Text or bytes.** A file's hash is over its bytes, a string's being its UTF-8 bytes, so a file hashes the same whichever way the host holds it, a UTF-8 byte order mark included: `textOf` keeps it as U+FEFF. (It used to strip it, so a file with a BOM hashed differently as text and as bytes, a folder-to-bundle round trip dropped its three bytes, and a manifest hashed before that change failed K006; that was wrong.) The manifest and data `json` files are parsed with a leading BOM ignored. Bytes are any `Uint8Array`, including one made in another realm (an iframe): `isBytes` tests for it, not `instanceof`. The manifest and the modules may be given as bytes and are read as UTF-8 (a module that is not UTF-8 is K007; a manifest, K001). `scripts/pkg/dir.js` reads a file as text when it is valid UTF-8, else as bytes.

## API

- `checkManifest(text)`: above.
- `readPngSize(bytes)` → `{ width, height }` or null: a PNG's size from its IHDR chunk. `textOf(content)` (a file's text, BOM kept, or null when its bytes are not UTF-8) and `bytesOf(content)`; `isBytes(value)` is the realm-safe Uint8Array test they and `readPngSize` use.
- `hashText(content)` → `Promise<"sha256-<base64>">` over `globalThis.crypto.subtle` (Node and the page), of a string's UTF-8 bytes or a `Uint8Array`'s bytes; `contentKey(filesHashes, manifestText)` → the package's **content key**: the hash (`hashText`) of the sorted `path\0hash\n` lines of `files`, followed by one line for the manifest, `wb-package.json\0<hashText(manifest text)>\n`. The manifest text is taken byte for byte, so a changed `entry`, `version` or even spacing is a different key. The hashes catch accidental change (a file edited or damaged after hashing); they are not a signature and do not show who made a package. Pinning against tampering is the workbench lock's job, which is not built.
- `scanImports(path, text, files, { bare?, who? })` → `{ imports, diagnostics }`. See "What imports may do". With `bare`, the module is not a package's: it may import exactly those bare specifiers and nothing else (no relative path), and `who` names it in the refusal. kit/compose's `scanGlue` uses it for a glue program (`"kit/compose"`, `"kit/define"` and the workbench's package names).
- `checkPackage(files, { kitVersion })` → `Promise<{ manifest, diagnostics }>`, no I/O: the manifest; `manifest.kit === kitVersion` (K003, the message names both); every file in `files` present (K004); every file in the map but the manifest listed (K005); hashes (K006); imports of every `.js` file (K007). Paths with a part starting with `.` are ignored first.
- `loadPackage(files, { importModule, kitVersion? })` → `Promise<{ name, version, content, dialect, grammar, ui, runtime, examples, refusals, foreign, data, diagnostics }>`. Runs `checkPackage`; if clean, calls `importModule(path)` (the host's) for `entry.dialect`, `entry.grammar`, `entry.ui`, then `entry.runtime`, stopping at the first one that throws (K011: the later ones would only repeat it). Then it checks the pieces fit (K008) and that the manifest's `elements` equal the set of modules the UI's custom elements name (`uiModules(ui, uiPath)` reads them from the UI's stage, inputs and tiles, each named relative to the UI module at the manifest's `entry.ui`, as an import in it would be: `uiModulePath(uiPath, module)`, which a host uses to find the module it imports; `elementModulePath(files, module)` does it from a package's files: it reads the manifest (`checkManifest`), takes `entry.ui` (default `ui.js`) and returns `{ path, diagnostics }`, where a manifest it cannot read is the manifest's own K diagnostic (K001, K002…) with a null path, and a module that leaves the package is a null path with none; until leaf `sr8Yp1` every path was named from the package's root, which agrees only for a UI module at the root): a module the UI names that `elements` omits is K015, one `elements` lists that the UI does not name is K016. Then it checks the Dialect's data files (above: K017–K019) and gives them as `data`. On any diagnostic the loaded parts are null and `data` is empty. `content` is the content key; `examples` and `refusals` the manifest's, for `checkExamples`; `ui` and `runtime` are null if the manifest names none. `kitVersion` defaults to `KIT_VERSION`.
- `checkExamples(loaded, { importModule, buildOptions? })` → `Promise<diagnostics>`: **the examples are the package's regression suite.** For `loaded` (what `loadPackage` returned; nothing is checked when it did not load), it imports each `examples` module through the host's `importModule`, builds its default export, `($) => Program`, with `kit/define`'s `run()` at the params' declared values, then lowers the record with the Grammar's `lower()`. It must come out with no error: otherwise K012 names the example and the first diagnostic. It does the same for each `refusals` module, which must be refused, with exactly its `code` (the code of the first diagnostic of `run()` or `lower()`): accepted is K013, refused with another code is K014 and names both. A module that fails to import is K011; a default export that is not a function of the params, or one that throws, is K012. It is a separate call so a host that does not run examples (the page, for now) does not pay for them. `buildOptions(path, module)` may return run()'s options for a module (its module scope: `scope`, `sources`, …); a host passes it when its examples' lambdas read top-level helpers of their file, which only the host can read. The folder checker does ([scripts/pkg-trial](../../scripts/pkg-trial/README.md)).
- `packageReference(loaded)` → Markdown: the package's generated reference, for now its seams only, which a composer reads to decide what to wire without running code: each output (seam type, note; an Event output says its runtime pushes the records), each input (seam type, `default` or `required`, an Event input's `delivery` and the name and slots its record is read by, note), each frame (dims, whether it has an extent for `"fit"`, note) and the kit's `s`. A package with none says nothing can be wired to it. Constructs and slots are not printed yet.
- `rewriteSpecifiers(files, urlFor, kitUrl)` → `{ diagnostics, modules }`, for uploads. See "Uploads".
- `readBundle(text)` → `{ files, diagnostics }` (`files` null on K010); `writeBundle(files)` → the text, paths sorted. A bundle is `{ "format": "wb-bundle", "files": { path: text | { "base64": "<bytes>" } } }`: a binary file is its bytes in base64 inside the JSON, so a bundle stays one JSON file and one without binary files is as before; `scripts/pkg/bundle.js` writes one.
- `PACKAGE_CODES`; types in [`package.d.ts`](package.d.ts).

### The entry export rule

Each entry module exports **exactly one value of its kind, found by value, not by name**: the Dialect file one `defineDialect` result, the Grammar file one `defineGrammar` builder, the UI file one `defineUI` value, the runtime file one `defineRuntime` result ([kit/define](../define/README.md#runtimes-defineruntime)). Export names are free (`particlesDialect`, `particles`, `particlesUI`). Other exports (a constant like `BUILTIN_FIELDS`) are fine, and one value exported under two names counts once. None, or two different ones, is K008. Examples are modules whose default export is a function `($) => Program`; the kit does not import them.

What `loadPackage` checks across the entries, with what it can see: the Dialect's `name` equals the manifest's `name`; the Grammar builder's `.dialect` is the entry Dialect; the UI's `.builder` and the Runtime's `.grammar` are the entry Grammar. All four links are exposed by `kit/define` (`builder.dialect`, `ui.builder`, `runtime.grammar`), so none is faked.

## What imports may do

A package module may import `"kit/define"` and files of its own package by relative path, and nothing else: no other package, no bare name, no Node built-in, no URL, no dynamic import expression (always refused, even of an allowed file, and also as an operand: after a spread, `...`, a call is still one), and no `import.source` or `import.defer` (only `import.meta` follows `import.`). A module that does not parse is refused. A relative specifier must be normalized (no trailing `/`, no empty part) and name an existing `.js` file. Every `.js` file is scanned, foreign modules and elements included. K007 names the file and line.

`scanImports` is **a parse**. It parses the module with the vendored acorn ([kit/vendor/acorn](../vendor/acorn/README.md), through [`kit/parse/module.js`](../parse/module.js); `ecmaVersion: "latest"`, module goal) and reads the tree: every `ImportDeclaration`, every `export … from` (`ExportAllDeclaration`, `ExportNamedDeclaration` with a `source`), every `ImportExpression` (refused) and every `import.<name>` that is not `import.meta` (refused). Comments, strings, regexes and template text are never imports, and a method, getter or property named `import` (`class A { import() {} }`, `a.import(1)`) is not an import expression. **A module that does not parse is refused**, K007, with the line of the error: what the check cannot read must not run, so it fails closed (this also refuses syntax the vendored acorn is older than, and TypeScript or JSX in a `.js` file). `imports[i].start`/`end` are the specifier's offsets in the original text, inside the quotes, which is what `rewriteSpecifiers` replaces.

Its limits: it checks **module imports**, the ways a module names another module. It stops a package that names something it may not import; it is not a sandbox, and a package's code runs with the page's privileges once loaded. Out of scope, because they are not imports: code built at run time (`eval`, `new Function`, `globalThis["imp" + "ort"]`), `new Worker(url)`, `importScripts`, a script or `<link>` element built from a string, `fetch`, `WebAssembly.instantiate`, and a `with { type: "json" }` attribute on an allowed import (the specifier must be a `.js` file of the package anyway).

## Uploads

A `blob:` module cannot resolve `./x.js` (the M0 package probe, Safari 27.2), and an import map resolves only bare names. So an upload rewrites specifiers: `rewriteSpecifiers(files, urlFor, kitUrl)` returns the package's `.js` files in dependency order, leaves first, each with its relative and `"kit/define"` specifiers replaced by `urlFor(dependencyPath)` and `kitUrl`. `modules` is a **generator**: it calls `urlFor` for a file's dependencies only when it yields that file, so the host creates each blob and records its URL before asking for the next:

```js
const urls = new Map();
const { modules, diagnostics } = rewriteSpecifiers(files, (p) => urls.get(p), kitBlobUrl);
for (const { path, text } of modules) urls.set(path, URL.createObjectURL(new Blob([text], { type: "text/javascript" })));
```

An import cycle is K009 (no order of blobs can resolve it; it names the cycle), and so is any import `scanImports` refuses (K007); `modules` is then empty. Non-`.js` files are the host's. Creating the blobs is the host's too, which keeps this a pure function that Node tests.

## Tests (draft, 2026-11-27, leaf 74YzpH)

> **Draft, not built.** Nothing in this section exists yet: `checkManifest` refuses a `tests` key (K002), and `checkTests`, kit/page's `runTests` and kit/run's `in` input are not written. It is the design for the leaves after it (dogfood, then build). The ruling it follows is Ben's, 2026-11-27 ([the plan](../../project/2026-11-27-layer-and-package-tests-plan.md), "Rulings" 2): faking an Event and scripting an input are one mechanism, a list of timed records on named inputs; a manifest `tests` entry names an example, gives those inputs and says what to expect; the kit runs it, so a package imports no test code; the same form can later cover value inputs and param edits. Why: every M4 author tested its Event input outside the kit, with a stubbed `defineRuntime` ([the M4 findings](../../project/2026-11-26-m4-trial-findings.md), "Testing a package alone").

A test runs one of the package's `examples` alone, as kit/page's `examplePreset` composes it (one part, nothing wired to it), for a headless run (kit/run, nominal frames, a development run). Its `inputs` become that run's input log, and its `expect` entries are checked against the run.

```json
"tests": [
  {
    "name": "<test>",
    "example": "<example>.js",
    "inputs": [
      { "T": <seconds>, "in": "<input>", "value": { "<field>": <value> } }
    ],
    "expect": [
      { "at": <seconds>, "state": { "<path>": <value> } },
      { "events": "<output>", "from": <seconds>, "to": <seconds>, "records": [ { "<field>": <value> } ] },
      { "events": "<output>", "from": <seconds>, "to": <seconds>, "count": <n> },
      { "diagnostic": "<code>", "at": <seconds> }
    ],
    "until": <seconds>,
    "seed": <n>
  }
]
```

### The entry

| Key | |
|---|---|
| `name` | required; unique among the package's tests; `^[a-z][a-z0-9-]*$`. Every failure names it |
| `example` | required; a path listed in `examples` (a refusal or another module is K002). The example is built at its params' declared values, as `checkExamples` builds it |
| `inputs` | required array, possibly empty, in log order: each `{ T, in, value }`. `T` is the stamp, in seconds as kit/run takes one: a number (a fraction with a denominator up to a million) or rational text (`"<n>/<d>"`), at least 0, and never less than the entry before it (K002: a log is in order, and two entries at one stamp apply in the order written). `in` names an Event input of the Dialect (`ports.in`). `value` is one record in **that input's own seam**: its fields, in its own frame, as the runtime reads it in `ctx.inputs.<input>`; a field with a default (`<field>: f64 = <n>`) may be left out and is filled as a wire fills it; any other field missing, an unknown field or a value of the wrong type is K021 |
| `expect` | required, at least one entry (a test that expects nothing is K002). The kinds are below |
| `until` | optional; the run goes to the largest of this, every input's `T` and every `at` and `to` in `expect`. Give it to show that nothing unexpected happens after the last expectation (H007 covers the whole run) |
| `seed` | optional whole number; the run's seed (kit/run's default, 0, otherwise) |

A package with `tests` and no `entry.runtime` is K002: only a runtime runs. Inputs and expectations take no part name: the example runs as one part, so `"in": "<input>"` is `<part>.in.<input>` of that part.

### How a record reaches an Event input nothing is wired to

**A kit/run input kind, `in`, addressed to `<part>.in.<input>`:** `{ kind: "in", T, part: "<part>", name: "<input>", value: <record> }` ([kit/run](../run/README.md), "Draft: the `in` input"). Each test input becomes one such log entry. Chosen over a built-in script source part, a part like `page` that would send the records along wires, because:

- **Replay, rewind and chunking come free.** The record is in the input log, which already is the run (a run is a pure function of the composed record, the params and the log). A script part would hold its records in its definition, outside the log, and a replay would have to rebuild it.
- **Delivery is the input's, unchanged.** kit/run queues the record on that input as a wire would, minus the conversion (the record is already in the input's seam): the input's own `delivery` applies (`{ keepLast: n }` trims and counts, N001), a step takes the ready records in stamp order, then log order, and a stopped part takes none (dropped, counted, N001). A script part would need a synthesized Dialect whose outputs copy each target input's seam and frame, and compose would plan a wire of it into the input for a conversion that does nothing.
- **`$T` is the stamp.** The run copies the record, stamps it with `T` and freezes it, as it does a page input. That is the instant a real producer would have pushed it at, which is what a step reading `rec.$T` (the score author's cutoff) needs.
- **Sizing needs no S116.** S116 sizes a wire from its producer's clock and per-step max; a test's log has neither, and its author writes every record. The bound is the runtime's own `events.in.<input>`: a step that would take more is refused, the part stops with N002, exactly as on a reliable wire. In a test that is an H007 failure, unless the test expects N002 (which is how a test shows the refusal). A script part would need an invented rate (the page uses `PAGE_CHANGES_PER_FRAME`) for a sender that has none.
- **It is the same form for later.** The kind names the target, not the seam, so a value input's record (`in` to a value input: the latest value at its stamp) and a param edit (`{ T, param, value }` in `inputs`, which is already kit/run's `param` input) join without a new mechanism, as the ruling asks.

An `in` input to an input a wire feeds is refused (N011): two senders on one queue would interleave records that S116 sized for one. A run that is not a test (a host, a glue's composition) may send `in` inputs too, to any unwired Event input.

### Expectations

Each `expect` entry is one of these, told apart by its key (an entry with none, or two, is K002):

| Kind | Passes when |
|---|---|
| `{ at, state: { <path>: <value>, … }, within? }` | after the run has run every instant at or before `at` and applied every input stamped by then (kit/run's `runUntil(at)`), the part's state (`run.state`: the state its last step at or before `at` committed, its init's if it has not stepped) has `<value>` at each `<path>`. Values compare as JSON data, deeply and exactly: a vector is the array of its components, a struct an object with exactly its fields, an `opt` with nothing `null`. `within` (a number, default 0) lets each number in this entry differ by at most that much. A part that has stopped keeps its last state, so `at` past the stop reads that |
| `{ events: <output>, from?, to?, records }` | the records the part pushed on its Event output `<output>` at instants from `from` to `to` (both included; default 0 and the run's end) are exactly `records`, in push order: the same number, each with exactly its fields, compared as `state` values are (`within` too). A record's `$T` is not a field; to pin an instant, narrow the window. A part run alone has no wire out, so its pushed records go nowhere today: the runner reads them through kit/run's draft `taps` option ([kit/run](../run/README.md), "Draft: the `in` input and taps") |
| `{ events: <output>, from?, to?, count }` | the same window holds exactly `count` records |
| `{ diagnostic: <code>, at? }` | the run reported a diagnostic with that code (any N code, or a J code from a Draw build), stamped at `at` when it is given. A run diagnostic of severity error that no `diagnostic` entry names fails the test (H007); a warning (N001) never does, and is listed with the result |

**A state path** names one value in the Dialect's `state` the way kit/define's `checkState` names a mismatch: field names joined by `.`, a list item as `[<i>]`, and a vector component by its name or alias (`<field>.x`) or the whole vector as an array (`<field>`). One addition: `<list>.length`, the number of items in a list, which a UI lambda may read too. A path whose fields the Dialect's `state` does not have is K020 before anything runs; a field of an extensible struct the Program itself declares is known only once the example is built, and one it does not declare is H008 then. A path that names a list item past the list's end reads as `null` (and fails unless `null` is expected).

**Why these kinds and no others:** they are the three the M4 authors asked for (state at an instant, Events out, and a run refusal they could not reach), and each reads something the run already keeps. A value output (`ports.out.<output>` with `from`) is not expected directly in this draft: it is a function of the state, and kit/run has no public read of one by name (adding `run.output(part, port)` would make it a fourth kind; parked in "Not in this draft").

### Who runs them

| What | Where | Why there |
|---|---|---|
| The manifest's shape: keys, names, `example` in `examples`, stamps in order, a runtime named | kit/package's `checkManifest`, **K002** | what can be judged from the manifest text alone is judged where every other field is |
| What needs the Dialect but no run: `in` names an Event input, `events` an Event output, a path's fields exist in `state`, each record fits its input's seam | kit/package's new `checkTests(loaded)` → diagnostics, **K020**, **K021** | it needs only the loaded Dialect, which kit/package imports already, so it stays inside kit/package. It is a separate call, as `checkExamples` is, so loading a package does not refuse it for a stale test, and a host that runs no tests pays nothing |
| The runs | kit/page's new `runTests(loaded, options)` ([kit/page](../page/README.md), "Draft: runTests"), **H006–H008** | kit/package may not depend on kit/run (its imports today: kit/define and kit/parse only), and kit/page already holds both pieces a test needs: `examplePreset` (one example alone, the way the page plays a preset) and `sweepRuns` (fresh headless runs, sliced so the page stays live). A new module would repeat both for one file |

`runTests` runs `checkTests` first and runs nothing when it reports anything: a test naming a missing input, output, example or path is refused, never skipped.

### Codes (draft)

| Code | Module | When |
|---|---|---|
| K002 | kit/package (`checkManifest`) | as today, and also: a `tests` entry with a missing, unknown or misshapen key, a duplicate name, an `example` not in `examples`, stamps out of order, an `expect` entry with no kind or two, no expectation at all, or `tests` in a package with no `entry.runtime` |
| K020 | kit/package (`checkTests`) | a test names something the Dialect does not have, or of the wrong kind: an `in` that is not an Event input (a value or Draw input is refused in this draft), an `events` that is not an Event output, a state path whose fields `state` lacks |
| K021 | kit/package (`checkTests`) | a test input's `value` does not fit its input's seam: a field missing that has no default, an unknown field, a value of the wrong type, a point not of its frame's dims |
| H006 | kit/page (`runTests`) | an expectation was not met. The message names the test, the kind, the instant (`at`, or the window), the path or output, and the expected and actual values; for `events`, the first record that differs and both counts; for `diagnostic`, the codes the run did report |
| H007 | kit/page (`runTests`) | the run reported an error diagnostic the test did not expect (N002, N003, N004, a J code; named with its part, T and message), or its replay diverged (N005: the test's run is replayed from its own record, so a test is deterministic or fails) |
| H008 | kit/page (`runTests`) | the test could not run: its example does not build alone (its B codes, or H005), `createRun` threw, an `in` input was refused when logged (N011, N012: kit/run's own guard, which `checkTests` should have caught first), or a state path names a Program field that the built Program does not declare |
| N011 | kit/run | an `in` input addressed to an input the part does not have, to a value or Draw input, or to an Event input a wire feeds: refused when logged (`RunError`, the run unchanged), as N009 is |
| N012 | kit/run | an `in` input whose `value` does not fit the input's seam: refused when logged (`RunError`) |

H is kit/page's letter and N kit/run's, both reserved (kit/define's `RESERVED_LETTERS`). No new letter is reserved: T, which the M4 checker and the score author both used, stays a Dialect's to take.

### Results, on the page and in the checkers

`runTests` resolves to `{ results: [{ name, ok, diagnostics, log, T }], diagnostics }`: one result per test, in manifest order, with its own diagnostics (each carrying `test: "<test>"`), the input log it ran (`run.log`) and the T it reached; `diagnostics` is every result's, flattened, after any K020/K021, so a caller that wants one list (a checker) takes that.

- **The page host** (kit/page/host). Each package with tests gets a **Tests** row under Presets: a Run button that calls `runTests` (in slices, with progress and cancel, as a `runs` tile's sweep does), then each test's name with pass or fail and its H diagnostics listed in the right column under a **tests** group, with the kit's own text. A failed test has **Open**: it loads the test's example as a preset with the test's `log` as the run's inputs, paused at the failing instant (`at`, or the window's end), so the person sees the state the test read and can step, scrub and read the Why panel from there.
- **The trial checkers.** `scripts/pkg-trial`'s folder checker and `scripts/m4-trial`'s author legs call `runTests` after `checkExamples`, with the same `importModule` and `buildOptions`, and print each diagnostic in their usual line form (code, message, test). Their record gains the counts: tests run, passed. A package with no `tests` is not a failure in this draft; a trial task that requires them says so and the trial's checker counts them.

### The M4 authors' tests, in this form

The tests the M4 trial's authors asked for and could not write (scripts/m4-trial/runs/2026-11-26/), against their packages' real names. They are theirs, written here in this draft's form; none of them is in a manifest.

The game author (`gemgrid`, example `examples/garden.js`: the player starts at cell [1, 1], a gem at [4, 1]; a 1/30 s tick; a new direction moves one cell at once):

```json
"tests": [
  {
    "name": "pad-moves-player",
    "example": "examples/garden.js",
    "inputs": [
      { "T": 0.5, "in": "pad", "value": { "up": false, "down": false, "left": false, "right": true } },
      { "T": 0.6, "in": "pad", "value": { "up": false, "down": false, "left": false, "right": false } }
    ],
    "expect": [
      { "at": 0.4, "state": { "player": [1, 1] } },
      { "at": 1, "state": { "player": [2, 1], "collected": 0, "held.right": false } },
      { "events": "picked", "count": 0 }
    ]
  },
  {
    "name": "taps-pick-a-gem",
    "example": "examples/garden.js",
    "inputs": [
      { "T": 0.5, "in": "pad", "value": { "up": false, "down": false, "left": false, "right": true } },
      { "T": 0.6, "in": "pad", "value": { "up": false, "down": false, "left": false, "right": false } },
      { "T": 0.7, "in": "pad", "value": { "up": false, "down": false, "left": false, "right": true } },
      { "T": 0.8, "in": "pad", "value": { "up": false, "down": false, "left": false, "right": false } },
      { "T": 0.9, "in": "pad", "value": { "up": false, "down": false, "left": false, "right": true } },
      { "T": 1.0, "in": "pad", "value": { "up": false, "down": false, "left": false, "right": false } }
    ],
    "expect": [
      { "at": 1.5, "state": { "player": [4, 1], "collected": 1, "gems.length": 4 } },
      { "events": "picked", "from": 0.9, "to": 0.9, "records": [{ "at": [4.5, 1.5], "collected": 1 }] }
    ]
  }
]
```

The score author (`scoretimer`, example `examples/sprint.js`: a 30 s round from its first step at T = 0, `worth` 10; a 0.1 s tick; a record counts when its `$T` is before the end):

```json
"tests": [
  {
    "name": "event-scores",
    "example": "examples/sprint.js",
    "inputs": [
      { "T": 1, "in": "scored", "value": {} },
      { "T": 2, "in": "scored", "value": { "points": 2 } }
    ],
    "expect": [
      { "at": 1.5, "state": { "score": 10 } },
      { "at": 2.5, "state": { "score": 30, "over": false } }
    ]
  },
  {
    "name": "end-freezes-score",
    "example": "examples/sprint.js",
    "inputs": [
      { "T": 29.5, "in": "scored", "value": {} },
      { "T": 30, "in": "scored", "value": {} },
      { "T": 31, "in": "scored", "value": { "points": 5 } }
    ],
    "expect": [
      { "at": 30, "state": { "score": 10, "over": true, "left": 0 } },
      { "at": 32, "state": { "score": 10, "over": true } }
    ]
  }
]
```

(`{}` is a whole `scored` record: its one field, `points`, has a default of 1. The record stamped 30 is taken at the step at 30 and ignored, since its `$T` is not before the end; the one at 31 reaches a round already over.)

### Questions for Ben

None of the decisions above changes the ruling. Two touch more than this draft and are left to Ben:

1. **Does `in` retire `ctx.controls`?** A `control` input addressed to a part by name lands in `ctx.controls`, a channel kept (kit/run, "The page part") for packages run without a glue. An `in` input to an unwired Event input does what those packages wanted from it, through the Event input the composition would wire. This draft keeps `control` as it is.
2. **Should a trial task, or the page, require tests?** This draft makes `tests` optional and a package without them clean.

### Not in this draft

Value inputs and param edits in `inputs` (the ruling's "later"; the forms are named above), expecting a value output by name (needs `run.output`), a test over a glue's composition rather than one example, tests in a display run (the frames are the nominal 60 Hz grid), a test's own params (the example runs at its declared values), and approximate stamps (an `at` is exact).

## Codes

| Code | Meaning |
|---|---|
| K001 | No `wb-package.json`, or one that is not a JSON object |
| K002 | A manifest field missing, unknown or the wrong shape (a glob, a bad path, a dotfile, a module path not ending in `.js`, a bad name, version, kit, hash or refusal code, a module both example and refusal) |
| K003 | The package's `kit` is not the kit's version |
| K004 | A file the manifest names that the package does not hold |
| K005 | A file in the package the manifest does not list |
| K006 | A file whose hash is not the listed one: it changed after the package was hashed |
| K007 | An import other than `kit/define` or an existing own `.js` file, any dynamic import, `import.source` or `import.defer`, or a module that does not parse |
| K008 | An entry without exactly one definition of its kind, or definitions that do not fit (name, Grammar on Dialect, UI or Runtime on Grammar) |
| K009 | Modules that import each other in a cycle |
| K010 | A malformed bundle |
| K011 | An entry, example or refusal module that failed to import |
| K012 | An example refused when built or lowered, or an example or refusal whose default export is not a function that builds a Program |
| K013 | A refusal that is accepted |
| K014 | A refusal refused with another code than its `code` |
| K015 | A module the UI's elements name that `elements` does not list |
| K016 | A module `elements` lists that no UI element names |
| K017 | A data file the Dialect names (in `files`, or an image's `file`) that is not a normalized path to a data file, or that the package does not hold and `files` does not list |
| K018 | A data file that does not decode as its kind: an image that is not a PNG (or is held as text), a text, csv or json file that is not UTF-8, a json file that does not parse |
| K019 | A PNG whose width and height are not its image's declared `size` |

Each diagnostic is `{ code, severity: "error", message, fix, file?, line? }`. Every code is exercised by the tests; K009 and K010 are not reachable from a folder check except K009 through `scripts/pkg-trial/check.js`. K012 to K014 come from `checkExamples`, not `loadPackage`.

## Not here

Package-to-package imports and dependencies, globs, lock files, identity and revision tracking, import-map loading and the page-side loader UI are not built; the draft's "workbench side" is a later leaf.
