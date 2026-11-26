# Trial rules: package two languages with the draft package format

*You have three documents: these rules, `packaging.md` (the package format, a draft) and `task.md` (the two languages to package and the questions to answer). You also have `particles/` and `maze/`, the loose parts, plus two tools: `hash.sh` writes a package's hashes, and `check.sh` checks both packages.*

## What you hand in

| Path | What |
|---|---|
| `out/particles/` | the particles package: `wb-package.json` and every file it lists |
| `out/maze/` | the maze package, the same way |
| `REPORT.md` | your report (rule R7) |

Leave `particles/` and `maze/` as they are. Work in `out/`.

If the tool you write files with refuses to write `REPORT.md`, write it from the shell with a heredoc instead (`cat > REPORT.md <<'EOF'` … `EOF`). Don't return the report as text in place of the file.

## The rules

`check.sh` loads each package as a host would, with the real kit. It prints each problem as `<file>:<line>: <code> <message>` with a `fix:` line. Run it as often as you like. It logs each run.

- **R1. One folder per package**, with `wb-package.json` at its root. Every file in the folder is listed in `files` with its current hash, and every listed file exists. (K codes)
- **R2. The manifest has only the keys `packaging.md` lists**, each in the form it gives, and `kit` is `"0.4"`. (K codes)
- **R3. Imports stay inside the package:** only `kit/define` and the package's own files, by relative path, in every `.js` file. (K codes)
- **R4. The definitions belong together:** the manifest's `name` is the Dialect's `name`, the Grammar is built on the Dialect, and the UI is built on the Grammar. (K codes; LOAD when a file cannot be imported)
- **R5. Definitions unchanged.** Moving a file and fixing its import paths is allowed. Changing what a Dialect, Grammar, UI, element or example says is not. (read by hand)
- **R6. Nothing outside the draft.** Don't add a manifest key, a file kind or a convention that `packaging.md` doesn't give. Where you needed one, report it as a gap. (K codes; the rest is read by hand)
- **R7. The report.** `REPORT.md` has these sections, in order:
  1. **Difficulty**, 1 (easy) to 5 (could not do it), with one sentence why.
  2. **Layout**: each package's file tree, and why you laid it out that way.
  3. **Where the draft misled you**: a rule or example in `packaging.md` that led you wrong, quoted.
  4. **What you guessed**: every place the draft didn't say and you chose, and what you chose.
  5. **Gaps**: what you needed that the draft doesn't have, smallest first.
  6. **Answers**: `task.md`'s three questions, in prose.
  7. **Files**: every file you opened, and confirm you opened nothing else.

## Codes

| Code | Refused when |
|---|---|
| K001 | there is no `wb-package.json`, or it is not a JSON object |
| K002 | a manifest key is missing, unknown or the wrong shape: a glob, a path that is not a plain relative path or names a dotfile, a module path that does not end in `.js`, a bad `name`, `version`, `kit`, hash or refusal `code`, a module that is both an example and a refusal |
| K003 | the package is written for another kit version than `"0.4"` |
| K004 | a file the manifest names (in `files`, `entry`, `lib`, `foreign`, `elements`, `examples` or `refusals`) is not in the package, or a named file is not in `files` |
| K005 | a file in the package folder is not listed in `files` |
| K006 | a file's hash is not the one `files` gives: the file changed after the package was hashed (rerun `hash.sh`) |
| K007 | an import of anything but `kit/define` or an existing `.js` file of the package: a bare name, a built-in, a URL, a path that leaves the package, a dynamic `import()`, `import.source` or `import.defer` |
| K008 | an entry file does not export exactly one definition of its kind, or the parts do not fit: the Dialect's name is not the package's, the Grammar is not built on the Dialect, the UI not on the Grammar |
| K009 | modules that import each other in a cycle (an uploaded package cannot be loaded then) |
| K011 | an entry, example or refusal file fails to import: a syntax error or an exception, at its line |
| K012 | an example is refused when built (it names the first diagnostic), or an example or refusal is not a function of the params that builds a Program |
| K013 | a refusal is accepted: its Program builds clean |
| K014 | a refusal is refused with another code than the one `refusals` gives (the message names both) |
| K015 | the UI names a custom element module that `elements` does not list |
| K016 | `elements` lists a module that no custom element in the UI names |
| U… | the UI file breaks a rule of the UI API; the message says which |

The checker doesn't run a host. Nothing is drawn. It does build each example and refusal (K012 to K014). Whether a definition still says what it said is read by hand.
