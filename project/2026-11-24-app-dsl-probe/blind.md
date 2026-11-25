# ReadList: a fluent DSL for an offline-first reading app

**The design rests on three rules.**

1. **Every lambda you write is a pure function.** It receives frozen values and returns a value. You cannot use `await`, `Date.now()` or `fetch`.
2. **Effects are values.** Event handlers return commands (`cmd.edit`, `cmd.go`, and so on), and the host performs them.
3. **The host is the only writer.** The cache and the outbox change only inside host transactions on one serial queue.

Configurator lambdas (`s => s.…`) run once, at build time, and may only call builder methods. Every other lambda runs at run time on a snapshot the host supplies.

## 1. Dream Code

```js
import { app, t, cmd, minutes, seconds } from "@readlist/dsl";
import { relativeTime, hostOf } from "./format.js"; // pure helpers, checked like lambdas

const EMPTY = { all: "No articles yet.", unread: "You’re all caught up.", starred: "Nothing starred yet." };

export default app("ReadingList")
  // ── Network ─────────────────────────────────────────────────────────
  .api(api => api
    .baseURL("https://api.readlist.example/v1")
    .bearerAuth({
      refresh: ({ refreshToken }) =>
        ({ method: "POST", path: "/auth/refresh", body: { refresh_token: refreshToken } }),
      tokens: json => ({ accessToken: json.access_token, refreshToken: json.refresh_token }),
    })
    .retry({
      serverError: { attempts: 4, firstDelay: seconds(2), maxDelay: minutes(2) }, // 5xx, timeouts
      rateLimited: "honorRetryAfter",                                             // 429
      offline: "waitForNetwork",
    }))

  // ── Data ────────────────────────────────────────────────────────────
  .record("Article", r => r
    .key("id")
    .server({
      id: t.string, title: t.string, url: t.url, author: t.string.optional(),
      summary: t.string, body: t.html.optional(), publishedAt: t.instant, version: t.int,
    })
    .user({ read: t.bool, starred: t.bool, note: t.string })
    // Called only when this device and the server changed `note` to different values.
    .merge({ note: (base, mine, theirs) => `${theirs}\n\n— edited on this iPhone —\n${mine}` })
    .writeBack(a => ({ method: "PATCH", path: `/articles/${a.id}`, ifMatch: a.version })))

  .source("articles", s => s
    .of("Article")
    .list({
      request: ({ since, cursor }) => ({ path: "/articles", query: { since, cursor } }),
      page: json => ({ items: json.items, next: json.next_cursor, watermark: json.server_time }),
      deletedId: item => (item.deleted_at ? String(item.id) : null),
    })
    .detail({ request: ({ id }) => ({ path: `/articles/${id}` }) })
    .decode(j => ({        // undefined = keep the cached value (list items omit body_html)
      id: String(j.id), title: j.title, url: j.url, author: j.author ?? null,
      summary: j.summary ?? "", body: j.body_html, publishedAt: j.published_at, version: j.version,
      read: j.is_read, starred: j.is_starred, note: j.note ?? "",
    }))
    .staleAfter(({ settings }) => minutes(settings.syncMinutes))
    .fixtures("fixtures/articles-page-1.json", "fixtures/article-42.json"))

  // Edits are pure reducers over user fields. The host applies them at once,
  // queues the changed fields, PATCHes them when online, and reconciles conflicts.
  .edit("setRead", e => e.of("Article").args({ read: t.bool })
    .apply((a, { read }) => ({ ...a, read })))
  .edit("setStarred", e => e.of("Article").args({ starred: t.bool })
    .apply((a, { starred }) => ({ ...a, starred })))
  .edit("setNote", e => e.of("Article").args({ text: t.string })
    .apply((a, { text }) => ({ ...a, note: text.trim() })))

  .settings(s => s
    .field("syncMinutes", t.int.range(5, 240).step(5).default(30))
    .field("showSummaries", t.bool.default(true)))

  .sync(s => s
    .pull("articles")
    .every(({ settings }) => minutes(settings.syncMinutes))
    .whenStale("launch", "foreground", "reconnect"))

  // ── Screens ─────────────────────────────────────────────────────────
  .screen("List", s => s
    .component("ArticleListView")
    .state({ filter: t.enum("all", "unread", "starred").default("all") })
    .view(({ db, state, settings, sync }) => {
      const rows = db.Article
        .filter(a => state.filter === "all" || (state.filter === "unread" ? !a.read : a.starred))
        .toSorted((x, y) => y.publishedAt - x.publishedAt);
      return {
        filter: state.filter,
        unreadCount: db.Article.count(a => !a.read),
        rows: rows.map(a => ({
          id: a.id, title: a.title, byline: a.author ?? hostOf(a.url),
          summary: settings.showSummaries ? a.summary : null,
          read: a.read, starred: a.starred, unsynced: a.$pending,
        })),
        empty: rows.length === 0 ? EMPTY[state.filter] : null,
        refreshing: sync.state === "syncing",
        banner: sync.state === "offline" ? "Offline — showing saved articles"
              : sync.state === "waiting" ? "Server busy — retrying shortly"
              : sync.state === "error" ? "Couldn’t refresh. Pull to try again." : null,
      };
    })
    .on("select", ({ id }) => cmd.go("Detail", { id }))
    .on("toggleStar", ({ id, starred }) => cmd.edit("setStarred", id, { starred: !starred }))
    .on("toggleRead", ({ id, read }) => cmd.edit("setRead", id, { read: !read }))
    .on("setFilter", ({ filter }) => cmd.state({ filter }))
    .on("refresh", () => cmd.refresh("articles"))
    .on("openSettings", () => cmd.go("Settings")))

  .screen("Detail", s => s
    .component("ArticleDetailView")
    .params({ id: t.string })
    .loads("articles", ({ params }) => params.id) // GET /articles/:id when body is missing or stale
    .view(({ db, params, load }) => {
      const a = db.Article.get(params.id);
      if (!a) return { phase: load.error ? "failed" : "loading" };
      return {
        phase: "ready", title: a.title, byline: a.author ?? hostOf(a.url), url: a.url,
        body: a.body ?? null, bodyLoading: a.body == null && load.busy,
        bodyError: a.body == null ? load.error : null,
        read: a.read, starred: a.starred, note: a.note, unsynced: a.$pending,
      };
    })
    .on("bodyShown", (_, { params }) => cmd.edit("setRead", params.id, { read: true }))
    .on("toggleStar", ({ starred }, { params }) => cmd.edit("setStarred", params.id, { starred: !starred }))
    .on("markUnread", (_, { params }) => [cmd.edit("setRead", params.id, { read: false }), cmd.back()])
    .on("saveNote", ({ text }, { params }) => cmd.edit("setNote", params.id, { text }))
    .on("openOriginal", ({ url }) => cmd.openURL(url)))

  .screen("Settings", s => s
    .component("SettingsView")
    .tick(minutes(1)) // re-derive each minute so "3 min ago" advances
    .view(({ settings, sync, outbox, now }) => ({
      syncMinutes: settings.syncMinutes,
      syncLabel: `Every ${settings.syncMinutes} min`,
      showSummaries: settings.showSummaries,
      unsyncedEdits: outbox.count,
      lastSynced: sync.lastSuccess == null ? "Never" : relativeTime(sync.lastSuccess, now),
    }))
    .on("slide", ({ value }) => cmd.setting("syncMinutes", value))
    .on("toggleSummaries", ({ on }) => cmd.setting("showSummaries", on))
    .on("syncNow", () => cmd.syncNow()))

  // ── App-wide events ─────────────────────────────────────────────────
  .on("authExpired", () => cmd.presentSignIn())
  .on("editRejected", ({ title, status }) => cmd.toast(`Couldn’t save your change to “${title}” (${status}).`))
  .start("List")
  .build();
```

