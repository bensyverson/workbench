# Draft: the Dialect package — format, version, and loading from a repo, a path or an upload

*2026-11-25, leaf `Uld5D0` (M4 Composition, `SPPLaM`). A design draft for Ben, not built and not ruled. Inputs: [the architecture synthesis](2026-11-24-architecture-synthesis.md) §2, §3.4, §3.7; [the M4 UI decision](2026-11-25-m4-ui-decision.md) ("What follows": the package must have a place for each part); [the composition trial](2026-11-24-composition-trial.md); [the M0 probe](2026-11-23-m0-platform-probe.md) and [delivery decisions](2026-11-23-delivery-decisions.md) for what a page can do. Written while Ben was away; every choice below is a recommendation awaiting his ruling (questions at the end).*

## The pattern it serves

Ben (2026-11-24): "I have a DSL at `bensyverson/mydsl`, and another here on disk (or uploaded); use both to do XYZ." So a package is written once, by one session, and composed later with packages its author never saw, inside one workbench page. That sets four requirements:

1. **Self-contained.** Everything a package needs travels in it: definitions, supporting code, UI, examples, its reference. It imports only the kit and its own files.
2. **Readable without running it.** A host (the page, an agent, a CLI) can say what a package is, what it holds and whether it fits this kit before importing any of its code.
3. **Pinned.** A workbench names each package by where it came from and holds exactly one version of it, so a workbench opened next month builds the same way, and the build record can say "rebuilt because `tiles` moved from 0.3.1 to 0.4.0".
4. **Loadable in an artifact.** A page on claude.ai **cannot fetch other hosts** (delivery decisions; M0). It can read its own sibling files and import `blob:` modules; it cannot import `data:` modules.

## What the platform settles

Requirement 4 decides where each source is resolved:

| Source | Who fetches it | How it reaches the page |
|---|---|---|
| A GitHub repo (`github:bensyverson/mydsl`) | The agent, in its sandbox (`curl` from `raw.githubusercontent.com` or `gh`), never the page | Published as the artifact's sibling files |
| A path on disk | The agent or a local CLI | Published as sibling files, or served locally |
| An upload | The viewer, through a file picker in the page | Read in the page and imported from `blob:` URLs |

So the kit never fetches a package from the network. Loading, in the kit, means **turning a set of files the host already holds into a loaded package**. The source is resolved earlier by whoever has a network (an agent or a CLI tool in `scripts/`), and recorded in the workbench's lock.

## The format

### A folder, with a manifest that is data

```
tiles/
  wb-package.json    -- the manifest (data, read before any code runs)
  tiles.dialect.js   -- defineDialect
  tiles.grammar.js   -- defineGrammar
  tiles.ui.js        -- defineUI (optional)
  lib/…              -- Bench modules: helpers lowered like any lambda (optional)
  foreign/…          -- declared foreign JS modules: trusted, not lowered (optional)
  elements/…         -- custom element modules for the UI (optional)
  examples/…         -- example Programs: presets, and the package's regression suite
  book/…             -- an optional book (Markdown)
  README.md          -- for humans; the reference is generated, not hand-written
```

The file names follow the convention the trials already use (`<name>.dialect.js`, `<name>.grammar.js`, `<name>.ui.js`). The manifest:

```json
{
  "name": "tiles",
  "version": "0.4.0",
  "kit": "0.4",
  "description": "A grid of tiles with actors that walk it.",
  "entry": { "dialect": "tiles.dialect.js", "grammar": "tiles.grammar.js", "ui": "tiles.ui.js" },
  "lib": ["lib/noise.js"],
  "foreign": [{ "module": "foreign/export-svg.js", "targets": ["js"], "why": "SVG export" }],
  "elements": ["elements/tiles-board.js"],
  "examples": ["examples/*.js"],
  "files": { "tiles.dialect.js": "sha256-…", "…": "…" }
}
```

- **`name`** is the package name: lowercase letters and digits, the Dialect's `name`, the prefix of every custom element tag (the UI draft's rule) and the qualifier of its views and vocabulary (`tiles.stage`, `tiles.table`). `defineDialect`'s name must equal it (a load error otherwise).
- **`version`** is semver, the author's. **`kit`** is the Definition API version the package was written against (major.minor; before 1.0 a minor bump may break). A kit refuses a package whose `kit` it does not support, with a message naming both.
- **`entry`** names the three definition files; `dialect` and `grammar` are required, `ui` optional.
- **`foreign`** lists every declared foreign module (decision §1: trusted, not lowered, accepted only by targets that can run it). Listing them in the manifest is what makes "nothing is handwaved" checkable: a package file that imports a module neither listed here nor a Bench `lib` module is refused.
- **`files`** is every file with its content hash (SHA-256, the Subresource Integrity spelling). A tool writes it; the loader checks it. It is the package's **content key** (synthesis §3.7: identity, revision and content key are three things).

