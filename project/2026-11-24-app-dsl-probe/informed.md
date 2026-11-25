# A reading-list app in the kit's shape

*app-designer (Opus, in the repo, read-only), 2026-11-24. Saved by the integrator from the agent's returned report, verbatim. This is a design probe and nothing here is built. It sources only START.md, API.md, the particles effects plan, the particles Dream Code sheet, the DMG effects census, and two lines of kit/ir/README.md that it checked: the IR already has optionals with narrowing, structs and unions, and it records the effects `read`, `write`, `rng`, `emit` and `call`.*

**The finding up front.** The framing generalizes further than I expected. It does so because every network effect becomes a value that a lambda returns and the host runs. In the Program below, **no lambda does I/O, awaits, or reads the clock.** There are 29 lambdas:
- 16 are pure functions that return a value.
- 7 write only the instance they were handed, which is sugar for returning a new value.
- 6 call deferred verbs, like particles' `p.kill()`.

Everything irreducibly effectful or order-dependent sits in the host runtime: storage, the outbox drain, the scheduler, retries, auth and navigation. That runtime is the real cost of this domain, and the language does not remove it. The framing breaks in one place. The outbox is a **per-key ordered log**: it is neither a commutative bump nor code that runs once.

## 1. Dream Code

```js
import { app } from "../reading.grammar.js";

// Top-level plain data and pure helpers: lambdas may use them.
const PAGE = 50;
const MAX_TRIES = 5;
const backoff = (attempt) => Math.min(60, Math.pow(2, attempt));

export default ($) => app("reading")
  // A setting is a param the user owns: persisted, shown on a screen, read as $.name.
  .setting("syncMinutes", { value: 15, min: 5, max: 120, whole: true })

  // Wire shapes: what the server sends. The host checks every response against one.
  .wire("ArticleJSON", {
    id: "str", title: "str", url: "str", updated_at: "time",
    read: "bool", starred: "bool", "note?": "str", "body?": "str", "deleted?": "bool",
  })
  .wire("PageJSON", { items: "ArticleJSON[]", "next?": "str" })
  .wire("TokenJSON", { access_token: "str", refresh_token: "str", expires_in: "number" })

  // The cache: one keyed table. `version` lets the host drop a response older than its row.
  .store("Article", {
    key: "id", version: "updatedAt",
    fields: { title: "str", url: "str", updatedAt: "time", read: "bool",
              starred: "bool", "note?": "str", "body?": "str" },
  })

  // The server. The host adds the bearer header; no lambda sees the access token.
  .api("server", { base: "https://api.example.com/v1", auth: "bearer" })
    .refresh((tok) => post("/auth/refresh", {}, { refresh_token: tok.refresh }))
    .token("TokenJSON", (t, w) => {
      t.access = w.access_token; t.refresh = w.refresh_token; t.expiresIn = w.expires_in;
    })
    .retry((err, attempt) =>                 // offline and 401 never reach here: the host owns them
      err.status === 429 ? waitFor(err.retryAfter)
      : err.status >= 500 && attempt < MAX_TRIES ? waitFor(backoff(attempt))
      : giveUp())

  // Incremental list sync. `since` is the last completed sync's time (null the first time).
  .sync("articles", { from: "server", store: "Article", wire: "PageJSON", items: "items" })
    .request((since, cursor) => get("/articles", { since: since, cursor: cursor, limit: PAGE }))
    .next((page) => page.next)               // the host fetches again while this is not null
    .merge((a, w) => {                       // a: the cached row with w's key, or a fresh one
      if (w.deleted === true) {
        a.drop();
      } else {
        a.title = w.title; a.url = w.url; a.updatedAt = w.updated_at;
        a.read = w.read; a.starred = w.starred; a.note = w.note;
      }
    })
    .stale((last, now) => minutesSince(last, now) >= $.syncMinutes)

  // One article's body, fetched when its screen shows and stale says so.
  .fetch("detail", { from: "server", store: "Article", wire: "ArticleJSON" })
    .request((a) => get("/articles/:id", { id: a.id }))
    .merge((a, w) => { a.body = w.body; a.updatedAt = w.updated_at; })
    .stale((a, last, now) => a.body === null || minutesSince(last, now) >= $.syncMinutes)

  // Edits: the user's changes. Each waits in the outbox until the server takes it.
  .edit("markRead", { store: "Article" })
    .apply((a) => { a.read = true; })
    .send((a) => patch("/articles/:id", { id: a.id }, { read: true }))
    .conflict((base, theirs) => "apply")     // read only goes one way: replaying is safe
  .edit("star", { store: "Article", args: { on: "bool" } })
    .apply((a, x) => { a.starred = x.on; })
    .send((a, x) => patch("/articles/:id", { id: a.id }, { starred: x.on }))
    .conflict((base, theirs, x) => (theirs.starred === base.starred ? "apply" : "drop"))
  .edit("note", { store: "Article", args: { text: "str" }, coalesce: true })
    .apply((a, x) => { a.note = x.text; })
    .send((a, x) => patch("/articles/:id", { id: a.id }, { note: x.text }))
    .conflict((base, theirs, x) => (theirs.note === base.note ? "apply" : "ask"))

  // Screens: state of their own, rows derived from the cache with pending edits applied.
  .screen("list", { start: true, state: { filter: { value: "unread", of: ["all", "unread", "starred"] } } })
    .rows("Article")
    .where((a, s) => (s.filter === "unread" ? !a.read : s.filter === "starred" ? a.starred : true))
    .order("updatedAt", "desc")
    .count("unread", (a) => !a.read)
    .intent("pick", { arg: "filter" }, (s, f) => { s.filter = f; })
    .intent("open", { arg: "Article" }, (s, a) => { go("detail", a); })
    .intent("pull", {}, (s) => { refresh("articles"); })
    .intent("toggleStar", { arg: "Article" }, (s, a) => { edit.star(a, { on: !a.starred }); })
  .screen("detail", { of: "Article", state: { editing: { value: false } } })
    .loads("detail")
    .intent("appear", {}, (s, a) => { if (!a.read) { edit.markRead(a); } })
    .intent("star", {}, (s, a) => { edit.star(a, { on: !a.starred }); })
    .intent("saveNote", { arg: "str" }, (s, a, text) => { edit.note(a, { text: text }); s.editing = false; })
  .screen("settings", {})
    .slider("syncMinutes", { label: "Sync every", unit: "min" })
    .readout("pending", (o) => o.count);     // o: the outbox summary, read-only
```

