# kit/build: the build record as data

Keys, revisions and build events for a composed workbench ([the build record draft](../../project/2026-11-26-build-record-draft.md), ruled 2026-11-26: all five questions as recommended). Three keys kept apart: a part's **identity** is its name in the glue; its **revision** numbers one run's builds of it; its **content key** is what a cache would reuse a result by. [kit/run](../run/README.md) computes keys when it starts and on every rebuild, and writes one build event per rebuild to the run log. No I/O, no Node built-ins.

```js
import { partKey, nextRevision, buildEvent, paramTrigger } from "kit/build";

const key = partKey({ package: pkg.content, record });          // sha256-…
nextRevision({ key: old, revision: 2 }, key);                    // 2 if key === old, else 3
buildEvent({ part: "level", boundary: { after: "12", before: "101/8" }, trigger: paramTrigger(record, "depth", 2, 3),
  before: { key: old, revision: 2, record: oldRecord, kernels }, after: { key, record, kernels: newKernels }, consumers: ["fx.in.burst"] });
```

## API

| Export | Does |
|---|---|
| `partKey({ package, record, kitVersion? })` | a part's content key: `sha256(KIT_VERSION \0 package key \0 canonical(keyed(record)))` |
| `keyed(record)` | the record as the key sees it: without `reads`, and each declaration under `params` with its `value` replaced by the value's type (`valueType`: `number`, `boolean`, `string`, `null`, `array` or `object`; the rest of the declaration stays) |
| `compositionKey(parts, wires, show)` | the hash of the parts' keys by name (sorted), the composed record's wires and the shown part |
| `nextRevision(previous, key)` | 1 for a first build; the same revision when the key is unchanged; the next when it changed |
| `buildEvent({ part, boundary, trigger, before, after, consumers, diagnostics?, input?, edges? })` | one rebuild as data (below); `after: null` for a rebuild that failed |
| `paramTrigger(record, param, from, to)` | `{ kind: "param", param, from, to, reads: [{ file, line, by }] }` from the record's `reads` |
| `packageTrigger({ key, files? }, { key, files? })` | `{ kind: "package", from, to, files }`: the paths whose hashes differ, when both `files` maps are given |
| `glueTrigger(call?)` | `{ kind: "glue", call }` |
| `sha256(text)` | `"sha256-<base64>"` of the UTF-8 bytes, synchronous; equal to kit/package's `hashText` |
| `canonical(value)` | one text per value: JSON with every object's keys sorted, and `NaN`, `Infinity`, `-Infinity` and `-0` spelled out (JSON makes the first three null and the last 0), so a content key tells them apart; plain JSON data gives its JSON text |
| `stateHash(value)` | a fast 53-bit hash of the canonical text (14 hex digits), for comparing a run's states instant by instant; not a content key |

**A build event** is `{ kind: "build", part, boundary: { after, before }, trigger, ok, changed, key: { before, after }, revision: { before, after }, record, kernels: { changed, added, removed, unchanged }, consumers, diagnostics }`. `boundary` is the instant boundary it landed on, as rational text (`after` null before the first instant); `after` equal to `before` is the boundary right after that instant, where a param wire's input lands (kit/run). `changed` is whether the key changed; when not, the revision is kept and the event is the answer to "why didn't my change do anything?". `record` lists the record's top-level keys that differ, compared as the key sees them (`keyed`), so a param's new value alone is no changed field. `kernels` compares each lambda's emitted source by id. `consumers` are the inputs fed by the part's outputs, which see the new revision in `inputs.$rev`. `input` (optional, set by kit/run) is the position in the run log's inputs of the input that applied the rebuild: the why text splits the log's inputs between builds by it, so two builds at one stamp each list their own. `edges` (optional, set by kit/run on a build that succeeded, only when one moved) lists each frame edge the rebuild's re-plan moved, `{ from, to, before, after }`: its two frames as `<part>.<frame>` and its `{ scale, offset }` before and after (`null` for an edge that appeared or went; kit/run's "Re-planning on a rebuild"). The human-facing text is `why` (below).

## The why text