**What I assumed beyond the brief:**
- `PATCH /articles/:id` accepts user fields with `If-Match: <version>`. It returns the updated article, or `412` with the current article in the body.
- List pages have the shape `{ items, next_cursor, server_time }`.
- `POST /auth/refresh` exists.
- `t.instant` takes an ISO‑8601 string and stores epoch milliseconds.
- `ArticleListView` and the other components are ordinary SwiftUI or React components. Each ships with a manifest listing the events it emits, their payload types, and the view-model shape it accepts.

## 2. Lambdas: what they receive, give, and may do

| Lambda | Runs | Receives → returns | Pure | Effects |
|---|---|---|---|---|
| **Configurator** `s => s.…` | Build time, once | builder → the same builder | Yes, builder calls only | None |
| **`request`, `refresh`, `writeBack`** | Per HTTP call | `{since, cursor}`, `{id}`, `{refreshToken}` (opaque Secret) or a visible record → `{method, path, query, body, ifMatch}` | Yes | None. The host sends it (network). |
| **`page`, `deletedId`, `decode`, `tokens`** | Per response | parsed JSON → page info, an id or null, a partial record, or tokens | Yes | None. The host writes the result to the cache server layer or the Keychain. |
| **`staleAfter`, `every`** | When settings change; at staleness checks | `{settings}` → Duration | Yes | None. The host owns the timers. |
| **`apply`** (edit) | Per `cmd.edit` | frozen visible record + validated args → next record | Yes; may change user fields only | None. The host diffs it into the outbox. |
| **Merge rule** | When both sides changed one field to different values | `(base, mine, theirs)` → value | Yes; must handle every input | None |
| **`loads`** | When the screen appears or its params change | `{params, settings}` → record id | Yes | None. The host fetches if the record is missing or stale. |
| **`view`** | After a commit that touches what it read; on `tick` | ctx `{db, state, params, settings, sync, outbox, load, now}` → plain-data view model | Yes | Cache read (snapshot); the clock only as `now` |
| **`on` handler** (screen or app) | Per component or app event | `(payload, ctx)` → `Command` or `Command[]` | Yes, as a function | Only through the commands it returns |

