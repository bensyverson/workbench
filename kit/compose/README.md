# kit/compose: the glue program

Composes parts, each a Program built by its own package's Grammar, into one workbench ([the seams draft](../../project/2026-11-25-seams-draft.md), "The glue program", as ruled 2026-11-26). The composer owns every fact that spans two parts: which output feeds which input, and how one part's frame relates to another's. kit/compose checks each wire field by field, plans each conversion through the frame graph as data, and names both sides when something is wrong. It runs nothing: the scheduler, Event delivery and queue bounds are leaf `ZH4KWX`'s, and the composed page's drawing is `FqsPVJ`'s. No Node built-ins.

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
    .wire(level.out.picked, fx.in.burst)                     // options: { rename: { pos: "at" }, delay: true }
    .show(fx);
};
```

## API

| Export | Does |
|---|---|
| `compose(name)` | a composition; `name` is lowercase letters, digits and `-` (S102) |
| `.part(builder)` | adds a part: any builder of a Program's chain. Its root's opening name is the part's name, unique (S101) |
| `.frame(a, b, edge \| "fit")` | relates a frame of one part to a frame of another: `{ scale, offset }` (a number for every axis, or one per axis), or `"fit"` (a's extent into b's, one scale, centered) |
| `.wire(out, in, options?)` | an output handle to an input handle. `rename: { producerField: "consumerField" }` renames record fields, as data; `delay: true` makes the consumer read the previous instant's snapshot, which breaks a cycle |
| `.show(part)` | the part whose stage the page shows; one |
| `.check(options?)` | every diagnostic at once: the S codes below, and a part's own (B, L, D) prefixed `part '<name>' (<dialect>): ` |
| `.build(options?)` | the composed record, or throws `ComposeError` (its `diagnostics`, and a message printed as below) |
| `.plan(options?)` | each checked wire as text: `level.out.picked → fx.in.burst: at: maze.cell → particles.px, point, ×32 +[16, 48]` |
| `formatDiagnostic(d, base?)` | a diagnostic as the draft prints it (below); `base` drops the glue's folder from the file |
| `scanGlue(text, packages, path?)` | a glue's imports from its syntax tree, by kit/package's `scanImports`: `"kit/compose"`, `"kit/define"` and the package names only, no dynamic import (K007 otherwise) |
| `COMPOSE_CODES`, `ComposeError`, `isComposition`, `GLUE_SPECIFIERS` | |

`options` is `{ packages?, build? }`: `packages` gives each part's version (kit/package's `loadPackage` results, or `{ name, version }`, matched by Dialect, then by name); `build` is the `BuildOptions` each part is built with (its module scope).

**The composed record** is `{ name, parts: [{ name, dialect, version, record }], wires: [{ from, to, convert, rename, delay, dropped, delivery }], show }`. Each `convert` entry is `{ field, kind, rate?, from, to, scale, offset }`: a point by scale and offset per axis, a vector (or a rate of one) by scale per axis with a zero offset, a quantity by one magnitude. `dropped` lists the producer's record fields the consumer does not take; `delivery` is the consumer's (`"reliable"` or `{ keepLast: n }`) for an Event wire.

**Bare package names.** A glue program imports its packages by name (`import { maze } from "maze"`). kit/compose does not resolve them: `scanGlue` refuses anything else before the glue runs, and the host maps each name to the Grammar entry of the package it loaded with kit/package (`loadPackage`; the manifest's `entry.grammar`). In Node that is a module hook (scripts/seams-trial does it); in the page it is the same blob URLs `rewriteSpecifiers` makes.

## Invariants

- **Each part is a whole Program**, built, checked and lowered by its own Grammar as if it stood alone. A part that does not build stops there with its own diagnostics, and its wires are not judged.
- **Every S diagnostic about a wire or an edge carries both sides** as `from` and `to`: `{ part, dialect, version, port | frame, seam | dims }`, or, for a name the part lacks (S111), what it `has`. S101 carries the two parts. S113 (a required input nobody wires) has only the consumer, and S301 (a handle read as a value) only the handle: neither has a second side.
- **The frame graph** holds each part's frames as `<part>.<frame>` (two parts' frames never unify by name), the kit's `s` once for every part, each Dialect's own `edges(record)`, then the glue's `.frame` calls in order. A second path between two frames must agree with the first (S253). Each tagged leaf of a wire converts along the path between its frames, by kind.
- **Renames are data.** The glue has no lambdas. A rename names producer fields and consumer fields; a refused rename is one mistake, so that wire is not compared further.
- **Cycles.** A loop of wires is S115 unless one wire in it is `{ delay: true }`. Glue line order never decides it: the loop is found from the parts and wires, and named from the part added first.
- **One wire per input** (S112); a part wired to itself is S114 (a cycle inside a part is its Dialect's business). Each part keeps its own params; there is no glue-level `$`.
- **S301 is a trap, not a scan.** A handle read as a number or a string at build time (`level.out.player * 2`, a template) records the read on its Program, and the check reports it at that line. A handle tested as a condition (`if (h)`, `h ? a : b`, `!h`) cannot be trapped, since an object is always truthy, and is not reported.

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
| S102 | a call given the wrong thing: `.part` of a non-builder or twice, a handle of a part not added, `.wire` of anything but an output then an input, wire options other than `{ rename, delay }`, `.frame` of anything but two frames, `.show` of a non-part or twice, a bad composition name |
| S111 | an output, input or frame the part does not have (its names, with a did-you-mean) |
| S112 | an input wired twice |
| S113 | a required input with no wire |
| S114 | a part wired to itself |
| S115 | a loop of wires with no delayed wire in it (names the loop) |
| S201 | seam kinds differ: an Event into a value input, a record into a scalar, a rate into a non-rate |
| S202 | a record field the consumer takes and the producer lacks (after any rename), or one of another kind |
| S203 | an enum the consumer does not accept |
| S204 | a list longer than the consumer's max |
| S205 | a rename naming a field either side lacks (with a did-you-mean), two fields into one, into a field the producer has, or on a wire with no record |
| S251 | tagged on both sides, no frame path (the fix suggests `.frame`, or says frames of different dims cannot join) |
| S252 | tagged on one side only |
| S253 | two frame paths disagree (both, with their edges) |
| S254 | a quantity across a non-uniform scale |
| S255 | a point into a vector, or a vector into a point |
| S256 | `"fit"` with a frame that has no extent, or with dims that differ |
| S257 | a malformed edge, or `.frame` of two frames of one part or of different dims |
| S301 | a handle read as a value at build time |

The codes are the relay trial checker's ([scripts/seams-trial](../../scripts/seams-trial/README.md)), kept where the meaning is unchanged, so its records still read; S115 and S205 are new with the 2026-11-26 rulings.
