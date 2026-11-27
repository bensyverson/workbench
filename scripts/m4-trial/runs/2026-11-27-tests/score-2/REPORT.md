# Report: score-and-timer (`tally`)

## Difficulty
2. The package, picture and tests passed on the first check; the only real thought went into the end-of-round cutoff.

## What I built
`tally/`: a Dialect for one timed round that keeps a score.

A Program:

```js
tally("sprint").seconds(30).worth(10).goal(100).label("COINS");
```

- `seconds` (required): whole, 1 to 3600. `worth` (default 1): score per point, whole, at least 1. `goal` (optional): the score turns green once reached. `label` (default `SCORE`): at most 8 characters, refused with `Q001` otherwise.
- Event input `scored: Event<{ points: f64 = 1 }>`: one scoring event per record. A producer with no `points` field counts 1. A negative value takes score away.
- Value outputs: `score` (`f64`), `left` (`f64@s`), `over` (`bool`).
- Picture: `view`, `Draw<4>@panel`, 128 by 28: a backing box, label and score, time left or `TIME UP`, and a shrinking bar.
- The round starts at the runtime's first step and runs on a 0.1 s tick. A record counts if it was sent (`$T`) before the end, even if it is taken by the step that ends the round.

Examples: `examples/sprint.js` (30 s) and `examples/blitz.js` (5 s). One refusal: `refusals/long-label.js`. Three tests are in the manifest.

To use it, load the folder in the workbench, or wire another package's events to `scored` and layer `view` over its picture.

Limits: a label and score longer than 16 characters together run past the panel. The score is shown rounded to two decimals; the `score` output is not rounded.

## Where the docs misled me
Nothing I tripped on. One point could confuse a reader: `docs/kit/package/README.md` says `checkManifest` refuses `tests` today (K002), while `START.md` says "The check runs them". The task explained that `./check.sh` uses a stand-in.

## What I guessed
- `slots: {}` is acceptable for a Dialect with no Runtime Lambdas in Programs (it was).
- To use `Math.round`, `Math.ceil`, `Math.min` and `Math.max` in a Draw builder, I declared a `Math` object with those members and a `Math` global. `draw/README.md` calls `Math` a page global but does not show the declaration a builder needs.
- The first step is at T = 0 or soon after, so the runtime records its start time then instead of assuming 0.
- `T` and `$T` are exact enough for a `<` comparison at the end instant. I round `left` to a microsecond so `ceil` does not show an extra second. The test at exactly T = 5 passed.
- `events.in.scored: 256` is enough for a stranger's producer. A consumer cannot know the producer's rate.
- A UI with only `stage: { draw: "view" }` and no tiles is complete (it was).

## APIs I fought
None needed a rewrite.

## Gaps
- **A length bound on a string argument.** `data()` bounds numbers only, so the 8-character label needed my own check. Smallest change: `data("string", { max: 8 })`.
- **Fitting text in a builder.** A string has no `length` there, so the picture cannot shrink or right-align a long score. Smallest change: `length` on strings in builders, or a text op with a maximum width.

## Tests
Writing them was easy: the draft's form, with its score-timer example, mapped directly onto this package. The three tests cover the default and explicit `points`, a negative value, several records in one step, the records just before, at and after the end, and the score staying put afterwards. All pass under the stand-in.

Where the draft left me guessing:
- `until` is described, but my last expectation was at 8 s, so `until: 10` only extends the run for errors. It does not check the state at 10 s.
- It does not say whether `-1` or other values outside an input's intended range are checked. Only the type is, as far as I can tell, and `-1` was accepted.

Wanted but not sayable:
- Expecting a value output (`score`, `left`, `over`) by name. I could only read the state behind each, so a wrong `from` path or lambda would go untested.
- Expecting anything about the picture, such as that it shows `TIME UP` or turns green at the goal. The goal colour is untested. Smallest change: an `expect` kind for a Draw output's ops at an instant.
- A glue-level test, wiring a real producer into `scored`.

## Docs I could not reach
None needed. Links from `docs/` to `scripts/` and kit source files point outside it and I did not follow them.

## Checker runs
2 runs of `./check.sh tally`, both clean (`tests: 3 of 3 passed`, `no violations`). No diagnostic codes along the way. The second followed the rounding change to the displayed score.