**Commands** (the only way to cause an effect):

| Command | Effect | State touched |
|---|---|---|
| `cmd.edit(name, id, args)` | Cache write and edit queueing, in one transaction | visible record, outbox |
| `cmd.state(patch)` | Screen-state write | that screen instance's `state` |
| `cmd.setting(key, value)` | Persisted write; reschedules `every` | settings |
| `cmd.go(screen, params)`, `cmd.back()` | Navigation | nav stack |
| `cmd.refresh(source)`, `cmd.syncNow()` | Network (pull; or push then pull) | server layer, `sync` |
| `cmd.openURL`, `cmd.toast`, `cmd.presentSignIn` | Platform UI | nothing in the store |

**Each effect at a glance:**
- **Network:** host only. It is triggered by `.sync`, `.loads`, the outbox, and `cmd.refresh` / `cmd.syncNow`.
- **Cache read:** `apply` sees one record; `view` and handlers read through `db`. Every read is a frozen snapshot.
- **Cache write:** host only. Server fields come only from `decode` output. User fields change only through `apply`, run by `cmd.edit`.
- **Queueing an edit:** only `cmd.edit`.
- **Navigation:** only `cmd.go` and `cmd.back`.
- **Timers:** host only (`every`, `tick`, backoff, Retry-After).
- **Randomness:** host only (backoff jitter, idempotency keys). Lambdas may not use it.
- **Clock:** the host reads it. Views and handlers receive `now`, captured once per call. `Date.parse` on data is allowed; `Date.now()` is not.

**Who owns each piece of state:**

| State | Owner | What lambdas can do |
|---|---|---|
| Server layer (records as the server last sent them, plus `$fetchedAt`) | Host | Read it through `db`; shape it via `decode` |
| Outbox (a per-record patch of user fields, plus `$pending`) | Host | Read `outbox.count` and `$pending`; add to it via `cmd.edit` |
| Watermarks, cursors, retry timers | Host | Nothing (`since` and `cursor` arrive as inputs) |
| Tokens | Host (Keychain) | See `refreshToken`, opaque, only inside `refresh` |
| Settings | Host, persisted | Read `settings`; write via `cmd.setting` |
| Screen state (`.state`) | Host, per screen instance | Read `state`; write via `cmd.state` |
| Nav stack | Host | `cmd.go`, `cmd.back` |
| `sync` (`idle` · `syncing` · `waiting` · `offline` · `error` · `signedOut`, plus `lastSuccess`) | Host | Read it |
| Drafts, scroll position, slider drag | The UI component | Nothing; the component emits events |