**Why not `package.json`:** a package here is not an npm package. Reusing the name invites `npm install`, a `dependencies` key the kit ignores, and confusion when a package also lives in an npm-using repo. A distinct name (`wb-package.json`) costs nothing.

**Why a data manifest and not a JS file:** requirement 2. A host lists the files, checks the hashes and the kit version, and shows the package's name and description before running any of its code; an upload from a stranger is inspected before it executes.

### What may be imported

A package module may import `kit/define` and the package's own files by relative path. Nothing else: no other package, no bare specifier, no Node built-in (the trial checkers' C006, made a load rule). A package does not depend on other packages: the composition between packages is the glue Program's job (synthesis §2: "the seam between them cannot be designed by either"). Shared helpers between packages are not a package feature; a glue Program's own `lib/` holds them, as the composition draft has it.

### Identity, revision, content key

Kept apart from the start (synthesis §3.7):

- **Identity:** where the package comes from, as the workbench names it: `github:bensyverson/mydsl` (optionally `#path/in/repo`), `path:../tiles`, `upload:tiles`. It is the address the build record and the lock use; two packages with one `name` and different identities in one page are an error (their views and vocabulary would collide).
- **Revision:** `version` plus, for a repo, the commit it was read at.
- **Content key:** the hash over the manifest's `files`, so a cached build of the package is reused exactly when its bytes are the same, whatever the source said.

## The workbench side

A workbench page carries a **lock**, `wb-lock.json`, one entry per package:

```json
{ "packages": { "tiles": { "source": "github:bensyverson/tiles", "version": "0.4.0", "commit": "3f2a9c1", "content": "sha256-…", "dir": "packages/tiles/" } } }
```

The packages sit under `packages/<name>/` beside the page. The glue Program imports a package by its name (`import { tiles } from "tiles"`, as the composition draft writes it), and the loader resolves that name through the lock. Updating a package is a tool's job (fetch, write the files, re-hash, rewrite the lock entry), done by the agent; the page only reads.

## Loading in the page

`loadPackage(files)` in a new kit module (`kit/package`), given the files a host holds (`{ path: text }`, from siblings or an upload):

1. Read and check the manifest (shape, `name`, `kit` version, every listed file present, hashes match). Errors are codes with fixes, as everywhere in the kit.
2. Check each module's imports lexically before running it: only `kit/define` and listed own files.
3. Import the entry modules. For sibling files this is a plain `import()`. For an upload, each file becomes a `blob:` URL; a `blob:` module cannot resolve `./x.js`, so the loader rewrites each relative and `kit/define` specifier to the target's `blob:` URL (leaves first). An import map would avoid the rewrite, but whether an artifact accepts one added at run time is untested.
4. Check the result: the Dialect's name is the package's, the Grammar is built on it, the UI on the Grammar.
5. Return `{ name, version, identity, content, dialect, grammar, ui, examples, foreign }`.

Two packages are then composed by the seam work (`hjdIRt`), which this format leaves room for but does not design: a package will declare its **ports** (synthesis §3.5) in its definition, not in the manifest, so the reference and the checks come from one place.

## Generated, not shipped

The package's reference (API.md-style) is generated from its definitions, so it cannot drift (synthesis §3.4). It is not a file in the package. Its `examples` double as its regression suite: the kit runs each and compares against recorded results where the package records them (the M1/M2 harness pattern).

## Open questions for Ben

1. **Manifest name and form:** a JSON `wb-package.json` beside the files (recommended), or fields in the Dialect itself?
2. **No package-to-package imports:** a package imports only the kit and its own files (recommended), so all composition is the glue Program's. The alternative is declared dependencies with versions, which brings a resolver.
3. **The kit version field:** `kit: "0.4"` checked at load (recommended), which needs the kit to carry a Definition API version and bump it. Today it has none.
4. **Upload form:** several files or a folder picked in the page (works with today's platform), or one bundle file (a JSON of `{ path: text }`, also the "download and run locally" form)? Recommended: both read as the same `{ path: text }`, with the bundle written by a tool.
5. **A spike first:** before building the loader, probe in an artifact whether an import map added at run time works (it would replace the specifier rewrite), and confirm the rewrite path. Half a day, in `scripts/m0-probe-*`. *Built and published the same day, not yet run: [`scripts/m0-probe-pkg/`](../scripts/m0-probe-pkg/README.md), https://claude.ai/artifact/JKj2gqGw6ixnYHknugiiWb. Opening it once answers this question.*
6. **Dogfood:** per the AGENTS.md ruling, have three fresh agents package an existing Dialect (maze, particles) from a draft packaging reference and load it in a checker before the format is frozen.
