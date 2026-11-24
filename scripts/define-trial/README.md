# Definition API trial kit

The dogfood trials of the Definition API (M3): fresh agents get only the API document, a strict rule set and the data-tools Dream Code, define the data-tools language with the API as far as it goes, and report where it failed them. Trial 1 (leaf `lMNmIB`) ran on paper, on the first draft, checked by a script with its own copy of the validators; trial 2 (leaf `O63kB5`) runs on the API as built ([kit/define](../../kit/define/README.md)), and the checker runs the real thing. The design behind the API is [project/2026-11-24-definition-api-design.md](../../project/2026-11-24-definition-api-design.md).

## What is here

| Path | What |
|---|---|
| `docs/api-draft.md` | the Definition API as built, with the fields Dialect written in it as the worked example (trial 2's packet; trial 1's is at commit `e44ff1e`) |
| `docs/rules.md` | the task, the hand-in, the rules R1–R9 and every code the checker prints |
| `trial-2-briefs.md` | trial 2: the agents and models, how to set up their directories, the exact brief, and how to record the runs |
| `check.js` | the checker the rules name (`check`): a thin CLI over `checker/` |
| `checker/` | the checker's library: `define.js` is the `kit/define` a candidate imports (the real one, with `defineDialect` / `defineGrammar` wrapped to record a refusal instead of ending the load), `examples.js` runs one example (its export, `.check()`, `lower()`), `index.js` `checkDir`, `session.js` one check's state, `locate.js` a definition path to a line, `codes.js` the checker's own codes |
| `fixtures/valid/` | the passing fixture: a tiny per-pixel language (borrowed from the fields example, with a stateful `layer` construct) shaped as rules.md's hand-in; the tests derive one failing fixture per code from it by a one-line edit |
| `test/` | the checker's tests (in `npm test`) |
| `runs/2026-11-24/` | trial 1: each agent's hand-in, `REPORT.md` and checker log (`log.jsonl`); the findings are [project/2026-11-24-definition-api-trial-1.md](../../project/2026-11-24-definition-api-trial-1.md) |
| `runs/2026-11-24-trial-2/` | trial 2's record, one directory per agent (empty until the runs; see `trial-2-briefs.md`) |

## Usage

```sh
node scripts/define-trial/check.js <dir>          # <dir> holds data.dialect.js, data.grammar.js, examples/*.js
node scripts/define-trial/check.js <dir> --json   # the same result as one JSON object
DEFINE_TRIAL_LOG=trial.jsonl node scripts/define-trial/check.js <dir>   # also log the invocation
```

Each violation prints as `<file>:<line>: <code> <message>` and a `  fix:` line; rules.md lists the codes. Exit 0 means no violations, 1 violations, 2 a bad invocation, 4 a missing directory or definition file. With `DEFINE_TRIAL_LOG` set, every invocation appends one JSON line: `time`, `dir`, `ok`, `diagnostics`, `files` (the text of every candidate file) and `loadError`.

How it works: a Node module hook (`module.registerHooks`) resolves `kit/define` to `checker/define.js`, which re-exports the real kit/define, so the candidate's files run unchanged. Its `load` hook appends to each example an export returning the file's top-level bindings (named by `topLevelNames`, [kit/parse/toplevel.js](../../kit/parse/toplevel.js); lines keep their numbers), and the checker passes them, with each top-level `const` declaration's initializer text (`topLevelBindings` filtered by `helperSources`, so a helper is only the arrow its `const` declaration writes) and the file's `buildTimeNames`, to `.check({ scope, sources, buildTime })` and `.build(…)`: the module scope a lambda's free names resolve against ([kit/define](../../kit/define/README.md), "Module scope"). A lowering error inside a top-level helper is placed at its `const` line. A `DefinitionError` from `defineDialect` or `defineGrammar` is recorded, each problem located by searching the file for its path's keys from the call's line; a refused Dialect is replaced by a stand-in with its convention names, so the Grammar is still checked without knock-on refusals. Once both definitions are accepted, each example is loaded (a `B001` thrown at a call is reported as the kit gave it), its default export, the Program as a function of its params (`($) => program(…)…`, a function of exactly one parameter, C001 otherwise), is built by kit/define's `run()` with the params at their declared values, which gives every collected `B…` code and the Dialect's own checks, and a Program that builds clean is passed to the Grammar's `lower()`: construct state call by call, convention functions, every lambda's body. A lowering diagnostic inside a lambda is placed at its line by finding the lambda's source in the file. An exception from the candidate's own functions (`environment`, a convention, a check, `init`, `step`) is `C005` at the line that threw.

The checker's own codes: `C001` (an example neither exports a builder chain nor is refused), `C005`, `C006` (an import other than `kit/define` or the candidate's own files, static or dynamic, in the Dialect, Grammar or an example: R1) and `C007` (no example files at all: R6); `LOAD` is a definition file that cannot be loaded at all. Check v0's other codes are retired, and the kit's own replace them: `C002` (a lambda that does not parse) is `B007`, `C003` (a free name) is `B008`, `C004` (an unknown method) is `B001`, and a call to a `rejected` name, which v0 accepted, is `B009`. D001–D015 keep their numbers (now the kit's own, widened where the API grew), D016 is retired, D017–D020 are new (D020: a Dialect without `text(state)`).

What it does not do: run any target (nothing is emitted or compared), or check a `// REFUSED:` comment's claim.

## Running a trial

Give each agent a private directory holding copies of `docs/api-draft.md`, `docs/rules.md` and [the Dream Code](../../project/2026-11-24-data-tools-dream-code.md) as `dream-code.md`, and a `check.sh` that runs the checker with `DEFINE_TRIAL_LOG` set. Tell it to read nothing else in the repository, and to write `REPORT.md` with a shell heredoc if its Write is refused ([project/gotchas.md](../../project/gotchas.md)). Record per agent the model, what it guessed, what it asked for, its difficulty score, and how much its output needed changing to comply. `trial-2-briefs.md` has trial 2's setup and brief word for word.
