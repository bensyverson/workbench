# kit/seam: seam types and frame math

The vocabulary every package's ports are written in, and the math a composition converts with ([the seams draft](../../project/2026-11-25-seams-draft.md), as ruled 2026-11-26). Pure data and functions: no Dialect, no Program, no Node built-ins. [kit/define](../define/README.md) reads a seam at each port and pairs it with the Dialect's own types; [kit/compose](../compose/README.md) compares two seams across a wire and plans each conversion through the frame graph.

## API

| Export | Does |
|---|---|
| `parseSeam(text)` | `{ ok: true, type }` or `{ ok: false, error }` (a sentence saying what is wrong) |
| `printSeam(seam)` | the canonical text: `"Event<{ at: point2@cell }>"`, `"vec2@px/s"` |
| `framesOf(seam)`, `leavesOf(seam)`, `frameOf(leaf)` | the frames a seam names (in order, once each); each leaf with its field path; one leaf's frame or null |
| `pairLocal(seam, type)` | null when a Dialect's local (IR) type has the seam's structure, else what does not fit |
| `compareSeams(from, to)` | `{ problems, tagged, dropped }`: each mismatch with its S code and field, each tagged leaf both sides have (`{ field, kind, dims, from, to, rate? }`), and the producer's record fields the consumer does not take |
| `printType(type)` | an IR type as a message writes it |
| `SECONDS` | `"s"`, the kit's one shared unit |
| `normalizeEdge(e, dims)` | `{ scale, offset }` as written (a number for every axis, or one per axis) to one array per axis, or why not |
| `composeEdges(a, b)`, `invertEdge(e)`, `identity(dims)`, `sameEdge(a, b)`, `uniform(e)` | edge algebra; `uniform`: one scale magnitude on every axis (a quantity may cross only such an edge) |
| `fitEdge(a, b)` | `"fit"`: one scale so box `a` fits inside box `b`, centered |
| `FrameGraph` | `addNode(id, dims)`, `add(edge)` (null, or `{ existing }` when a path already joins the two frames and disagrees), `path(from, to)` (the composed edge and its steps, or null) |
| `edgeText(e)`, `convertText(c)`, `show(v)` | an edge, a planned conversion (`at: maze.cell → particles.px, point, ×32 +16`) and any value as messages print them |

## Seam types

| Kind | Written | Crosses as |
|---|---|---|
| scalar | `f64`, `bool`, `str` | itself, only into an untagged port |
| quantity | `f64@<frame>` | a number measured in a frame: converts by the scale's magnitude, which must be one on every axis |
| point | `point1@<frame>`, `point2@<frame>`, `point3@<frame>` | a position: scale and offset. `point1` is a position on one axis (a temperature, an altitude, an instant `point1@s`) and pairs with a plain `f64`; `f64@<frame>` stays a quantity (a length, a duration) and converts by scale alone |
| vector | `vec2@<frame>`, `vec3@<frame>`; `vec2`, `vec3` untagged | a displacement: scale only, sign kept |
| rate | `vec2@<frame>/s`, `f64@<frame>/s` | a vector or quantity per second: converts as its kind, by its frame's edge alone, since `s` is the same in every package |
| enum | `'rock' \| 'open'` | a string from a closed set |
| record | `{ at: point2@cell, kind: 'coin' \| 'key' }` | fields of seam types |
| list | `list<T, max>` | at most `max` values |
| Event | `Event<{ at: point2@cell }>` | the records one step produced, in order; only at a port's top |

**Invariants.** Points, vectors and quantities are three kinds, and a rate is its own kind beside its vector or quantity: a point never feeds a vector (S255), and a `point1` never feeds a quantity (S201) or an untagged `f64` (S252), a rate never feeds a non-rate (S201, or S202 in a record). Untagged numbers do not convert: a tagged leaf into an untagged one, or the reverse, is S252. A rate is written only per second (`/ms` does not parse), only over a frame, and never of a point. The frame `s` is the kit's (1 dims, seconds): every package names it without declaring it, and kit/define refuses a package frame named `s` (D030). Frame names are compared only as tags here: whether a path joins two frames is the graph's question, asked by kit/compose. A record field or a frame named `__proto__` does not parse. A producer's record field the consumer does not take is dropped, not refused, and listed in `dropped`.

**Codes.** This module reports none of its own. `compareSeams` labels each problem with the composition's S code (S201, S202, S203, S204, S252, S255), which [kit/compose](../compose/README.md) prints with both sides.
