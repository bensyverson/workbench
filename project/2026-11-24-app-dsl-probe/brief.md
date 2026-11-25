# Design brief: a DSL for a conventional client app

Design a small domain-specific language, embedded in JavaScript as a fluent builder whose behavior is customized by lambdas, for a very ordinary client app: an iOS-style reading-list app.

The app:
- fetches a list of articles and each article's detail from a REST API (`GET /articles?since=…`, `GET /articles/:id`), with auth (a bearer token that can expire and refresh), paging, and errors (offline, 401, 429 with Retry-After, 5xx);
- caches everything locally so it opens instantly and works offline, with a staleness policy (show cached, refresh in the background when older than N minutes);
- lets the user mark an article read, star it, or add a note while offline; those edits queue and sync when the network returns, with a conflict rule when the server changed the same article;
- has screens (a list with filters such as unread and starred, a detail view, a settings screen with a sync-interval slider) whose state derives from the cache.

Lambdas in the language run at build time (configuration) or at run time (deriving view state, mapping JSON to records, deciding conflicts, reacting to events). The language's host (the runtime) is yours to assume.

Write one Markdown document with:
1. **Dream Code**: a complete Program for this app in your DSL, 60 to 150 lines, as you would want to write it.
2. **What each kind of lambda receives, gives, and may do**, as a table: which ones are pure; which have effects, and which effects (network, cache read, cache write, queueing an edit, navigation, timers, randomness, the clock); who owns each piece of state.
3. **Shared mutable state**: the cache and the outbox are shared by every screen and by sync. Say precisely how your design lets lambdas read and change them, what guarantees order and consistency, and what the host does versus what lambdas do. How much of the Program's logic can be pure functions, and what is irreducibly effectful or order-dependent?
4. **What a checker should refuse**: 10 to 20 numbered mistakes an author (human or AI agent) could make that your design can catch before running, each with the diagnostic you would want.
5. **Where a fluent builder plus lambdas fits this domain and where it fights it**: be candid. Name what you would leave to ordinary code instead.

Keep it under about 4,000 words. Prefer a design a small model could use correctly over a clever one.
