## Difficulty
2. The package is small and the docs covered nearly all of it; the one real snag was that `init` gets no `ctx.T`.

## What I built
`scoretimer/`: one Program declares one timed round.

    scoretimer("Sprint").label("COIN SPRINT").lasts(30).worth(10).target(100)

- `.lasts(seconds)` is required: a whole number, 1 to 3600.
- Optional: `.worth(points per scoring point, 1 to 100, default 1)`, `.target(score)` and `.label(text, at most 19 characters; refused with T001)`.
- **In:** `scored`, `Event<{ points: f64 = 1 }>`. While the round runs, each record adds `floor(points) * worth`. Points of 0 or less add nothing. A producer with no `points` field counts as 1.
- A record sent at or after the end is ignored. One sent before the end but read at the final step counts. Nothing counts once `over` is true.
- **Out:** `score` (`f64`), `timeLeft` (`f64@s`), `over` (`bool`) and `view` (`Draw<8>@panel`).
- **Picture:** a 160 by 24 panel (frame `panel`, origin top-left, y down) with a translucent backing, the label, the score (`n/target` when there is a target, green once reached), the seconds left or `OVER`, and a shrinking bar.
- The clock ticks every 0.1 s, and the round starts at the part's first step.
- Examples: `examples/sprint.js` (30 s, with every option) and `examples/practice.js` (45 s, defaults only).

**Verified:** `./check.sh scoretimer` exits 0. A label that is too long is refused with T001 (checked by listing it as an example once, then removing it).

**Not verified:** the checker sends no events and runs 65 s. Scoring, `points`, `worth`, the end-of-round cutoff and the target color have never been run. I did not look at the picture, only passed the checker's non-empty and changing tests.

## Where the docs misled me
- `docs/kit/run/README.md`, "What a step is handed": it says `init(record, ctx)` and `step(state, ctx)` are handed `ctx` with the keys in the table, including `T`. Only `inputs` and `events` carry an "init" or "step only" qualification. In `init`, `ctx.T` was `undefined` and my first run failed with N002 (which printed `at T=null`).
- `docs/kit/API.md`, `defineRuntime` snippet: it shows only `events: { out: … }`. An Event input also needs `events.in`, which I learned from `docs/kit/define/README.md`.

## What I guessed
- A Dialect with no lambdas may declare `slots: {}` and `types: {}`. It worked.
- The first step of a tick part is at the instant the part starts, so I take the start time there. If it is one tick later, the round ends 0.1 s late.
- A UI may be only `{ stage: { draw: "view" } }`. It worked.
- `score` and `over` need no frame. `timeLeft` is `f64@s`.
- An input max of 64 records per step is enough. A faster producer would need a larger max or a wire `overflow` policy.
- `max: () => 5` is the right max for a five-op list under a `Draw<8>` ceiling.
- A rebuild restarts the round and the score, because it runs `init` again.
- A very large score (6 or more digits with a target) can run into the time text. I did not cap it.

## APIs I fought
- `init`'s `ctx`: with no start instant, `start` became `opt("f64")`, set on the first step.
- `hash.sh` rewrites the whole manifest's layout, so my text edit to it failed after the first hash. This is minor.

## Gaps
- **The start instant in `init`.** Needed: when this part started. Smallest change: give `init` `ctx.T`, or document that it has none.
- **Testing events.** Needed: to send a package's Event input some records and check the state. The checker runs examples alone with no events, and the docs offer an author no way to script a record into an input without a glue and a producer. Smallest change: let the check take a list of scripted input records with expected state.
- **Checking refusals.** `check.sh` passed with a `refusals` entry present, and I could not tell whether it ran it (the task's description of the check lists only examples). Smallest change: run `refusals` too, or say that it does not.
- **Code letters.** The checker reports its own failures as T010 and T011, but T is not listed as reserved, and my Dialect's T001 uses it. Smallest change: reserve the checker's letter or have it use a reserved one.

## Docs I could not reach
None that I needed. Links in the docs to `docs/project/*` drafts and `scripts/` mostly point at files that are not there.

## Checker runs
9, all on `scoretimer`:
1. T010, T011 and N002 on both examples (`init` had no `ctx.T`).
2. Clean.
3. Clean. This was meant to test the long label, but the file was never listed in the manifest, so it proved nothing.
4. Clean.
5. Clean, with the long label under `refusals`.
6. Clean.
7. K012 carrying T001, as intended (long label listed as an example).
8. Clean.
9. Clean, the final state, after writing this report.