That is about 100 lines.

**What the host does with it.**
- **On launch** it renders from the cache and runs every `stale` check.
- **When the network returns, the app comes to the foreground, or a timer fires** (the timer is set from `$.syncMinutes`), it drains the outbox and then runs any stale syncs.
- **On a 401** it runs `refresh` once, as a single flight, and replays the requests that were waiting. If the refresh itself fails, it signs the user out.
- **Offline** it parks requests until the network is reachable.
- **On a 409 or 412 for an edit** (a precondition failure on `ifMatch` / `updatedAt`), it fetches the article and calls `conflict(base, theirs, args)`. `"apply"` resends the edit over the server's change, `"drop"` discards it, and `"ask"` raises a conflict sheet, which is ordinary UI code.

## 2. The lambdas

| Lambda | Receives | Gives | May do | Class |
|---|---|---|---|---|
| `api.refresh` | `tok` (refresh token only) | a `Request` | nothing | pure |
| `api.token` | `t` (new token), `w: TokenJSON` | nothing | write `t`'s fields | own-instance |
| `api.retry` | `err {status, retryAfter}`, `attempt` | `waitFor(s)` or `giveUp()` | nothing | pure |
| `sync.request` | `since: time?`, `cursor: str?` | a `Request` | nothing | pure |
| `sync.next` | `page: PageJSON` | `str?` | nothing | pure |
| `sync.merge`, `fetch.merge` | `a: Article` (this key), `w` (one wire item) | nothing | write `a`'s non-key fields; `a.drop()` (sync only) | own-instance + verb |
| `sync.stale`, `fetch.stale` | (`a`), `last: time`, `now: time` | `bool` | nothing | pure; the clock is an argument |
| `fetch.request` | `a: Article` | a `Request` | nothing | pure |
| `edit.apply` | `a: Article`, `x` (args) | nothing | write `a`'s fields **from `x` and constants only** | own-instance |
| `edit.send` | `a`, `x` | a `Request` whose body is checked against the wire | nothing | pure |
| `edit.conflict` | `base`, `theirs: Article`, `x` | `"apply"`, `"drop"` or `"ask"` | nothing | pure |
| `screen.where`, `screen.count` | `a` (an overlaid row), (`s`) | `bool` | nothing | pure |
| `screen.readout` | the outbox summary | a value | read only | pure |
| `screen.intent` | `s` (own state), (`a`), the arg | nothing | write `s`; verbs `go`, `refresh`, `edit.*` | own-instance + deferred verbs |

