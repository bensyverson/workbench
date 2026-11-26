# Packaging trial report

## 1. Difficulty

**2 of 5.** Both packages passed `check.sh` on the first run with no source edits; the only real judgement call was the refusal examples, which the draft has no place for.

## 2. Layout

```
out/particles/                 out/maze/
  wb-package.json                wb-package.json
  particles.dialect.js           maze.dialect.js
  particles.grammar.js           maze.grammar.js
  particles.ui.js                maze.ui.js
  particles-field.js             examples/
  examples/                        01.js
    01.js … 06.js
```

I followed the draft's own convention: definitions and the element at the root, examples in `examples/`. The sources already had this shape, so no import path (including the UI's `module: "./particles-field.js"`) needed changing, and every copied `.js` file is byte-identical to its source. The element tag `particles-field` already carries the required prefix. Neither package has `lib` or `foreign`; maze has no `elements`. The six refusals (`r01.js` to `r06.js`) are **not** in the particles package (see answer 1).

What was checked: `check.sh` reports no violations for either package. It does not import or run examples or draw anything, so I have not verified that the Grammars accept the examples, that the refusals are refused with the codes in their headers, or that either UI renders.

## 3. Where the draft misled you

Nothing led me to a wrong result. One line would have, if followed literally:

> `examples` — "example Programs. Each is a module whose default export is a function `($) => Program`."

The refusals match that description exactly (a default-exported `($) => …` in an `examples/` folder), so the table seems to admit them. A host would then list six Programs that exist to fail alongside the six that work, with nothing to tell them apart.

Two places where the checker and the draft don't match:

- The draft says "Every file in the folder belongs to the package and is listed in the manifest with its hash", and `check.sh` is said to load as a host would. I put a `.DS_Store` in `out/maze/` and it reported no violations (then removed it). I tried no other ignored names.
- The draft says to run `./hash.sh`. The K006 fix line says `node scripts/pkg/hash.js <dir>`, a path that is not in what I was given.

## 4. What you guessed

