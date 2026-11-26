# kit/package: Dialect packages

A **package** is a folder (or an uploaded bundle of the same files) that carries one Dialect: its definitions, its UI, its supporting code and its examples, so it can be composed later with packages its author never saw. This module turns a set of files the host already holds into a loaded package. It never fetches and never touches a file system: the source is resolved earlier (by an agent or a CLI), and the host passes in the `{ path: text }` map and an importer. The design is [the package format draft](../../project/2026-11-25-package-format-draft.md) and the rulings at its end. No Node built-ins, so it runs in the page too.

```js
import { loadPackage, readBundle, KIT_VERSION } from "./kit/package/index.js";   // KIT_VERSION is in kit/define
const { files } = readBundle(text);                       // or build { path: text } from sibling files
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
  …                 lib, foreign, element modules, examples: any layout, named by exact path
```

The manifest (`MANIFEST_PATH = "wb-package.json"`), checked by `checkManifest(text)` → `{ manifest, diagnostics }` (`manifest` is null when there are diagnostics). Unknown top-level keys are an error (K002), so a `dependencies` key is caught, not ignored.

| Field | |
|---|---|
| `name` | required; `^[a-z][a-z0-9]*$`; the Dialect's `name` |
| `version` | required; semver |
| `kit` | required; the Definition API version as `"major.minor"` (`KIT_VERSION` from `kit/define`, now `"0.4"`) |
| `description` | optional string |
| `entry` | required: `{ dialect, grammar }` and optionally `ui`, each an exact path |
| `lib`, `elements`, `examples` | optional arrays of exact paths. **No globs in v0** (K002) |
| `foreign` | optional array of `{ module, targets, why }`; each is a path in the package |
| `files` | required: `{ path: "sha256-<base64>" }` for every file but the manifest |

Every path is normalized and relative: `/`-separated, no leading `/`, no `.`, `..` or empty part, no backslash. Every path the manifest names must be in `files` (K004). `scripts/pkg/hash.js <dir>` writes `files`.

## API

- `checkManifest(text)`: above.
- `hashText(text)` → `Promise<"sha256-<base64>">` over `globalThis.crypto.subtle` (Node and the page); `contentKey(filesHashes)` → the hash over the sorted `path\0hash\n` lines, the package's **content key**: two packages with the same bytes have one key whatever their source or version said.
- `scanImports(path, text, files)` → `{ imports, diagnostics }`. See "What imports may do".
- `checkPackage(files, { kitVersion })` → `Promise<{ manifest, diagnostics }>`, no I/O: the manifest; `manifest.kit === kitVersion` (K003, the message names both); every file in `files` present (K004); every file in the map but the manifest listed (K005); hashes (K006); imports of every `.js` file (K007).
- `loadPackage(files, { importModule, kitVersion? })` → `Promise<{ name, version, content, dialect, grammar, ui, examples, foreign, diagnostics }>`. Runs `checkPackage`; if clean, calls `importModule(path)` (the host's) for `entry.dialect`, `entry.grammar`, then `entry.ui`, stopping at the first one that throws (K011: the later ones would only repeat it). Then it checks the pieces fit (K008). On any diagnostic the loaded parts are null. `content` is the content key; `examples` the manifest's example paths for the host to import; `ui` is null if the manifest names none. `kitVersion` defaults to `KIT_VERSION`.
- `rewriteSpecifiers(files, urlFor, kitUrl)` → `{ diagnostics, modules }`, for uploads. See "Uploads".
- `readBundle(text)` → `{ files, diagnostics }` (`files` null on K010); `writeBundle(files)` → the text, paths sorted. A bundle is `{ "format": "wb-bundle", "files": { path: text } }`; `scripts/pkg/bundle.js` writes one.
- `PACKAGE_CODES`; types in [`package.d.ts`](package.d.ts).

### The entry export rule

Each entry module exports **exactly one value of its kind, found by value, not by name**: the Dialect file one `defineDialect` result, the Grammar file one `defineGrammar` builder, the UI file one `defineUI` value. Export names are free (`particlesDialect`, `particles`, `particlesUI`). Other exports (a constant like `BUILTIN_FIELDS`) are fine, and one value exported under two names counts once. None, or two different ones, is K008. Examples are modules whose default export is a function `($) => Program`; the kit does not import them.

What `loadPackage` checks across the entries, with what it can see: the Dialect's `name` equals the manifest's `name`; the Grammar builder's `.dialect` is the entry Dialect; the UI's `.builder` is the entry Grammar. All three links are exposed by `kit/define` (`builder.dialect`, `ui.builder`), so none is faked.

## What imports may do

A package module may import `"kit/define"` and files of its own package by relative path, and nothing else: no other package, no bare name, no Node built-in, no URL, no dynamic `import()` (always refused, even of an allowed file). Every `.js` file is scanned, foreign modules and elements included. K007 names the file and line.

`scanImports` is **lexical**. It uses `kit/parse`'s `blank` to turn comments, strings, regexes and template text into spaces, finds `import "x"`, `import … from "x"`, `export * from "x"`, `export * as n from "x"`, `export { … } from "x"`, and every `import(`, and reads the specifier from the original text. A specifier inside a comment, a string or a template is not an import. Its limits, honestly: it is not a parser, so an odd layout it does not recognize (an `import` clause with a `}` or `;` inside a default-value expression, attributes such as `with { type: "json" }` are read only as far as `from "x"`) is skipped, not refused; it cannot see code built at run time (`eval`, `new Function`, `globalThis["imp" + "ort"]`, a worker or script tag built from a string) or a dynamic `import()` spelled with a comment between `import` and `(` only because that does parse as one. It stops a package that **names** something it may not import; it is not a sandbox, and a package's code runs with the page's privileges once loaded.

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
| K002 | A manifest field missing, unknown or the wrong shape (a glob, a bad path, name, version, kit or hash) |
| K003 | The package's `kit` is not the kit's version |
| K004 | A file the manifest names that the package does not hold |
| K005 | A file in the package the manifest does not list |
| K006 | A file whose hash is not the listed one |
| K007 | An import other than `kit/define` or an existing own file, or any `import()` |
| K008 | An entry without exactly one definition of its kind, or definitions that do not fit (name, Grammar on Dialect, UI on Grammar) |
| K009 | Modules that import each other in a cycle |
| K010 | A malformed bundle |
| K011 | An entry module that failed to import |

Each diagnostic is `{ code, severity: "error", message, fix, file?, line? }`. Every code is exercised by the tests; K009 and K010 are not reachable from a folder check except K009 through `scripts/pkg-trial/check.js`.

## Not here

Package-to-package imports and dependencies, globs, lock files, identity and revision tracking, import-map loading and the page-side loader UI are not built; the draft's "workbench side" is a later leaf.
