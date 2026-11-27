# kit/compose: the glue program

Composes parts, each a Program built by its own package's Grammar, into one workbench ([the seams draft](../../project/2026-11-25-seams-draft.md), "The glue program", as ruled 2026-11-26). The composer owns every fact that spans two parts: which output feeds which input, and how one part's frame relates to another's. kit/compose checks each wire field by field, plans each conversion through the frame graph as data, and names both sides when something is wrong. It runs nothing: [kit/run](../run/README.md) runs the composed record; given the parts' runtimes, it sizes each reliable Event queue (S116). The composed page's drawing is `FqsPVJ`'s. No Node built-ins.

```js
import { compose } from "kit/compose";
import { maze } from "maze";                 // a package, by its name: the host resolves it to the package's Grammar
import { particles } from "particles";

export default ($) => {
  const level = maze("level").grid(GRID).control(steer);
  const fx = particles("fx").bounds({ width: 320, height: 320 })
    .emitter("pop", { x: 160, y: 160, trigger: "burst" }).rate((t) => 0).spawn((p, rng) => { p.pos = ev.at; });
  return compose("coin-bursts")
    .part(level).part(fx)
    .frame(level.frame.cell, fx.frame.px, "fit")             // or { scale: 32, offset: 16 }
    .wire(level.out.picked, fx.in.burst)                     // options: { rename: { pos: "at" }, set: { kind: "coin" }, delay: true }
    .show(fx);
};
```

## API

