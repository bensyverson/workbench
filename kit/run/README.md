# kit/run: the scheduler

Runs a composed workbench: kit/compose's composed record, each part stepped by its package's runtime ([kit/define](../define/README.md)'s `defineRuntime`), on one workbench time. The spec is [the clocks draft](../../project/2026-11-25-clocks-draft.md) as ruled 2026-11-26, and [the build record draft](../../project/2026-11-26-build-record-draft.md) for rebuilds. No Node built-ins; it runs in the page. Drawing a composed page is not here (leaf `FqsPVJ`).

```js
import { createRun, createDriver, replay } from "kit/run";

const composed = composition.build({ packages, runtimes });          // S116 refuses an overflowing reliable queue
const run = createRun(composed, { runtimes, packages, seed: 1, inputs: [
  { kind: "control", T: 2.25, part: "level", name: "pad", value: { right: true } },  // a scripted D-pad
] });
run.runUntil(3);                     // headless: as fast as it can; frame parts at a nominal 60 Hz
run.state("fx");                     // a part's state now
replay(composed, { runtimes, packages }, run.record()).ok;           // same log, same hashes: true

const live = createRun(composed, { runtimes, frames: "display" });
const driver = createDriver(live);   // the page calls driver.frame(wallSeconds) once per display frame
```

## API

| Export | Does |
|---|---|
| `createRun(composed, options)` | compiles, clocks, keys and inits every part; throws `RunError` with R006 (a clock that is not one) or S116 (an overflowing reliable queue), and a plain Error for a part with no runtime |
| `run.step()` | runs the next instant: `{ T: "19/8", stepped: ["level", "fx"] }`, or null when no part has a clock |
| `run.runUntil(t)` | runs every instant at or before `t` (seconds, or a rational `{ n, d }`), then applies the inputs stamped by `t` |
| `run.input(entry)` | adds an outside input, stamped with `entry.T` or the next instant; a stamp at or before the last instant run throws |
| `run.state(part)`, `run.snapshot(part)` | a part's state (null if its init failed); `{ state, revision, T }`, T the instant it was committed (null: init's) |
| `run.T`, `run.seconds` | the time the run has reached |
| `run.revision`, `run.key(part)`, `run.compositionKey` | the composition's revision (bumps when a part's does); a part's content key; the composition's ([kit/build](../build/README.md)) |
| `run.log` | `{ header: { name, seed, frames, catchUp, params }, inputs }`: the input log as data, each `T` as rational text |
| `run.record()` | `{ log, hashes, builds }`: what `replay` compares |
| `run.hashes` | one `{ T, hash, parts: { name: hash } }` per instant (a fast hash of each state, not a content key) |
| `run.builds`, `run.diagnostics` | the build events ([kit/build](../build/README.md)); every R diagnostic, `{ code, severity, message, part?, T, revision? }` |
| `run.stats()` | `{ dropped: { "<wire>": n }, slowdowns: [{ from, to, wall, workbench, ratio }] }` |
| `run.rewind(t)`, `run.checkpoints` | back to `t` from the nearest checkpoint, replaying forward; inputs stamped after `t` are dropped (a rewind is a branch) |
| `createDriver(run, { catchUp? })` | the real-time driver: `frame(wallSeconds)`, `pause()`, `resume()`, `step()`, `paused` |
| `replay(composed, options, record)` | runs the record's log again: `{ ok, diagnostics, run }`, R005 at the first instant whose state hash differs (naming the parts), or when the build events differ |
| `carry(value, wire)`, `slowdowns(entries)`, `RUN_CODES`, `RunError`, `INPUT_KINDS` | |

