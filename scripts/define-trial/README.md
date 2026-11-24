# Definition API trial kit

The first dogfood trial of the Definition API (M3, leaf `lMNmIB`): fresh agents get only the draft API, a strict rule set and the data-tools Dream Code, define the data-tools language with the draft as far as it goes, and report where it failed them. The draft is not built; the trial runs on paper, checked by a script. The design behind the draft is [project/2026-11-24-definition-api-design.md](../../project/2026-11-24-definition-api-design.md).

## What is here

| Path | What |
|---|---|
| `docs/api-draft.md` | the draft Definition API, with the fields Dialect written in it as the worked example |
| `docs/rules.md` | the task, the hand-in, the rules R1–R9 and the checker's codes (`D…` for definitions, `C…` for examples) |
| `check.js` | the checker the rules name (`check` v0): a thin CLI over `checker/` |
| `checker/` | the checker's library: `define.js` is the stub `kit/define` (the draft's helpers, plus `defineDialect` / `defineGrammar` that validate, D001–D014), `dialect.js` and `grammar.js` the checks, `builder.js` the recording builder, `lambda.js` the Runtime Subset parse and free names (C002, C003), `index.js` `checkDir` |
| `fixtures/valid/` | the passing fixture: a tiny per-pixel language (borrowed from the fields example) shaped as rules.md's hand-in; the tests derive one failing fixture per code from it by a one-line edit |
| `test/` | the checker's tests (in `npm test`) |
| `runs/2026-11-24/` | trial 1: each agent's hand-in, `REPORT.md` and checker log (`log.jsonl`); the findings are [project/2026-11-24-definition-api-trial-1.md](../../project/2026-11-24-definition-api-trial-1.md) |

## Usage

```sh
node scripts/define-trial/check.js <dir>          # <dir> holds data.dialect.js, data.grammar.js, examples/*.js
node scripts/define-trial/check.js <dir> --json   # the same result as one JSON object
DEFINE_TRIAL_LOG=trial.jsonl node scripts/define-trial/check.js <dir>   # also log the invocation
```

Each violation prints as `<file>:<line>: <code> <message>` and a `  fix:` line; the codes are rules.md's. Exit 0 means no violations, 1 violations, 2 a bad invocation, 4 a missing directory or definition file. With `DEFINE_TRIAL_LOG` set, every invocation appends one JSON line: `time`, `dir`, `ok`, `diagnostics`, `files` (the text of every candidate file) and `loadError`.

How it works: a Node module hook (`module.registerHooks`) resolves `kit/define` to `checker/define.js`, so the candidate's files run unchanged. `defineDialect` and `defineGrammar` validate their input and report every problem, located by searching the file for the offending key from the call's line. `defineGrammar` returns a recording builder: it records each call and its line, opens child constructs through `parent`, forwards parent methods, accepts `rejected` names, and reports any other method as C004 with a did-you-mean. The checker then parses every Runtime Lambda (and `.fn` / `.const` source) with `kit/parse` and applies the free-name rule. It does not run `environment()`, the slots' `check`s or the generated builder's own `B…` checks, and it does not type-check lambdas.

Codes outside rules.md's table: `LOAD` is a definition file that cannot be loaded at all (a syntax error, an exception, no define call); an example that cannot be loaded is C001.

## Running a trial

Give each agent a private directory holding copies of `docs/api-draft.md`, `docs/rules.md` and [the Dream Code](../../project/2026-11-24-data-tools-dream-code.md) as `dream-code.md`, and the checker's path. Tell it to read nothing else in the repository. Record per agent the model, what it guessed, what it asked for, its difficulty score, and how much its output needed changing to comply (the leaf's notes carry the protocol).
