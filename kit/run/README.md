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
| `createRun(composed, options)` | compiles, clocks, keys and inits every part; throws `RunError` with N006 (a clock that is not one) or S116 (an overflowing reliable queue), and a plain Error for a part with no runtime |
| `run.step()` | runs the next instant: `{ T: "19/8", stepped: ["level", "fx"] }`, after applying the inputs stamped before it, each at its stamp. When no part is due, it applies the log's inputs a stamp at a time until one restarts a part, and runs that part's first instant; when none does, it has applied the whole log, `run.T` is the last stamp, and it returns null (an input stamped before that stamp then throws, naming it) |
| `run.runUntil(t)` | runs every instant at or before `t` (seconds, or a rational `{ n, d }`) and applies every input stamped by `t`, each at its own stamp, so the run is the same however it is chunked, and as in a replay. In a display run whose frame part waits on a frame not yet logged, an input waits for that frame, which may come first. A display run first logs frames up to `t` on the nominal grid from the last frame (see Run control) |
| `run.advance(t)` | `runUntil` from the log alone, logging no frames: what `replay` runs |
| `run.nextInstant()` | the next instant a part is due at, as a rational, not run; null when none is |
| `run.input(entry)` | adds an outside input, stamped with `entry.T` or the next instant (when none is due yet, as in a display run of frame parts waiting on its next frame: `run.T`, or the first millisecond after it when `run.T` is the last instant run); a stamp at or before the last instant run throws, and one at or before `run.T` applies at once, as `runUntil(run.T)` would |
| `run.state(part)`, `run.snapshot(part)` | a part's state (null if its init failed); `{ state, revision, T }`, T the instant it was committed (null: init's) |
| `run.T`, `run.seconds` | the time the run has reached |
| `run.catchUp`, `run.lastFrame`, `run.framed` | the catch-up cap (a rational); the last frame at or before `run.T` (a display run starts at a frame at T = 0); whether a running part steps on frames (what the driver reads) |
| `run.revision`, `run.key(part)`, `run.compositionKey` | the composition's revision (bumps when a part's does); a part's content key; the composition's ([kit/build](../build/README.md)) |
| `run.log` | `{ header: { name, seed, frames, catchUp, params }, inputs }`: the input log as data, each `T` as rational text |
| `run.record()` | `{ log, hashes, builds, T }`: what `replay` compares, and the T the run reached (a replay runs to it, so it applies the inputs the run applied after its last instant) |
| `run.hashes` | one `{ T, hash, parts: { name: hash } }` per instant (a fast hash of each state, not a content key) |
| `run.builds`, `run.diagnostics` | the build events ([kit/build](../build/README.md)); every N diagnostic, `{ code, severity, message, part?, T, revision? }` |
| `run.stats()` | `{ dropped: { "<wire>": n }, stopped: { "<wire>": n }, slowdowns: [{ from, to, wall, workbench, ratio }] }`: records a `keepLast` input dropped; records sent to a stopped part, dropped |
| `run.rewind(t)`, `run.checkpoints` | back to `t` from the nearest checkpoint, replaying forward; inputs stamped after `t` are dropped (a rewind is a branch) |
| `createDriver(run)` | the real-time driver: `frame(wallSeconds)`, `pause()`, `resume()`, `step()`, `paused`; its cap is the run's `catchUp` (passing the driver its own throws) |
| `replay(composed, options, record)` | runs the record's log again: `{ ok, diagnostics, run }`, N005 at the first instant whose state hash differs (naming the parts), or when the build events differ |
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
| `kernels` | the Program's compiled lambdas by id, `<instance>.<slot>` (an emitter's `kernels["pop.spawn"]`), and the part's own (the root instance is the part) by slot name too: `kernels.control` is `kernels[\`${part}.control\`]`; the aliases are not enumerable, so `Object.keys` lists ids |
| `rng` | the part's seeded stream: `rng()` in [0, 1) |
| `events` | an empty list per Event output (step only): push records into `ctx.events.picked` |
| `globals` | what the Kernels' global names read in this step: `$` (the params), the inputs object (the value inputs); set any other the Dialect declares before calling a Kernel that reads it (an Event record's name, `ctx.globals.ev = record`; particles' `counters`) |
| `params` | the params, as `$` |

