# Report: UIs for particles and maze

## 1. Difficulty

**2.** Items 1–13 map almost one to one onto the draft and both packages passed the checker on the first run; only the element's contract details, a few unstated choices and the composition question needed thought.

## 2. Per item

1. **Fits.** `stat` with `value: (s) => s.particles.length`, `max: "maxParticles"`, `badIf` at `>=` the cap; `stat` on `"t"`.
2. **Fits.** `table` over `"emitters"`, columns `name`, `live`.
3. **Fits.** `table` over `"counters"`, columns `name`, `value`.
4. **Fits.** `check` with `s.particles.length < s.maxParticles`.
5. **Fits.** `plot`, `window: 10`.
6. **Fits.** `runs` over `rate` 0 to 400, `seconds: 5`. The tick is the Program's own, so "take it as 1/30 s" needs nothing declared. I chose 9 steps.
7. **Fits.** `particles-stage` with `emits: ["pick"]`. The module was syntax-checked only; no host exists, so it has not been drawn or clicked.
8. **Fits.** A `note` on the `t` trace and a `badge` lambda on the `rate` param.
9. **Fits**, on one reading: "a tab with it" taken as a tab with the readouts tile (see 4).
10. **Fits.** `inputs` on `Pad`, four D-pad roles, `a` and `b` labelled "Dash" and "Wait".
11. **Fits.** No `stage`, so the stage is `text(state)`. No maze element written.
12. **Fits.** Two `stat`s and a `check`, in a tile `splitBelow: "stage"`.
13. **Fits.** `plot` on `"score"`, `window: 30`.
14. Answered in section 7. Placement is expressible on paper; most of the rest is unsaid.

## 3. Where the draft misled you

Nothing led me to a wrong declaration. Two places made me stop and re-read:

- "with `max`, shown as "value / max" and red past it". For item 1, "past" is never true of a value that cannot exceed its cap, so `max` alone does not give "red when the system is full". I added `badIf`. The draft does not say how the two combine; I assumed red if either holds.
- "`max?` (a number)" in the components table reads at first like a literal. The sentence under "Values" ("give a path to one or a lambda") is what allows `max: "maxParticles"`.

## 4. What you guessed

State:
- List maxima: `particles` 10000 (the Grammar's `maxParticles` upper bound); `emitters` and `counters` 64, and maze `grid` 256, are arbitrary because neither Grammar bounds them.
- Every number is `"f64"`, including counts and coordinates. `grid` is `list("str", …)`.

Particles:
- "The chart of runs in a tab with it": "it" could be the readouts tile or the stage. I chose `tabWith: "readouts"`, which keeps the stage visible while the sweep is shown.
- One tile holds all readouts, the check, both tables and the plot, to the right of the stage, `size: 0.3`.
- `steps: 9` (every 50), `limit: 64` on both tables, `unit: "s"` on time, all label and note wording.
- "Above 300" is `> 300`; "under its cap" is `<`; "full" is `>=`.
- A `traces` key for a top-level number is just `t`.

Element:
- State coordinates have y pointing down with the origin at the top left, as `text(state)` and the example's gravity suggest.
- The box is scaled to fit with its aspect ratio kept; clicks in the margin send nothing.
- Dots have a fixed 2 px radius (the state has positions only) and use the element's inherited `color`.
- "Read any already set when the element upgrades": I did this for `state` only, since the element uses neither `params` nor `text`.

Maze:
- Score, coins left, check and plot share one tile, `size: 0.35`. The task puts only the readouts and check "below the stage" and does not place the plot.
- The `a` and `b` buttons are the only ones with a `label`.

## 5. Gaps

No item from 1 to 13 needed something missing. Smallest first:

1. **How `max` and `badIf` combine, and an "at or past" form of `max`** (item 1). Worked with `badIf`; only the wording is missing.
2. **Number formatting** (item 1). `t` is a raw f64 such as 3.0333333…, and a lambda cannot format strings. `text(state)` uses `toFixed(2)`; the draft does not say how a `stat` rounds. The task does not ask for it.
3. **Lists with no natural bound** (items 2, 3, 11). `list(type, max)` demands a maximum that the Grammar does not enforce for emitters, counters or grid rows, and the draft does not say what a host does when a list is longer.
4. **A rule for views that two packages both claim** (item 14): `inputs` keys and roles, and annotations on one trace or param from both.
5. **A way for one package's UI to know another's state** (item 14): paths and lambdas in a cross-package annotation have nothing to be checked against, because `defineUI` takes one builder.
6. **Any link between two packages' runs** (item 14's "coins burst into particles"): no shared state, event routing or call from one run to another. This may be outside a UI API, but the draft does not say where it belongs.