## 3. Shared mutable state

### The store keeps three layers per record

- **Server row:** the article as the server last sent it, plus `$fetchedAt`. It is written only from `decode` output: list pages, detail fetches, PATCH replies and 412 bodies.
- **Patch:** the record's outbox entry, `{ base, patch }`. `patch` maps user fields to the values the user wants. `base` holds those fields' server values as of the last reconciliation.
- **Visible:** the server row overlaid with the patch, plus `$pending` (true when the patch is non-empty). Lambdas only ever see visible records.

The outbox is the set of non-empty patches, ordered by when each record first became dirty. It lives in the same SQLite file as the cache, so one transaction can update both.

### Reading

`db`, `settings`, `state`, `sync` and `outbox` are deep-frozen views of one committed revision. A `view` re-runs when a commit touches anything it read last time (the host records reads through the snapshot), or on its screen's `tick`.

### Changing

Lambdas never write. `cmd.edit("setStarred", id, { starred: true })` makes the host run one transaction:

1. Validate `args` against the edit's schema and look up `visible(id)`. An unknown id is dropped with a dev warning.
2. Compute `next = apply(visible, args)`.
3. Diff `next` against `visible` over the user fields. An empty diff is a no-op, so repeated `bodyShown` events cost nothing.
4. Fold the diff into the record's patch; a later value for a field replaces an earlier one. A new patch takes its `base` from the current server row.
5. Commit durably, bump the revision, and re-derive the affected views.

`cmd.setting` and `cmd.state` are transactions on the same queue. Server fields change only when the host writes `decode` output.

### Reconciliation: the one place conflicts are decided

Whenever a server row changes under a patch, the host reconciles each patched field `f`:

```js
const b = base[f], m = patch[f], s = server[f];
const merged = m === s ? s            // already agree
             : b === s ? m            // only this device changed it
             : b === m ? s            // only the server changed it
             : rules[f](b, m, s);     // both changed it, differently
if (merged === s) delete patch[f]; else patch[f] = merged;
base[f] = s;
```

- **Only the last line calls author code.** For a two-valued type it can never be reached, which is why `read` and `starred` need no rule.
- **Rules get values, never timestamps.** Device clocks are not reliable enough for last-writer-wins.
- **Offline edits are never silently overwritten.** Every server write goes through this step, so a background refresh reconciles with an offline edit instead of replacing it.

### Pushing

The host's push loop runs while the app is online and signed in. It keeps one request in flight and takes records in first-dirty order. The body is the patch, `If-Match` comes from `writeBack`, and the host adds an `Idempotency-Key` it generates. Responses are handled like this:

- **2xx:** decode the reply into the server row. Clear each sent field whose patch value hasn't changed since sending; an edit made mid-flight stays queued. Reconcile the rest.
- **412:** decode the article in the body, reconcile, and resend. After three conflicts in a row, drop that record's patch and fire `editRejected`.
- **401:** refresh the token, one refresh at a time; other requests wait, then retry. If the refresh fails, the host sets `sync.state = "signedOut"` and fires `authExpired`. The outbox is kept.
- **429, 5xx or offline:** follow `.retry`. Retry-After pauses all requests, not just the one that got the 429.
- **Other 4xx:** drop the patch, so the visible record reverts to the server row, and fire `editRejected`.

Pulls follow the same 401, 429, 5xx and offline rules.

### Guarantees

1. **One writer, serial transactions.** Pages, edits, push replies, settings and screen state all commit through one queue. No view ever sees half a transaction.
2. **Handlers see a snapshot.** A handler's `ctx` is the latest committed revision. Commands returned together don't see one another. Their store changes commit as one transaction, and then navigation and UI commands run in array order.
3. **Read-your-writes, offline too.** The first view derived after `cmd.edit` shows the edit.
4. **Durable before visible.** The edit commits before the screen re-renders, so killing the app loses nothing the user saw.
5. **Edits survive refreshes**, through reconciliation.
6. **Convergence.** Once the outbox drains, the visible state equals the server state.
7. **Paging can restart safely.** Each page commits separately, so the list fills progressively. The watermark uses server time, never device time, and advances only after the last page. An interrupted pull restarts from the old watermark, which is safe because upserts are idempotent. A tombstone deletes the server row and drops any patch on it with `editRejected`.
8. **Staleness uses the host clock.** It compares `$fetchedAt` against `staleAfter(settings)`. That threshold, and `every`, are re-evaluated when the slider moves.

