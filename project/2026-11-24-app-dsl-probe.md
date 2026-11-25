# App-DSL probe: how pure can a conventional app's lambdas be?

*2026-11-24. Ben asked what a DSL for a very vanilla app would look like, to see how far "pure by default, effects declared per slot" reaches beyond games and shaders. Two Opus agents designed one for the same app, an iOS-style reading list with a REST API, a local cache, offline edits and sync. **Informed** ([informed.md](2026-11-24-app-dsl-probe/informed.md)) ran in the repo and read START.md, API.md, the [particles plan](2026-11-24-particles-effects-plan.md), the particles sheet and the DMG effects census. **Blind** ([blind.md](2026-11-24-app-dsl-probe/blind.md)) ran as `claude -p --model opus --effort xhigh` in a scratch directory outside the repo, with only [the brief](2026-11-24-app-dsl-probe/brief.md). Nothing here is built.*

## The answer

**Every author lambda can be pure.** Neither design has a lambda that does I/O, awaits, or reads the clock:

- **Informed:** 29 lambdas. 16 are pure functions, 7 write only the instance they are handed (sugar for returning a new value), and 6 call deferred verbs (`go`, `refresh`, `edit.star(…)`).
- **Blind:** 34 run-time lambdas, all pure. 16 of them return commands (`cmd.edit`, `cmd.go`).

The two arrived independently at the same architecture, the Elm "commands as values" shape: a lambda builds a request or a command, the host runs it, and the response goes to a sibling slot. Shared mutable state (the cache, the outbox, the token, the nav stack) is **owned by the host, never written by a lambda**. That keeps the IR synchronous, makes every lambda replayable from a recorded network log, and puts every race in one place, the host's serial queue.

The cost moves to the host. Both say so plainly: "the language here is thin and the host is thick" (informed). The host is weeks of careful work: storage with transactions, the outbox, retries, single-flight auth, scheduling and reachability.

## Where they agree

1. **No async in lambdas.** Both refuse `await` and `fetch` and argue against awaited calls: an `await` lets two lambdas interleave over shared state, which is the race the design exists to rule out.
2. **The clock is an argument** (`now`), never `Date.now()`, so lambdas replay.
3. **A screen shows the server row with pending edits folded over it,** recomputed when either changes. A background refresh then cannot lose an offline edit. Informed calls this the place where "own-instance writes as values" earns its keep.
4. **The outbox is ordered per record.** Informed: "a per-key ordered log", a fourth category beside pure, own-instance and commutative-or-run-once. Blind: one patch per record, drained in first-dirty order, one request in flight. Edits to one record do not commute (the last star wins); edits to different records do.
5. **Conflict rules are pure,** and the host keeps a base snapshot beside each pending edit.
6. **Toggles move out of the edit.** Both compute `!starred` in the event handler and pass the new value, so a replayed edit cannot flip twice. Informed makes this a checker rule (a write may not read the field it writes).
7. **Leave to ordinary code:** layout and components, multi-step flows such as OAuth sign-in, error banners and the host itself.

## Where they differ, and what each implies for the kit

| | Informed | Blind | For the kit |
|---|---|---|---|
| Edit form | own-instance mutation, `a.read = true` | returns a new record, `({ ...a, read })` | the same meaning; the blind form needs object literals and spread in lambdas, which the subset lacks |
| List logic | declarative `.where`, `.order`, `.count` constructs | `db.Article.filter(…).toSorted(…).map(…)` in a view | the blind form needs closures and higher-order list operations; informed stays inside today's subset, as the data Dialect does |
| Conflicts | per edit: `"apply"`, `"drop"` or `"ask"` | per field, three-way: no rule needed for a two-valued field, a merge function for the rest | the blind rule is more principled, and its "a string field with no merge rule" refusal is checkable from the schema |
| Checking | static, from the IR, plus cross-lambda checks (`apply` against `send`) | static, plus running pure lambdas on fixtures and generated inputs | the reference interpreter can do the blind one's fixture runs; cross-lambda checks need a hook that sees two lambdas' IR |
| Structure | one flat chain with child constructs | nested configurator closures (`r => r.key(…)`) | blind itself calls the nesting noise; the kit's flat chain avoids it |
| Components | intents named in the Program | a manifest per component, listing the events it emits, checked against the handlers | worth borrowing: it catches a handler for an event nothing emits |

## What this means for per-slot effects

- **The framing generalizes, but for apps the categories collapse.** Lambdas need only "pure", "write the instance you were handed" and "emit a deferred verb or command". `emit` is already an IR effect kind. The fourth category, the per-key log, is real, but it is a property of the **host's** outbox, not of any lambda, so it needs no slot rule. That answers the note on [`EZex6F`](2026-11-24-particles-effects-plan.md): park the ordered log as host semantics, and give it no slot rule.
- **Intrinsics that build requests are pure.** `get(…)`, `patch(…)` and `waitFor(…)` return values the host runs. This matches the rule now on the draft leaf: an intrinsic declares its effect kinds, async never enters a lambda, and the Dialect author vouches for each intrinsic's declared effects.
- **New gaps, in order of cost:**
  1. Optional values in data shapes (`"str?"`), and narrowing surfaced as L diagnostics. The IR already has optionals.
  2. Records typed from Program data (`.wire`, `.store`), as the data Dialect types tables from a schema.
  3. Object literals in lambdas, typed against a struct, for request bodies.
  4. A hook that checks two lambdas' IR together.

  None is needed for particles. They wait for an app-shaped domain, if one is chosen.

**On Ben's question, "how pervasive does shared state need to be?"** Across the three probes (the DMG census, particles and this one), lambdas almost never need to write shared state. Games write it from code that runs once, plus counters. Particles need none. Apps need none at all once effects are values. Shared mutable state is pervasive in these programs, but it can live in the host, behind commands and declared verbs, and lambdas stay pure or own-instance.
