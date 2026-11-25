# Trial rules: map the particles Dream Code onto the Definition API, with per-slot effects

*2026-11-25, fourth trial. You have four documents: these rules, `api-draft.md` (the Definition API, as built), `api-effects.md` (per-slot effects: an addition to `api-draft.md` that is **not built yet**; where the two disagree, `api-effects.md` wins) and `dream-code.md` (the particles language: one example Program, the rules of its lambdas, and the mistakes it must refuse). Read nothing else in the repository.*

## The task

Define the particles language with the Definition API and its effects addition, as far as they go. Write the sheet's example Program in the builder your definition generates, five more Programs of your own, and six refusals. Where the API cannot express something, do not invent API: write down what you needed. The point of the trial is to find where the effects design fails a real author, so a gap you report is worth as much as a definition that checks.

**The host is not part of the hand-in.** The host is the program that runs your Programs: the tick loop, the particle store, what `p.kill()` and `rng()` do, the counters, and the state the text view prints. Your Dialect declares the objects the host hands each lambda (`api-effects.md`, "Who implements a verb"); you do not write the host. The one host-facing function you do write is `text(state)`, which every Dialect needs (D020): say in a comment what `state` holds.

## What you hand in

Your directory holds exactly these files:

| File | What |
|---|---|
| `particles.dialect.js` | `export const particlesDialect = defineDialect({...})` |
| `particles.grammar.js` | `export const particles = defineGrammar(particlesDialect, {...})`, importing `particlesDialect` from `./particles.dialect.js` |
| `examples/01.js` | the sheet's example Program ("A Program"), verbatim; if your builder needs another import line, change only that line |
| `examples/02.js` … `examples/06.js` | Programs you write so that, across `01.js` to `06.js`, every lambda kind (`rate`, `spawn`, a force, `update`), a top-level helper, a declared `.field`, a counter that is bumped and read, a `p.kill()` and an `rng()` call all appear (rules R6, R7) |
| `examples/r01.js` … `examples/r06.js` | one refusal each for the sheet's refusals 3, 4, 6, 7, 23 and 24, in that order (rule R6) |
| `REPORT.md` | your report (rule R9) |

Import only from `kit/define` (and between your own files). The checker supplies `kit/define`.

**Refusal numbers.** The numbers 1 to 25 are the sheet's ("What it must refuse"). The checker does not know them: it prints the kit's own codes (`L004`, `L013`, `L017` …). A refusal's first line names the code your language gives, then the sheet's number: `// REFUSED: L004 (sheet 3: a force writes p.size)`.

If the tool you write files with refuses to write `REPORT.md`, write it from the shell with a heredoc instead (`cat > REPORT.md <<'EOF'` … `EOF`). Do not return the report as text in place of the file.

## The rules

Each rule names the codes that enforce it. Run the checker as often as you like: `node <checker> <your directory> --effects --lang particles` (your `check.sh` does this). It loads your files with the real `kit/define`, with a stand-in for `api-effects.md`: it checks your effect declarations, takes them out so the real API accepts the rest, builds every example's Program (your `($) => particles(…)…`, with its params at their declared values) through the generated builder, lowers every lambda of each Program that builds, and checks each lambda's effects against its slot's `may`. It prints each diagnostic with its file and line, and a fix.

