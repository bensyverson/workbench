# Draft: clocks, the runtime contract and the snapshot scheduler

*2026-11-25, leaf `IBo0RD` (under `f2dMku`, M4 Composition, `SPPLaM`). A design draft for Ben, written while he was away; ruled 2026-11-26 (the rulings block below). Inputs:*
- *[the architecture synthesis](2026-11-24-architecture-synthesis.md) §3.5 (Time) and §3.8 (replay);*
- *[the composition trial](2026-11-24-composition-trial.md) (the double descent, `lerp` across a reload);*
- *[the seams draft](2026-11-25-seams-draft.md) ("What the host must do") and [the relay trial](2026-11-25-seams-relay-trial-findings.md), whose three composers asked the questions this answers, and whose authors described their hosts in prose because there was nowhere else.*

*The build record (identity, revision, content key: `HKNInI`) is a separate leaf. This draft says only what it needs from it.*

> **Ruled 2026-11-26 (Ben, leaf `ETSYfC`).** This draft is now the build's spec (`ZH4KWX`), with these rulings:
> - **Questions 1, 3, 5, 6 and 7: as recommended.**
> - **Question 2, same-instant wire order: as recommended, but a cycle no longer breaks by glue order.** Breaking it "at the wire the glue added last" would let a harmless-looking reorder of two `.wire` lines change behavior silently. A cycle of wires is now an S error naming the loop, unless one wire in it is marked `{ delay: true }`; that wire's consumer reads the previous instant's snapshot. Simulink's algebraic loops and Lustre's `pre` work the same way.
> - **Question 4 is replaced: reliable by default, checked at composition; overload slows time and never drops Events.** "Exactly once" and "drop the oldest" contradicted each other, and dropping Events doesn't help performance anyway. Queues live in workbench time, which is deterministic, so a queue's length depends only on rates and per-step maximums, never on the machine. Each pressure gets its own fix:
>   - *Queues: sized at composition, as in synchronous dataflow.* A `tick → tick` wire's bound follows from the two rational periods and the producer's per-step max. A `demand` consumer is woken by the Event, so its bound is the producer's max. A `frame` consumer's bound follows from the catch-up cap below. A reliable wire whose bound exceeds the consumer's list max is an S error naming both sides. It offers two fixes: raise the max, or opt into `{ keepLast: n }`.
>   - *Delivery policy per input, as in ROS 2 / DDS:* `"reliable"` (the default for Events) or `{ keepLast: n }`, lossy by the consumer's choice and counted in the run record.
>   - *Wall time: a capped fixed-timestep loop.* The page runs at most K steps per display frame. When a machine can't keep up, `T` falls behind wall time (slow motion) and no Event is lost. The capped frames are in the input log, so replay matches.
>   - R001 changes meaning: a run statistic ("ran at 0.8× for 2 s"), not "records dropped".
> - **A stopped part takes no Events (Ben, 2026-11-26, from reviewer-run-2's review of `acc5434`; leaf `4WMA0R`).** Records sent to a part while it is stopped (its init or step failed) are not queued: they are dropped and counted, and the count is reported as a run statistic, as N001 is. A rebuild that restarts the part starts it with empty queues. "Reliable" promises delivery to a running part. Keeping the backlog would have the restarted part refuse it at once (N002) or take stale Events late, with a queue that grows without bound while the part is stopped.

## The problem in one paragraph

No Dialect of ours has a runtime. maze's and particles' hosts exist only as comments. So every relay author wrote host duties in prose that nothing checks, such as "refill `picked` each step" and "place a triggered particle at `at`". Every composer then asked the same questions:
- When does a burst play relative to its pickup?
- Is each record delivered exactly once when the two parts step at different rates?
- Which part steps first when both are due?
- What do pause, rewind and a headless run do?

The answer has to be **one contract the kit owns**. A package supplies a small runtime module, two functions over its own state, and the kit's scheduler does everything between parts. Then a package's prose shrinks to what is truly its own: what a record *means* to it.

## The runtime module

A package gains one optional entry, `runtime`: a module that calls `defineRuntime` from `kit/define`.

```js
// maze/maze.runtime.js
import { defineRuntime } from "kit/define";
import { maze } from "./maze.grammar.js";

export const mazeRuntime = defineRuntime(maze, {
  clock: (record) => ({ tick: record.tick ?? 1 / 8 }),        // seconds per step, from the built Program
  init(record, { kernels }) {                                  // the run's first state
    return { t: 0, score: 0, coinsLeft: countCoins(record.grid), player: { at: [record.start.x, record.start.y] }, picked: [], grid: record.grid };
  },
  step(state, { dt, kernels, inputs, pad, events }) {          // one step: the state after it
    const pl = { x: state.player.at[0], y: state.player.at[1], dx: 0, dy: 0, steps: 0 };
    kernels.control(pl, pad);                                   // the Program's own lambda, compiled
    // … walk, pick coins …
    for (const at of pickedNow) events.picked.push({ at });     // an Event output is written here, not kept in state
    return { ...state, t: state.t + dt, player: { at: [x, y] } };
  },
});
```

- **`init` and `step` are plain JavaScript**, trusted like a package's foreign modules. They are not lowered. They call the Program's Runtime Lambdas through `kernels`, each compiled by the kit for its target.
- **`step` returns the next state** and must not keep any other memory: no module-level variables, no `Math.random`, no clock. The kit checks the state with `checkState` after every step. A step that changes the state it was handed is refused in development runs, because the kit freezes it.
- **Event outputs are written to `events`, not to state.** The kit gives `step` an empty list per Event output (`events.picked`) and collects what is pushed into it. This replaces the seams draft's rule that "the host refills a state list each step". That rule was the one host duty every maze author had to describe, and it goes away. The seams draft's `from: "picked"` for an Event output becomes `from: "events.picked"`, or simply nothing (question 3).
- **Event inputs arrive in `inputs`**, as each step's list of records, already converted into this part's frames. Value inputs arrive there too, and in lambdas as `inp.*`, as the seams draft says.
- **Randomness** comes from `ctx.rng`, a seeded stream per part that the kit owns, so replay is exact.
- **The run's `text(state)` and the UI read the state `step` returned**, as they do today.

A package with no runtime still loads, checks and lowers as today. It just cannot be run or composed.

## Clocks

`clock(record)` returns one of:

| Clock | Steps | `dt` | For |
|---|---|---|---|
| `{ tick: s }` | every `s` seconds of workbench time | `s` | games, simulations (maze `1/8`, particles `1/30`) |
| `{ frame: true }` | once per display frame | the frame's length | a shader, a drawing that only follows others |
| `{ demand: true }` | when one of its inputs changed since its last step, or it was rebuilt | 0 | a generator (a cave from a seed), a data table |

The clock is the **Dialect's** to declare and the Program's to parameterize (a Grammar's `tick` slot), never the composer's. That matches the composition trial, where no agent needed `.clock()`.

## The scheduler

One kit scheduler runs every part of a workbench on one **workbench time** `T`, in seconds, starting at 0.

1. **Instants.** The scheduler finds the next instant at which any part is due: a `tick` part every `s`, a `frame` part at each display frame, and a `demand` part right after anything it reads has changed. A `tick` part's instants are exact multiples of `s` in rational arithmetic, so `1/8` and `1/30` meet exactly every half second, with no drift.
2. **Order within an instant.** The parts due at one instant step in **wire order**: a producer before its consumers (a topological sort of the wires). Ties go by `.part` order. A cycle of wires is broken at the wire the glue added last, and that consumer reads the previous instant's snapshot: the one-step delay the synthesis describes, now at a stated place.
   > **Ruled 2026-11-26:** a cycle is an S error unless one of its wires is marked `{ delay: true }`; glue order does not break it (rulings block, top).
3. **Commit.** After a part steps, its outputs are read from the new state and its Events are stamped with `T`. That is the part's **snapshot**. Nobody ever sees a part halfway through a step.
4. **Reads.** A consumer stepping at `T` reads each value input from its producer's latest snapshot at or before `T`. Wire order means a same-instant producer has already committed. So a burst wired from a pickup plays **at the same instant** as the pickup, with no extra delay, unless the wire closes a cycle.
5. **Events are delivered exactly once, in order.** Each wire keeps a queue. A consumer's step takes every record stamped at or before its `T` that it has not yet taken, in stamp order, and then the order the producer pushed them. A fast consumer gets each record once; a slow consumer gets several producer steps' records together, still in order. The queue is bounded by the consumer's input list max (`Event<R>` pairs with a list of max `n`). Past that, the oldest records are dropped and counted, and the run record says how many (R001, below).
   > **Ruled 2026-11-26:** no drop-oldest. A reliable wire's bound is checked at composition, a `{ keepLast: n }` input drops by its own choice, and overload slows `T` instead (rulings block, top).
6. **Conversions** (`wires[i].convert` from the seams draft) are applied as records and values cross.

So the composers' questions have answers:
- A pickup at the maze step at `T = 2.375` (19/8) bursts at the particles' first step at or after 2.375. Particles step every 1/30 s, so that is `T = 2.4`, 25 ms later.
- If the particles part were a `frame` part, the burst would play on the next display frame.
- Both parts due at once: maze first, because it is the producer.

## Run control and replay

**A run is a pure function** of the composed record, the params, and the **input log**: every outside event, such as a D-pad press, stamped with `T` when it happens. The kit records the log as the run goes.

- **Pause** stops advancing `T`. **Step** advances it to the next instant.
- **Headless** runs (a sweep, a test, an agent's lab call) advance `T` as fast as they can, with `frame` parts stepped at a nominal 60 Hz. Same record, params and log, same states: the synthesis's replay law, now checkable. The harness can run a workbench twice and compare state hashes per instant.
- **Rewind** to `T` replays from 0, or from the nearest checkpoint. The scheduler snapshots every part's state every N seconds. That is cheap, since state is plain data.
- **Real time.** The page advances `T` by wall time, capped per frame, so a stalled tab does not try to catch up a minute of steps. A capped frame is recorded in the input log, so replay matches.

## Rebuilds and revisions (with `HKNInI`)

A param read at build time, or a new package version, rebuilds a part. That is the composition trial's double descent. The rule:

- **A rebuild happens between instants, never inside one.** The part's `init` runs again on the new record, and its snapshot gets a new **revision**. Its Event queues are kept, because what happened still happened.
- **A consumer sees the revision.** `inputs.$rev` gives, for each input, the revision of the snapshot read. A value read across a revision change is not interpolated (the `lerp` problem). Interpolation is not in v0 anyway (question 5).
- **The double descent goes away** for the reason the trial wanted. The game raises `depth` at instant `n`. The cave, a `demand` part, rebuilds before instant `n + 1`. At `n + 1` the game reads the new revision, and the exit it is standing on is gone.

What a revision *is* (an identity, a counter, a content key) and how the build record explains it is `HKNInI`'s.

## What a package's author now writes

- **maze:**
  - `maze.runtime.js`, with `init` and `step`, and the clock from the `tick` slot.
  - Its Event `picked` is pushed in `step`.
  - The prose about refilling state lists is gone.
- **particles:**
  - `particles.runtime.js`.
  - `step` reads `inputs.burst` and spawns each triggered emitter's particles at `at`.
  - The seams draft's question 9 (Event records reaching lambdas) then means `step` passes the record to `kernels.spawn` as an argument the convention declares.
- **The manifest:** `entry.runtime` names the module. kit/package checks that it exports exactly one runtime, built on the package's Grammar (as K008 does for the UI).

## Diagnostics

R is a new letter for run-time diagnostics, which no current code uses (B C D L P S U V are taken). Each carries the part, the instant `T`, and the revision.

> **Corrected 2026-11-26 (Ben's ruling, leaf `p3OBui`):** R was not free. kit/lir already reports R001–R006 (the GLSL backend's refusals), and the particles packages use R as their own Dialect letter. The run's codes below are now **N001–N006** (same numbers, same meanings), and N is reserved in kit/define's `RESERVED_LETTERS`. The table keeps the draft's R spelling as written.

| Code | When |
|---|---|
| R001 | ~~an Event queue overflowed; records were dropped~~ ruled 2026-11-26: the run fell behind wall time and `T` slowed (how long, how much); a `keepLast` input's drops are counted here too |
| R002 | `step` returned a state that does not fit the Dialect's `state` (the `checkState` paths) |
| R003 | `step` changed the state it was handed, or kept memory outside it (a development-run check) |
| R004 | `step` or `init` threw: the part stops, and the others run on with its last snapshot |
| R005 | a replay diverged from its record (a state hash differs at an instant): something is not deterministic |

## Parked

- **`lerp` and other sampling modes.** No relay composer needed one, and a cell-jumping maze has nothing to interpolate. Un-park when a `frame` part follows a `tick` part's moving value and it looks wrong.
- **Workers.** Snapshots cross a Worker boundary unchanged, which the design keeps possible, but v0 runs every part on the main thread.
- **A runtime lowered as Kernels.** `step` is trusted JS. A runtime the kit could analyze is the backlog's "Native slot" question, inverted.

## Questions for Ben

1. **A runtime module per package**, plain trusted JS with `init` and `step` over its own state, calling the Program's compiled lambdas through `kernels`. Recommended: the smallest thing that makes a package runnable, and the relay showed the prose it replaces.
2. **One workbench time, rational tick instants, and wire order within an instant**, so a same-instant consumer sees its producer's new snapshot and only a cycle costs a step. Recommended. The alternative, every consumer one step behind, is simpler to explain but makes every burst late.
3. **Event outputs are pushed in `step`, not kept in state.** This changes the seams draft: an Event port then has no `from`. Recommended. It removes the one host duty all three maze authors had to describe.
4. **Exactly-once, in-order delivery with a bounded queue that drops the oldest** and reports R001. Recommended. The alternative, refusing to run, punishes a burst of pickups the author could not bound.
5. **No sampling modes in v0**, `latest` only. Recommended; parked above.
6. **Replay is a promise:** seeded `rng` per part, an input log, and R005 when a replay diverges. Recommended. Synthesis §3.8 called it cheap now and expensive to retrofit.
7. **A rebuild lands between instants** and bumps the part's revision, which consumers can see. Recommended; the revision's identity is `HKNInI`'s.

## Next

If Ben agrees, the dogfood pass is a small runtime trial: two fresh agents each write `maze.runtime.js` and `particles.runtime.js` from this contract and the relay's hand-ins, and a third runs the composed workbench headless and reports the burst instants. That run is also `IhJ35P`'s first playable composition, once the composed page (`FqsPVJ`) exists.
