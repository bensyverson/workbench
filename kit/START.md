# Start here

The Workbench Kit turns a small domain language into a workbench: people (and models) write Programs in it, and the kit type-checks every Program and compiles it to run in the browser. You build a language by writing **two files of plain data**. The kit generates everything else: the builder people call, its error messages, the type checker for their lambdas.

Read this page, then [API.md](API.md). Together they are everything you need. Don't read the kit's source: if you have to, that is a gap in these two pages, and worth reporting.

## What you write

| File | What |
|---|---|
| `<lang>.dialect.js` | `export const <name> = defineDialect({...})`: the language's types, the operations a lambda may call, and how each kind of lambda is called |
| `<lang>.grammar.js` | `export const <builder> = defineGrammar(<dialect>, {...})`: the builder methods and their arguments |
| `examples/*.js` | Programs in your language, one per file: `export default ($) => <builder>("name")…;` |

Import only from `"kit/define"` and your own files.

## The loop

1. **Sketch three example Programs first**, from the spec you were given, in the exact form people will write. They are your tests.
2. **Write the Dialect, then the Grammar.** Start from API.md's examples and change what your language needs.
3. **Run the check** your task names (for example `./check.sh`). It loads your files with the real kit, builds every example, and type-checks every lambda. Each problem prints as `<file>:<line>: <code> <message>`, then a `fix:` line.
4. **Fix the first error, then rerun.** Errors come in order: definition errors (`D…`) first, then builder errors (`B…`), then lambda errors (`L…`), which only appear once a Program builds.
5. **Prove the refusals.** For each mistake your spec says the language must refuse, write a Program with that one mistake, check that it fails with a clear message, then delete it (or keep it where your task says).

## When the API can't express something

Don't invent API, and don't work around it silently. Express what you can, refuse the rest in the language itself (a `rejected` entry, or a check with your own code), and report the gap: what you needed, and the smallest change that would let you say it.

## Words

- **Dialect**: what a language means (types, operations, conventions).
- **Grammar**: how it is written (constructs, slots, arguments).
- **Construct**: a thing a Program declares, with its own builder methods. The root construct is the Program.
- **Slot**: one builder method of a construct.
- **Runtime Lambda**: a function passed into a Program. The kit reads its text and never calls it.
- **Build time / run time**: the Program function runs once, at build time. Its lambdas run later, per row, pixel or month.