### Who does what

Lambdas decide *what*: request shapes, how JSON maps to fields, what an edit means, how to settle a true conflict, what a screen shows, and which command an event becomes. The host decides *when* and *how*: I/O, retries, token refresh, ordering, persistence, reconciliation, timers, ids and the clock.

### How much can be pure

All of the author's code. The Dream Code has 34 run-time lambdas, none of which performs an effect; 16 of them return commands.

Everything irreducibly effectful or order-dependent lives in the host and is written once:
- the HTTP client and its retry logic, plus single-flight token refresh;
- the store queue and its transactions;
- the push loop's ordering and in-flight bookkeeping;
- reachability, app lifecycle, timers, the clock, randomness and rendering.

Three order effects do reach authors, and the docs state them plainly:
- handlers see a snapshot (guarantee 2);
- within a patch, the last value for a field wins;
- merge rules see three values but not which change came first.

## 4. What the checker should refuse

`readlist check` first builds the Program. That is safe because configurators are pure, and it means the checker knows every record, field, edit, screen, setting and component manifest. It then does three things:
- reads each lambda's source;
- resolves every name and checks its type;
- runs the pure lambdas against the fixtures and against generated inputs.

Errors block the build; ⚠ marks a warning.

1. **Clock, randomness or I/O in a run-time lambda** (`Date.now()`, `new Date()`, `Math.random()`, `fetch`, `setTimeout`, `localStorage`).
   `Settings.view calls Date.now(). Read time from ctx.now, and add .tick(minutes(1)) if the text must keep advancing.`
2. **An `async` lambda, or one that returns a Promise.**
   `List.on("refresh") is async. Handlers return commands synchronously and the host does the network work: () => cmd.refresh("articles").`
3. **Mutating a snapshot or args.**
   `Detail.on("toggleStar") assigns a.starred on a frozen record. To change an article, return cmd.edit("setStarred", id, { starred }).` Also: `db.Article.sort() mutates the snapshot; use toSorted().`
4. **Remembering state between calls** by assigning to a module or closure variable.
   `List.view assigns module variable lastFilter. Lambdas keep nothing between calls; declare it in .state({...}) and set it with cmd.state(...).`
5. **Effects or environment reads in a configurator.**
   `The configurator for source "articles" calls fetch(). Configurators run once at build and may only call builder methods; describe requests in .list({ request }).`
6. **An edit that changes a server field.**
   `edit setNote: apply changes Article.title, a server field. Edits may change only read, starred, note.`
7. **An edit that drops the rest of the record.**
   `edit setRead: apply returns { read }, dropping id, title, url, … Did you mean ({ ...a, read })?`
8. **A user field that can truly conflict but has no merge rule.**
   `Article.note (t.string) can be changed to different values on two devices but has no merge rule. Add .merge({ note: (base, mine, theirs) => … }), or merge.mine / merge.theirs.` Two-valued types are exempt.
9. **A merge rule that doesn't handle every input or returns the wrong type.**
   `merge rule for note returned undefined for (base "", mine "a", theirs "b"). It must return a string for every input.`
10. **Unknown names.**
    `cmd.edit("markRead", …): no edit named markRead. Known edits: setRead, setStarred, setNote.` The same check covers screens, sources, settings, records and state keys.
11. **Wrong argument shapes or values.**
    `cmd.go("Detail", { articleId }): Detail expects params { id: string }.`
    `cmd.state({ filter: "favorites" }): filter must be all, unread or starred.`
    `cmd.setting("syncMinutes", 2): outside 5…240.`
12. **Decode output that doesn't fit the schema** (checked on the fixtures).
    `decode(articles-page-1.json items[3]): version is "7" (string) but Article.version is t.int; use Number(j.version).`
    `summary is undefined in a list item. Undefined means "keep cached," but a new record has nothing cached.`
    Having no fixtures at all is ⚠.