- **R1. Only the API's keys and helpers.** Every key in `defineDialect` and `defineGrammar` is one `api-draft.md` or `api-effects.md` names (`api-effects.md` adds `instance`, `may`, `helpers`, `write`, `bump`, `effects`, and `call` on an object); every import is one `kit/define` exports, and the only others are your own files. (D001, D011, D018, C006)
- **R2. Every type name resolves** to a built-in, a declared vector, scalar or object, or a type variable. (D002)
- **R3. Every intrinsic is complete:** a signature, a `ref`, and a spelling for every target that accepts a space; and it has no `effects`, since an intrinsic is pure. (D003, D004, D021)
- **R4. Every space is pure or an instance space, every slot convention names a declared space, and every target accepts declared spaces only.** A space has exactly one of `pure: true` and `instance: "Obj"`. (D005, D006, D008, D012)
- **R4b. Every effect is declared and lands only where it may.** Each slot's `may`, `helpers.may` and each verb's and call's `effects` name real verbs, objects and members; writes and verbs stay in their object's instance space; nothing else can hand a lambda an instance (no member, method result, global, list item, struct field, intrinsic or call result of its type); no slot both reads and bumps one total; `write` and `bump` sit only on value members, never together. (D021, D022)
- **R5. Names do not collide:** across intrinsics, globals, library entries, objects and types; between a child construct's methods and its parent's; between two things one record key would hold. (D007, D010, D017)
- **R6. Each example file is a Program or a refusal, and in this trial a refusal is a Program too.** Every file `export default`s its Program as a function of the params that returns your generated builder's call chain, `export default ($) => particles("…")…;` (without `.build()`). A refusal is a valid Program with exactly one mistake, the one its sheet number describes, and its first line is `// REFUSED: <code> (sheet <n>: what the mistake is)`. The checker builds and lowers every refusal: it must fail (C008 if it checks clean), and the checker prints the codes it failed with beside the one you declared, for a person to compare. (C001; C007 if there are none; C008)
- **R7. Every exported Program that is not a refusal builds and lowers clean, effects included.** The generated builder accepts it (every `B…` code, and your own checks), its construct state threads without a loop or a refusal (B003, B010, B011), and every Runtime Lambda in it parses, obeys the free-name rule and type-checks against its slot convention (B007, B008, and lowering's `L…`, `P…` and `S…` codes); no lambda or helper has an effect its `may` does not allow (L004), writes a member that is not writable or part of a vector member (L013), or changes a total other than by the statement `+= <number>` or `++` (L017). Your definitions' own functions (`environment`, convention functions, checks, `init`, `step`) must not throw on any example (C005); `text` is not run.
- **R8. Nothing outside the two API documents is assumed.** No build-time lambdas (functions that run while the Program is built and return grammar) other than the Program's own `($) => …`; no effects but `api-effects.md`'s: no spawn from a lambda, no `emit`, no effectful intrinsic, no write outside the instance a lambda is handed but a bump; no fragments or mixins, no layout, no rendering, no integer type. Where the sheet needs one, report it as a gap (R9). (D021, D022; the rest is read by hand)
- **R9. The report.** `REPORT.md` has these sections, in order:
  1. **Difficulty**, 1 (easy) to 5 (could not do it), with one sentence why.
  2. **Per example**: one line each, for `01.js` to `06.js` and `r01.js` to `r06.js`: fits, partly fits (what did not), or, for a refusal, the code it gave and whether that is the mistake the sheet names.
  3. **Where the API documents misled you**: a rule or example in `api-draft.md` or `api-effects.md` that led you wrong, quoted.
  4. **What you guessed**: every place the documents did not say and you chose; what you chose.
  5. **What you needed and did not have**: API you would add, smallest first, each with the example or sheet rule that needs it.
  6. **Gaps in the kit**: types, operators or semantics the language needs that the documents say do not exist.
  7. **Effects**: every effect you declared (each slot's `may`, `helpers`, each verb's and call's `effects`, each writable member and total), one line each with why; then every place where `api-effects.md`'s rules fought the sheet: a sheet rule you could not enforce, or one the packet enforces differently (another code, another place, a looser or stricter rule).

## Codes

The checker prints the kit's own codes (`D…` from `defineDialect` and `defineGrammar`, `B…` from the generated builder and from lowering a Program's construct state, `L…`, `P…` and `S…` from lowering a lambda, your Dialect's own letter from your checks), the effects addition's (D012 widened, D021, D022, L004 widened, L017, which the checker gives for `api-effects.md` until it is built) and its own (`C…`, `LOAD`, `REFUSED`). Examples are checked only once both definition files are accepted, since each would repeat their errors; a Program's lambdas are lowered only once its builder accepts it.

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
| D012 | a space with neither `pure: true` nor `instance`, or with both; `pure` that is not `true`; an `instance` that names no declared object (widened) |
| D013 | a library entry that is not `{ fn: src }` or `{ const: src }`, or whose source does not parse |
| D014 | a slot without a `kind`, or with a kind other than `decl` or `unit` |
| D015 | a construct `state` without `record: "calls"`, without `init` or `step`, or whose `names` clash with a Program namespace; an `opt` or `rest` argument that is not last |
| D017 | two things of one construct that the record would put under one key (two opening arguments, an opening argument and a child construct, two slots' names or `as`, `units` beside a unit slot, `calls` in a `record: "calls"` construct) |
| D018 | a slot or construct named like a property runtimes probe on every object (`then`, `toJSON`, `inspect`, `constructor`, `valueOf`, `toString`, `prototype`, `nodeType`, `asymmetricMatch`, `$$typeof`) |
| D019 | a `lambda()` in a construct's `opens` (not built) |
| D020 | a Dialect without `text(state)`, its text view, or with one that is not a function |
| D021 | a malformed effect declaration: an unknown verb, object or member in a `may` or an `effects` list; a non-read in a pure space's slot or in `helpers`; a key in `helpers` other than `may`; a `bump` outside an instance space, or of a member that is not a total; a `write` of a member that is not writable; a `write` or `bump` that names no object; one slot that may both read and bump a total; `write` and `bump` on one member, either on a member that is not a `value`, or `bump` on one that is not `"f64"`; `effects` on an intrinsic, on a member that is not a verb, or beside an object with no `call` (new) |
| D022 | an instance that could reach a lambda another way, or a change to an object outside its instance space: a member, method result, global, list item, struct field, intrinsic result or call result of the instance's type, or what `environment(program)` adds of it; a slot outside the instance space that takes one; a slot in it that takes none or two; `write` or `destroy` of an object in a slot whose space's instance is not that object (new) |

A D021 or D022 that depends on the Program (a member `environment(program)` adds, or what a convention function returns) is found when an example is lowered, and printed at the Dialect with `(when examples/… was lowered)`.

### Programs (`B…`): the example files, from the generated builder and from lowering

| Code | Refused when |
|---|---|
| B001 | a method the construct does not have (thrown at the call, with a "did you mean") |
| B002 | a `name()` already declared in its namespace, or a second construct instance with state under a name another has |
| B003 | a `ref()` that names nothing; for a state namespace, nothing at that step |
| B004 | a value that does not fit its shape, or a name that is not an identifier; a param whose declared `value` does not fit its own declaration (not finite, outside `min..max`, not one of `options`) |
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

### Lambdas (`L…`, `P…`, `S…`): each lambda's and helper's body, when lowered

A lambda's body is type-checked by lowering, whose codes start with `L` (an unknown member, a type mismatch …), `P` (does not parse) or `S` (outside the Runtime Subset); each is printed at its line inside the lambda, with the lambda's id, or at a helper's line. Three of them are about effects:

| Code | Refused when |
|---|---|
| L004 | an effect the slot's `may` does not allow, the lambda's own or through a helper it calls; or a helper's own effect beyond `helpers.may`, at the helper. With no `helpers`, a helper may read only the members of each instance space's object (`may: ["read <each instance object>"]`): a total read in a helper is L004 unless `helpers.may` lists it, e.g. `helpers: { may: ["read Particle", "read Counters"] }`. The message names the effect and the slot; the fix lists the slot's `may` (widened from "a verb the slot forbids") |
| L013 | a write to a member without `write: true`, or to part of a vector member (`p.vel.x = 0`) |
| L017 | a total changed other than by the statement `x.m += <number>` or `x.m++` (`=`, `-=`, `--`, a bump used as a value), or a total read in a slot that may bump it (new) |

### The checker's own (`C…`)

| Code | Refused when |
|---|---|
| C001 | an example file that does not export its Program as a function of the params, `($) => particles(…)…`; or exports a function that does not take exactly one parameter (one with a default, `($ = {}) => …`, counts; a rest parameter does not), the chain itself, or what `.build()` returns; or cannot be loaded |
| C005 | a function in your definitions (`environment`, a convention function, a check, `init`, `step`) threw while an example was checked; printed at the line that threw |
| C007 | there are no example files |
| C008 | a file marked `// REFUSED: <code>` that checks clean: its Program builds and lowers with no error, or it exports no Program, so nothing was refused |
| LOAD | a definition file that cannot be loaded at all (a syntax error, an exception, no define call); or an example whose top level the checker misread (it found a name declared twice), which is the checker's fault, not yours |
| REFUSED | not a violation: for each refusal that failed, the code you declared and every code the checker gave, with its line and message |

The checker does not run any target (no JavaScript is emitted or compared), does not run your `text(state)`, and cannot check that a refusal fails for the reason its sheet number names: that, and whether the code you declared is the one it gave, are read by hand.
