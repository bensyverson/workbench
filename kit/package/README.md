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
