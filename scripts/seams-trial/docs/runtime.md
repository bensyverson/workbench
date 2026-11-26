# Runtimes: how a package runs

*A package that runs, alone or composed with others, has a **runtime module**: plain JavaScript over the run's `state` your Dialect declares. The kit's scheduler calls it once per step, hands it everything the step needs, and checks what it returns. The same runtime runs headless (in a test, a checker) and in a page. The examples come from `seams.md`'s two packages, `drums` and `board`.*

## The module

The manifest names it in `entry.runtime` (`packaging.md`). It exports one `defineRuntime` result, built on the package's Grammar, and may import only `kit/define` and the package's own files.

```js
// board.runtime.js
import { defineRuntime } from "kit/define";
import { board } from "./board.grammar.js";

export const boardRuntime = defineRuntime(board, {
  clock: () => ({ frame: true }),                              // steps with the display
  init: (record) => ({ lamps: record.lamps, lit: 0, shift: 0, levels: new Array(record.lamps).fill(0) }),
  step(state, { dt, inputs, kernels, globals }) {
    const levels = state.levels.map((v) => Math.max(0, v - dt / inputs.fade));
    for (const hit of inputs.flash) {                          // this step's records, in order, in lamps
      const i = Math.round(hit.pos);
      if (i < 0 || i >= levels.length) continue;
      const lamp = { index: i, level: levels[i] };
      globals.hit = hit;                                       // what glow reads as `hit`
      kernels.glow(lamp);                                      // changes lamp in place
      levels[i] = Math.min(1, Math.max(0, lamp.level));
    }
    const lit = levels.filter((v) => v > 0.5).length;
    return { ...state, levels, lit, shift: state.shift + inputs.drift * dt };
  },
  events: { in: { flash: 8 } },                                // the most records one step may take
});
```

```js
// drums.runtime.js
export const drumsRuntime = defineRuntime(drums, {
  clock: (record) => ({ tick: 1 / record.tempo }),             // one step of the pattern per tick
  init: (record) => ({ step: 0, tempo: record.tempo, playing: true }),
  step(state, { record, inputs, kernels, events }) {
    const playing = !inputs.mute;
    if (playing) {
      for (const lane of record.lane) {
        if (!lane.steps.includes(state.step)) continue;
        const loud = kernels.accent ? kernels.accent(state.step) : 1;
        events.hit.push({ lane: lane.name, when: state.step, loud });
      }
    }
    return { ...state, step: (state.step + 1) % record.length, playing };
  },
  events: { out: { hit: 4 } },                                  // one per lane, and a pattern has at most 4
});
```

| Key | What |
|---|---|
| `clock(record)` | when the part steps (**there is no default**: the Grammar decides, so a language whose Program may omit its `tick` writes the fallback in `clock`, as `clock: (record) => ({ tick: record.tick ?? 1 / 30 })`; a result that is not one of these three is N006): `{ tick: seconds }` (every so many seconds of workbench time), `{ frame: true }` (once per display frame; 60 a second headless) or `{ demand: true }` (only when an input changes or an Event arrives) |
| `init(record, ctx)` | the run's first state, from the built record |
| `step(state, ctx)` | the state after one step: a **new** object |
| `events` | `{ out: { port: max }, in: { port: max } }`: for **every** Event port, the most records one step may push (`out`) or take (`in`), a whole number of at least 1 (D033). An input with `keepLast: n` takes at least `n` |

A declaration that is wrong (a missing max, a max on a value port or on a port the Dialect lacks, an unknown key) is D033 when the module loads.

## What a step is handed

