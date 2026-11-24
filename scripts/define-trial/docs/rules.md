# Trial rules: map the data-tools Dream Code onto the Definition API

*2026-11-24, second trial. You have three documents: these rules, `api-draft.md` (the Definition API, as built) and `dream-code.md` (ten example Programs for a data-tools language that does not exist yet). Read nothing else in the repository.*

## The task

Define the data-tools language with the Definition API, as far as it will go, and rewrite each of the ten Dream Code examples as a Program in the builder your definition generates. Where the API cannot express something, do not invent API: write down what you needed. The point of the trial is to find where the API fails a real author, so a gap you report is worth as much as a definition that checks.

## What you hand in

Your directory holds exactly these files:

| File | What |
|---|---|
| `data.dialect.js` | `export const data = defineDialect({...})` |
| `data.grammar.js` | `export const program = defineGrammar(data, {...})`, importing `data` from `./data.dialect.js` |
| `examples/01.js` … `examples/10.js` | one per Dream Code example (rules R6, R7) |
| `REPORT.md` | your report (rule R9) |

Import only from `kit/define` (and between your own files). The checker supplies `kit/define`.

If the tool you write files with refuses to write `REPORT.md`, write it from the shell with a heredoc instead (`cat > REPORT.md <<'EOF'` … `EOF`). Do not return the report as text in place of the file.

## The rules

Each rule names the codes that enforce it. Run the checker as often as you like: `node <checker> <your directory>`. It loads your files with the real `kit/define`, builds every example's Program (your `($) => program(…)…`, with its params at their declared values) through the generated builder, and lowers every lambda of each Program that builds; it prints each diagnostic with its file and line, and a fix.

