# Package trial

The dogfood trial of the Dialect package format (M4; the format is [the package draft](../../project/2026-11-25-package-format-draft.md), built as [kit/package](../../kit/package/README.md)): fresh agents get the packaging reference, a rule set and a task sheet, turn the loose files of two existing Dialects (particles, maze) into packages, and report where the format failed them. This folder is the checker, the launcher and two hand-made packages the checker is tested against.

## What is here

| Path | What |
|---|---|
| `check.js` | the checker as a command: `node scripts/pkg-trial/check.js <dir>`, a thin CLI over `checker/` |
| `checker/index.js` | `checkPackageDir(dir)`: reads the folder into a `{ path: text }` map, runs `loadPackage` with a Node importer, runs the defineUI checks of the UI trial's checker (`scripts/ui-trial/checker`, called with the UI and Grammar paths the manifest names) and the upload check (an import cycle, K009) |
| `run.sh` | sets up one agent's directory and runs `claude -p` there, blind to the repository (the same directory guards as the [UI trial's](../ui-trial/README.md)) |
| `docs/packaging.md`, `rules.md`, `task.md`, `brief.md` | the agent-facing documents. **Placeholders** (one TODO line each) until the integrator writes them |
| `fixtures/valid/{particles,maze}/` | both packages built correctly by hand, hashed with `scripts/pkg/hash.js` |
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

How it works: the UI trial's module hook supplies `kit/define` to the package's files (the real one, with a `defineUI` that records its call and the kit's refusal, so a bad UI still loads and is reported with a line). An entry that throws is a K011 placed at the first stack frame inside the folder; once one entry has thrown the others are not tried. The UI checks run only when the package got as far as loading (every diagnostic so far is a K008), and a UI problem replaces the K008 the stand-in would otherwise give for the same file. The upload check runs only on a clean package.

`run.sh <dir> <model>` copies `docs/` into `<dir>`, lays the raw materials out loose (`particles/` and `maze/`: Dialect, Grammar, UI, element and the examples, **not** packages, with particles' refusal examples `r01`–`r06` among them, which the manifest has no field for), makes an empty `out/`, writes `check.sh` (the checker on `out/particles` and `out/maze`, logging to `log.jsonl`) and `hash.sh` (`scripts/pkg/hash.js`), and starts `claude -p` with the text of `brief.md` after its `---` line, `<DIR>` filled in. It does not sandbox the agent; see the UI trial's README for what that means.

What it does not do: import the examples (their default exports are not run), run a host, or sandbox the package: the files load in this process with your privileges (the import scan is lexical, [its limits](../../kit/package/README.md#what-imports-may-do)). Read the files of any package you do not trust.

## Running the trial

Not run yet. Per the plan: fresh agents (a spread of models) each `run.sh <fresh dir under /private/tmp> <model>`; copy each directory to `runs/<date>/agent-x/` afterwards, record what each guessed, which codes it hit and how much its output needed changing, and write the findings as a dated doc under `project/`.
