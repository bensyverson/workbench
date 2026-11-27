# Package trial

The dogfood trial of the Dialect package format (M4; the format is [the package draft](../../project/2026-11-25-package-format-draft.md), built as [kit/package](../../kit/package/README.md)): fresh agents get the packaging reference, a rule set and a task sheet, turn the loose files of two existing Dialects (particles, maze) into packages, and report where the format failed them. This folder is the checker, the launcher and two hand-made packages the checker is tested against.

## What is here

| Path | What |
|---|---|
| `check.js` | the checker as a command: `node scripts/pkg-trial/check.js <dir>`, a thin CLI over `checker/` |
| (tests) | after the examples the checker runs the package's manifest `tests` if it has any (kit/page's `runTests`: K020, K021, H006–H008; none is clean, since tests are optional) and the result gains `tests: { run, passed }` |
| `checker/index.js` | `checkPackageDir(dir)`: reads the folder into a `{ path: text }` map, runs `loadPackage` with a Node importer, builds every example and refusal (`checkExamples`; `checker/scope.js` gives each its module scope), runs the defineUI checks of the UI trial's checker (`scripts/ui-trial/checker`, called with the UI and Grammar paths the manifest names) and the upload check (an import cycle, K009) |
| `run.sh` | sets up one agent's directory and runs `claude -p` there, blind to the repository (the same directory guards as the [UI trial's](../ui-trial/README.md)) |
| `docs/packaging.md`, `rules.md`, `task.md`, `brief.md` | the agent-facing documents: the draft packaging reference, the rules R1–R7, the task and its three questions, and the brief |
| `checker/scope.js` | the Node side of the examples: a load hook that appends the define trial's scope export to each example and refusal, and `buildOptions` that turns it into `run()`'s module scope |
| `fixtures/valid/{particles,maze}/` | both packages built correctly by hand, hashed with `scripts/pkg/hash.js`; particles' `refusals/r01.js` to `r06.js` are listed in its `refusals` with the codes of their `// REFUSED:` lines |
| `test/` | the checker's tests (a failing copy of a fixture per K code, the CLI, the log) and the guard of `run.sh` |

`fixtures/` holds candidate code (it imports `kit/define`, which only the checker's hook supplies), so it is excluded from `tsconfig.json` and kept out of `test/` ([project/gotchas.md](../../project/gotchas.md)); so is `runs/`.

## Usage

```sh
node scripts/pkg-trial/check.js <dir>          # <dir> holds wb-package.json and the package's files
node scripts/pkg-trial/check.js <dir> --json   # the result as one JSON object
PKG_TRIAL_LOG=log.jsonl node scripts/pkg-trial/check.js <dir>   # also log the invocation
scripts/pkg-trial/run.sh /private/tmp/<job>-pkg/agent-a claude-opus-5-5   # one blind agent; the directory must not exist
```

Each violation prints as `<file>:<line>: <code> <message>` and a `  fix:` line; a manifest-level problem is reported at `wb-package.json:1`, and a K… with no line of its own at line 1 of its file. K… codes are [kit/package's](../../kit/package/README.md#codes); U… and LOAD come from the UI checker. Exit 0 no violations, 1 violations, 2 bad invocation, 3 the checker itself failed, 4 the folder is missing. With `PKG_TRIAL_LOG` set, **every** invocation appends one JSON line: `time`, `dir`, `ok`, `diagnostics`, `files` (the package's paths) and `loadError` (the target error, `usage: …`, or `the checker failed: …`; null otherwise).

How it works: the UI trial's module hook supplies `kit/define` to the package's files (the real one, with a `defineUI` that records its call and the kit's refusal, so a bad UI still loads and is reported with a line). An entry that throws is a K011 placed at the first stack frame inside the folder; once one entry has thrown the others are not tried. When the package loads clean, every `examples` module is built with `kit/define`'s `run()` and lowered by the Grammar and must be accepted, and every `refusals` module must be refused with its code (K012 to K014; [kit/package](../../kit/package/README.md#api)). Dotfiles are not read at all, by the folder reader or the check. The UI checks run only when the package got as far as loading (every diagnostic so far is a K008, or an example or element check, K012 to K016), and a UI problem replaces the K008 the stand-in would otherwise give for the same file. The upload check runs only on a clean package.

`run.sh <dir> <model>` copies `docs/` into `<dir>`, lays the raw materials out loose (`particles/` and `maze/`: Dialect, Grammar, UI, element and the examples, **not** packages, with particles' refusal examples `r01`–`r06` among them; the manifest's `refusals` is where a package lists them), makes an empty `out/`, writes `check.sh` (the checker on `out/particles` and `out/maze`, logging to `log.jsonl`) and `hash.sh` (`scripts/pkg/hash.js`), and starts `claude -p` with the text of `brief.md` after its `---` line, `<DIR>` filled in. It does not sandbox the agent; see the UI trial's README for what that means.

What it does not do: run a host, or sandbox the package (it does import and build the examples): the files load in this process with your privileges (the import scan is lexical, [its limits](../../kit/package/README.md#what-imports-may-do)). Read the files of any package you do not trust.

## Running the trial

Run 2026-11-25 ([the findings](../../project/2026-11-25-package-trial-findings.md); records in `runs/2026-11-25/`). To rerun: fresh agents (a spread of models) each `run.sh <fresh dir under /private/tmp> <model>`; copy each directory to `runs/<date>/agent-x/` afterwards, record what each guessed, which codes it hit and how much its output needed changing, and write the findings as a dated doc under `project/`.

## Massage for declared Controls (2026-11-27, leaf `FhnOhO`)

[Declared Controls](../../project/2026-11-27-controls-draft.md) retired the kit's own pad (`PAGE_CONTROLS`), defineUI's `inputs` and `emits`, and the manifest's `elements`, and raised `KIT_VERSION` to 0.5. Every fixture and run record a test loads was massaged to the new API; run records no test loads stay as handed in. Sizes are `git diff --numstat` against `b115e90` (lines added / removed); a manifest's count includes its rehash (`node scripts/pkg/hash.js <dir>`).

| File | Size | What |
|---|---|---|
| `fixtures/valid/maze/maze.ui.js` | +1 / −12 | `inputs` removed (this maze Dialect has no ports) |
| `fixtures/valid/maze/wb-package.json` | +2 / −2 | `"kit": "0.5"`, rehash |
| `fixtures/valid/particles/particles.ui.js` | +1 / −1 | `emits` removed |
| `fixtures/valid/particles/wb-package.json` | +3 / −3 | `"kit": "0.5"`, `elements` renamed `modules`, rehash |
| `test/check.test.js` | +6 / −5 | K015 and K016 cases name `modules`; the K003 CLI case expects 0.5 |
