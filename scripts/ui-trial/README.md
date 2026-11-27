# UI trial kit

The dogfood trial of the draft kit UI DSL (M4, leaf `vp27OC`): fresh agents get only the draft UI API, a strict rule set and a task sheet, write the UI of two packages with it, and report where it failed them. The design is [project/2026-11-25-ui-dsl-draft.md](../../project/2026-11-25-ui-dsl-draft.md); the ruling it follows is [the M4 UI decision](../../project/2026-11-25-m4-ui-decision.md). `defineUI` is now built into `kit/define` ([its README](../../kit/define/README.md)); the checker here is a thin consumer of it, kept for the trial's CLI, its `C001`, `C006` and `LOAD` codes and its line location. The run's state is declared in each package's Dialect (`state`), not in the UI file, so the fixtures and packages here carry it in their Dialects and the packet `docs/ui-draft.md` was revised to match for the third round ([its findings](../../project/2026-11-25-ui-state-trial-findings.md)).

## What is here

| Path | What |
|---|---|
| `docs/ui-draft.md` | the agent-facing draft: `defineUI`, generated views, the state (declared in the Dialect), values, stage contract, custom elements, inputs, tiles, annotations, a worked example, pitfalls and the U codes |
| `docs/rules.md` | the task, the hand-in, rules R1–R10 and every code the checker prints |
| `docs/task.md` | the two packages and the numbered items each UI must show (particles: readouts, tables, check, plot, chart of runs, a stage element; maze: D-pad and A/B inputs, readouts, plot), plus a composition question answered in prose |
| `packages/maze/` | the input-driven package written for the trial: a Dialect (a `Player` instance space and a `Pad` object of six booleans), a Grammar and one example; `node scripts/define-trial/check.js scripts/ui-trial/packages/maze --lang maze` checks it clean. The particles package is [scripts/particles/reference/](../particles/reference/) |
| `packages/given/` | each package's Dialect as an agent gets it: the state described in a comment above `text(state)` but not declared (the files as they were before `d5d3f90`), so the agent writes the `state` (second trial). The packages' own Dialects declare it |
| `brief.md` | the brief each agent gets, word for word (H5's shape, with its paragraph on reporting gaps instead of working around them) |
| `run.sh` | sets up one agent's directory (the three docs, `check.sh`, `particles/` and `maze/` with the given Dialects, their Grammars and one example each) and runs `claude -p` there |
| `check.js` | the checker the rules name: a thin CLI over `checker/`. `checkDir(dir, { lang, files? })` also takes the UI and Grammar paths to check (`scripts/pkg-trial` passes the ones a package manifest names) |
| `checker/` | `index.js` `checkDir` (loads the UI file, then judges it), `hooks.js` (supplies `kit/define`, flags outside imports, reloads per check), `define.js` (the real kit/define with a `defineUI` that calls the kit's and records the call and its refusal), `session.js` (one check's state, and the `moduleText` a hand-in's module paths read), `locate.js` (a declaration path to a line), `codes.js` (`C…`, `LOAD`, and the kit's `UI_CODES` re-exported). The declaration's rules, state paths, lambda checks and the tag rule are `kit/define/ui/` |
| `fixtures/valid/` | the passing hand-ins: `particles.ui.js` with its `particles-field.js` element, and `maze.ui.js`; the tests copy them beside their package and derive one failing hand-in per case by a small edit |
| `test/` | the checker's tests, and the directory guard of this `run.sh` and the H5 one (in `npm test`) |

`fixtures/`, `packages/` and `runs/` hold candidate code (it imports `kit/define`, which only the checker's hook supplies), so they are excluded from `tsconfig.json` and kept out of `test/` ([project/gotchas.md](../../project/gotchas.md)).

## Usage

```sh
node scripts/ui-trial/check.js <dir> --lang particles   # <dir> holds particles.ui.js, particles.grammar.js, particles.dialect.js
node scripts/ui-trial/check.js <dir> --lang maze --json # the result as one JSON object
UI_TRIAL_LOG=log.jsonl node scripts/ui-trial/check.js <dir> --lang maze   # also log the invocation
scripts/ui-trial/run.sh /private/tmp/<job>-ui/agent-a claude-opus-5-5     # one blind agent; the directory must not exist
```

Each violation prints as `<file>:<line>: <code> <message>` and a `  fix:` line. Exit 0 means no violations, 1 violations, 2 a bad invocation, 3 the checker itself failed (a bug here, printed with its stack), 4 a missing directory, UI file or Grammar file (a UI or Grammar path that is a directory counts as missing). With `UI_TRIAL_LOG` set, **every** invocation appends one JSON line, whatever its exit: `time`, `dir` and `lang` (null when the arguments did not get that far), `ok`, `diagnostics`, `files` (the UI file and each element module it read) and `loadError` (the target error, `usage: …`, or `the checker failed: …`; null otherwise).

`run.sh` takes an absolute directory that does not exist yet and refuses one inside the repository or `~/.claude`, however spelled (`..`, a symlink): it canonicalizes the path first. It does not sandbox the agent. The agent runs as you with Bash, Read and Glob over the whole disk; a trial's blindness rests on the brief ("work only in `<DIR>`") and on checking the transcript afterwards with `scripts/particles/h5/summarize.js`, whose outside-path detection is a text match with known gaps (see [h5/README](../particles/h5/README.md)).

How it works: a Node module hook resolves `kit/define` to `checker/define.js`, which re-exports the real kit/define and adds a `defineUI` that calls the kit's `defineUI` (passing `moduleText`, which reads the package's files) and records the arguments and the `DefinitionError` it threw, if any, so the file still loads. The checker imports the package's Grammar and the UI file (with a per-check query string, so a rerun loads them afresh), requires exactly one `defineUI` call whose builder is one of the Grammar file's exports (C001, U013), and prints each of the kit's diagnostics with a line. The path of each diagnostic inside the declaration is turned into a line by searching the file from the `defineUI` call (from the top of the file for a key not written out after it, as in a declaration built in variables above the call); a lambda's problem is placed by finding the lambda's text, in code and not in a comment, at or after the key that holds it, and adding the diagnostic's `line` within it, so two identical lambdas get their own lines. A load failure names the first stack frame inside the hand-in (its UI file, the Grammar file or a helper), not the checker's or kit's; a syntax error's stack names no file, so it is placed at line 1 of the UI file. A Dialect whose `state` is malformed (D023) is refused when the Grammar loads, so it is a LOAD.

Rules worth knowing about:

- **Lambda globals (U007).** A member chain that starts at a Dialect global (`Math.round`, `Math.random`) is checked against that Dialect object: a member in its `rejected` list is refused with the Dialect's message and fix, and a member it does not declare is unknown (with a did-you-mean). An object that declares no members (`counters`, `$`, filled per program) is only checked for rejected ones. `Math["random"]` is refused too (computed members of a declared object). Members of `Object.prototype` (`s.constructor`, `row.hasOwnProperty`) are not state members: shape lookups use own keys.
- **A row used whole.** `(row) => row` is fine when the table's rows are leaves (`listOf("string")`); it is refused for an object row and for the state `s`.
- **Tags (U008).** `element` must be lowercase, with a hyphen, under the package prefix (`<package>-<name>`, name not empty), as ui-draft.md says. The draft says no more than that, so the checker allows what HTML's valid-custom-element-name does among ASCII lowercase letters: digits, `-`, `.` and `_` after the first letter (`particles-my_field` passes). A module defines the tag when its code, with comments, strings and regexes blanked (`kit/parse/blank.js`), calls `customElements.define(<tag>, …)` with the tag as a literal or as a top-level `const` bound to the tag string (`window.customElements.define` counts). A call in a comment or a string does not. A module path that is a directory, or unreadable, is a U008 ("not a readable file"), not a crash.
- **`element` on `row` and `col`** is refused (U001, no such key): layouts draw nothing of their own, and ui-draft.md says so ("any component but `row` and `col`").
- **Qualified ids (U003).** On this one-package page every qualified id is an error, the package's own (`maze.stage`) included.
- **Inputs (U010).** `inputs` with no buttons is refused.
- **U013** is also a Dialect that declares no `state`: a UI has nothing to read. (A Dialect without `text(state)` is D020, a LOAD, as before.) **`state` in the UI** is U001 with a tip that says the state is declared in `defineDialect`; **U006** is retired and `stat` takes `max?`.

What it does not do: run a host, load an element module (it only reads the file for a `customElements.define` of the tag), type a lambda's result, or compare the declared state with what `text(state)` reads (the Dialect's `text` does check its argument against the declared state at run time). Those are read by hand. And it is **not a sandbox**: it runs the hand-in's own files in this process with your privileges to read what they declare. C006 (rules.md R1) catches a static import of anything but `kit/define` and the package's own files through the module hook, and a lexical scan of every package file that loaded (comments, strings and regexes blanked) refuses a deferred `import()` and `process.getBuiltinModule` written plainly. It cannot catch a computed spelling (`process["getBuiltin" + "Module"]`, `globalThis["pro" + "cess"]`), or code built at run time (`eval`, `new Function`). Treat the verdict as "the file does not contain the plain spellings", and read the files of any hand-in you do not trust.