## 6. The element contract

Properties in and events out were enough for `particles-stage`. It reads `state.bounds` and `state.particles` and sends `wb-pick` with `{ x, y }`. It ignores `params` and `text`.

Things the contract leaves open, none of which blocked me:
- The state coordinate system (origin, direction of y) is not stated anywhere an element can read; it is a convention between the Dialect and the element.
- A pick has no visible effect beyond the `events` log. Nothing in the draft lets a Program or view respond to it.
- Nothing is said about theme colours; I used the inherited `color`.
- It does not say whether the host reuses one `state` object and mutates it. The element redraws on every set and on resize, from the last reference.

## 7. Two packages

**Placing the maze score tile beside the particles stage.** In the maze UI:

```js
tiles: { score: { title: "Score", place: { splitRight: "particles.stage" }, body: [ /* … */ ] } }
```

This follows "Another package's view is named in full (`fields.stage`) in a `place`". It is not in the handed-in file: this trial rejects qualified ids (U003). A tile has one `place`, so it could no longer also sit below the maze's own stage.

**Annotating each other's views.** The draft says a view is named in full in "an `annotate` key". Since `annotate`'s keys are view ids, I read that as:

```js
// in the maze UI
annotate: { "particles.traces": { t: { note: "particle time" } } }
// in the particles UI
annotate: { "maze.params": { dash: { tone: "dim" } } }
```

Only `traces` and `params` take annotations, so neither package can mark the other's stage, tiles or other views.

**Left unsaid:**
- No example shows a qualified `annotate` key; the shape above is inferred.
- Whether `s` and `$` in a cross-package annotation lambda belong to the annotating package or the annotated one, and how the inner path or param name is checked without the other package's definition.
- What happens when the named package is not on the page: an error, or a skip as for a missing param.
- Whether another package's own tiles can be a `place` target (the draft says "views and tiles are named by the package" but speaks only of "another package's view"), and how cycles across packages are found.
- The order in which packages' placements apply, so what `splitRight` and `size` mean when both split the same view.
- How two annotations on the same key merge.
- Whether each package has its own `editor`, `agent` and `book` ("the page's own") and how a bare `place` on them resolves.
- How two packages' `inputs`, keys and focus coexist.
- Whether the runs share a clock, and how a coin in the maze could cause particles at all. The UI API has no cross-package state or events, and views may not change a run.

## 8. Files

Opened, all under `/private/tmp/3d093c96-ui2/agent-b`:
- `ui-draft.md`, `rules.md`, `task.md`
- `particles/particles.dialect.js`, `particles/particles.grammar.js`, `particles/examples/01.js`
- `maze/maze.dialect.js`, `maze/maze.grammar.js`, `maze/examples/01.js`

I ran `check.sh` without opening it (one run, no violations in either package), and ran `node --check` on `particles/particles-stage.js`. A directory listing showed `stderr.txt` and `transcript.jsonl`; I did not open them. I opened nothing else and did not search the web. The session itself supplied some user-level instructions and context at startup, which I did not use for this task.

Written: both `*.dialect.js` (added `state`, plus `struct` and `list` on the existing `kit/define` import, which `state` needs), both `*.ui.js`, `particles/particles-stage.js`, `REPORT.md`.
