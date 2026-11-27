# Start here

The Workbench Kit turns a small domain language into a workbench: people (and models) write Programs in it, and the kit type-checks every Program and compiles it to run in the browser. You build a language by writing **two files of plain data**. The kit generates the rest: the builder people call, its error messages, and the type checker for their lambdas.

Read this page, then [API.md](API.md). The pages in [docs/](docs/) cover one topic each; API.md says when to read each one. Don't read the kit's source: if you have to, that is a gap in these pages, and worth reporting.

**Reading the snippets.** In the code in these pages, a word in angle brackets is a name or number you choose, with the rule for choosing it beside it: `<field>`, `<frame>`, `<part>`, `<slot>`, `<max>`. A digit tells two of a kind apart, and `<…>` stands for text or code you write. Everything else is literal: the kit's keys, handles, functions and seam spellings, and all punctuation. Don't type the angle brackets, and take names and numbers from your spec, not from a snippet.

## What you write

| File | What |
|---|---|
| `<lang>.dialect.js` | `export const <name> = defineDialect({...})`: types, the operations a lambda may call, how each kind of lambda is called |
| `<lang>.grammar.js` | `export const <builder> = defineGrammar(<dialect>, {...})`: the builder methods and their arguments |
| `<path>.<ext>` | optional data files (a PNG, a CSV): anything not `.js`, named by your Dialect where it reads them (API.md ▸ Seams, "Data files") |
| `examples/*.js` | Programs, one per file: `export default ($) => <builder>("<name>")…;` |
| `<lang>.runtime.js` | optional: `export const <name> = defineRuntime(<builder>, {...})`: how a run steps your state (API.md ▸ A runtime). Data a Program declares (a field per `<item>`) lives in that state too: API.md ▸ `defineDialect`, "Data a Program declares goes in the state" |

Declare each vector or scalar once, in the Dialect's `types: { <vec>: vector(<dims>, "f64") }`, and name it by its key (`"<vec>"`) in `state` and on ports: `vector(…)` written inline there is refused (D023, D027). API.md ▸ `defineDialect`.

Import only from `"kit/define"` and your own files. If other packages will be wired to yours, declare its ports and frames in the Dialect: see [API.md](API.md) ▸ Seams. If your Dialect offers a picture (a `Draw` output), your UI's stage can show it: `stage: { draw: "<Draw output>" }` (API.md ▸ `defineUI`). To wire packages together, you write a glue program with `kit/compose`: see [compose/README.md](compose/README.md). To draw one package's picture over another's, the glue layers them with no package of its own: `.show(<part>.out.<output>, <part>.out.<output>)`, bottom first, or `layer("<name>", <output>, <output>)` to wire or layer the result again (compose/README.md ▸ Layers).

## The loop

1. **Sketch three example Programs first**, in the exact form people will write. They are your tests.
2. **Write the Dialect, then the Grammar**, starting from API.md's snippets.
3. **Run the check** your task names (for example `./check.sh`). It builds every example with the real kit and type-checks every lambda. Each problem prints as `<file>:<line>: <code> <message>`, then a `fix:` line.
4. **Fix the first error, then rerun.** Definition errors (`D…`) come first, then builder errors (`B…`, including your own checks), then lambda errors (`L…`). **Lambda errors appear only once a Program builds clean.**
5. **Prove the refusals.** For each mistake your spec says the language must refuse, write a Program with that one mistake, check that it fails with a clear message, then delete it (or keep it where your task says). Most lambda strictness is off by default: see API.md's pitfalls under `defineDialect`. Conditions are the exception: a Program's tests must be bools in every Dialect (an optional is `m == null` / `m != null`, a number `n !== 0`, a string `s !== ""`), or L003.
6. **Test your runtime with the kit, not a harness.** If you want to test your runtime, list tests in your manifest's `tests` (optional): each names an example, gives timed records on your named Event inputs (`{ "T": <seconds>, "in": "<input>", "value": { <field>: <value> } }`) and says what to expect (state at an instant, a value output, the records your Event output pushed, a run diagnostic). The check runs them and reports H006–H008. Don't stub `defineRuntime` or call `step` yourself. API.md ▸ A runtime, "Testing it".

## When the API can't express something

Don't invent API, and don't work around it silently. Express what you can, including refusals through a `rejected` entry or a check with your own code, and report the gap: what you needed, and the smallest change that would let you say it. [docs/strictness.md](docs/strictness.md) lists the known gaps.

## Words

- **Dialect**: what a language means (types, operations, conventions).
- **Grammar**: how it is written (constructs, slots, arguments).
- **Construct**: a thing a Program declares, with its own builder methods. The root construct is the Program.
- **Slot**: one builder method of a construct.
- **Runtime Lambda**: a function passed into a Program. The kit reads its text and never calls it.
- **Port**: what a Dialect offers (`ports.out`) or accepts (`ports.in`), written in a seam type every package shares. An Event input's field may have a default, `<field>: <type> = <value>`, for a producer that lacks it (API.md ▸ Seams).
- **Frame**: a coordinate space or unit a Dialect measures in; a composer relates one package's to another's.
- **Build time / run time**: the Program function runs once, at build time. Its lambdas run later, per row, pixel or month.
- **Runtime**: a package's `init` and `step` over its own state; the kit's scheduler runs it on one workbench time, instant by instant.