## Running the trial

Per the leaf: one Opus, one Sonnet and one Haiku agent, each `run.sh <fresh dir under /private/tmp> <model>`. Afterwards copy each directory (hand-in, `REPORT.md`, `log.jsonl`, `transcript.jsonl`) to `runs/<date>/agent-x/`, and record per agent the model, its difficulty score, what it guessed, its gaps, and how much its output needed changing to comply. `scripts/particles/h5/summarize.js` reads the directories as they are, with one caveat: `check.sh` logs one line per package, so its `checkerRuns` counts packages checked (two per `check.sh`) and `firstClean` is the first clean package, not the first clean pair; read `lang` in `log.jsonl` for those. The findings go in a dated doc under `project/`, then the design changes, then the build (a separate leaf).

## Records

- `runs/2026-11-25-first/` (agents a–c): the first round, on a draft whose worked example was the particles answer.
- `runs/2026-11-25-rerun/` (agents d–f): the rerun, after the first round's changes (`runs.seconds`, the element's update order and size) and with every example moved to `orbits`.

Findings: [project/2026-11-25-ui-trial-findings.md](../../project/2026-11-25-ui-trial-findings.md). After the rerun the draft took four more wording fixes (`Math.abs` in the example, `stage` always present, `:host { display: block }`, strings in lambdas), which no agent has run against yet.

## Massage for declared Controls (2026-11-27, leaf `FhnOhO`)

[Declared Controls](../../project/2026-11-27-controls-draft.md) retired the kit's own pad (`PAGE_CONTROLS`), defineUI's `inputs` and `emits`, and the manifest's `elements`, and raised `KIT_VERSION` to 0.5. Every fixture and run record a test loads was massaged to the new API; run records no test loads stay as handed in. Sizes are `git diff --numstat` against `b115e90` (lines added / removed); a manifest's count includes its rehash (`node scripts/pkg/hash.js <dir>`).

| File | Size | What |
|---|---|---|
| `fixtures/valid/maze.ui.js` | +1 / −12 | its `inputs` onto the Pad object removed: this Dialect has no Event input for a Control |
| `fixtures/valid/particles.ui.js` | +1 / −1 | `emits` removed from the stage |
| `test/check.test.js` | +13 / −28 | the four U009 and U010 cases replaced by one U001 case for `emits` and `inputs`; the codes-in-the-docs check skips U015–U020, which came after the trial |

The size is the finding: the trial UIs used two mechanisms that retired (`inputs`, `emits`), and neither had a Dialect input to become a Control.
