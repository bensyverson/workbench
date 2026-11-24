# Trial rules: map the data-tools Dream Code onto the draft Definition API

*2026-11-24. You have three documents: these rules, `api-draft.md` (the draft API) and `dream-code.md` (ten example Programs for a data-tools language that does not exist yet). Read nothing else in the repository.*

## The task

Define the data-tools language with the draft API, as far as it will go, and rewrite each of the ten Dream Code examples as a Program in the builder your definition generates. Where the API cannot express something, do not invent API: write down what you needed. The point of the trial is to find where the draft fails a real author, so a gap you report is worth as much as a definition that checks.

## What you hand in

Your directory holds exactly these files:

| File | What |
|---|---|
| `data.dialect.js` | `export const data = defineDialect({...})` |
| `data.grammar.js` | `export const program = defineGrammar(data, {...})`, importing `data` from `./data.dialect.js` |
| `examples/01.js` … `examples/10.js` | one per Dream Code example (rules R6, R7) |
| `REPORT.md` | your report (rule R9) |

Import only from `kit/define` (and between your own files). The checker supplies `kit/define`.

## The rules

Each rule names the checker codes that enforce it. Run the checker as often as you like: `node <checker> <your directory>`. It prints each diagnostic with its file and line.

- **R1. Only the draft's keys and helpers.** Every key in `defineDialect` and `defineGrammar` is one the draft names; every helper is one it exports. (D001, D011)
- **R2. Every type name resolves** to a built-in, a declared vector, scalar or object, or a type variable. (D002)
- **R3. Every intrinsic is complete:** a signature, a `ref`, and a spelling for every target. (D003, D004)
- **R4. Every space is pure, every slot convention names a declared space, and every target accepts declared spaces only.** (D005, D006, D008)
- **R5. Names do not collide:** across intrinsics, globals, library entries and objects; and between a child construct's methods and its parent's. (D007, D010)
- **R6. Each example file is a Program or a refusal.** Either it builds a Program with your generated builder and `export default`s the call chain (without `.build()`), or its first line is `// REFUSED: <code>` followed by the diagnostic your language gives for it (a `rejected` entry or a check), and why. A file may also hold a Program for the part that fits plus a `// REFUSED:` comment for the rest. (C001)
- **R7. Lambdas obey the Runtime Subset and the free-name rule.** Every Runtime Lambda in an example parses in the Runtime Subset, and every free name in it is allowed by the free-name rule. (C002, C003, plus the parser's own `P…` and `S…` codes)
- **R8. Nothing outside the draft is assumed.** No build-time lambdas (functions that run while the Program is built and return grammar), no effects, no fragments or mixins, no layout, no rendering, no integer type. Dates are a nominal scalar you declare (`scalar`). Where an example needs one, refuse it (R6) or report it as a gap (R9). (D012 for an impure space; the rest is read by hand)
- **R9. The report.** `REPORT.md` has these sections, in order:
  1. **Difficulty**, 1 (easy) to 5 (could not do it), with one sentence why.
  2. **Per example**: one line each: fits, partly fits (what did not), or refused (why).
  3. **Where the draft misled you**: a rule or example in `api-draft.md` that led you wrong, quoted.
  4. **What you guessed**: every place the draft did not say and you chose; what you chose.
  5. **What you needed and did not have**: API you would add, smallest first, each with the example that needs it.
  6. **Gaps in the kit**: types, operators or semantics the language needs that the draft says do not exist.

## Checker codes

### Definition (`D…`): the definition files

| Code | Refused when |
|---|---|
| D001 | a key that `defineDialect` or `defineGrammar` does not take, at any level (a typo such as `intrinsic:` included) |
| D002 | a type name that resolves to nothing |
| D003 | an intrinsic without a spelling for one of the targets |
| D004 | an intrinsic without `ref`, `params` or `returns` |
| D005 | a slot convention whose `space` is not declared |
| D006 | a target whose `accepts` names an undeclared space |
| D007 | a name declared twice across intrinsics, globals, library and objects |
| D008 | a compare mode other than `exact()` or `tolerance(figure)` with a positive figure |
| D009 | a `lambda(convention)`, in an argument or a shape, that names no slot convention |
| D010 | a child construct with a method of the same name as its parent's, or a `parent` that is not a construct |
| D011 | a malformed argument spec or shape (`data()` with no shape, an unknown shape name) |
| D012 | a space without `pure: true` |
| D013 | a library entry that is not `{ fn: src }` or `{ const: src }`, or whose source does not parse |
| D014 | a slot without a `kind`, or with a kind other than `decl` or `unit` |
| D015 | a construct `state` without `record: "calls"`, without `init` or `step`, or whose `names` clash with a Program namespace; an `opt` or `rest` argument that is not last |

### Examples (`C…`): the example files

| Code | Refused when |
|---|---|
| C001 | an example file that neither exports a builder chain nor starts with `// REFUSED: <code>` |
| C002 | a Runtime Lambda that does not parse in the Runtime Subset (the parser's `P…`/`S…` diagnostic follows) |
| C003 | a free name in a Runtime Lambda that the free-name rule does not allow |
| C004 | a builder call to a method the grammar does not define (and does not `reject`) |

The checker does not run the generated builder or type-check lambdas: the builder is not built yet. It reads your definitions and the call chains in your examples, so `B…` and `L…` diagnostics you expect should be written in comments.