`why(builds, log, { part?, since?, base? })` and `formatBuild(event, { log?, base?, inputs? })` (`why.js`): pure text, no I/O, for an agent reading cold. `run.why(part?, since?)` in [kit/run](../run/README.md) passes it the run's own events and log. Format version 2 of [the why-text trial](../../project/2026-11-26-why-text-trial-findings.md) ("The format" there has full examples). Each build is a block: a head line, `build <part>@<rev> after instant <A>, at <T> (before the next instant)` (a rebuild lands at its own stamp, which need not be an instant; times as rational text with seconds beside them; `: rebuilt, nothing changed; revision kept` for a no-op; `build <part> FAILED …; <part>@<rev> keeps running` for a failure), then

- `because:` the trigger: a param's old and new values, the param input in the log that set it (`set by the wire <part>.out.<port> → <part>.param.<name>, in a param input stamped …` when a param wire made it: the input's `wire`), and each build-time read (`file:line`, and the builder call made next); a package's two keys and changed files; the glue edit's call; the two kit versions;
- `key:` the two keys cut to six characters, and the record fields that differ (`params` there is a changed declaration, never a value);
- `kernels:` each recompiled, added, removed or unchanged; `edges:` (only when the event has them) each moved edge, `<from> → <to> <before> → <after>`; `consumers:` who read the old revision before the boundary and the new one (`$rev`) from their first step at or after it (for a build right after an instant, `through` that instant and `from their first step after it`; its first line says `right after instant <T>`). A build the same part's next changed build supersedes at the same boundary (the same stamp and the same instant before it) says `never read <part>@<n>: superseded by <part>@<m> before any consumer step`, and that next build names the revision consumers last read; when the next build lands at a later stamp the text says `at any step from <T> until <part>@<m> landed at <T'>`, claiming no step happened; `inputs:` the log's inputs since the part's previous build, frames left out (a param wire's as `<part>.$.<name> = <value> (wire <part>.out.<port>)`).

`why` heads its output with the count of rebuilds (`why cave: 2 rebuilds in the run log; cave@3 now`, or `2 rebuilds since T=1/3 (0.333 s)` when `since` is given, or `no rebuilds` for a part that never rebuilt). `since` is rational text. Read paths are shown relative to the directory every build-time read shares (`readBase(builds)`), so a `file://` URL does not reach the text; `base` overrides it, and `""` keeps the whole URL.

## Invariants

- **The record is the dependency list, and a param's value is not in the key** (ruled 2026-11-26, leaf `x3iG6D`). A param build-time code read is in the record where the code put it; a param only Kernels read reaches them through `$` each step, never compiled in. So `partKey` hashes each param's declaration (its type, bounds, options) but not its `value`: the type, which comes only from the value, is kept as `valueType` (leaf `DJZ2z2`: a change of type alone kept the key and the compiled code, which a Dialect can type by it), and a param change that builds the same record keeps the revision: the why text says `rebuilt, nothing changed; revision kept`. Until then this line said a Kernel-only param changed no key, which was wrong: `record.params` carries every value, and the key hashed it, so every build-time param change bumped the revision (the [why-text trial](../../project/2026-11-26-why-text-trial-findings.md), finding 2). The record's `reads` (file, line, next call) are left out of the key: they move when the glue's lines do, and they are what a param trigger cites. A Grammar whose root keeps its calls (`record: "calls"`) has no `params` object, so its param values are still keyed; kit/run reads params from `record.params` too.
- **A revision bumps only when the key changes.** Revisions number one run's builds; replay reproduces them. Content keys compare across runs.
- **One struct for every reader.** The scheduler, the page and the lab API read the same events; the text below is written from them and from the input log only, so a replay gives the same text.

## Not built

A content-keyed cache (un-park on a measured slow build), stable lambda identity across edits (lambda ids stay positional), an origin on outside `param` and `rebuild` inputs (who set the value: the page, the host or a script), so the `because:` line cannot yet say who; a param wire's input does say (its `wire`, kit/run). Un-park it when the kit decides who stamps it: the host's `run.input` call, or the log's header per source.
