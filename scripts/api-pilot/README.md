# API pilot kit

The pilot of START.md and API.md (M3, leaf `qwgSOL`): fresh agents, given only those two documents and a one-page Dream Code sheet, define a small budget-planner language with the Definition API. Hidden programs, written before the documents by an agent that saw only the sheet, decide green. The checker is the define-trial's ([scripts/define-trial](../define-trial/README.md)), run with `--lang budget`.

## What is here

| Path | What |
|---|---|
| `docs/dream-code.md` | the sheet: the language's builder surface, its meaning and the twelve refusals. The pilot's fixed spec |
| `hidden/accept/`, `hidden/reject/` | the hidden programs (12 that must check clean, 21 that must each be refused; `hidden/README.md` says what each tests). Never shown to a pilot agent |
| `reference/` | the reference implementation (`budget.dialect.js`, `budget.grammar.js`), its passing `examples/` and one `reject/` file per refusal; it passes every hidden program |
| `score.js`, `score/` | the scorer: a hand-in's definitions over every hidden program |
| `count-tokens.js` | token counts for documentation files with the `count_tokens` endpoint: each file and all of them joined, per model (default: the three pilot tiers). Needs `ANTHROPIC_API_KEY` (`set -a; . ./.env; set +a`) |
| `pilot-brief.md` | the brief the pilot agents got, word for word |
| `test/` | the scorer's tests (in `npm test`), including that the reference passes the hidden set |

## Usage

```sh
node scripts/api-pilot/score.js <hand-in dir>                 # the hand-in's budget.*.js over hidden/
node scripts/api-pilot/score.js <hand-in dir> <hidden dir>    # over another set
node scripts/define-trial/check.js <hand-in dir> --lang budget   # the hand-in's own examples
node scripts/api-pilot/count-tokens.js kit/START.md kit/API.md   # the documents' size in tokens
```

The scorer copies the hand-in's `budget.dialect.js` and `budget.grammar.js` and every hidden program (as `examples/accept-<file>` and `examples/reject-<file>`) into a temp directory and checks it once. An accept program passes when its file gets no error; a reject program passes when it gets at least one, whatever the code. An error in the definitions fails every program. It prints one line per program with the codes it got, and a tally; exit 0 only when every program passes and each kind had at least one program. A hidden dir without `accept/` and `reject/` exits 2, so a mistyped path cannot read as a pass.

How the sheet was settled (2026-11-24): the hidden-program author and the reference implementer each listed what the sheet left open, and one revision settled all of it before any pilot agent saw it. The run order of a month is stated in the sheet but cannot be written in a Dialect: the API has no run semantics, so the text view formats a ledger the host computes.
