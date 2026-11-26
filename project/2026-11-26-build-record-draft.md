# Draft: the build record — identity, revision, content key, and why a part rebuilt

*2026-11-26, leaf `HKNInI` (M4 Composition, `SPPLaM`). A design draft for Ben, not built and not ruled. Inputs:*
- *[the architecture synthesis](2026-11-24-architecture-synthesis.md) §3.7, from Manuel's pass-design gist: keep identity, revision and content key apart; answer "why did this rebuild?" from a dependency record, not opaque hashes; no pass framework at our scale;*
- *[the clocks draft](2026-11-25-clocks-draft.md) as ruled, which needs a revision per rebuild that consumers can see (`inputs.$rev`), rebuilds between instants, and replay from a log;*
- *what is already built: kit/package's content key (`contentKey`), kit/define's recorded build-time reads (`record.reads`, `needsRebuild`), and lambda slot ids (`<on>.<slot>#<index>`).*

## The problem in one paragraph

A composed workbench rebuilds parts while it runs. A param that build-time code read changes, a package is upgraded, or the glue is edited. Three questions then need different answers, and today nothing keeps them apart. *Which thing is this?* A trace link, a debugger breakpoint or a wire must still point at "the maze part" after an edit. *Which version of it is this?* A consumer must know that the snapshot it read came from a new build; the double descent in [the composition trial](2026-11-24-composition-trial.md) is what happens when it can't. *Can a result be reused?* An unchanged part should not rebuild or recompile. And when something does rebuild, the author and the agent need one sentence saying why.

## Three keys, kept apart

| Key | Answers | Form | Changes when |
|---|---|---|---|
| **Identity** | which object | an address: `coin-bursts#level`, `coin-bursts#level/emitter:pop` | the glue renames the part or the instance, never on a rebuild |
| **Revision** | which version of it, in this run | a counter per part: `level@3` | the part's content key changes |
| **Content key** | can a result be reused | `sha256-…`, as kit/package's | anything the build's output depends on changes |

### Identity

- **A part is identified by its opening name in the glue** (`maze("level")`), unique in the composition (S101 already). That is the stable handle across edits to the part's Program, its params, and its package version.
- **Inside a part, a named instance is identified by its name** (`emitter:pop`, a construct with state: kit/define already finds those by name). A lambda is identified by its slot id, `<on>.<slot>#<index>`, as today.
- **The index is positional, and that is a known weakness:** inserting a call above shifts every later `#n`. For v0 it is acceptable. Breakpoints and trace links are per build, and a part-level identity is all the scheduler and the wires need. Stable lambda ids (matching old to new by construct, name and text) are parked until the debugger keeps something across a rebuild.

### Revision

- **A revision is per part, starts at 1 when the run starts, and bumps only when the part's content key changes.** A rebuild that produces the same key (a param changed, but nothing at build read it differently; a package re-hashed with no change) keeps the revision. Consumers never see a revision change that isn't a real one.
- **A rebuild lands between instants** (clocks ruling 7). Its snapshot carries the new revision, and `inputs.$rev` shows it to consumers. The composed workbench has its own revision, which bumps when any part's does or the glue changes.
- **Revisions are not global versions.** They number one run's builds, so replay reproduces them exactly (below), and two runs' `level@3` are not comparable. What *is* comparable across runs is the content key.

### Content key