**Effects, by kind.** I use the IR's kinds, plus one new kind, `net`.
- **Network:** no lambda has it. Request slots return a `Request` value, which is data, and the host runs it.
- **Cache read:** implicit. A lambda reads only the row it is handed, never runs a query.
- **Cache write:** `merge` (server truth) only. `apply` writes an *overlay* that the host recomputes and never stores as truth.
- **Outbox:** append only, through `edit.*`, which is an `emit` from intents.
- **Navigation:** `go`, an `emit` from intents.
- **Timers:** none in lambdas. The host derives them from `stale` and `$.syncMinutes`.
- **Clock:** `now` is a parameter, so the host can replay a lambda.
- **rng:** none.

**Who owns each piece of state.**

| State | Owner | Written by |
|---|---|---|
| Article rows (server truth) | host store | `merge`, one key per call, guarded by `version` |
| What a screen shows | nobody (derived) | `fold(apply, row, pendingEdits(row))`, recomputed |
| Outbox | host | appended by `edit.*` verbs; drained by the host |
| Sync cursor `since`, last-sync times | host | committed once per *completed* sync |
| Token | host keychain | `token`, once per refresh |
| Screen state (`filter`, `editing`) | the screen instance | its own intents |
| Navigation stack | host | `go` verbs, applied in order |
| Settings | host, persisted | the slider (UI); lambdas read `$.syncMinutes` |

## 3. Shared mutable state

**Cache.** Every write to the cache is "own instance as a new value". `merge` is handed exactly one row, chosen by the wire item's key, and it may write only that row. The host commits a page's merges as one transaction, so screens see either the whole page or none of it. Two host rules make this safe without the lambdas knowing:
1. **The version guard.** A wire item older than the cached row is skipped. This handles out-of-order responses, such as a slow detail fetch landing after a newer list sync.
2. **Idempotence.** `merge` writes only from `w`, never from the fields it writes (refusal 7). So merging the same page twice gives the same row. That lets the host keep the merged pages after paging fails halfway and simply leave `since` uncommitted.

**The view is not the cache.** A screen shows `server row ⊕ pending edits`. This is the one place the framing earns its keep. `apply` is a pure function of `(row, args)`, so when a background sync replaces the server row under a pending edit, the host just refolds, and the user's star survives. With mutation in place, that would be a lost update. Rebase is free *because* own-instance writes are values.

**Outbox: where the framing breaks.** The edits do not commute:
- `markRead` is a join (read only ever goes from false to true). It commutes and is idempotent: it is the app's one "commutative bump", and its conflict rule is trivially `"apply"`.
- `star(on)` and `note(text)` are idempotent sets, but two of them on one article do not commute: the last one wins.

So the outbox needs a fourth category the framing lacks: **a log ordered per key**. Edits to the same article drain in order, while edits to different articles commute and can run in parallel. `coalesce: true` lets the host fold consecutive sets on one key. The framing *helps* here too: refusal 7 bans a toggle (`a.starred = !a.starred`), which would flip twice on replay. The toggle moves to the intent, which reads the overlaid row once and enqueues an explicit value.

