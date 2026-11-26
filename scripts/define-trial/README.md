# Definition API trial kit

The dogfood trials of the Definition API (M3): fresh agents get only the API document, a strict rule set and the data-tools Dream Code, define the data-tools language with the API as far as it goes, and report where it failed them. Trial 1 (leaf `lMNmIB`) ran on paper, on the first draft, checked by a script with its own copy of the validators; trial 2 (leaf `O63kB5`) runs on the API as built ([kit/define](../../kit/define/README.md)), and the checker runs the real thing. The design behind the API is [project/2026-11-24-definition-api-design.md](../../project/2026-11-24-definition-api-design.md).

## What is here

| Path | What |
|---|---|
| `docs/api-draft.md` | the Definition API as built, with the fields Dialect written in it as the worked example (trial 2's packet; trial 1's is at commit `e44ff1e`) |
| `docs/api-effects.md` | the per-slot effects addition to `api-draft.md` (built in kit/define since leaf `8vQJOw`): instance spaces, `may`, writable members, verbs, totals, and codes D021, D022, L017; the design and its reasons are in [the effects draft](../../project/2026-11-25-per-slot-effects-draft.md) |
| `docs/rules.md` | the task, the hand-in, the rules R1–R9 and every code the checker prints |
| `docs/rules-effects.md` | trial 4's task (particles, with per-slot effects): the hand-in, the rules R1–R9 (R4, R7, R8 widened, R4b new) and every code the checker prints with `--effects` |
| `trial-2-briefs.md` | trial 2: the agents and models, how to set up their directories, the exact brief, and how to record the runs |
| `check.js` | the checker the rules name (`check`): a thin CLI over `checker/` |
| `checker/` | the checker's library: `define.js` is the `kit/define` a candidate imports (the real one, with `defineDialect` / `defineGrammar` / `defineRuntime` wrapped to record a refusal instead of ending the load), `examples.js` runs one example (its export, `.check()`, `lower()`), `index.js` `checkDir`, `session.js` one check's state, `locate.js` a definition path to a line, `codes.js` the checker's own codes |
| `fixtures/valid/` | the passing fixture: a tiny per-pixel language (borrowed from the fields example, with a stateful `layer` construct) shaped as rules.md's hand-in; the tests derive one failing fixture per code from it by a one-line edit |
| `fixtures/effects-valid/` | the passing fixture for `--effects` (`--lang garden`): the packet's garden (plants grown and sown in an instance space, a pure rain rate reading the totals grow bumps), shaped as rules-effects.md's hand-in with its own small examples and one refusal; `test/effects.test.js` derives one failing fixture per case of each new code from it |
| `test/` | the checker's tests (in `npm test`) |
| `runs/2026-11-24/` | trial 1: each agent's hand-in, `REPORT.md` and checker log (`log.jsonl`); the findings are [project/2026-11-24-definition-api-trial-1.md](../../project/2026-11-24-definition-api-trial-1.md) |
| `runs/2026-11-24-trial-2/` | trial 2's record, one directory per agent; the findings are [project/2026-11-24-definition-api-trial-2.md](../../project/2026-11-24-definition-api-trial-2.md) |
| `trial-3-briefs.md`, `runs/2026-11-24-trial-3/` | trial 3 (binding time, module scope, the text view; one Opus, one Sonnet, one Haiku agent): its setup and its record |
| `trial-4-briefs.md` | trial 4 (per-slot effects on the particles sheet, checked with `--effects`; one Opus, one Sonnet, one Haiku agent): its setup and its brief; its record goes in `runs/<date>-trial-4/` |

## Usage

```sh
node scripts/define-trial/check.js <dir>          # <dir> holds data.dialect.js, data.grammar.js, examples/*.js
node scripts/define-trial/check.js <dir> --json   # the same result as one JSON object
DEFINE_TRIAL_LOG=trial.jsonl node scripts/define-trial/check.js <dir>   # also log the invocation
node scripts/define-trial/check.js <dir> --lang budget   # another language: <dir>/budget.dialect.js and budget.grammar.js
node scripts/define-trial/check.js <dir> --effects --lang particles   # trial 4: a // REFUSED: example must fail
```

Each violation prints as `<file>:<line>: <code> <message>` and a `  fix:` line (then a `  tip:` line when the kit gave both a fix and a different tip); rules.md lists the codes. Exit 0 means no violations, 1 violations, 2 a bad invocation, 4 a missing directory or definition file. With `DEFINE_TRIAL_LOG` set, every invocation appends one JSON line: `time`, `dir`, `ok`, `diagnostics`, `files` (the text of every candidate file) and `loadError`.

The checker hands each example's module scope to the builder with `keywords` and `shadowed` too (leaf LWKjTf).