- **A part's content key is the hash of exactly what determines its built record and Kernels:** the kit version (`KIT_VERSION`), the package's content key (kit/package, which already covers every file and the manifest byte for byte), and the part's built record in a canonical form.
- **The built record already folds in build-time reads** (kit/define's binding-time design): a param that build-time code read is in the record where the code put it, and a param only Kernels read is a uniform, not baked. So hashing the record covers exactly the params that matter, with no separate manifest. A change to a live param changes no key and rebuilds nothing.
- **A composition's content key** is the hash of its parts' keys (by identity, sorted) and the glue's frames and wires as data.
- **Caching is not in v0.** Kernels compile in milliseconds (synthesis §3.7). The key is what a cache would use, so adding one later is cheap. Un-park when a measured build is slow, or when a Dialect's own build step (a cave, a BVH) is expensive.

## Why it rebuilt

Every rebuild writes one **build event**, and the "why" is read from it:

```
build level@3 at T=12.5 (between instants 100 and 101)
  because: param level.$.depth changed 2 → 3; read at maze-level.js:14 (before level.grid#0)
  key:     sha256-Qm… → sha256-Xr… (record changed: grid, start)
  kernels: level.control#0 unchanged; level.spawn#0 recompiled
  consumers: fx reads level.out.picked (revision change seen at instant 101)
```

- **Triggers** come from what is already recorded: a param read at build time (`record.reads`: param, old and new value, file, line, the next builder call), a package whose content key changed (with the files that changed, from the two `files` maps), a glue edit (which call), or a kit upgrade.
- **The outcome** is the key comparison. If the key is unchanged, the event says "rebuilt, no change; revision kept", which is the answer to "why didn't my change do anything?".
- **The event names what changed downstream:** which Kernels differ, and which consumers will see the new revision. That is the double descent's explanation, written down instead of discovered.
- **A rebuild that fails** keeps the previous revision running (as R004 keeps the last snapshot), and the event carries the diagnostics.

## One log for the run

Build events go in the **run log**, beside the clocks draft's input log, each stamped with the instant boundary it landed on. The log is append-only (the principle's event stream). One log then serves three readers:

- **Replay** reproduces rebuilds, and so revisions, exactly. A param change or a package swap is an input like a D-pad press, stamped with `T`, so a replay with the same log rebuilds at the same boundaries.
- **The lab API's `why(address)`** (for the agent and the page) is a query over it: the latest build event for that part, or every one since `T`.
- **The debugger and traces** carry `part@revision` on every snapshot and diagnostic, so a trace line says which build it came from.

## Where it lives

A small kit module, `kit/build`, with no I/O: computing a part's content key from a built record, comparing two builds into an event, and the log's types. kit/compose calls it when it builds a composition, and the scheduler (`ZH4KWX`) calls it on a rebuild and writes the log. It stays a separate module because the scheduler, the page and the lab API all read the same records. One struct, imported by all three, rather than a twin in each.

## Parked

- **A content-keyed cache** of built records and Kernels (above).
- **Stable lambda identity across edits** (above).
- **A pass manager, strategies and incremental queries** (synthesis §3.7: dead weight at our scale; the backlog entry stands).
- **Provenance below the record** (which builder call produced which IR node). Spans and slot ids already cover what the debugger needs.

## Questions for Ben

1. **A revision bumps only when the content key changes**, not on every rebuild. Recommended: consumers and logs see only real changes, and a no-op rebuild says so instead of looking like a change.
2. **Identity at the part and named-instance level; positional lambda ids kept for v0.** Recommended: the scheduler and wires need only parts, and stable lambda ids are a real design problem better solved when the debugger needs it.
3. **The content key hashes the canonical built record** (plus the kit version and the package's key), not a separate list of dependencies. Recommended: the record already folds in exactly the build-time reads, so the two cannot drift. The alternative, a manifest of everything read, is what Manuel's gist describes, but kit/define already gives it to us for free in `reads`, which the "why" uses.
4. **Build events in the run log, beside inputs**, so replay covers rebuilds and "why" is a query. Recommended.
5. **No cache in v0.** Recommended; un-park on a measured slow build.

## Next

The "why" text is something agents will read, so per the dogfood ruling it gets a small trial before it is built. Replay the composition trial's double descent (the game raises `depth`, the cave rebuilds, the exit vanishes) as a scripted run, then hand fresh agents the run log's `why` output and the bug report. The question: can they say what happened and fix it from the output alone? Then build `kit/build` alongside `ZH4KWX`, which writes the log.