- **R1. Only the API's keys and helpers.** Every key in `defineDialect` and `defineGrammar` is one `api-draft.md` names; every import is one `kit/define` exports, and the only others are your own files. (D001, D011, D018, C006)
- **R2. Every type name resolves** to a built-in, a declared vector, scalar or object, or a type variable. (D002)
- **R3. Every intrinsic is complete:** a signature, a `ref`, and a spelling for every target that accepts a space. (D003, D004)
- **R4. Every space is pure, every slot convention names a declared space, and every target accepts declared spaces only.** (D005, D006, D008, D012)
- **R5. Names do not collide:** across intrinsics, globals, library entries, objects and types; between a child construct's methods and its parent's; between two things one record key would hold. (D007, D010, D017)
- **R6. Each example file is a Program or a refusal.** Either it `export default`s its Program as a function of the params that returns your generated builder's call chain, `export default ($) => program("…")…;` (without `.build()`), or its first line is `// REFUSED: <code>` followed by the diagnostic your language gives for it (a `rejected` entry or a check), and why. A file may also hold a Program for the part that fits plus a `// REFUSED:` comment for the rest; that Program must itself check clean (R7). (C001; C007 if there are none)
- **R7. Every exported Program builds and lowers clean.** The generated builder accepts it (every `B…` code, and your own checks), its construct state threads without a loop or a refusal (B003, B010, B011), and every Runtime Lambda in it parses, obeys the free-name rule and type-checks against its slot convention (B007, B008, and lowering's `L…`, `P…` and `S…` codes). Your definitions' own functions (`environment`, convention functions, checks, `init`, `step`) must not throw on any example (C005).
- **R8. Nothing outside the API is assumed.** No build-time lambdas (functions that run while the Program is built and return grammar) other than the Program's own `($) => …`, no effects, no fragments or mixins, no layout, no rendering, no integer type. Dates are a nominal scalar you declare (`scalar`). Where an example needs one, refuse it (R6) or report it as a gap (R9). (D012 for an impure space; the rest is read by hand)
- **R9. The report.** `REPORT.md` has these sections, in order:
  1. **Difficulty**, 1 (easy) to 5 (could not do it), with one sentence why.
  2. **Per example**: one line each: fits, partly fits (what did not), or refused (why).
  3. **Where the API document misled you**: a rule or example in `api-draft.md` that led you wrong, quoted.
  4. **What you guessed**: every place the document did not say and you chose; what you chose.
  5. **What you needed and did not have**: API you would add, smallest first, each with the example that needs it.
  6. **Gaps in the kit**: types, operators or semantics the language needs that the document says do not exist.

## Codes

The checker prints the kit's own codes (`D…` from `defineDialect` and `defineGrammar`, `B…` from the generated builder and from lowering a Program's construct state, `L…`, `P…` and `S…` from lowering a lambda, your Dialect's own letter from your checks) and its own (`C…`, `LOAD`). Examples are checked only once both definition files are accepted, since each would repeat their errors; a Program's lambdas are lowered only once its builder accepts it.

### Definitions (`D…`): the definition files, when `defineDialect` or `defineGrammar` is called

| Code | Refused when |
|---|---|
| D001 | a key that `defineDialect` or `defineGrammar` does not take, at any level (a typo such as `intrinsic:` included), or a required key missing |
| D002 | a type name that resolves to nothing (also in what a convention function returns, found when a Program is lowered) |
| D003 | an intrinsic without a spelling for a target that accepts a space |
| D004 | an intrinsic without `ref`, `params` or `returns` |
| D005 | a slot convention whose `space` is not declared |
| D006 | a target whose `accepts` names an undeclared space |
| D007 | a name declared twice across intrinsics, globals, library, objects and types, a type named like a built-in (`f32`, `str` …) or a type variable (`T`), or a convention named `helper`, `const` or `method` |
| D008 | a compare mode other than `exact()` or `tolerance(figure)` with a positive figure |
| D009 | a `lambda(convention)`, in an argument or a shape, that names no slot convention |
| D010 | a child construct with a method of the same name as its parent's, a `parent` or `root` that is not a construct, or a slot named `check` or `build` |
| D011 | a malformed declaration, argument spec or shape (`data()` with no shape, an unknown shape name), or an import `kit/define` does not export |
| D012 | a space without `pure: true` |
| D013 | a library entry that is not `{ fn: src }` or `{ const: src }`, or whose source does not parse |
| D014 | a slot without a `kind`, or with a kind other than `decl` or `unit` |
| D015 | a construct `state` without `record: "calls"`, without `init` or `step`, or whose `names` clash with a Program namespace; an `opt` or `rest` argument that is not last |
| D017 | two things of one construct that the record would put under one key (two opening arguments, an opening argument and a child construct, two slots' names or `as`, `units` beside a unit slot, `calls` in a `record: "calls"` construct) |
| D018 | a slot or construct named like a property runtimes probe on every object (`then`, `toJSON`, `inspect`, `constructor`, `valueOf`, `toString`, `prototype`, `nodeType`, `asymmetricMatch`, `$$typeof`) |
| D019 | a `lambda()` in a construct's `opens` (not built) |
| D020 | a Dialect without `text(state)`, its text view, or with one that is not a function |

### Programs (`B…`): the example files, from the generated builder and from lowering

| Code | Refused when |
|---|---|
| B001 | a method the construct does not have (thrown at the call, with a "did you mean") |
| B002 | a `name()` already declared in its namespace, or a second construct instance with state under a name another has |
| B003 | a `ref()` that names nothing; for a state namespace, nothing at that step |
| B004 | a value that does not fit its shape, or a name that is not an identifier |
| B005 | a construct missing a `required` slot |
| B006 | a second call to a `once` slot |
| B007 | a lambda that is not an arrow function or its source text, or does not parse |
| B008 | a free name the free-name rule does not allow |
| B009 | a call to a `rejected` name |
| B010 | a construct state that depends on itself through `stateOf` |
| B011 | a slot convention function that refused the lambda (returned a reason) |
| B012 | a top-level binding a lambda reads that is neither the arrow function its declaration writes (not one made by another function) nor plain data |
| B013 | a free name your file declares only inside build-time code (a loop variable, a function's local), not at its top level |
| B014 | a member of the params that exists only while the Program runs (fields' `u.t`), read by build-time code |
| B015 | the params read by build-time code other than by name (`"topN" in $`, a spread, `Object.keys($)`, `JSON.stringify($)`, a rest pattern) |

A lambda's body is type-checked by lowering, whose codes start with `L` (an unknown member, a type mismatch …), `P` (does not parse) or `S` (outside the Runtime Subset); each is printed at its line inside the lambda, with the lambda's id.

### The checker's own (`C…`)

| Code | Refused when |
|---|---|
| C001 | an example file that neither exports its Program as a function of the params, `($) => program(…)…`, nor starts with `// REFUSED: <code>`; or exports a function that does not take exactly one parameter, the chain itself, or what `.build()` returns; or cannot be loaded |
| C005 | a function in your definitions (`environment`, a convention function, a check, `init`, `step`) threw while an example was checked; printed at the line that threw |
| LOAD | a definition file that cannot be loaded at all (a syntax error, an exception, no define call) |

The checker does not run any target (no JavaScript or GLSL is emitted or compared), and it cannot check a `// REFUSED:` comment's claim: those are read by hand.
