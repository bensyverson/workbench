# Report: packaging particles and maze with the draft package format

## 1. Difficulty

**3 of 5.** Copying the files, writing the manifests, hashing and passing `check.sh` took one pass with no violations. The difficulty is in the refusal examples and the composition question, where the draft says nothing and the answer depends on design it leaves open.

## 2. Layout

Both packages are flat: every definition and element sits at the package root, and examples sit in `examples/`.

```
out/particles/
  wb-package.json        manifest (name particles, kit 0.4, version 0.1.0)
  particles.dialect.js   copied unchanged
  particles.grammar.js   copied unchanged
  particles.ui.js        copied unchanged
  particles-field.js     the stage element, copied unchanged
  examples/
    01.js … 06.js        Programs the Grammar accepts (listed in "examples")
    r01.js … r06.js      refusals (listed in "files" only)
```

```
out/maze/
  wb-package.json        manifest (name maze, kit 0.4, version 0.1.0)
  maze.dialect.js        copied unchanged
  maze.grammar.js        copied unchanged
  maze.ui.js             copied unchanged
  examples/
    01.js                the one example (listed in "examples")
```

I chose flat because the imports already fit it. `particles.ui.js` names its element with `module: "./particles-field.js"`, and each example imports `../<name>.grammar.js`. A flat layout keeps both paths valid, so no definition file changed. `files` lists all 16 particles files and all 4 maze files, and `hash.sh` wrote the hashes.

## 3. Where the draft misled you

The draft did not mislead me often. The one place I was led wrong for a while was the examples rule:

> "`examples`: example Programs. Each is a module whose default export is a function `($) => Program`." and "List the examples. Each is imported when a host runs it."

The refusal files `r01`–`r06` also export `($) => …` functions, so the word "examples" pulled me toward listing them there. Listing them would make a host import and run programs that are meant to be refused. I kept them out of `examples` (see section 4).

A smaller point: `files` is a required key, and the hash tool rewrites it. The draft's example shows `files` already filled in, so it did not say whether to write a placeholder first. I wrote `"files": {}` and then ran `hash.sh`, which worked.

## 4. What you guessed

- **Layout.** Flat, with `examples/` as the only subfolder (section 2).
- **Refusals.** `r01`–`r06` are in `out/particles/examples/`, hashed in `files`, and absent from `examples`. Nothing in the draft says where refusals go.
- **`version`.** `0.1.0` for both packages. The task gives no version, and `0.1.0` is the value in the draft's example.
- **`description`.** I wrote one sentence for each package from its code. The draft leaves the wording to the author.
- **`elements`.** `["particles-field.js"]`, matching the `module` string the UI already uses. The draft does not say these two must agree; I matched them.
- **Examples order.** Listed by number, `01` to `06`.
- **Maze.** No `elements` key, because `maze.ui.js` names no element.
- **README.** Not included. It is optional.
- **Scratch files.** None. `out/` holds only the package files, so `hash.sh` hashed exactly what I wanted.

## 5. Gaps

Smallest first:

1. **Version of an unreleased package.** The draft gives no rule for the first version. I used `0.1.0`.
2. **Where a UI's contract lives.** Both UI sources refer to `docs/ui-draft.md` for the element and input contract. That file is not in either package, and I was not allowed to read it. The draft does not say whether a package may carry or link its UI spec. I could not check the element's contract against it.
3. **Link between `elements` and the UI's `module`.** The draft does not say whether the manifest's `elements` list must match the `module` paths the UI uses. I matched them by hand.
4. **Refusals.** There is no key or convention for an example that must be refused. Nothing records which error code each refusal should raise. In the files the codes are only comments: `r01` says `L004`, `r02` `L013`, `r03` `L004`, `r04` `B013`, `r05` `L017`, `r06` `L004`. The checker does not run examples, so it cannot confirm any refusal. What I would want is a key (for example `refusals` with path and expected code), so a host can run the refusals and check the codes. I did not add such a key.
5. **The manifest is not hashed.** `files` covers every file except `wb-package.json`, and nothing hashes the manifest itself. Question 3 below turns on this.
6. **Composition.** A glue Program needs a way to import another package's Grammar. The draft allows imports only of `kit/define` and the package's own files, and it has no ports. See Answers, question 2.
7. **Names shared between packages.** Both packages use `$` as the params global and a `t` field in `state`. The draft does not say how two packages that are composed keep these apart.

## 6. Answers

**1. Refusals.** I kept the six refusal files in `out/particles/examples/` and listed them in `files`, so they are hashed and count as part of the package. I left them out of `examples`, because that key means Programs a host imports and runs. The manifest has no place for refusals, so the expected error codes live only in comments. I would want a `refusals` key that gives each file and its expected code, with a rule that a host runs each refusal and checks that the code is raised. I did not add that key, because the draft does not give it.

**2. Two packages together.** Following `packaging.md`, the workbench author would write a glue Program that imports both Grammars and combines them, and the glue would live in the workbench, not in either package folder. The draft does not say where a glue Program is stored, how a host loads one, or what it may import beyond the two packages' Grammars. The format also leaves several things unsayable. The maze has no declared output for "the actor reached the goal". Particles has no declared input for "start a burst here". The particle emitter's `x` and `y` are fixed numbers in the builder, so the format does not show how a burst follows the actor. Both packages also use `$` and a `t` field, and the draft does not say how the two are kept apart. The "no ports or seams" note says this design is still open, so the draft cannot answer the question yet.

**3. An upload.** If one file changed after hashing, the loader would refuse the package at step 1, before any code runs. The message would be a K006 error naming the file, with the fix "rerun hash.sh". That is the right outcome: a host should not run code it cannot vouch for. The fix line, though, is written for the author, so a viewer would not know what to do. I would want the message to say the file changed since its author hashed it. The hash check also has a limit. The manifest is not hashed, so someone who edits a file and rewrites its hash in `wb-package.json` produces a package that passes. The check catches accidental change, not tampering. Pinning the package is the workbench's job, according to the draft, so the workbench would have to store a hash of the manifest. I did not test the upload case by changing a file in `out/`, because the deliverable must not be altered. This answer comes from reading the draft.

## 7. Files

Files opened and read, in full:

- `packaging.md`, `rules.md`, `task.md`
- `particles/particles.dialect.js`, `particles/particles.grammar.js`, `particles/particles.ui.js`, `particles/particles-field.js`
- `particles/examples/01.js` to `06.js`, and `r01.js` to `r06.js` (12 files)
- `maze/maze.dialect.js`, `maze/maze.grammar.js`, `maze/maze.ui.js`
- `maze/examples/01.js`

Executed, not opened: `check.sh` (run once, both packages no violations) and `hash.sh` (run once per package).

Also seen: a directory listing (`ls -laR`) of the working folder showed the names `transcript.jsonl` and `stderr.txt` at its top level. I did not open either.

Files written: `out/particles/` and `out/maze/` (the copied files, plus `wb-package.json` in each), and this `REPORT.md`. I opened nothing outside `/private/tmp/3d093c96-pkg/agent-c`, and I did not search the web.