How it works: a Node module hook (`module.registerHooks`) resolves `kit/define` to `checker/define.js`, which re-exports the real kit/define, so the candidate's files run unchanged. Its `load` hook appends to each example an export returning the file's top-level bindings (named by `topLevelNames`, [kit/parse/toplevel.js](../../kit/parse/toplevel.js); lines keep their numbers), and the checker passes them, with each top-level `const` declaration's initializer text and each function declaration's text (`topLevelBindings` filtered and `topLevelFunctions`, by `helperSources`, so a helper is only the arrow its `const` declaration writes or the `function` declaration itself; a name the scan finds declared twice is `LOAD`, below) and the file's `buildTimeNames`, to `.check({ scope, sources, buildTime })` and `.build(…)`: the module scope a lambda's free names resolve against ([kit/define](../../kit/define/README.md), "Module scope"). A function declaration vouches only by identity: the load hook prepends (on line 1, so lines hold) a capture of each top-level function declaration's value, and `moduleScope` drops the text of any whose value in the scope is no longer that function (reassigned, even to a closure with the same text), so it is B012. A lowering error inside a top-level helper is placed at its `const` or `function` line. A `DefinitionError` from `defineDialect` or `defineGrammar` is recorded, each problem located by searching the file for its path's keys from the call's line; a refused Dialect is replaced by a stand-in with its convention names, so the Grammar is still checked without knock-on refusals. Once both definitions are accepted, each example is loaded (a `B001` thrown at a call is reported as the kit gave it), its default export, the Program as a function of its params (`($) => program(…)…`, a function of exactly one parameter, C001 otherwise; one parameter with a default, `($ = {}) => …`, counts, though its `length` is 0, and a rest parameter does not), is built by kit/define's `run()` with the params at their declared values, which gives every collected `B…` code and the Dialect's own checks, and a Program that builds clean is passed to the Grammar's `lower()`: construct state call by call, convention functions, every lambda's body. A lowering diagnostic inside a lambda is placed at its line by finding the lambda's source in the file. An exception from the candidate's own functions (`environment`, a convention, a check, `init`, `step`) is `C005` at the line that threw.

The checker's own codes: `C001` (an example neither exports a builder chain nor is refused), `C005`, `C006` (an import other than `kit/define` or the candidate's own files, static or dynamic, in the Dialect, Grammar or an example: R1) and `C007` (no example files at all: R6); `LOAD` is a definition file that cannot be loaded at all, or an example whose text the scan could not parse as a module (`topLevelBindings` threw a `ScanError`; a name declared twice is the case that names it), so the checker reports it at the error's line and checks nothing more of that file rather than vouch for a helper by either declaration. Check v0's other codes are retired, and the kit's own replace them: `C002` (a lambda that does not parse) is `B007`, `C003` (a free name) is `B008`, `C004` (an unknown method) is `B001`, and a call to a `rejected` name, which v0 accepted, is `B009`. D001–D015 keep their numbers (now the kit's own, widened where the API grew), D016 is retired, D017–D020 are new (D020: a Dialect without `text(state)`).

What it does not do: run any target (nothing is emitted or compared), or check a `// REFUSED:` comment's claim.

## The --effects mode

> **Changed 2026-11-25 (leaf `8vQJOw`):** `--effects` was a shim over a kit without effects (`checker/effects/`: it checked the draft's declarations itself, stripped them, lowered against a patched Environment with the verifier off, and judged effects and totals after lowering). kit/define now has per-slot effects ([its README](../../kit/define/README.md#per-slot-effects)), so the shim is retired and every effect code comes from the kit.

Per-slot effects ([docs/api-effects.md](docs/api-effects.md)) are kit/define's own checks, so the checker reports D012, D021 and D022 (at the Dialect, `(when examples/… was lowered)` for what `environment(program)` added or a convention function returned), and L004, L013 and L017 (at the lambda or helper) with or without the flag. `--effects` (`checkDir(dir, { effects: true })`) adds only trial 4's rule from [docs/rules-effects.md](docs/rules-effects.md):

- **Expected refusals:** an example whose first line is `// REFUSED: <code>` must fail (any diagnostic, from the definitions, the builder or lowering); its diagnostics are folded into one info line, `REFUSED declared <code>; the checker gave …`, which gates nothing. One that checks clean, or exports no Program, is `C008`.

On the real kit, the trial-4 hand-ins (`runs/2026-11-25-trial-4/agent-{a,b,c}`) and `fixtures/effects-valid` check as they did under the shim: each clean, every refusal failing with the same code at the same line (`node scripts/define-trial/check.js <dir> --effects --lang particles`, `--lang garden` for the fixture). Only the wording changed: the kit's L004 reads `A force may not 'write Particle.size'.` where the shim's read `The force slot may not …`, and its L017 for a read of a bumped total reads `'counters.hits' is a total this update may bump, so it may not read it.`

## Running a trial

Give each agent a private directory holding copies of `docs/api-draft.md`, `docs/rules.md` and [the Dream Code](../../project/2026-11-24-data-tools-dream-code.md) as `dream-code.md`, and a `check.sh` that runs the checker with `DEFINE_TRIAL_LOG` set. Tell it to read nothing else in the repository, and to write `REPORT.md` with a shell heredoc if its Write is refused ([project/gotchas.md](../../project/gotchas.md)). Record per agent the model, what it guessed, what it asked for, its difficulty score, and how much its output needed changing to comply. `trial-2-briefs.md` has trial 2's setup and brief word for word.