**Conflicts are the network form of a race.** The protocol detects them, through versions and a base snapshot; nothing prevents them. The rule is a pure three-way decision, but the *base* is state the host must keep beside each edit (a copy of the server row when the edit was enqueued). No category in the framing predicts that state. It is the price of offline writes.

**Code that runs once per event.** This covers the rest:
- the token refresh, once per burst of 401s, made single flight by the host;
- committing `since`, once per completed sync;
- each intent, once per user action, serialized by the host.

An intent that calls `go` twice is order-dependent, and refusal 13 refuses it.

**How much is pure.** Of the 29 lambdas, 16 are pure functions, 7 are own-instance writes (pure once desugared), and 6 emit deferred verbs. **No lambda is effectful in the sense of touching the world.** What is irreducibly effectful or order-dependent lives in the host:
- I/O and persistence;
- the clock and timers;
- reachability;
- auth single-flight;
- the per-key outbox order;
- the base snapshot;
- transactional page commits;
- the navigation stack.

**How async enters.** I considered three ways:
- **(a) Awaited calls in lambdas.** Every lambda becomes a coroutine. Cache reads would straddle a yield, so two lambdas could interleave at every `await`. That is exactly the shared-state race the framing exists to rule out. The IR would need continuations, and the interpreter would need a scheduler.
- **(b) Requests a lambda returns, with the response handed to a sibling slot** (`request` → host → `merge`, `next`). This is the Elm `Cmd` shape. The IR stays synchronous, and a lambda runs to completion, so the only interleaving is *between* whole lambdas, which the host serializes. A recorded network log replays deterministically through the reference interpreter. Retry, backoff, auth and offline become policy, not code paths.
- **(c) Host-owned declarative resources.** `sync`, `fetch` and `edit` are constructs. The host knows their lifecycle, so the Program states *what* to keep fresh, not *when* to call.

**I chose (c) for structure, with (b) inside it.** The cost is that an arbitrary chain ("fetch A, then B using A's answer") is not expressible, except for paging, which `next` covers. That is deliberate, and section 6 says where such chains go.

## 4. Refusals

Codes `A…` are this Dialect's own. The `B…` and `L…` codes are the kit's.

