# UI trial kit

The dogfood trial of the draft kit UI DSL (M4, leaf `vp27OC`): fresh agents get only the draft UI API, a strict rule set and a task sheet, write the UI of two packages with it, and report where it failed them. The design is [project/2026-11-25-ui-dsl-draft.md](../../project/2026-11-25-ui-dsl-draft.md); the ruling it follows is [the M4 UI decision](../../project/2026-11-25-m4-ui-decision.md). Nothing here is built into `kit/`: the checker judges a recorded declaration against the draft.

## What is here

| Path | What |
|---|---|
| `docs/ui-draft.md` | the agent-facing draft: `defineUI`, generated views, state, values, stage contract, custom elements, inputs, tiles, annotations, a worked example, pitfalls and the U codes |
| `docs/rules.md` | the task, the hand-in, rules R1–R10 and every code the checker prints |
| `docs/task.md` | the two packages and the numbered items each UI must show (particles: readouts, tables, check, plot, chart of runs, a stage element; maze: D-pad and A/B inputs, readouts, plot), plus a composition question answered in prose |
| `packages/maze/` | the input-driven package written for the trial: a Dialect (a `Player` instance space and a `Pad` object of six booleans), a Grammar and one example; `node scripts/define-trial/check.js scripts/ui-trial/packages/maze --lang maze` checks it clean. The particles package is [scripts/particles/reference/](../particles/reference/) |
| `brief.md` | the brief each agent gets, word for word (H5's shape, with its paragraph on reporting gaps instead of working around them) |
| `run.sh` | sets up one agent's directory (the three docs, `check.sh`, `particles/` and `maze/` with their definitions and one example each) and runs `claude -p` there |
| `check.js` | the checker the rules name: a thin CLI over `checker/` |
| `checker/` | `index.js` `checkDir` (loads the UI file, then judges it), `hooks.js` (supplies `kit/define`, flags outside imports, reloads per check), `define.js` (the real kit/define plus a recording `defineUI`), `validate.js` (the declaration's rules), `shapes.js` (state shapes and paths), `lambda.js` (a UI lambda's checks), `locate.js` (a declaration path to a line), `codes.js` |
| `fixtures/valid/` | the passing hand-ins: `particles.ui.js` with its `particles-field.js` element, and `maze.ui.js`; the tests copy them beside their package and derive one failing hand-in per case by a small edit |
| `test/` | the checker's tests (in `npm test`) |

`fixtures/`, `packages/` and `runs/` hold candidate code (it imports `kit/define`, which only the checker's hook supplies), so they are excluded from `tsconfig.json` and kept out of `test/` ([project/gotchas.md](../../project/gotchas.md)).

## Usage

```sh
node scripts/ui-trial/check.js <dir> --lang particles   # <dir> holds particles.ui.js, particles.grammar.js, particles.dialect.js
node scripts/ui-trial/check.js <dir> --lang maze --json # the result as one JSON object
UI_TRIAL_LOG=log.jsonl node scripts/ui-trial/check.js <dir> --lang maze   # also log the invocation
scripts/ui-trial/run.sh /private/tmp/<job>-ui/agent-a claude-opus-5-5     # one blind agent; the directory must not exist
```

Each violation prints as `<file>:<line>: <code> <message>` and a `  fix:` line. Exit 0 means no violations, 1 violations, 2 a bad invocation, 4 a missing directory, UI file or Grammar file. With `UI_TRIAL_LOG` set, every invocation appends one JSON line: `time`, `dir`, `lang`, `ok`, `diagnostics`, `files` (the UI file and each element module it read) and `loadError`.

How it works: a Node module hook resolves `kit/define` to `checker/define.js`, which re-exports the real kit/define and adds a `defineUI` that records its two arguments. The checker imports the package's Grammar and the UI file (with a per-check query string, so a rerun loads them afresh), requires exactly one `defineUI` call whose builder is one of the Grammar file's exports (C001, U013), and runs `validate` over the declaration with the Dialect's name (the tag prefix), objects (for `inputs`) and free names (globals, intrinsics, library, vector types; for lambdas). Each problem's path inside the declaration is turned into a line by searching the file from the `defineUI` call; a lambda's problem is placed by finding the lambda's text and adding the line within it.

What it does not do: run a host, load an element module (it only checks the file exists and calls `customElements.define` for the tag), type a lambda's result, or compare the declared state with what `text(state)` reads. Those are read by hand.

## Running the trial

Per the leaf: one Opus, one Sonnet and one Haiku agent, each `run.sh <fresh dir under /private/tmp> <model>`. Afterwards copy each directory (hand-in, `REPORT.md`, `log.jsonl`, `transcript.jsonl`) to `runs/<date>/agent-x/`, and record per agent the model, its difficulty score, what it guessed, its gaps, and how much its output needed changing to comply. `scripts/particles/h5/summarize.js` reads the directories as they are, with one caveat: `check.sh` logs one line per package, so its `checkerRuns` counts packages checked (two per `check.sh`) and `firstClean` is the first clean package, not the first clean pair; read `lang` in `log.jsonl` for those. The findings go in a dated doc under `project/`, then the design changes, then the build (a separate leaf).

## Records

- `runs/2026-11-25-first/` (agents a–c): the first round, on a draft whose worked example was the particles answer.
- `runs/2026-11-25-rerun/` (agents d–f): the rerun, after the first round's changes (`runs.seconds`, the element's update order and size) and with every example moved to `orbits`.

Findings: [project/2026-11-25-ui-trial-findings.md](../../project/2026-11-25-ui-trial-findings.md). After the rerun the draft took four more wording fixes (`Math.abs` in the example, `stage` always present, `:host { display: block }`, strings in lambdas), which no agent has run against yet.
