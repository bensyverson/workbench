# Composition trial kit

The dogfood trial of dialect *composition* (leaf `ZCE0qf`), run on paper before any composition machinery exists. Fresh agents get only a draft composition model, three short dialect references (`cave`, `tiles`, `glow`) and a strict rule set, write one program that composes the three into a game, and report where the draft failed them. The design under test is [the architecture synthesis](../../project/2026-11-24-architecture-synthesis.md) §3.1 and §3.5 (parts with dialect-declared clocks, outputs under `part.out`, seam types with frame tags, snapshot reads, signal-dependent arguments as lambdas, shared `lib/` helpers), after consult A §4 and consult B §4.

## What is here

| Path | What |
|---|---|
| `docs/composition-draft.md` | the draft composition model, as user-facing reference, with the seam diagnostics (S2…, S3…) |
| `docs/cave.md`, `docs/tiles.md`, `docs/glow.md` | the three dialect references, each with an example of that dialect alone |
| `docs/rules.md` | the task (the game *Glowworm Deep*), the hand-in, the rules R1–R12 and every code the checker prints |
| `trial-briefs.md` | the agents and models, how to set up their directories, the exact brief, and how to record the runs |
| `check.js` | the checker the rules name: a thin CLI over `checker/` |
| `checker/` | the checker's library: `stubs/` holds the stand-in `kit`, `cave`, `tiles` and `glow` a program imports; `handles.js` the part, output and parameter handles; `args.js` argument checks; `lambdas.js` reads lambdas and `lib/` helpers from source; `seams.js` the cross-part and task checks; `source.js` a line scan of the program file; `index.js` `checkDir` |
| `fixtures/valid/` | the passing fixture, *Spore Run*: a program shaped as rules.md's hand-in; the tests derive one failing fixture per code from it by a small edit |
| `test/` | the checker's tests (in `npm test`) |
| `runs/2026-11-24/` | the trial's record, one directory per agent (empty until the runs) |

## Usage

```sh
node scripts/compose-trial/check.js <dir>          # <dir> holds program.js and lib/*.js
node scripts/compose-trial/check.js <dir> --json   # the same result as one JSON object
COMPOSE_TRIAL_LOG=trial.jsonl node scripts/compose-trial/check.js <dir>   # also log the invocation
```

Each violation prints as `<file>:<line>: <code> <message>` and a `  fix:` line; rules.md lists the codes. Exit 0 means no violations, 1 violations, 2 a bad invocation, 4 a missing directory or `program.js`. With `COMPOSE_TRIAL_LOG` set, every invocation appends one JSON line: `time`, `dir`, `ok`, `diagnostics`, `files` (the text of every candidate file) and `loadError`.

## How it works

1. **Imports** are scanned first: `program.js` may import only `kit`, `cave`, `tiles`, `glow` and `./lib/` files (C003 otherwise, and nothing loads).
2. **The build.** A Node module hook (`module.registerHooks`) resolves the four bare names to `checker/stubs/`, and `program.js` runs unchanged. Each builder call records itself and checks its arguments (D001–D004). A part's binding is read from the line that creates it (`const level = cave(…)`; C002 if none). `part.out.x` returns an output handle: passing it to a connecting slot (`.map`, `.spawn`, `.over`, `.sample`) records a connection; coercing it, iterating it, reading a field of it, or passing it to a plain slot is a build-time read (S301, or S302 for a slot with no lambda form). A part used before it exists (`.seed(game.out.depth)` above `const game`) throws a TDZ `ReferenceError`, which is also S301. Reading `$.x` at build records a build-time parameter read. Runtime lambdas are never called.
3. **Lambdas** are read from `String(fn)` with `kit/parse`: `parseLambda` (P…), `checkSubset` (S1…), then a walk of the tree. Free names resolve against the program file's top-level declarations and imports (S331, S332); a member chain on a part binding must be `.out.<declared>` (S311, S312, S313); on a context parameter it must be a listed member (D005); a GPU lambda may read only scalar, vector and enum signals (S203) and has no `for…of` (D007). Frame tags (S251) come from a small inference: context members (`s.at`, `p.xy`, `self.pos`), declared fields, outputs and the `tile()` / `cell()` conversions carry a tag; arithmetic erases it. They are compared where a value lands unchanged: `distance()`, `==`/`===`, an assignment, an actor's `init` fields and an `.export()` value. Each diagnostic is placed at its line by finding the lambda's source in the file.
4. **`lib/` helpers** are read the same way, and may see only their arguments, intrinsics and other helpers.
5. **Cross-checks** run once the build is done: required calls (D003), map shape and values (S201, S202), seam types of connections (S203), spawn kinds (S204), player cardinality and unused actors (D006), output names (S311), sampling (S321).
6. **The task's seams** (G001–G005) are checked last, and only when the program loaded.

What it does not do: run the game, schedule anything, compile any kernel, check that a cycle settles, or read `// GAP:` comments and `REPORT.md`; those are read by hand.

## Running a trial

`trial-briefs.md` has the setup and the brief word for word. In short: give each agent a private directory holding copies of the five files in `docs/` and a `check.sh` that runs the checker with `COMPOSE_TRIAL_LOG` set; tell it to read nothing else in the repository, and to write `REPORT.md` with a shell heredoc if its Write is refused. Then review each hand-in by hand and write the findings as a dated doc in `project/`.