1. **`async`, `await` or `fetch(…)` in a lambda.** `A001 lambdas never wait: return a request and the host runs it`, with the fix `.request((…) => get("/articles", {…}))`.
2. **`get`, `post` or `patch` outside a request, refresh or send slot** (for example in an intent). `A002 a request is built only in request slots`, with the fix `refresh("articles")`.
3. **`Date.now()` or `new Date()`.** `B008 'Date' is not available`, tip: "`stale` receives `now`; edits are timestamped by the host."
4. **An intent that writes a row** (`a.read = true`). `A004 intents don't write the cache: enqueue an edit`, with the fix `edit.markRead(a)`.
5. **`merge` that writes the key** (`a.id = …`), or writes anything but `a`'s fields (`const b = a; b.title = …`, a param, a top-level name). `A005 merge writes only the row it was handed, never its key`.
6. **`apply` that writes a field its `send` never sends.** Found by the query layer (who writes a place, versus the body's keys): `A006 apply sets 'starred' but send doesn't send it; the change would vanish on sync`.
7. **`apply` or `merge` that reads a field it writes** (`a.starred = !a.starred`, `a.note = a.note + x.text`). `A007 edits replay and merges repeat; a write must come from the args or the wire`, fix: "pass the new value: `edit.star(a, { on: !a.starred })`."
8. **An intent that writes another screen's state, or a setting** (`$.syncMinutes = 5`). `A008 an intent writes only its own screen's state`.
9. **A verb in a pure slot** (`edit.star(…)` in `where`, `a.drop()` in `fetch.merge`). `A009 'where' is pure; edit verbs belong in an intent`.
10. **`go("detial", a)`.** `B003 no screen 'detial'. Did you mean 'detail'?`. A `go` to a screen with `of: "Article"` and no row is `A010 'detail' needs an Article`.
11. **A lambda that reads the access token** (`tok.access` in refresh, or any use of the token in `request`). `A011 the host adds the bearer header; refresh sees only the refresh token`.
12. **A use of an optional value without narrowing** (`a.body.length`, `page.next + "x"`). `L… 'a.body' may be null; test 'a.body !== null' first`.
13. **Two `go` calls on one path through an intent.** `A013 one navigation per intent; the order between them would be a guess`.
14. **A send body with a key not in the wire** (`{ stared: x.on }`), or a value of the wrong type. `A014 ArticleJSON has no 'stared'. Did you mean 'starred'?`
15. **A wire field read by the store's name** (`w.updatedAt`). `L… ArticleJSON has no 'updatedAt'. Did you mean 'updated_at'?`
16. **An edit missing `apply`, `send` or `conflict`; a second `.store` key; `version` naming no `time` field.** `B005` / `B006` / `A016`.
17. **`conflict` returning anything but its three outcomes** (`"keep"`), or `stale` returning a non-bool. `L… expected "apply" | "drop" | "ask"`.
18. **A top-level `let` or a write to a top-level constant.** `B013` / `A018 there is no state outside the store, the outbox and a screen's own state`.
19. **`.timer(…)`, `.interval(…)` or `.socket(…)`.** These are rejected names: `B009 the host schedules syncs from 'stale'; use .sync(…).stale(…)`.
20. **A setting whose `value` lies outside `min`..`max`, or a `.slider` naming an undeclared setting.** `B004` / `B003`.

## 5. Gap analysis

Each item gives what the Definition API and the IR lack. They run from cheapest to costliest.

1. **Per-slot effects.** This is the particles plan, almost as written: write own instance, destroy verb (`drop`), plus `emit` verbs (`go`, `refresh`, `edit.*`). There is one new rule, "writes come only from args or the wire, not from the written field". The query layer can already answer it, since it knows who writes a place and what a region reads. **Cheap, already planned.**
2. **Nominal opaque results.** `Request`, `waitFor`/`giveUp`, `time`. These are nominal types plus intrinsics, which the API already has. `time` is a `scalar`, so arithmetic on it is refused by design, and `minutesSince` carries the meaning. **Cheap.**
3. **Optional values.** The IR has optionals and narrowing. The Grammar's data shapes need a `"str?"` spelling for declared fields, and lambdas need `!== null` narrowing surfaced as L diagnostics. **Cheap to moderate.**
4. **Record types from Program data.** `.wire` and `.store` become struct objects through `environment()`, the way the data Dialect types tables from a schema. **Moderate.** What the subset lacks is **object literals in lambdas** (request bodies and query maps), typed against a struct with did-you-mean. There is also no `T[]` in data shapes for declared types.
5. **Intents (events with typed payloads).** `{ arg: "Article" }` decides the lambda's convention. A convention function `(ref, program, state)` can already build that. **Moderate.** What is missing is the "lambda as the third argument after a data spec" pattern being blessed and documented.
6. **Cross-construct checks.** `apply` against `send` (refusal 6), `go` against a screen's `of` (refusal 10). These need a check that sees two lambdas' IR at once. Construct `check` sees only the record, which holds lambda source text, not IR. **Moderate: a new hook.**
7. **A text view for an app.** `text(state)` would print the list screen as rows plus outbox and sync status. The shape fits; the state is large. **Moderate.**
8. **The host runtime.** This is the real cost, and it is not language work:
   - an IndexedDB store with transactions and the version guard;
   - the per-key outbox with base snapshots and coalescing;
   - the scheduler, reachability and backoff;
   - auth single-flight and sign-out;
   - the navigation stack;
   - the conflict sheet.

   It is weeks of careful engineering and the source of most bugs. The kit has no notion of a host library beyond `ref` per intrinsic. **High.**
9. **A Swift target**, if "iOS-style" means native. The kit emits JS and GLSL; a third backend plus a native host is **highest**. In a browser artifact it is not needed.

**Not needed, which is the point:** async in the IR, closures, and a general effect system.

**What the kit gives that a plain library does not.** Compare Redux with RTK Query, TanStack Query or a sync engine:
- **Effects refused before the app runs**, not by convention. "Reducers must be pure" is a comment in Redux; here it is refusal 9 at the exact span.
- **Checks across lambdas that libraries cannot make.** The toggle-replay bug (7) and the vanishing edit (6) are classic offline-sync bugs. Both are decidable from the IR.
- **Did-you-mean against the declared schema, end to end**: wire to store to request body to screen.
- **The whole app as one record.** An agent can read, diff and explain it, and a schema change between versions is a diff of `.store` from which a migration can be generated or demanded.
- **Deterministic replay.** Every lambda is pure or own-instance and receives the clock, so the reference interpreter can run the Program against a recorded network log. That gives offline and conflict scenarios as golden tests.
- **Settings as params.** The live slider reruns nothing; lambdas read `$.syncMinutes` at run time.

## 6. Where builder plus lambdas fits, and where it fights

**It fits the data plane.** That means schema, sync, outbox, conflict rules and derived lists. This is configuration with small decisions in it, which is the kit's sweet spot. The lambdas here are one to five lines. A small model gets them right because each slot hands it exactly one thing and the table says what it may do. Constructs also scope well: `.edit("star")` owns its three lambdas, and the builder's "a parent method ends the child" rule maps onto "the next edit starts".

**It fights in five places:**
- **Layout, animation, gestures, accessibility, platform idioms.** SwiftUI or HTML components do this better. I would leave all rendering to ordinary code that binds to intents by name. The DSL declares what a screen *knows and can do*, not how it looks.
- **Multi-step flows.** Sign-in with OAuth redirects, a "share to" extension, a chain of dependent requests. These are state machines across slots, which is awkward. I would leave them to ordinary host code that ends by handing the host a token.
- **Arbitrary logic over lists.** There are no closures or higher-order functions, so anything beyond `where`, `order` and `count` (grouping, search ranking) needs a construct per operation, as the data Dialect does, or ordinary code.
- **Long chains.** A 100-line chain with three child kinds is where a small model loses track of which construct it is in. Indentation hides that from no one but the reader. A block body that builds the chain in sections (`app = withEdits(app)`) would help, but that is fragments, which are not built.
- **Error UX.** Banners, "you are offline", and "sync failed, retry?" are host state shown by ordinary UI. The Program only classifies errors through `retry`.

Candidly, the language here is thin and the host is thick. The kit's value is not that it makes the app smaller; a plain library is about as short. Its value is that the sync rules that are easy to get wrong become checkable, and the app becomes a record an agent can read and replay.

## What in this brief is wrong?

1. **"Their state derives from the cache" is only partly true.** A screen shows the cache *with pending edits folded in*, not the cache alone. Screen state (`filter`), navigation and settings are not derived from it at all; each has its own owner.
2. **The framing's three categories do not cover the outbox.** It needs a fourth, a per-key ordered log. "Code that runs once per tick or event" also has no tick here; "event" means user intents, network-returned events and refresh bursts.
3. **The API as given cannot sync deletions.** `GET /articles?since=…` has no tombstone, so the cache never learns of a deletion. I assumed a `deleted` flag. Incremental sync with cursor paging also needs a stable server order and a server time for `since`; the device clock will not do.
4. **The brief lists "cache read/write" and "clock" as lambda effects.** In this design neither is one: rows and `now` are arguments. Treating them as effects would push the design toward awaited queries, the option I argue against.
5. **The auth flow is missing a screen.** A refresh token can itself expire, so there must be a signed-out route.
6. **"iOS-style" against "runs in the browser".** The kit emits JS and GLSL. A native app would need a Swift backend, which no milestone covers. I assumed a browser host.

I could not verify the DMG census claim myself; I took it as given.