| Export | Does |
|---|---|
| `compose(name)` | a composition; `name` is lowercase letters, digits and `-` (S102) |
| `.part(builder)` | adds a part: any builder of a Program's chain. Its root's opening name is the part's name, unique (S101) |
| `.frame(a, b, edge \| "fit")` | relates a frame of one part to a frame of another: `{ scale, offset }` (a number for every axis, or one per axis), or `"fit"` (a's extent into b's, one scale, centered) |
| `.wire(out, in, options?)` | an output handle to an input handle. `rename: { producerField: "consumerField" }` renames record fields, as data; `set: { consumerField: <value> }` is a wire constant (below); `delay: true` makes the consumer read the previous instant's snapshot, which breaks a cycle; `overflow: "keepLast" \| "keepFirst"` (an Event wire only) lets the wire drop what a consumer step cannot take (below). A rename reaches the records of an Event, of a record value and of a `list<{ … }, n>` value. `.wire(out, <part>.param.<name>)`, with no options, is a param wire (below) |
| `.show(part)` | the part whose stage the page shows; one |
| `.check(options?)` | every diagnostic at once: the S codes below, and a part's own (B, L, D) prefixed `part '<name>' (<dialect>): `, its warnings as warnings (**corrected 2026-11-26**, review M1, leaf `1Bfx8t`: until then only a part's errors were kept, so a part's B or L warnings, a preset's included, never reached the page) |
| `.build(options?)` | the composed record, or throws `ComposeError` (its `diagnostics`, and a message printed as below) when any diagnostic is an error; a warning (S206, S118, S116 with a policy or on a page wire) does not stop a build |
| `.plan(options?)` | each checked wire as text: `level.out.picked → fx.in.burst: at: maze.cell → particles.px, point, ×32 +[16, 48]` |
| `formatDiagnostic(d, base?)` | a diagnostic as the draft prints it (below); `base` drops the glue's folder from the file |
| `scanGlue(text, packages, path?)` | a glue's text, from its syntax tree: its imports by kit/package's `scanImports` (`"kit/compose"`, `"kit/define"` and the package names only, no dynamic import; K007 otherwise), and S301 at the line of any test or comparison of a handle (by shape; see the S301 notes) |
| `rewriteGlue(text, urls, path?)` | a glue's text with each import's specifier replaced by its URL (`urls`: `kit/compose`, `kit/define` and each package's name, to its Grammar entry's URL): `{ text, diagnostics }`, `text` null with what `scanGlue` refuses; throws when `urls` lacks a name the glue may import (the host's mistake). Importing the text is the host's: the kit holds no dynamic import |
| `callGlue(exported, path?)` | calls an imported glue's default export with the glue's `$`: `{ composition, diagnostics }`. A build-time read of `$` is S104 (below), even when the glue catches it; an export that is not a function, throws, or returns something other than a composition is S103; a thrown error carrying kit diagnostics (`diagnostics`) or a kit code (`code`, a handle's S301) keeps them |
| `page`, `PAGE`, `PAGE_CONTROLS`, `PAGE_CHANGES_PER_FRAME`, `pageRuntime`, `pageInputProblem` | the page part (below): its builder (`page.out.<control>`), its name, each control's seam, the records per control per frame it is sized for (2), its sizing runtime, and why a page input does not fit |
| `queueProblems`, `stepsIn`, `catchUpOf`, `CATCH_UP`, `NOMINAL_FRAME`, `MIN_FRAME` | the queue bound (below), shared with [kit/run](../run/README.md) |
| `COMPOSE_CODES`, `ComposeError`, `isComposition`, `GLUE_SPECIFIERS` | |

**Loading a glue** ([`glue-load.js`](glue-load.js); review M2 and M4.4, leaf `1Bfx8t`). `rewriteGlue`, then the host's import, then `callGlue`: the page host used to rewrite the imports itself, call the export with `Object.freeze({})`, and turn a thrown error's code into its own, so a glue that read `$.n` at build time built its part with `undefined` and nothing said so. A glue has no params ("Each part keeps its own params; there is no glue-level `$`", below), so its `$` refuses every read. Answering a read with a part's declared param instead (one `$` over several parts' params, recorded as reads so kit/run could rebuild a glue part, issue `aRnKm8`) was not built: kit/define's `run` builds one Program, and which part a glue's `$.n` names is a design question.

`options` is `{ packages?, build?, runtimes?, catchUp?, profile? }`: `profile` (a kit/draw profile, or its name, `"canvas"` or `"gameboy"`) turns on the shown draw list's kind check (S401, below) and is kept, resolved, as the record's `profile`, which the page's draw-time check reads; `packages` gives each part's version (kit/package's `loadPackage` results, or `{ name, version }`, matched by Dialect, then by name); `build` is the `BuildOptions` each part is built with (its module scope); `runtimes` (kit/define's `defineRuntime` results, matched by Dialect name) turns on the queue bound below; `catchUp` is the most workbench time one display frame may cover (seconds, default 1/15).

**The composed record** is `{ name, parts: [{ name, dialect, version, record }], wires: [{ from, to, convert, rename, delay, overflow?, dropped, fill?, set?, delivery }], show, view?, profile? }`; `profile` is the renderer profile `check` or `build` was given, resolved from its name (only when one was), so a page reads it from the record (kit/run's `pageView`); a wired page is a part like any other (`{ name: "page", dialect: "page" }`), which kit/run never steps. Each `convert` entry is `{ field, kind, rate?, from, to, scale, offset }`: a point by scale and offset per axis, a vector (or a rate of one) by scale per axis with a zero offset, a quantity by one magnitude; a `point1` (a 1-D position) by one scale and one offset. A conversion's `field` is the consumer's name for the leaf, after the rename (rename applies first): `[].at` for a list's items' `at`. `dropped` lists the producer's record fields the consumer does not take; `fill` (only when there is one) gives each field the producer's record lacks and the consumer's Event input declares a default for (`<field>: <type> = <value>`, [kit/define](../define/README.md)), with that default: the run adds it to every record after the conversions, since it is already in the consumer's frame, and never computes a value (the plan says `fills <field> = <value>`); `set` (only when there is one) is the wire constant, given the same way (the plan says `sets <field> = <value>`); a param wire's `to` is `<part>.param.<name>`, with no conversions and no `delivery` (the plan says `sets the param between instants`); `delivery` is the consumer's (`"reliable"` or `{ keepLast: n }`) for an Event wire.

**A wire constant** (ruled 2026-11-26, leaf `8JTaDq`): `{ set: { <field>: <value> } }` sets fields of the consumer's record, as data. Each value is a literal (a number, `true` or `false`, a string, or a list of these; else S102), checked against the consumer field's seam, and each field must be one the consumer's Event record or record value takes and the producer's record (after any rename) does not send: a set never overrides (S208). A field the consumer does not take, a value that does not fit, or a set on a wire with no record or into a list's items is S207. The rest of the consumer's record is compared as usual, so a set field needs no default. kit/run gives each record the set fields after the conversions, as it gives a fill ([kit/run](../run/README.md)).

**A param wire** (ruled 2026-11-26, leaf `x3iG6D`; [`param-wires.js`](param-wires.js)): `.wire(<part>.out.<port>, <part>.param.<name>)` sets a param of another part from a value output. A builder's `.param.<name>` is the handle of a param its Program declares (kit/define; where the Grammar's param slot is itself named `param`, the slot's method answers the handles too). The output's seam is compared with the seam the param's declaration gives: `f64` for a number, `bool`, `str`, or the enum of its `options` for a string (an Event output, another kind, a tagged value, or an enum the options do not cover is S201, S252 or S203). Bounds (`min`, `max`) are not in a seam, so kit/run checks each value as it applies it (N008). A param wire takes no options (S102) and one per param (S112); an unknown param is S111. kit/run applies it between instants, only when the value changes, as a logged `param` input, so the part rebuilds when build-time code reads the param, and replay and `why` see it. Because it applies between instants it orders nothing within one: a loop through a param wire and an ordinary wire is no cycle (no S115), since the ordinary wire's consumer steps between two rebuilds. A param wire from the part's own output, or a loop of param wires alone, is S117: a rebuild runs init, which can change the output that sets the param again with no step between. Given the runtimes, a param wire whose producer steps at a rate (a tick or frame clock) is S118, a warning: each change rebuilds. A host bridge (the host reading an output and logging a param input) stays possible, but nothing checks it.

**Bare package names.** A glue program imports its packages by name (`import { maze } from "maze"`). kit/compose does not resolve them: `scanGlue` refuses anything else before the glue runs, and the host maps each name to the Grammar entry of the package it loaded with kit/package (`loadPackage`; the manifest's `entry.grammar`). In Node that is a module hook (scripts/seams-trial does it); in the page it is the same blob URLs `rewriteSpecifiers` makes.

## Invariants

- **Each part is a whole Program**, built, checked and lowered by its own Grammar as if it stood alone. A part that does not build stops there with its own diagnostics, and its wires are not judged.
- **Every S diagnostic about a wire or an edge carries both sides** as `from` and `to`: `{ part, dialect, version, port | frame, seam | dims }`, or, for a name the part lacks (S111), what it `has`. S101 carries the two parts. S113 (a required input nobody wires) has only the consumer, and S301 (a handle read as a value) only the handle: neither has a second side.
- **The frame graph** holds each part's frames as `<part>.<frame>` (two parts' frames never unify by name), the kit's `s` once for every part, each Dialect's own `edges(record)`, then the glue's `.frame` calls in order. A second path between two frames must agree with the first (S253). Each tagged leaf of a wire converts along the path between its frames, by kind.
- **Renames are data.** The glue has no lambdas. A rename names producer fields and consumer fields; a refused rename is one mistake, so that wire is not compared further.
- **Cycles.** A loop of wires is S115 unless one wire in it is `{ delay: true }`. Glue line order never decides it: the loop is found from the parts and wires, named from the part added first, and parallel wires between two parts are ordered by their port names. Delaying one of several parallel wires leaves the loop, so the fix names every wire of a hop (all the wires from one part to the next) to delay.
- **One wire per input** (S112); a part wired to itself is S114 (a cycle inside a part is its Dialect's business). Each part keeps its own params; there is no glue-level `$`.
- **A wire never computes.** A wire constant is literal data, and a param wire carries the output's value as it is.
- **S301 is a trap, a throw and a scan.** A handle read as a number or a string at build time (`level.out.player * 2`, a template, an ordering comparison) records the read on its Program, and the check reports it at that line. A handle read for a property it does not define (`level.out.picked.y`) throws S301 at once, because it would otherwise read as `undefined` and a test of it would take a branch silently; the properties the kit reads (`part`, `side`, `name`, `known`, `seam`, `dims`, ...), `then`, symbols and the Object.prototype members still work. A handle tested as a condition cannot be trapped (an object is always truthy), so `scanGlue` finds it in the glue's text: a member chain ending `.out.X`, `.in.X` or `.frame.X` in the test of an `if`, `while`, `for` or `?:`, the operand of `!` or `typeof`, the left operand of `&&`, `||` or `??`, the right operand of one of those only when the logical is itself in a test position (`const h = flag && level.out.picked` selects a handle and is fine), or either side of `===`, `!==`, `==`, `!=`, `in` or `instanceof` (`h !== undefined` and `h == null` hide the same mistake), the `switch` discriminant or a `case` value, and a comparison operand that may be a handle through a logical, a ternary's arms or a sequence's last value (`(flag && h) === 1`); a sequence or ternary in a test position is read through the same way (`(0, h) ? …`). Each report carries the handle chain's own line.
- **The S301 scan works by shape, so it has limits.** It misses a handle that was first aliased (`const h = a.out.x; if (h) {}`), destructured (`const { x } = a.out`) or passed to a helper that tests it. It also flags any chain of that shape, so an ordinary object with `in`, `out` or `frame` keys (`config.in.length`) is a false positive; rename the key.

**The page** ([`page.js`](page.js); Ben's ruling 5, 2026-11-26) is a built-in part whose Event outputs are the controls: `pad`, `Event<{ up: bool, down: bool, left: bool, right: bool }>`, and the DMG host's buttons `a`, `b`, `start` and `select`, each `Event<{ held: bool }>`. A glue wires one like any output, `.wire(page.out.<control>, <part>.in.<input>)`, with the usual seam, rename and S checks (S111 for a control the page lacks); a wire from the page adds it as a part, so no `.part(page)` is needed (one is allowed). It has no frames, no inputs and no step: kit/run delivers each page input in the log to the wires from that control at its stamp. kit/run delivers every press and release, in order (Ben, 2026-11-26: "we need tap and release"), so for S116 the page counts as a frame part that sends at most `PAGE_CHANGES_PER_FRAME` records per control per frame (`pageRuntime`): 2, a press and a release (for the pad, any two changes of the held directions). A frame consumer of a page control takes at least 2 per step; a tick consumer, 2 for each frame of at most 1/240 s its period can hold (120 for a quarter-second tick). That is the page's stated limit, not one the host enforces: past it, a wire with `{ overflow: "keepLast" }` or `{ overflow: "keepFirst" }` trims what each step takes, and a wire without one **folds** (Ben, 2026-11-26: a person is the one sender no party controls): each step takes the first max-1 records in order and then the latest, the control's held state, so the final release always arrives and no button sticks down (with a max of 1, only the latest). Both count what they drop (kit/run's `stats().overflow`, N001), and neither stops the consumer. **S116 on a page wire with no policy is a warning naming the fold**, not an error: the run no longer stops the part, so refusing the glue would block a composition that runs, while saying nothing would hide that a fast tapper's presses can fold; a warning tells the composer what the run will do and how to keep every record (raise the max), as S116 does for an explicit policy. kit/run's own S116 refusal at `createRun` skips page wires, as it skips a policy wire. **Reversed 2026-11-26:** from `3bfd8ee` until the fold, a page wire with no policy had its consumer's step refused past its max (kit/run's N002, the part stopped) and S116 on it was an error. An input that wants only the latest state declares `delivery: { keepLast: 1 }` or its wire takes `{ overflow: "keepLast" }`. **Reversed 2026-11-26:** this said the page sends at most one record per control per frame and that kit/run kept that bound by coalescing page inputs to the latest value per control (`ada0afe`); that lost a tap whose press and release both fell between two of the consumer's steps, and was wrong. A display run's page logs each change as the person makes it; a headless run gets only its scripted page inputs ([kit/run](../run/README.md)). A user part may not be named `page` in a composition that wires the page (S101).

**An overflow policy** (Ben's ruling 7, 2026-11-26): `{ overflow: "keepLast" | "keepFirst" }` on an Event wire turns its S116 into a warning that names the policy (the fix: raise the max and remove the policy if every record matters). At run time each consumer step takes at most the consumer's max, the newest or the first, and drops the rest, counted in `stats().overflow` and noted once per wire (kit/run). The consumer's max never changes, and a wire that cannot overflow is unchanged. A policy on a page wire replaces its default fold ("The page", above), and its S116 warning says so: keepFirst can then drop the final release and leave a button down. A policy on a value wire, or one that is neither, is S102. The plan says `overflow keepLast`.

**Draw wires** ([`draw.js`](draw.js); the draw-list draft, as ruled 2026-11-26). A part's Draw outputs are judged at the max its built Program gives (kit/define's `seams.draws`, ruling 1), so S204 and both sides' printed seams use it, not the Dialect's ceiling. A Draw wire plans one conversion of kind `draw` (`field` `""`) along the frame path, by scale and offset; kit/run converts each op by it ([kit/draw](../draw/README.md)'s `convertOp`). The composed record's `view` names the shown part's Draw output the page draws: its only one, or the one named `view` (S402 when there are several and none is). Given `profile`, the kinds the shown list can hold are read from its builder and followed through every Draw input the builder spreads to the producer wired to it; a kind the profile does not draw is S401, naming the output whose builder writes it and the shown output. Counts are never judged here: the composer owns the budget, and the profile counts at draw time. A builder whose kinds the kit cannot see (a computed tag, a helper's result) is left to the draw-time check; it does not hide the kinds the kit can see, which are judged all the same.

**Queue bounds** ([`queues.js`](queues.js); the clocks draft's queue ruling). Queues live in workbench time, so their length depends only on rates and per-step maximums, as in synchronous dataflow. With the runtimes, each reliable Event wire's bound is the producer's per-step max (its runtime's `events.out`) times the most producer steps one consumer step can see: for a tick consumer, in a window of its period (a tick producer's `ceil(period_c / period_p)`); for a frame consumer, in a window of the catch-up cap; a demand consumer is woken by the Event, so one producer step. A frame producer counts as stepping at most every 1/240 s, except into a frame consumer: the two step on the same frames, so one producer step. A demand producer counts at most once per instant: the distinct instants of the tick clocks (where two tick clocks meet, one instant; exact while their combined pattern repeats within 100,000 steps, an upper bound past that), plus the frames. Into a frame consumer, whose window (its last frame, this frame] holds one frame, that is 1 plus the tick instants in the catch-up cap. A bound above the consumer's max (its runtime's `events.in`) is S116, naming both sides and the two fixes: raise the max, or `{ keepLast: n }` on the input. `queueProblems(parts, wires, runtimes, { catchUp })` is exported for the scheduler, which refuses the same composition.

## Printing

```
workbench.js:14: S251 level.out.picked cannot feed fx.in.burst: the field 'at' is a point in maze.cell; burst takes a point in particles.px, and no frame path joins them
  from: level.out.picked  Event<{ at: point2@cell }>  (maze 0.2.0)
  to:   fx.in.burst       Event<{ at: point2@px }>    (particles 0.3.0)
  fix: write .frame(level.frame.cell, fx.frame.px, "fit"), or give the edge: .frame(level.frame.cell, fx.frame.px, { scale: …, offset: … })
```

## Codes

| Code | When |
|---|---|
| S101 | two parts with one name |
| S102 | a call given the wrong thing: `.part` of a non-builder or twice, a handle of a part not added, `.wire` of anything but an output then an input or a param, wire options other than `{ rename, set, delay, overflow }` (or an overflow that is not `"keepLast"` or `"keepFirst"`, or one on a value wire, or a `set` that is not an object of literals), any option on a param wire, `.frame` of anything but two frames, `.show` of a non-part or twice, a bad composition name |
| S103 | a glue's default export is not a function `($) => composition`, throws (a thrown kit code or kit diagnostics are kept instead), or returns something that is not a composition (`callGlue`) |
| S104 | a glue's build-time code reads its `$` (a param by name, `$` as a value, a spread, `in`): a glue has no params, so the read is refused, never `undefined` (`callGlue`) |
| S111 | an output, input, frame or param the part does not have (its names, with a did-you-mean) |
| S112 | an input or a param wired twice |
| S113 | a required input the glue does not wire (an input the glue wires is never S113, even when its wire is refused for another reason) |
| S114 | a part wired to itself |
| S115 | a loop of wires with no delayed wire in it (names the loop) |
| S116 | a reliable Event wire whose queue can hold more records at one consumer step than the consumer takes (needs the runtimes; names both sides and the fixes: raise the max, `{ keepLast: n }` on the input, or an overflow policy on the wire); a warning naming the policy on a wire with `overflow`, and a warning naming the fold on a page wire with none |
| S117 | a param wire from the part's own output, or a loop of param wires alone (names the loop) |
| S118 | a warning: a param wire whose producer steps at a rate (a tick or frame clock; needs the runtimes), so each change of the value rebuilds the param's part |
| S201 | seam kinds differ: an Event into a value input or a param, a record into a scalar, a rate into a non-rate |
| S202 | a record field the consumer takes and the producer lacks (after any rename) and the consumer gives no default for, or one of another kind |
| S203 | an enum the consumer does not accept |
| S204 | a list longer than the consumer's max |
| S205 | a rename naming a field either side lacks (with a did-you-mean), two fields into one, into a field the producer has, or on a wire with no record (an Event, a record, or a list of records) |
| S206 | a warning (`severity: "warning"`), not an error: a wire drops a producer field the consumer does not take and fills a consumer field with its default, and the two fields' seams are compatible and any frames they are measured in are joined by a frame path (so the rename would plan), so a rename was probably meant; the fix names `rename: { <dropped>: "<filled>" }` (ignore it when the default is intended) |
| S207 | a wire constant (`set`) naming a field the consumer's record does not take (with a did-you-mean), with a value that does not fit the field's seam, or on a wire with no record into its input or into a list's items |
| S208 | a wire constant on a field the producer's record also sends (a set never overrides) |
| S251 | tagged on both sides, no frame path (the fix suggests `.frame`, says frames of different dims cannot join, or, when one side is the kit's `s`, that `s` relates to no package frame) |
| S252 | tagged on one side only |
| S253 | two frame paths disagree (both, with their edges) |
| S254 | a quantity across a non-uniform scale |
| S255 | a point into a vector, or a vector into a point |
| S256 | `"fit"` with a frame that has no extent, or with dims that differ |
| S257 | a malformed edge, or `.frame` of two frames of one part or of different dims |
| S301 | a handle read as a value at build time (a read as a number or string, caught as the glue runs), or tested or compared (found by `scanGlue`) |
| S401 | given `profile`: the shown draw list can hold an op kind the profile does not draw (names the output whose builder writes it, and the shown output) |
| S402 | the shown part has several Draw outputs and none is named `view` |
| S403 | `profile` names no renderer profile |

The codes are the relay trial checker's ([scripts/seams-trial](../../scripts/seams-trial/README.md)), kept where the meaning is unchanged, so its records still read; S115, S116 and S205 are new with the 2026-11-26 rulings, and S117, S118, S207 and S208 with the rulings on a wire constant and a param wire (the same day).

## Layers (draft, 2026-11-27, leaf LiOmY9; revised after the dogfood, leaf teBNYM)

> **Draft: not built.** This section is the API the layer part will have, written so an agent can build against it and so blind agents can try it before it is frozen (the dogfood ruling, AGENTS.md). Nothing below runs yet: `layer` is not exported and `.show` takes one part. Ruling: Ben, 2026-11-27, [the layer and package tests plan](../../project/2026-11-27-layer-and-package-tests-plan.md), "Rulings" 1. Each decision below that the ruling leaves open gives its reason. Where this section extends a row of the tables above (`.show` takes one part; S102 lists `.show` of a non-part), this section wins; those rows change when the layer is built. **Revised 2026-11-27** after three blind Sonnet legs wrote the M4 glue against it, all clean at their first check with no massage ([the layer dogfood findings](../../project/2026-11-27-layer-dogfood-findings.md)): the revisions say how to place a smaller picture (the edge's direction, and that its offset is still the composer's), that a layer's producers are added with `.part`, that a conversion does not scale text, what falls outside the page box, what the page host shows for a layer, and correct the example's summed max.

A **layer** is a built-in part, like the page, that draws several Draw outputs as one picture, each over the one before. The kit knows the producers wired into it, so it derives what a composer would otherwise copy by hand: its output's max is the sum of the producers' built maxes (kit/define's `seams.draws`), each input takes its ceiling from its producer, and its frame is the bottom layer's, so no ceiling and no canvas size is typed. Where a picture sits over the bottom one is still the composer's: a `.frame` edge (below, "Placing a picture"). Because it is a part, a layered picture can be shown, wired into another part's Draw input, or layered again.

```js
import { compose, layer } from "kit/compose";

// a layer made by name: its arguments are Draw outputs, bottom first
const <layer> = layer("<layer>", <part>.out.<output>, <part>.out.<output>);
return compose("<name>")
  .part(<part>).part(<part>)
  .frame(<part>.frame.<frame>, <part>.frame.<frame>, { scale: <n>, offset: [<x>, <y>] })
  .show(<layer>);                                        // or .wire(<layer>.out.view, <part>.in.<input>), or layer it again

// the shorthand: two or more Draw outputs, bottom first, add a layer named `layers` and show it
return compose("<name>").part(<part>).part(<part>).show(<part>.out.<output>, <part>.out.<output>);
```

### API

| Export or call | Does |
|---|---|
| `layer(<name>, <output>, <output>, ...)` | a layer part named `<name>` (lowercase letters, digits and `-`, as `compose`'s; S102 otherwise), over two or more Draw output handles, in painter's order: the first argument is drawn first, at the bottom. Fewer than two, an argument that is not an output handle, or one output given twice is S102; an output whose seam is not a Draw list is S404 |
| `.part(<layer>)` | allowed, never needed: a layer joins the composition at the first call that names it (`.part`, `.show`, a `.wire` from its output, or another layer's argument), as a wire from the page adds the page |
| `.show(<layer>)` | shows the layer: the page draws its output, `view` |
| `.show(<output>, <output>, ...)` | shorthand for `.show(layer("layers", <output>, <output>, ...))`: two or more Draw output handles, bottom first. A part named `layers` beside it is S101, whose fix says to name the layer with `layer(<name>, ...)` |
| the producers | each output's part is added with `.part(<part>)` as usual: a layer joins the composition when it is named, but naming an output adds nothing, so an output of a part not added is S102 (as for `.wire`) |
| `<layer>.out.view` | the layer's one output: `Draw<sum>@<frame>`, where `sum` is the sum of its producers' built maxes and `<frame>` is the bottom producer's frame. Wire it like any Draw output (S204 against a consumer's smaller max), show it, or pass it to another layer |
| `<layer>.in.<...>`, `<layer>.frame.<...>`, `<layer>.param.<...>` | none: S111, with a fix that names what to do instead (pass the output to `layer`, relate the bottom producer's frame) |

### Decisions

- **How a glue makes one: both a `layer(<name>, ...)` builder and the `.show` shorthand.** The ruling asks for both: a part, so a layered picture can be wired or layered again, which needs a handle the glue can name (`<layer>.out.view`); and the shorthand, because showing two pictures as one is the common case and needs no name. `layer` is exported by kit/compose beside `page`, so a glue imports nothing new (`GLUE_SPECIFIERS` already allows `"kit/compose"`). The shorthand's layer is named `layers`, a fixed name, so the plan, diagnostics and addresses (`lab:<name>#layers.out.view`) can name it; a glue that wants another name writes `layer`.
- **Inputs: given as arguments, in painter's order by position; not named ports wired with `.wire`.** Order is the only thing that tells a layer's inputs apart, and an argument list shows it on one line; named ports would make the composer invent a name per input and then keep a second order (the wires' or the names') in step with the drawing. So a layer's inputs are fixed when it is made: no `.wire(<output>, <layer>.in.<...>)` (S111), no wire options on them (no rename, set, delay or overflow means anything for a picture). In the composed record each argument is still a wire, `<part>.out.<output> → <layer>.in.<i>`, `<i>` counting from 0 at the bottom, so the plan, the cycle check and kit/run treat it as they treat every Draw wire. One output given twice in one layer is S102: drawing the same list twice doubles its count for nothing a composer would want, and is almost always a slip. The same output may feed several layers, as an output may feed several wires.
- **Ceilings come from the producers.** Each input's seam is its producer's output seam at that Program's built max (`withDrawMaxes`, as for every Draw wire), so no input is ever too small and a layer input is never S204. The output's max is the sum of those maxes: the most ops the concatenation can hold. A producer that does not build stops with its own diagnostics, and the layer, like any consumer of an unbuilt part, is not judged; nor are wires from it.
- **Differing frames: each input converts to the bottom input's frame through the frame graph.** The bottom input's frame is the layer's frame; every other input plans a `draw` conversion from its producer's frame to that one, by the same path search as any wire, so the composer relates frames with `.frame` exactly as for a wire, and no extent is typed twice. No path is S251 (its fix suggests the `.frame` call between the two parts' frames), two disagreeing paths S253. Draw frames are always 2-D, so S257's dims case cannot arise. The layer has no frame of its own in the graph: a second name for the bottom producer's frame would be a node with nothing to say, and `.frame` on it would be a second way to say the same edge. When the bottom input is itself a layer's output, the frame is that layer's bottom frame, and so on down.
- **What the page draws, and its box.** A shown layer's list is its inputs' converted lists concatenated bottom first; the box kit/run's `pageView` gives the renderer is the bottom producer's frame extent for that producer's built record (followed down through a layer at the bottom), exactly as if the bottom producer were shown. A bottom frame with no extent gives no box, as a shown part's does today. The page sizes its canvas to that box (kit/page's `page.size`), so an upper picture's ops outside it fall off the canvas, as any shown list's do; nothing clips or moves them. The page host shows each part's tiles, inputs and params as it does today; its fallback stage (a custom element or the text view, for a shown part with no Draw output) never applies to a layer, which always has one, so the host must not look a package up by the shown name (`textStage` in kit/page/host/main.js does today: a build seam).
- **Placing a picture** (added after the dogfood: all three legs asked). `.frame(<a>, <b>, { scale, offset })` maps a point `p` in frame `a` to `p × scale + offset` in frame `b`, so `.frame(<top part>.frame.<frame>, <bottom part>.frame.<frame>, { scale: 1, offset: [<x>, <y>] })` draws the top picture's origin at `[<x>, <y>]` in the bottom picture, at its own size. `"fit"` scales the top extent by one scale to fit inside the bottom one and centers it, which suits a background, not a panel. A conversion moves a `text` op's `at` and never scales its glyphs ([kit/draw](../draw/README.md)'s op table), so a top picture that holds text wants scale 1. The offset is computed from the two extents by hand (to center a 160-unit panel on a 192-unit level, 16): the layer derives the ceilings and the box, not the placement. An anchored edge that would compute it is a `.frame` question for every wire, not a layer's, and is parked in [the backlog](../../project/backlog.md).
- **S401 follows through a layer.** The kinds a layer's output can hold are the union of its inputs' kinds, each followed to its producer as a Draw input is today (`kindsReaching` visits every input of a layer, and through a layer wired into a part's Draw input). S401 names the output whose builder writes the refused kind, never the layer, and the shown output (`<layer>.out.view`). An input whose kinds the kit cannot see is left to draw time and does not hide the other inputs' kinds. Counts stay the profile's at draw time: the summed max is a ceiling, not a budget.
- **kit/run never steps a layer.** It has no state, no clock, no runtime and no params, so a composition needs no runtime for it (as for the page), it adds nothing to the log, the state hashes or `stats()`, and S116 never concerns it (Draw wires are value wires). Its output, whenever a wire or `pageView` reads it, is each input wire's list carried as any Draw wire's is (`carry`, so `convertOp` by the planned edge) and concatenated in order. A read through a delayed wire reads every producer under the layer as the instant began, since the delay is the reading wire's; `snapshot(<layer>)` answers `{ state: null, draws: { view } }` computed the same way. The scheduler orders a layer's consumers after all its producers, through its input wires.
- **Cycles.** A layer's input wires count in the cycle check like any wire (S115), but they take no options, so the fix never names one: it names the delayable wires of the next hop in the loop (typically the wire from the layer into the part whose output the layer holds).
- **How kit/run tells a layer from a user part.** A part entry in the composed record carries `layer` (below). A name or Dialect name alone cannot tell a built-in from a user package that happens to be named `layer`, and several layers can exist, so the page's check (`dialect === "page" && name === "page"`) does not carry over.

### The composed record

A layer is a part entry `{ name: "<layer>", dialect: "layer", record: {}, layer: { inputs: ["<part>.out.<output>", ...], max: <sum>, frame: "<part>.<frame>" } }`, with no `version`, after the parts in glue order of first mention. Each input is a wire entry `{ from: "<part>.out.<output>", to: "<layer>.in.<i>", convert, rename: {}, delay: false, dropped: [] }`, whose `convert` is empty for the bottom input (already in the layer's frame) and one `draw` conversion for any other input in another frame. When the layer is shown, `show` is `"<layer>"` and `view` is `"view"`; a layer's one Draw output is named `view`, so S402 never concerns it.

### Codes

| Code | When |
|---|---|
| S404 | **new:** a layer argument (`layer(<name>, ...)` or `.show(<output>, ...)`) whose output is not a Draw list: a value, an Event or a record (names the output and its seam; the fix says a layer takes only `Draw` outputs) |

Kept with a layer's meaning: S101 (a layer named like another part, `layers` included), S102 (`layer` given fewer than two outputs, a name that is not lowercase letters, digits and `-`, something that is not an output handle, an output twice, a handle of a part not added; `.show` given a mix of a part and outputs, or one output alone), S111 (a layer's `in`, `frame` or `param` handle), S115 (a loop through a layer), S204 (a layer's output into a smaller Draw input), S251 and S253 (an input's frame and the bottom frame), S401 (followed through). `.show(<part>.out.<output>)` with one output is S102 in this draft: showing one output of a part with several is a different question (S402's), not a layer's.

### The M4 trial's glue, rewritten against this draft

The trial's composer wrote a 70-line `overlay` package (`scripts/m4-trial/runs/2026-11-26/compose/overlay/`) and a glue that copied `Draw<302>` and `Draw<8>` from the producers and repeated the level's 192 by 128 pixels as the canvas size. Against this draft, that trial's glue (real names, from [that run](../../scripts/m4-trial/runs/2026-11-26/compose/workbench.js)) reads:

```js
import { compose, page } from "kit/compose";
import { gemgrid } from "gemgrid";
import { scoretimer } from "scoretimer";

export default () => {
  // 12 by 8 cells of 16 pixels. Two rows of wall on top sit under the score panel.
  const level = gemgrid("level").map([
    "############",
    "############",
    "#P..*....*.#",
    "#.##.##.##.#",
    "#.*......*.#",
    "#.##.##.##.#",
    "#.*..*...*.#",
    "############",
  ]);
  const round = scoretimer("round").label("GEM RUSH").lasts(30);

  return compose("timed-gems")
    .part(level).part(round)
    .frame(round.frame.panel, level.frame.px, { scale: 1, offset: [16, 4] })
    .wire(page.out.pad, level.in.pad)
    .wire(level.out.picked, round.in.scored, { set: { points: 1 } })
    .show(level.out.view, round.out.view);
};
```

No overlay package, no `.size`, no copied ceiling: the layer `layers` is `Draw<72>@px` in gemgrid's `px` (67 + 5, from the two built Programs; **corrected 2026-11-27**, leaf `teBNYM`: this said `Draw<310>`, 302 + 8, which are the Dialects' declared ceilings, not the built maxes), its page box is gemgrid's `px` extent for this map (192 by 128), and the one `.frame` call relates the panel to the level directly instead of both to a third canvas. Its plan's two layer lines read `level.out.view → layers.in.0: unchanged` and `round.out.view → layers.in.1: (value): scoretimer.panel → gemgrid.px, draw, ×1 +[16, 4]`. Naming the layer instead, for a glue that wires or layers it again, is `const screen = layer("screen", level.out.view, round.out.view)` with `layer` imported beside `page` and `.show(screen)`.