13. **Paging that can't make progress.**
    `list.page(articles-page-1.json) returns no watermark, so every sync downloads everything.`
    `next equals the cursor just requested; paging would loop.`
14. **A write-back without a version.**
    `Article.writeBack has no ifMatch. Server changes to the same article would be overwritten and merge rules would never run.`
15. **Leaking a secret.**
    `refreshToken flows into the request query. Secrets may appear only in the body or headers of the refresh request, never in a URL, view model or toast.`
16. **Reading a record that may be absent.**
    `Detail.view reads .title of db.Article.get(params.id), which is undefined on a deep link or after a server delete. Handle the missing case.`
17. **A view that returns behavior or effects.**
    `List.view returns a function at rows[0].onTap. Views return plain data; handle taps with .on("select", …).`
    `Detail.view returns a command. Views can't cause effects; move it into .on(…).`
18. **Events that don't match the component manifest.**
    `List handles "tapRow", which ArticleListView never emits. It emits: select, toggleStar, toggleRead, setFilter, refresh, openSettings.`
    ⚠ `ArticleDetailView emits "share", which Detail ignores.`
19. ⚠ **Time that can't advance.**
    `Settings.view reads now, but Settings has no .tick(); "3 min ago" will freeze.`
20. ⚠ **Unreachable or empty parts.**
    `Screen "Archive" is never the target of cmd.go and isn't .start().`
    `Record "Tag" is read by a view but no source fills it, so it will always be empty.`

## 5. Where a fluent builder plus lambdas fits, and where it fights

**Where it fits**

- **The app is mostly configuration**, with small decisions at known seams. A builder puts endpoints, auth, retry, staleness and sync triggers in one discoverable place. Typing `s.` lists what's possible, which helps a small model more than any naming convention.
- **The seams are where lambdas shine.** `decode`, `apply`, merge rules, `view` and handlers are pure functions of 1 to 15 lines with obvious inputs. You can test them with literals, and the checker can property-test them.
- **Effects-as-values removes the dangerous freedoms.** An author can't write a race, forget to persist, double-send an edit or refresh a token twice, because they can't do I/O at all.
- **`.build()` yields data**, so the checker sees the whole app before anything runs.

**Where it fights**

- **Names are strings.** The checker catches errors in `cmd.edit("setRead", …)` and `cmd.go("Detail", …)`, but JavaScript doesn't. TypeScript builder generics can type these names, but their error messages are unreadable. It is better to generate a `.d.ts` from the built Program for editor help and let the checker write the messages.
- **Nested `b => b` closures are noise.** They hide structure from ordinary tooling and invite call-order bugs, such as calling `.apply` before `.of`. A plain object literal per record or screen would be just as checkable; the builder mostly buys autocomplete.
- **Sequential, effectful flows don't fit** "return a command". OAuth sign-in, switching accounts, and "sign out and wipe the cache" become host commands (`presentSignIn`) written as ordinary async code.
- **Text is awkward.** Notes are typed one keystroke at a time, and routing each keystroke through `cmd.edit` would churn the outbox. So the draft lives in the component, and `saveNote` fires when the user commits. Real text merging is beyond a three-value lambda; the rule here just keeps both versions.
- **Pure re-derivation costs O(n) per commit.** That is fine for a few thousand articles and wrong for 100,000, or for full-text search. Those need indexed queries in the host, exposed as declared queries rather than `filter`.
- **Odd errors don't fit the uniform policy.** It covers 401, 429, 5xx and offline. A paywalled 403 on one article, or a 200 with an error body, needs per-source error hooks, and then the language starts to grow.
- **Debugging is indirect.** Stack traces land inside the host's interpreter, so a command log and revision-by-revision replay are required tooling, not nice-to-haves.

**What I would leave to ordinary code**

- layout, components, animation and accessibility;
- drafts, gestures and slider dragging;
- the host itself: HTTP, SQLite, the store queue, the scheduler, reachability and the Keychain;
- the sign-in flow;
- formatting helpers such as `relativeTime`, built on `Intl`;
- cache migrations and eviction, and analytics;
- integration tests, which drive the host through a simulator (go offline, edit, change the server, reconnect) rather than calling lambdas one at a time.
