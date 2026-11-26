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
| `partKey({ package, record, kitVersion? })` | a part's content key: `sha256(KIT_VERSION \0 package key \0 canonical(record without reads))` |
| `compositionKey(parts, wires, show)` | the hash of the parts' keys by name (sorted), the composed record's wires and the shown part |
| `nextRevision(previous, key)` | 1 for a first build; the same revision when the key is unchanged; the next when it changed |
| `buildEvent({ part, boundary, trigger, before, after, consumers, diagnostics? })` | one rebuild as data (below); `after: null` for a rebuild that failed |
| `paramTrigger(record, param, from, to)` | `{ kind: "param", param, from, to, reads: [{ file, line, by }] }` from the record's `reads` |
| `packageTrigger({ key, files? }, { key, files? })` | `{ kind: "package", from, to, files }`: the paths whose hashes differ, when both `files` maps are given |
| `glueTrigger(call?)` | `{ kind: "glue", call }` |
| `sha256(text)` | `"sha256-<base64>"` of the UTF-8 bytes, synchronous; equal to kit/package's `hashText` |
| `canonical(value)` | one text per value: JSON with every object's keys sorted, and `NaN`, `Infinity`, `-Infinity` and `-0` spelled out (JSON makes the first three null and the last 0), so a content key tells them apart; plain JSON data gives its JSON text |
| `stateHash(value)` | a fast 53-bit hash of the canonical text (14 hex digits), for comparing a run's states instant by instant; not a content key |

**A build event** is `{ kind: "build", part, boundary: { after, before }, trigger, ok, changed, key: { before, after }, revision: { before, after }, record, kernels: { changed, added, removed, unchanged }, consumers, diagnostics }`. `boundary` is the instant boundary it landed on, as rational text (`after` null before the first instant). `changed` is whether the key changed; when not, the revision is kept and the event is the answer to "why didn't my change do anything?". `record` lists the record's top-level keys that differ. `kernels` compares each lambda's emitted source by id. `consumers` are the inputs fed by the part's outputs, which see the new revision in `inputs.$rev`. The human-facing "why" text is written from these fields later, after its trial.

## Invariants

- **The record is the dependency list.** A param build-time code read is in the record where the code put it; a param only Kernels read is not, so changing it changes no key. The record's `reads` (file, line, next call) are left out of the key: they move when the glue's lines do, and they are what a param trigger cites.
- **A revision bumps only when the key changes.** Revisions number one run's builds; replay reproduces them. Content keys compare across runs.
- **One struct for every reader.** The scheduler, the page and the lab API read the same events; nothing here formats them.

## Not built

A content-keyed cache (un-park on a measured slow build), stable lambda identity across edits (lambda ids stay positional), the `why` text.