| `ctx.` | What |
|---|---|
| `record` | the built Program, as `.build()` returns it (read-only) |
| `part` | the part's name: the Program's opening name |
| `T`, `dt` | the instant in seconds, and the step's length: a tick part's period, a frame part's time since its last frame (0 at its first), 0 for a demand part |
| `inputs` | each value input, converted into your frames (its `default` when unwired), and each Event input's records since your last step, converted, in order (`[]` when none) |
| `events` | an empty list per Event output: push records into `ctx.events.<port>` (step only) |
| `kernels` | the Program's compiled lambdas (below) |
| `globals` | what your lambdas' global names read in this step (below) |
| `controls` | the outside inputs addressed to this part (below) |
| `rng` | the part's seeded random stream: `rng()` gives a number in [0, 1). The kit seeds it from the **run's seed** (the host's `seed` option, 0 when it gives none) and the part's name, so two parts never share a stream and a replay is exact. A `.seed(n)` your language lets a Program write seeds nothing: the kit doesn't read it, so if your language has one, your runtime has to apply it itself (mix it into what you draw from `rng()`, or into your own state) |
| `params` | the Program's params, as lambdas read `$` |

`init` gets the same, without `T`, `dt`, `inputs` and `events`.

## Calling the Program's lambdas

`ctx.kernels` holds each lambda the Program wrote, compiled, by id: `<instance>.<slot>`, where the instance is the construct's opening name (`kernels["big.glow"]` for a `.lamp("big", …)` construct's `glow`). The root construct's own lambdas are also there by slot name alone (`kernels.glow`, `kernels.accent`), but **only for a slot that can be called once**; an optional slot the Program did not write is `undefined`. A call that declares a name (a slot whose first argument is a name) is also there by `<instance>.<slot>.<name>`, the same function as its id. The aliases are not listed by `Object.keys(ctx.kernels)`, which lists ids only.

A slot a construct may call more than once (one without `once`) has no alias: it has one lambda per call, and its id adds the call's place among **all** that instance's calls, `#n`, counting from 0. Every call the instance has counts, once-slots and declarations without a lambda included, in the order the **Grammar** declares its slots (not the order the Program wrote them). So where a Grammar declares `bounds`, `maxParticles`, then `force` (repeatable), the Program

```
particles("fx").bounds({ width: 320, height: 224 }).maxParticles(600)
  .force("fall", (p, dt) => { p.vel = p.vel + vec2(0, 1) * dt; })
  .force("wind", (p, dt) => { p.vel = p.vel + vec2(1, 0) * dt; })
```

has the ids `fx.force#2` and `fx.force#3`, because `bounds` is call 0 and `maxParticles` call 1. (A construct whose Grammar keeps its calls in call order, `record: "calls"`, counts them in the order the Program made them.) The record keeps such calls by the name each declares (`record.forces.fall`), not by place, so list the ids (`Object.keys(ctx.kernels)`), sort them by their `#n`, and match them to the record's names in order. The kit does not match them for you.

- **A kernel takes its slot convention's params, in order**, and returns what the convention returns. Call it with plain values: a number, a string, a vector or a point as an array `[x, y]` (a one-dimensional point is a bare number).
- **An instance param** (an object a lambda may change, such as `Lamp`) is a plain object you make, holding each member the lambda may read or write. The kernel changes it in place; read the members back afterwards. A member that is a function (a `kill()`, say) is one you supply.
- **A random-stream param** is `ctx.rng`.
- **Globals.** Before a step, the kit sets `globals.$` (the params) and the inputs object (`globals.inp`). You set the others your Dialect declares before calling a kernel that reads them: an Event record's name (`globals.hit = record`, once per record), or any object your language shares between lambdas (`globals.counters`). Changes a kernel makes through a global land in the object you set. A kernel that reads a global you have not set throws (N004), except an Event record's name: in a slot listed in a `record`'s `slots` it reads as null while it is unset or null, so set `globals.hit = null` before calling such a slot without a record. Its lambdas check it first (`seams.md`).

## The built record, and values at the boundary

`ctx.record` is what the Program's `.build()` returns, and you can read it as it is: `console.log(JSON.stringify(ctx.record, null, 2))` in a test, or `JSON.stringify(program.build(), null, 2)`. It is plain data, shaped by your Grammar:

- the Program's name is `record.name`, and its `params` are in `record.params`;
- a slot called once is its value (`record.bounds`, `record.tick`), and is **absent** when the Program did not write an optional one: `record.tick` is `undefined`;
- a repeatable named declaration is an object by name (`record.forces`: `{ fall: "…", wind: "…" }`), always present, empty when the Program wrote none; an unnamed repeatable one is a list in call order (`record.emitter`: `[{ name, opts, rate, spawn }]`); a slot's `as` renames its key (`.force` is `record.forces`);
- **a lambda is its source text, a string, never a function.** Call lambdas through `ctx.kernels`; read the record for their names, places and settings;
- helper functions and constants the lambdas use are listed in `record.units`.