## Invariants

- **One workbench time, exact.** Instants are rationals: a tick part's are multiples of its period, so 1/8 and 1/30 meet exactly at 1/2. Headless frame parts step at multiples of 1/60; under the driver at the logged frames. Demand parts make no instants of their own.
- **Wire order within an instant.** The parts due step producer before consumer along undelayed wires; ties go by `.part` order. A consumer reads each value input from its producer's latest snapshot, so a same-instant producer has already committed. A delayed wire reads the snapshot as the instant began, and takes only Events stamped before it. kit/compose refuses an undelayed cycle (S115).
- **Events exactly once, in order.** Each Event wire keeps a queue of records stamped with T. A step takes every record ready for it, in stamp order, then push order. A reliable wire's bound was checked at composition (S116); a `{ keepLast: n }` input keeps the newest n, and its drops are counted in `stats().dropped` and noted once per wire as N001. **A stopped part takes no Events** (Ben, 2026-11-26): the records waiting for it when it stops, and those sent to it while it is stopped, are dropped, counted in `stats().stopped` and noted as N001 (a warning) once per wire for each stop: a restart clears the note (ruling R3); "reliable" promises delivery to a running part. A record handed to the step that stopped it was delivered. A step that would take more records from an Event input than its runtime declares (a hand-written display log whose frames are farther apart than the cap, say) is refused: the part stops with N002 and none are taken.
- **Crossing a wire:** the rename first (a record's fields, or each item's in a list of records; a conversion and a dropped path name the consumer's field), then the producer's fields the consumer does not take are dropped by path (`keep`, `inner.x`, `pts[].x`, a list's `[].k`), then each tagged leaf converts: a point by scale and offset (a `point1` is one number), a vector by scale, a quantity by its one magnitude.
- **A demand part** steps at the first instant, after a rebuild, when an Event is ready for it, or when a value input's converted value differs from what it last read.
- **Steps are checked.** After init and every step the state is checked with the Dialect's `checkState(state, record)`, against the part's Program's state (the Dialect's, with the fields the Program declares added to its extensible struct; [kit/define](../define/README.md), "Per-Program state"), and the Event counts against the runtime's maxes, pushed and taken (N002). A field in the extensible struct that the Program does not declare is N003 in every run: the step kept memory outside its state (the message lists any other misfit of the same state beside it). In a development run (the default) every state is frozen, and each step runs twice on the same state and inputs, which must agree (N003: a module-level variable, `Math.random`, a clock). A throw is N004. Any of these stops the part; the others run on with its last snapshot.
- **A run is a pure function** of the composed record, the params and the input log. Inputs (`control`, `param`, `rebuild`, `frame`) take effect at their own stamps, in log order, so a part reads them at its first step at or after the stamp. Replay compares every instant's state hashes (N005).
- **Rebuilds land between instants.** A `rebuild` input carries the new record (a glue edit or package swap the host built; `package: { content }` for a new package key, `trigger` for the event); a `param` input whose param build-time code read (`record.reads`) calls `options.build`. The revision bumps only when the part's content key changes; init then runs again on the new record, and the Event queues are kept (a part a rebuild restarts has none: they were dropped while it was stopped). A rebuild that fails (it does not lower, its clock does not read, or its init throws or returns a state that does not fit) keeps the previous revision running: init runs on a trial copy, and the build event is not ok and carries the diagnostics. **A rebuild takes effect at its own stamp** (ruling R2, 2026-11-26), and its boundary names the last instant run and that stamp: a part it restarts, or whose clock it changes, has its first instant at the first on its clock at or after the stamp, whatever other parts are in the composition (with a 1 s ticker beside it, a 1/8 s part restarted at 1.01 steps at 9/8). No instant runs before an input already applied, and the run is the same however `runUntil` is chunked and in a replay. Each writes a build event ([kit/build](../build/README.md)).
- **Real time slows instead of dropping.** The driver advances T by each display frame's wall time, and no logged frame covers more than the run's `catchUp` since the frame before it: the window S116 sized the queues for. A display run starts at a frame at T = 0 (as a headless one does), so the first frame's window is half-open too. The driver's frames are kept to the millisecond (a capped one lands exactly on the cap; runUntil's lie on the nominal grid, below), and one closer than 1/240 s to the last frame is merged into the next, whose cap still counts from the last logged frame. Each frame is logged, a capped one with its wall time, so replay steps frame parts at the same T. A run of capped frames is one N001, written at its first capped frame and rewritten at each one after ("has run at 0.13× for 30 s of wall time …, and has not caught up"), so a run that never catches up still says so; the first frame that is not capped closes it ("ran at 0.13× for 2 s of wall time"). A rewind keeps it as it stood then.
- **Run control.** `driver.step()` runs the next instant, paused or not; when a part steps on frames, a step goes at most one nominal frame (1/60 s) past the last frame (when T already stands that far past it, as after a rewind between capped frames, to the cap past the last frame instead) and logs a frame when it gets there, so frame parts advance while paused and the window holds. Anything else that moves T resets the driver's place. `runUntil` on a display run logs frames up to its target on the nominal grid from the last frame (last + k/60 at or before the target; none at a target off the grid: ruling R1), whether or not a frame part runs, as the driver logs every display frame. When T stands past the last frame (after a rewind), the first is never past the catch-up cap from it: if the next grid point is, the first frame is the cap, and the grid goes on from there. So chunking changes nothing (except where a hand-written log already holds frames ahead of T: the grid starts from the last of them at or before the target, so where runUntil is cut decides which), frame parts step through a skip ahead as they would headless, a part restarted mid-run steps within the cap, and the driver's next frame counts from the run's T. When T moved without frames (`advance` from the log alone), the driver's window counts from T, so no frame is capped that wall time did not slow. A rewind logs none: its next frame counts from the last frame at or before T, which is within the cap of it. A frame costs the same at any length of run: frames are found by binary search.
- **Checkpoints** every `checkpointEvery` seconds of T hold every part's state (shared, since state is immutable), stream, build and queues; rewind restores the nearest and replays.

## Codes

N is kit/run's letter, reserved in kit/define (a Dialect's own codes may not use it). The clocks draft named these R001–R006; Ben ruled them N on 2026-11-26 (leaf `p3OBui`), since kit/lir reports R001–R006 and the particles packages use R as their own letter.

| Code | When |
|---|---|
| N001 | the run fell behind wall time and T slowed (a warning, with how long and how much, while it lasts and when it ends); an input's `keepLast` dropped records (counted); records sent to a stopped part were dropped (counted in `stats().stopped`) |
| N002 | a step returned a state that does not fit the Dialect's `state` (the paths), pushed more Events than its runtime declares, or would take more than it declares from an Event input; also an init's state |
| N003 | a step or init kept memory outside its state: a field in the extensible struct the Program does not declare (any run), or, in a development run, a step that changed the state it was handed or gave another result the second time |
| N004 | a step or init threw (also a part whose lowering throws) |
| N005 | a replay diverged: a state hash differs at an instant, or the build events differ |
| N006 | a runtime's `clock(record)` is not one (refused at `createRun`; in a rebuild, the build event fails) |

## Not built

Sampling modes and `lerp` (latest only), Workers, a content-keyed cache, the human-facing `why` text (its data is in each build event), swapping a package's runtime code in a rebuild (a rebuild changes the record and the package key, with the runtime it started with), re-sizing queues after a rebuild changes a clock (the run-time intake check, N002, still refuses a step past its max), a workbench of demand parts only (nothing makes an instant), a bound on what a long run keeps (the input log, the per-instant hashes and the checkpoints grow with it; a replay and a rewind read them).
