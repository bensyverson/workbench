# Packaging a Dialect (draft)

*A draft for review, v0. A **Dialect package** is a folder holding everything a small domain language needs: its Dialect, its Grammar, its UI, its examples, and the code they use. A workbench page loads it from a repository, from a path, or from a file someone uploads, and composes it with packages its author never saw. So a package must be self-contained, and a host must be able to read it before running any of its code.*

## A package is a folder

```
tiles/
  wb-package.json     the manifest: data, read before any code runs
  tiles.dialect.js    the Dialect (defineDialect)
  tiles.grammar.js    the Grammar (defineGrammar)
  tiles.ui.js         the UI (defineUI), optional
  tiles-board.js      a custom element the UI names, optional
  lib/…               helper modules the package's own files import, optional
  foreign/…           declared foreign modules, optional (see below)
  examples/…          example Programs
  refusals/…          Programs the kit must refuse, optional
  README.md           for people, optional
```

Only the manifest's name is fixed. The other names follow a convention (`<name>.dialect.js`, `<name>.grammar.js`, `<name>.ui.js`), and the manifest says where each part is. Subfolders are allowed. Every file in the folder belongs to the package and is listed in the manifest with its hash, including the README. The exception is a **dotfile**: a file or folder whose name starts with `.` (`.DS_Store`, `.git`) is not part of a package. The tools and the checker skip it, so it is neither listed nor hashed, and a manifest that lists one is an error.

The package's **modules** are exactly its files whose names end in `.js` (lowercase). Every path the manifest names as code (`entry`, `lib`, `elements`, `examples`, `refusals` and each `foreign` module) must be such a file, and so must every file a module imports. Other files (a README, a data file) are listed and hashed but can't be imported.

## The manifest: `wb-package.json`

```json
{
  "name": "tiles",
  "version": "0.1.0",
  "kit": "0.4",
  "description": "A grid of tiles with actors that walk it.",
  "entry": { "dialect": "tiles.dialect.js", "grammar": "tiles.grammar.js", "ui": "tiles.ui.js" },
  "lib": ["lib/noise.js"],
  "elements": ["tiles-board.js"],
  "examples": ["examples/01.js", "examples/02.js"],
  "refusals": [{ "module": "refusals/r01.js", "code": "L004" }],
  "files": { "README.md": "sha256-…", "tiles.dialect.js": "sha256-…" }
}
```

| Key | Required | What |
|---|---|---|
| `name` | yes | the package name: lowercase letters and digits, starting with a letter. It must equal the Dialect's `name`. It is also the prefix of every custom element tag (`tiles-board`). |
| `version` | yes | the package's version, semver (`0.1.0`). |
| `kit` | yes | the Definition API version the package is written for, `major.minor`. This kit is `"0.4"`. Before 1.0, a kit loads only packages written for exactly its own version. |
| `description` | no | one sentence for people. |
| `entry` | yes | the path of each definition file. `dialect` and `grammar` are required; `ui` is optional. |
| `lib` | no | the helper modules the definition files import. |
| `elements` | no | the custom element modules the UI names: exactly that set, no more and no fewer. If the UI names `./tiles-board.js` and `elements` doesn't list `tiles-board.js`, or lists a module the UI doesn't name, that is an error. |
| `foreign` | no | declared foreign modules: `{ "module": path, "targets": ["js"], "why": "one sentence" }`. A foreign module is plain JavaScript the kit trusts and does not lower. It is the only way to bring in code outside the language's subset, so declaring one is a claim to justify. |
| `examples` | no | example Programs. Each is a module whose default export is a function `($) => Program`. The checker builds each one and every one must be accepted: the examples are the package's regression suite. |
| `refusals` | no | Programs the language must refuse: `{ "module": path, "code": "L004" }`. Each module has the same form as an example, and must be listed in `files` and not in `examples`. The checker builds each one and requires it to be refused with exactly that diagnostic code (a capital letter and three digits). One that is accepted, or refused with another code, is an error. |
| `files` | yes | every file in the folder except `wb-package.json`, each with its content hash. |

Paths are relative to the folder, written with `/`, and stay inside it: no `..`, no leading `/`. List each one exactly, because globs (`examples/*.js`) are not allowed. Any key not in this table is an error. That includes `dependencies`, because a package has none (see below).

### Hashes

`files` maps each path to the SHA-256 of its text (as UTF-8), written as `sha256-` plus base64 (the spelling HTML uses for Subresource Integrity). Don't write hashes by hand. Run the hash tool on the folder, and run it again after any change:

```sh
./hash.sh out/tiles      # rewrites out/tiles/wb-package.json's "files"
```

The hash tool lists every file in the folder (dotfiles aside), so a stray file you leave there becomes part of the package. Delete scratch files before you hash. The loader refuses a package whose files and hashes disagree, in either direction.

The hashes catch accidental change: a file edited or damaged after the package was hashed. They don't show who made the package, and they don't stop someone who changes a file and its hash together. Files are hashed as UTF-8 text, so a changed line ending or byte-order mark changes the hash.

## What a package may import

A module in a package may import exactly two kinds of thing:

- `kit/define`
- the package's own files, by relative path (`./tiles.dialect.js`, `../lib/noise.js`), each of which must exist in the package

Nothing else is allowed: no other package, no bare name, no URL, no Node built-in, no dynamic `import()` (also not after a spread, `...`), and no `import.source` or `import.defer` (`import.meta` is fine). A module that does not parse as an ES module is refused too. A relative path names a `.js` file exactly, with no trailing `/` or empty part. This holds for every `.js` file, examples and elements included. Packages never import each other. When two packages are used together, a **glue Program** written for the workbench joins them, so the seam between them is designed by whoever uses both, not by either author.

## The definition files

The loader finds each definition **by its value, not by its export name**:

- The Dialect file has exactly one export that is a `defineDialect(…)` result.
- The Grammar file has exactly one export that is a `defineGrammar(…)` builder, and that builder is built on the package's Dialect.
- The UI file, if there is one, has exactly one export that is a `defineUI(…)` value, built on the package's Grammar.

Other exports are fine (a list of constants the Grammar shares with the Dialect, say). You choose the export names.

## Loading

When a host loads a package, it does this, in order. The checker you are given does the same:

1. Read `wb-package.json` and check it: its shape, its `kit` version, every listed path present, and every file hashed.
2. Scan every `.js` file's imports, without running anything.
3. Import the Dialect, the Grammar and the UI, and check that they belong together and to this package.
4. Check that `elements` is the set of modules the UI's custom elements name.
5. Build every example, and require that each is accepted. Build every refusal, and require that each is refused with its code.

Each problem is printed with a code and a fix. A problem in step 1 or 2 stops the load, so the host never runs a module whose imports it has not checked.

## What a package does not have (yet)

- **No dependencies, no lock file.** Pinning a package's source and revision belongs to the workbench that uses it, not to the package.
- **No ports or seams.** How a package declares what it offers to a glue Program is still being designed.
- **No generated reference.** A package's API reference will be generated from its definitions, so don't hand-write one. A README for people is fine.