**Vectors and points.** At the runtime boundary a vector or a point is a plain array of its components: in the record's data, in `state`, in the Events you push and take (`{ pos: [3, 4] }` for a `point2`; a `point1` is a bare number, `{ pos: 8.5 }`), and in what you pass a kernel. `.x`, `.y` exist only in lambda source (`p.pos.x`); the compiled kernel reads them as `v[0]`, `v[1]`, so your runtime reads `p.pos[0]`. Vectors are values: replace one (`p.pos = [x, y]`), don't change a component in place.

## The rules a step keeps

- **Return a new state; never change the one you are handed.** Copy what changes (`{ ...state, levels }`).
- **Keep no other memory:** no module-level variables, no `Math.random` (use `ctx.rng`), no clock or date. A run is a function of the record, the params and the inputs, so it can be replayed exactly.
- **The state fits your Dialect's `state`**, after `init` and after every step (N002, naming the paths that don't).
- **Push no more Events than `events.out` declares**, and expect no more than `events.in` (N002).
- An Event output is **pushed, never kept in state**.

In a development run (the default, and the checker's) every state is frozen and each step runs twice on the same state and inputs; the two must agree (N003). A step that throws is N004. Any of these stops that part; the others run on.

## Time

- **One workbench time, exact.** Instants are fractions of a second, from 0: a part with `tick: 1/8` steps at 0, 1/8, 2/8, …; one with `tick: 1/30` at 0, 1/30, 2/30, …; the two meet exactly at 0, 1/2, 1, …. Headless, frame parts step at multiples of 1/60.
- **Within one instant**, the parts due step in wire order: an output's part before the input's (ties in `.part` order). So a value input reads what its producer committed this instant, if the producer stepped at this instant; otherwise its latest value. A delayed wire reads what the producer held when the instant began.
- **Events.** A record pushed at instant T reaches the input's part at its first step at or after T: at T itself when both step then (the producer goes first), else at the consumer's next step. Each record arrives exactly once, in order, and carries `$T`: the instant in seconds it was pushed at (read-only, and not among its keys, so a spread copies only its fields). A consumer that steps less often than its producer gets several steps' records at once, which is why `events.in` is a max and `S116` checks it: for a reliable input, the producer's `events.out` max times the most producer steps one consumer step can see must not exceed the consumer's `events.in`.

## Controls

**In a composition, controls are Events.** The page is a built-in part whose Event outputs are the D-pad and the buttons (`seams.md`, "The page's controls are a part"). To be driven by one, give your Dialect an Event input for it (`Event<{ up: bool, down: bool, left: bool, right: bool }>` for the D-pad, or the fields you need), and read its records in `ctx.inputs.<input>` like any Event: each is the control's whole new state, at the instant the person changed it (`r.$T`). Keep the latest one in your state if a step needs the held state between changes. A headless run feeds the page only the inputs in its log (a checker's scripted presses); a page in the browser logs each change as the person makes it, so a replay presses the same.

`ctx.controls` stays for a part that runs on its own without a glue: an outside input addressed to the part by name reaches it as `ctx.controls.<name>`, the latest value at or before the instant, a whole new value each time (not merged). **`ctx.controls` is always an object** (frozen, and `{}` before anything arrives, in `init` too), so `ctx.controls.<name>` is safe to read; it is `undefined` until that name's first value arrives, so read it with a fallback. Nothing in the kit links that name to your UI's `inputs`, and the glue does not say which part it goes to, which is why a composed part takes the page's Events instead.

## Run codes

| Code | When |
|---|---|
| N001 | the run fell behind real time and slowed (a warning), or a `keepLast` input dropped records (counted) |
| N002 | a state that does not fit the Dialect's `state`; more Events pushed or taken than `events` declares |
| N003 | in a development run, a step changed the state it was handed, or kept memory outside it |
| N004 | an `init` or `step` threw |
| N005 | a replay diverged from the recorded run |
| N006 | `clock(record)` returned something that is not a clock |
