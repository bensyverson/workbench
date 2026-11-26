# Seams relay trial

The checker for the dogfood trial of [the seams draft](../../project/2026-11-25-seams-draft.md) (M4, leaf `Qw03tp`): a relay in three blind sessions. A **maze author** adds output ports and frames to the maze package, knowing nothing of particles; a **particles author** adds an Event input that fires emitters through a `trigger` that is a `ref("in")`, and a value input read through `inputs: { object, name }`, knowing nothing of maze; a **composer** writes a glue program, `workbench.js`, with `kit/compose`, so a burst fires where the maze player picks up a coin. None of the draft is built in the kit yet, so this folder holds stand-ins for the draft's Dialect additions and for `kit/compose`, the checker over them, and a hand-made hand-in per role. It also holds the agent-facing packet and the launcher.

## What is here

| Path | What |
|---|---|
| `check.js` | the checker as a command: `node scripts/seams-trial/check.js <dir> --role maze\|particles\|compose [--json]`, a thin CLI over `checker/` |
| `checker/index.js` | `checkRole(dir, role)`: a package leg gets the [package trial's](../pkg-trial/README.md) checks with the stand-in as its `kit/define`, its D codes placed at lines, then its task; the compose leg checks both packages, runs the glue, checks the composition, then the task |
| `checker/seam.js` | the seam types: parser and canonical printer for the draft's grammar, pairing with a Dialect's local (IR) type, and the field-by-field comparison of two seams (S201–S204, S252, S255) that lists the tagged leaves a conversion needs |
| `checker/ports.js` | the Dialect additions judged: `ports`, `frames`, `edges`, `inputs` (D024–D030), and the inputs object's member types |
| `checker/port-lower.js` | what the seams need from one built Program: each output's value lambda lowered as a UI value lambda is and paired with its seam (D027), each `extent(record)` and `edges(record)` called and checked (D030) |
| `checker/define.js` | the `kit/define` stand-in, over the UI trial's: `defineDialect` strips and judges the additions and passes the rest to the real one; `defineGrammar` fills the `in` namespace, gives every builder its handles, and makes `lower(record)` judge the seams too (D031) |
| `checker/handles.js` | `.out.<port>`, `.in.<port>`, `.frame.<name>` on every builder of a chain; a handle read as a number or string records S301 |
| `checker/frames.js` | edges (`{ scale, offset }` per axis), composition, inverses, `"fit"`, and the frame graph that finds a path and refuses a second one that disagrees |
| `checker/compose.js` | the `kit/compose` stand-in: `compose(name).part().frame().wire().show()`, `.check()`, `.build()`, and the analysis behind them (every S code) |
| `checker/task.js` | the relay's task checks (G…) per role |
| `checker/hooks.js`, `stack.js`, `registry.js` | the module hooks that supply the stand-ins; the stack filter that hides the stand-in's frames from kit/define's call site; what the stand-ins learn as a hand-in loads |
| `checker/place.js` | where a seam problem found when a Program lowers belongs: the port's or frame's line in the Dialect file |
| `checker/glue-scan.js` | the glue's text, read before it runs: the imports it may not make (C006) and the handles it tests as values (S301) |
| `fixtures/valid/{maze,particles}/` | both packages with ports, by hand: maze 0.2.0 offers `picked` (`Event<{ at: point2@cell }>`), `player` (`point2@cell`, by a lambda) and `score`; particles 0.3.0 accepts `burst` (`Event<{ at: point2@px }>`) and `radius` (`f64@px`, default 40), and its `examples/07.js` triggers an emitter on `burst` and reads `inp.radius` |
| `fixtures/valid/compose/workbench.js` | the glue: `level.frame.cell` to `fx.frame.px` by `"fit"` (maze's box of cells is -0.5..9.5 by -0.5..7.5, as its cells are centered on whole numbers, so the plan is ×32 +[16, 48]), `level.out.picked` wired to `fx.in.burst`, `.show(fx)`. The compose hand-in is it beside copies of the two package fixtures; `fixture-copy.js` assembles one |
| `fixture-copy.js` | the tests' copies of a fixture: edited, then re-hashed with `scripts/pkg/hash.js`'s `hashDir` |
| `docs/seams.md` | the agent-facing form of the draft: seam types, ports, frames, the glue program, the S codes |
| `docs/rules.md`, `docs/task-{maze,particles,compose}.md` | the rules R1–R8 for every leg, and each leg's task and questions (`run.sh` copies one as `task.md`) |
| `brief.md` | the text each agent gets, after its `---` line |
| `run.sh` | `run.sh maze\|particles <dir> <model>`, or `run.sh compose <dir> <model> <maze-leg-dir> <particles-leg-dir>`: sets up one blind leg in a fresh directory outside the repo and `~/.claude` (the authors' legs start from `fixtures/valid` of [the package trial](../pkg-trial/README.md)), and runs `claude -p` there |
| `test/` | the checker's tests: the seam grammar, the frame math, one failing copy per D, S, G code (and C006, LOAD), the CLI |

`fixtures/` and `runs/` hold candidate code (it imports `kit/define`, which only the hooks supply), so they are excluded from `tsconfig.json` and kept out of `test/` ([project/gotchas.md](../../project/gotchas.md)).

## Usage

```sh
node scripts/seams-trial/check.js <pkg-dir> --role maze        # <pkg-dir> holds wb-package.json
node scripts/seams-trial/check.js <pkg-dir> --role particles
node scripts/seams-trial/check.js <dir> --role compose         # <dir> holds workbench.js, maze/ and particles/
node scripts/seams-trial/check.js <dir> --role compose --json  # the result as one JSON object
SEAMS_TRIAL_LOG=log.jsonl node scripts/seams-trial/check.js <dir> --role compose   # also log the invocation
```

Each violation prints as `<file>:<line>: <code> <message>`, then, for a wire or an edge, one line per side, then the fix, as the draft prints it:

```
workbench.js:41: S251 level.out.picked cannot feed fx.in.burst: the field 'at' is a point in maze.cell; burst takes a point in particles.px, and no frame path joins them
  from: level.out.picked  Event<{ at: point2@cell }>  (maze 0.2.0)
  to:   fx.in.burst       Event<{ at: point2@px }>    (particles 0.3.0)
  fix: write .frame(level.frame.cell, fx.frame.px, "fit"), or give the edge: .frame(level.frame.cell, fx.frame.px, { scale: …, offset: … })
```

A clean composition prints each wire with its conversion plan and the producer's record fields it drops (`wire level.out.picked → fx.in.burst: at: maze.cell → particles.px, point, ×32 +[16, 48]; drops value`); `--json` gives the same as `wires` (`convert`, `dropped`). A diagnostic carries whatever sides it has, as `from` and `to`: `{ part, dialect, version, port | frame, seam | dims }` for a wire or an edge, `{ part, dialect, version }` for S101's two parts, and for S111 the part's side with `has`, what it does have (printed `to:   fx.in.brust  has burst, radius  (particles 0.3.0)`); S102 carries the sides of the call's handles that are known. In the compose leg a package's files are reported under `maze/` or `particles/`. Exit 0 no violations, 1 violations, 2 bad invocation (no `--role`, or not one `<dir>`), 3 the checker itself failed, 4 the folder (or `workbench.js`, `maze/`, `particles/`) is missing. With `SEAMS_TRIAL_LOG` set, **every** invocation appends one JSON line: `time`, `dir`, `role`, `ok`, `diagnostics`, `files`, `wires` (compose), and `loadError` (the target error, `usage: …`, or `the checker failed: …`; null otherwise).

## How it works

**The Dialect additions.** The module hooks resolve `kit/define` to `checker/define.js`, which is the UI trial's stand-in (the real kit/define, with a `defineUI` that records its call) with two functions replaced. `defineDialect` takes `ports`, `frames`, `edges` and `inputs` off the declaration, judges them, adds the value inputs as members of the inputs object through `environment(program)` (the author declares the object empty and a global naming it, as for params), and hands the rest to the real `defineDialect`; the kit's refusal and the stand-in's are thrown as one `DefinitionError`. Outputs are judged against the Dialect's resolved run's state: a path must resolve (the UI's `resolvePath`) and its type pair with the seam; a value lambda keeps the UI value lambda rules (`checkLambda`, the same U007 rules, reported as D026). What a lambda gives needs a Program, so `lower(record)` lowers each output lambda as `kit/define/ui/lower.js` lowers a view lambda (`(s, $)`, no effects, `returns: "infer"`) and pairs the result with the seam (D027); it also calls each `extent(record)` and `edges(record)` (D030). A problem found there is the Dialect's, not the example's: it is reported once, with its own code (D027, D030, or the kit's L… for a lambda that does not lower), at the port's or frame's line in the Dialect file (`place.js`), and the example that exposed it is not also a K012. In the compose leg the same problems stop the part, at the same lines.

**`ref("in")`.** `defineGrammar` fills the Program's `in` namespace from `ports.in` when the root opens, so a `trigger: "brust"` is the kit's own B003 with a did-you-mean, at the author's line. The kit has no public way to fill a namespace from the Dialect (a construct's `names` checks only slot calls' refs, not an opening's), so the stand-in sets it on the kit's Program object; and because every builder the chain returns is wrapped (for the handles), a stack filter (`stack.js`) hides the stand-in's frames, as kit/define's own are hidden, so each diagnostic still points at the author's file.

**The glue.** For the compose leg the hooks also resolve `kit/compose` to `checker/compose.js`, and the bare `"maze"` and `"particles"` to each package's Grammar entry (as its manifest names it). The glue's default export is called with an empty, frozen `$` (a glue-level `$` is parked in the draft) and must return a composition; its module scope (the package trial's `scope.js`) is what each part's lambdas may read. `.check()` builds and lowers each part with its own Grammar, builds the frame graph (each part's frames as `<part>.<frame>`, its Dialect's own edges, then the glue's `.frame` calls in order; a second path that disagrees is S253), then judges each wire: the seams field by field (a record field the producer has and the consumer does not take is dropped on the wire and listed in the plan; a missing field or one of another kind is S202), and for each tagged leaf the path between its frames and a conversion by kind (a point by scale and offset, a vector by the scale, a quantity by the scale's magnitude, which must be the same on every axis; the record keeps a quantity's conversion as that one magnitude, `scale: [m], offset: [0]`). Two frames of different dims are never joined, so S251 between them says so instead of suggesting a `.frame`. An extent is the box a frame spans for a built Program, `{ min: [...], max: [...] }` per axis (maze's: `{ min: [-0.5, -0.5], max: [w - 0.5, h - 0.5] }`, since a cell's center is its whole-number coordinate), and `"fit"` maps a's box into b's with one scale, centered. A handle used in arithmetic or as a string is trapped at run time; one tested in a condition (`if`, `?:`, `!`, `&&`) is found in the glue's text (S301).

**The task.** Checked only when everything else is clean. Maze: an Event output whose record has a tagged point (G101, G102). Particles: an Event input, a Grammar option that is a `ref("in")`, a value input read in an example's lambda (G111–G113). Either: a package file names the other package (G103). Compose: one maze part and one particles part (G006), a wire from a maze Event output into a particles Event input that one of the part's emitters names through `ref("in")` (G001), an output whose name or note says pickup or goal (G002, a word list: pick, coin, collect, goal, exit, reach, finish, win, arriv), the burst's position converted through a `.frame` of the glue (G003), and `.show` of the particles part (G004). A package edited by the composer is its manifest's K006, repeated as G005. The glue may import only `kit/compose`, `kit/define`, `"maze"` and `"particles"` (C006). That is decided from its syntax tree before it runs (a static import or re-export of anything else, a package's other file by a bare path included; any dynamic import expression; a free `process` or `require`), and a glue with such an import is not loaded at all.

**What it does not do.** Run anything: no clocks, scheduling, delivery of events or values, revisions. No `Grid`, `Image`, `Mesh`, `Field` or `Ids`; no direct cross-part reads in lambdas; no glue lambdas. G005 sees only an edit the composer did not re-hash: a composer who runs `hash.js` after editing a package passes it (compare against the earlier legs' hand-ins by hand). The hand-in's files load in this process with your privileges: this is not a sandbox.

## Codes

D024–D031 are the stand-in's numbers for the draft's "definition error (D-code)" (kit/define uses D001–D023, D016 retired); kit/compose proper (leaf `wwG0JR`) may renumber them.

| Code | When |
|---|---|
| D024 | a malformed `ports` or `inputs` port: a key it does not take (with a did-you-mean), a missing `seam` or output `from`, no `note` on a tagged or Event port, a port name that is not an identifier |
| D025 | a seam type that does not parse, names an undeclared frame, or tags a point or vector with a frame of other dims |
| D026 | an output's `from` that is neither path nor lambda, a path that names nothing in the state, a lambda that breaks the UI value lambda rules, an Event output read by a lambda |
| D027 | a local type that does not pair with the seam: the state at `from`, what a lambda gives (when a Program lowers), or a point or vector input when the Dialect has no vector type of its dims, or several (then `type: "vec2"` says which) |
| D028 | a value input with neither `default` nor `required: true`, or both, or a default that does not fit; an Event input with either |
| D029 | value inputs and no `inputs`; an inputs object that is not declared or has members; no global of `inputs.name` naming it |
| D030 | a malformed frame (a key it does not take, dims not 1–3, no note, a non-function extent) or `edges`; when a Program lowers, an `extent(record)` that throws or is not `{ min, max }` (each `dims` numbers, max above min), or an `edges(record)` that throws or has the wrong shape |
| D031 | a Grammar with `ref("in")` and no `ports.in`, a `name("in")`, or a slot or child construct named `out`, `in` or `frame` |
| S101–S301 | the draft's table, as written, except S202: a producer's extra record field is dropped on the wire (listed in the plan), not refused; a missing field or one of another kind is still S202 |
| S102 | (added) a composition call given the wrong thing: `.part` of a non-builder or twice, a handle of a part not passed to `.part`, `.wire` of anything but an output then an input, `.frame` of anything but two frames, `.show` of a non-part or a second `.show`, a composition name that is not lowercase letters, digits and `-` |
| S257 | (added) a malformed edge (not `{ scale, offset }`, a scale of 0, the wrong number of axes), or `.frame` of two frames of one part or of different dims |
| G101–G113, G001–G006 | the task, above |
| C006 | the glue imports something it may not, or uses a dynamic import, `process` or `require` (read from its syntax tree; the glue is then not loaded) |
| LOAD | the glue does not load or its default export throws; or the composition throws while it is checked (a value the stand-in did not foresee), reported at the export rather than failing the checker |

K… (kit/package's), U… (defineUI's), B… and L… (the kit's builder and lowering) come through unchanged, with a part's prefixed by `part '<name>' (<dialect>)`.

## Running the trial

A relay is three legs: the maze and particles legs run in parallel, then the compose leg on their hand-ins. Copy each leg's directory to `runs/<date>/<relay>-<role>/` afterwards. G005 trusts the package hashes, so a composer who edits a package and re-hashes it passes it: when recording a compose leg, `diff -r` its `maze/` and `particles/` against the author legs' hand-ins.

Run 2026-11-25: three relays, nine legs, all clean ([the findings](../../project/2026-11-25-seams-relay-trial-findings.md)); records in `runs/2026-11-25/r{1,2,3}-{maze,particles,compose}/`. After that run, `docs/packaging.md` became this trial's own copy of the package trial's (its stale "No ports or seams" line replaced) and `seams.md` says how a glue program's bare names resolve.