- **Refusals:** left out, rather than listed in `examples` or carried as role-less files.
- **`version`:** `0.1.0` for both, copied from the draft's example.
- **`description`:** I wrote one sentence for each.
- **`README.md`:** optional, so none.
- **Comments:** left unchanged, although some point at things outside the package (`docs/ui-draft.md`, `docs/task.md`, "the sheet") or call the UIs "the passing fixture". They will dangle for anyone who receives the package. I did not follow them.
- **Free names in Programs** (`vec2`, `rng`, `counters`, `length`): I took these not to be imports, so the import rule does not touch them.
- **Maze has no stage element:** I assumed a UI without `stage` is fine and the host picks a view (perhaps the Dialect's `text`). The draft doesn't say. The checker accepts it.

## 5. Gaps

Smallest first.

1. **Which files don't count.** The draft says every file in the folder belongs to the package, but operating systems and editors add files on their own. It should say which names a hasher and a loader ignore, or that none are ignored.
2. **A place for refusal examples.** There is no way to ship a Program that must be refused, or to state the code it must be refused with. As a result the particles package loses the six cases that show what its Grammar catches.
3. **Any seam between packages.** There is no way to declare what a package offers or accepts (events, readable state, settable inputs), and no description of the glue Program: where it lives, what it may import, how it runs or drives two languages (see answer 2). The draft says this is still being designed.

## 6. Answers

### 1. Refusals

I left them out of `out/particles/`; the originals are untouched in `particles/examples/`. The manifest has no place for them. `examples` is the only role for Programs, and it means Programs a host offers to run. I could have put them in the folder and listed them only in `files`, as the README is, but then their meaning would rest on a folder or filename convention the draft doesn't give, and no host or checker would know what to do with them.

I would want a separate key, for instance:

```json
"refusals": [ { "module": "refusals/r01.js", "code": "L004" } ]
```

A checker could then run each one and fail if it is accepted, or refused for a different reason. A host could show them as "mistakes this language catches" without offering them as working examples. The expected code is now only in a header comment (`r01` L004, `r02` L013, `r03` L004, `r04` B013, `r05` L017, `r06` L004). Since L004 covers three different mistakes, a line number or message fragment would make the assertion tighter.

### 2. Two packages together

From `packaging.md` they would write a "glue Program" for the workbench, outside both package folders, because packages never import each other. That is all the draft says. It gives no file name, shape, entry point, allowed imports, or way to refer to a loaded package, so I have not sketched code.

What they cannot say:

- **"The actor reached the goal."** The maze language has no goal. Its state has `t`, `score`, `coinsLeft`, `player` and `grid`. The glue would have to choose a meaning (`coinsLeft` becoming 0, or `player` reaching a chosen cell), and the format offers no way to subscribe to either or to rely on those state fields staying the same in a later version.
- **"Play a burst now."** Particles has no input object or trigger. Its knobs are the params a Program declares, and the draft doesn't say whether glue may set them or start a run. Starting a fresh run of something like `examples/05.js` would be one way, but nothing says glue can do that.
- **"Here."** The maze position is in grid cells, particles use the pixels of its `bounds`, and an emitter's `x` and `y` are fixed data in the Program (`05.js` hard-codes 200, 200). There is no way to pass a position in or to map one space to the other.
- **How they share the page and the clock.** Nothing says how the particle stage overlays the maze view, how two UIs' tiles are arranged, or how two tick rates relate.
- **Which versions the glue was written against.** There are no dependencies; pinning is left to the workbench.

Separately, the maze Dialect's own comment says its host "is described there in prose and is not built", so passing the check does not show that the maze can be walked.

### 3. An upload with one changed file

I tried it by appending a comment line to `out/maze/examples/01.js`, then restored the file. The checker printed:

```
…/out/maze/examples/01.js:1: K006 examples/01.js does not match its hash in wb-package.json (the file is sha256-wz7o…, the manifest says sha256-9xen…)
  fix: run node scripts/pkg/hash.js <dir> if the change is intended; otherwise restore the file
```

By the draft, this is a step 1 problem, so the whole load stops: no Dialect, UI or examples, even though the change was only a comment in an example. What a page actually shows the viewer is not specified, and the checker runs no host.

Refusing is what I would want: a package that loads half-changed is harder to reason about. Three reservations:

- **The message is written for the author.** A viewer may have no tool to rerun. A page should say that the upload differs from what was packaged, name the file, and suggest getting a fresh copy.
- **It only detects accidents.** The hashes travel in the same folder as the files, so anyone who changes a file on purpose can rehash it. "The host does not run code from a package it cannot vouch for" promises more than this gives. Vouching needs a hash or signature held outside the folder, such as the workbench's pin.
- **Harmless rewrites would also fail.** Hashes are over the text, so I expect a line-ending conversion (for example by Git on checkout) to break the load. I did not test that. The draft could say whether line endings and a byte-order mark are normalised.

## 7. Files

Read, under `/private/tmp/3d093c96-pkg/agent-b/`:

- `packaging.md`, `rules.md`, `task.md`
- `particles/`: `particles.dialect.js`, `particles.grammar.js`, `particles.ui.js`, `particles-field.js`, `examples/01.js` to `06.js`, `examples/r01.js` to `r06.js`
- `maze/`: `maze.dialect.js`, `maze.grammar.js`, `maze.ui.js`, `examples/01.js`
- my own output: both `out/*/wb-package.json` (and `cmp` compared the copied files with their sources)

I ran `hash.sh` and `check.sh` without reading them. A directory listing showed the names `stderr.txt` and `transcript.jsonl`; I did not open either. I opened no other files and did not search the web. The session put some user instructions and account details into my context automatically; I did not open any file to get them, and none of it affected the packages.