**Options.** `runtimes` (matched to parts by Dialect name; required), `packages` (`[{ name, content }]`: each package's content key from kit/package, for the parts' keys), `params` (`{ part: { name: value } }`, else each param's declared value), `inputs` (an input log), `seed` (0), `dev` (true), `frames` (`"nominal"`, or `"display"` under the real-time driver), `catchUp` (seconds, default 1/15), `checkpointEvery` (seconds, default 1), `build(part, params)` (the host's rebuild of a part whose build-time param changed: it runs the part's Program again and returns the record).

## What a step is handed

`init(record, ctx)` and `step(state, ctx)` are the package's ([kit/define](../define/README.md#runtimes-defineruntime)). `ctx` is:

| Key | What |
|---|---|
| `part`, `revision`, `record` | the part's name (its identity), its revision, its built record (read-only) |
| `T`, `dt` | the instant in seconds, and the step's length: a tick part's period, a frame part's time since its last frame (0 at its first), 0 for a demand part |
| `inputs` | each value input, converted (a default when unwired); each Event input's records since the part's last step, converted, in order; `$rev` the revision of the producer snapshot each input read (null unwired) |
| `controls` | the outside inputs addressed to the part (`{ pad: { right: true } }`), each the latest value at or before T |
| `kernels` | the Program's compiled lambdas by id, `<instance>.<slot>`: the root instance is the part, so `kernels[\`${part}.control\`]`, an emitter's `kernels["pop.spawn"]` |
| `rng` | the part's seeded stream: `rng()` in [0, 1) |
| `events` | an empty list per Event output (step only): push records into `ctx.events.picked` |
| `globals` | what the Kernels' global names read in this step: `$` (the params), the inputs object (the value inputs); set any other the Dialect declares before calling a Kernel that reads it (an Event record's name, `ctx.globals.ev = record`; particles' `counters`) |
| `params` | the params, as `$` |

## Invariants

- **One workbench time, exact.** Instants are rationals: a tick part's are multiples of its period, so 1/8 and 1/30 meet exactly at 1/2. Headless frame parts step at multiples of 1/60; under the driver at the logged frames. Demand parts make no instants of their own.
- **Wire order within an instant.** The parts due step producer before consumer along undelayed wires; ties go by `.part` order. A consumer reads each value input from its producer's latest snapshot, so a same-instant producer has already committed. A delayed wire reads the snapshot as the instant began, and takes only Events stamped before it. kit/compose refuses an undelayed cycle (S115).
- **Events exactly once, in order.** Each Event wire keeps a queue of records stamped with T. A step takes every record ready for it, in stamp order, then push order. A reliable wire's bound was checked at composition (S116); a `{ keepLast: n }` input keeps the newest n, and its drops are counted in `stats().dropped` and noted once per wire as R001.
- **Crossing a wire:** the rename first (a conversion names the consumer's field), then the producer's fields the consumer does not take are dropped, then each tagged leaf converts: a point by scale and offset, a vector by scale, a quantity by its one magnitude.
- **A demand part** steps at the first instant, after a rebuild, when an Event is ready for it, or when a value input's converted value differs from what it last read.
- **Steps are checked.** After every step the state is checked with the Dialect's `checkState` and the Event counts against the runtime's maxes (R002). In a development run (the default) every state is frozen, and each step runs twice on the same state and inputs, which must agree (R003: a module-level variable, `Math.random`, a clock). A throw is R004. Any of these stops the part; the others run on with its last snapshot.
- **A run is a pure function** of the composed record, the params and the input log. Inputs (`control`, `param`, `rebuild`, `frame`) apply at the first instant at or after their stamp, in log order. Replay compares every instant's state hashes (R005).
- **Rebuilds land between instants.** A `rebuild` input carries the new record (a glue edit or package swap the host built; `package: { content }` for a new package key, `trigger` for the event); a `param` input whose param build-time code read (`record.reads`) calls `options.build`. The revision bumps only when the part's content key changes; init then runs again on the new record, and the Event queues are kept. A rebuild that fails to lower keeps the previous revision running. Each writes a build event ([kit/build](../build/README.md)).
- **Real time slows instead of dropping.** The driver advances T by each display frame's wall time, at most `catchUp` per frame (frames kept to the millisecond, merged below 1/240 s). Each frame is logged, a capped one with its wall time, so replay steps frame parts at the same T. A run of capped frames ends with an R001: "ran at 0.13× for 2 s of wall time".
- **Checkpoints** every `checkpointEvery` seconds of T hold every part's state (shared, since state is immutable), stream, build and queues; rewind restores the nearest and replays.

## Codes

| Code | When |
|---|---|
| R001 | the run fell behind wall time and T slowed (a warning, with how long and how much); an input's `keepLast` dropped records (counted) |
| R002 | a step returned a state that does not fit the Dialect's `state` (the paths), or pushed more Events than its runtime declares; also an init's state |
| R003 | in a development run, a step changed the state it was handed, or kept memory outside it |
| R004 | a step or init threw (also a part whose lowering throws) |
| R005 | a replay diverged: a state hash differs at an instant, or the build events differ |
| R006 | a runtime's `clock(record)` is not one (refused at `createRun`; in a rebuild, the build event fails) |

> **R collides.** kit/lir already reports R001–R006 (the shader backend's refusals), and particles packages use R001–R010 as their own check codes. The run's codes are the clocks draft's, as ruled; renaming one family is open (leaf `ZH4KWX`'s notes).

## Not built

Sampling modes and `lerp` (latest only), Workers, a content-keyed cache, the human-facing `why` text (its data is in each build event), swapping a package's runtime code in a rebuild (a rebuild changes the record and the package key, with the runtime it started with), re-sizing queues after a rebuild changes a clock, a workbench of demand parts only (nothing makes an instant).
