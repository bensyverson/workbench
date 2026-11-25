# Report: UI trial, agent-a

## Difficulty

2 of 5: the draft covered nearly every item directly, and the worked example was close to what particles needed. The only real friction was the chart of runs, which counts ticks when the task asks for seconds of run time.

## Per item

1. Fits: a `stat` "live" with `value: (s) => s.particles.length` and `badIf: (s) => s.particles.length >= s.maxParticles`, beside a "cap" stat and a "time" stat on path `t` with unit `s`.
2. Fits: a `table` over `emitters` with the columns `name` and `live`.
3. Fits: a `table` over `counters` with the columns `name` and `value`.
4. Fits: a `check` with `expect: (s) => s.particles.length < s.maxParticles`.
5. Fits: a `plot` with `y: (s) => s.particles.length` and `window: 10`.
6. Partly fits: `runs` takes `ticks`, not seconds, and a UI cannot read the Program's `tick`. I wrote `ticks: 150` from the task's "take it as 1/30 s". For a Program with another tick, the chart shows live particles at the wrong time. (`param: "rate", from: 0, to: 400, steps: 9`; `steps` was my choice.)
7. Fits: `stage: { element: "particles-field", module: "./particles-field.js", emits: ["pick"] }`. The module draws a canvas of dots and dispatches `wb-pick` in state coordinates.
8. Fits: `annotate.traces.t.note`, and `annotate.params.rate.badge: (s, $) => ($.rate > 300 ? "hot" : null)`.
9. Fits: the `health` tile is `splitRight: "stage"` (size 0.35), and the `sweep` tile (the chart of runs) is `tabWith: "health"`.
10. Fits: `inputs.object: "Pad"` with six buttons, roles `dpad.*`, `a` labelled "Dash" and `b` labelled "Wait".
11. Fits: the text view is the fallback. I added an optional `maze-grid` element that draws the grid and emits nothing.
12. Fits: a `score` tile placed `splitBelow: "stage"`, holding the stats on `score` and `coinsLeft` and a `check` "all coins" with `expect: (s) => s.coinsLeft === 0`.
13. Fits: a `plot` with `y: "score"` and `window: 30`.
14. Answered in prose under "Two packages".

## Where the draft misled you

Nothing led me to a wrong declaration. Some passages were easy to misread:
- "`text` | the run as characters" (a generated view's id) and "`text` | `value` (a Markdown string …)" (a component kind) share one word. `place: { tabWith: "text" }` and `{ kind: "text" }` mean different things.
- "`runs` … `ticks` (whole, 1 to 100000) … each run `ticks` ticks". This sits beside `plot`'s `window` "(seconds …)". It reads as though a run's length could be given in time like the plot's window, but it cannot (item 6).
- "`y` read from its last state" with the convention "`(s, $) => …`: `s` the state, `$` the params". This does not say that inside `runs`, `$` is the swept run's params (with `rate` set to the swept value) rather than the live run's. I assumed the swept run's.

## What you guessed

- `null` is allowed in a lambda's result (taken from the draft's own badge example) and is in the Runtime Subset.
- `===` and the `?:` ternary are in the Runtime Subset for UI lambdas.
- `listOf("string")` is a valid shape for the maze's `grid`. The draft says `listOf(shape)`, and `"string"` is a shape.
- In item 9, "in a tab with it" means a tab with the readouts tile (`tabWith: "health"`), not with the stage.
- `steps: 9` for the sweep, so rate runs 0, 50, …, 400.
- `size` 0.35 for the particles readouts and 0.3 for the maze score tile.
- A "cap" stat, so that "against the cap" can be read at a glance. The `badIf` alone would have met the item.
- The maze element is sized from the grid at 24 px per cell, and its colours are inside its own shadow DOM. I read R9's "no styling" as applying to the declaration, not to how an element draws.
- The order in which the host sets `state`, `params` and `text` is unspecified, so both elements redraw on `state` and keep the others as plain fields.

## Gaps

1. **A run length in seconds for `runs`** (item 6). A `seconds` key next to `ticks`, or exposing the Program's tick to the declaration, so that "after 5 s" holds for every Program. Using `s.t` in `y` does not help, because `y` is read only at the last state.
2. **Saying which params a swept run sees** (item 6). The draft does not define what `$` is inside a `runs` lambda.
3. **Cross-package data or events** (item 14). Nothing lets one package's run react to another's (coins bursting into particles). The draft only names views across packages.
4. **Cross-package rules for inputs and annotations** (item 14). These are listed under "Two packages" below.

## The element contract

They sufficed for both elements. `state` in and `wb-pick` out was all `particles-field` needed. `maze-grid` needed only `state`. What I would have liked:
- The element's intended size or the device pixel ratio. I sized the canvas from `bounds` and let CSS scale it, so a pick has to be rescaled from client coordinates by hand.
- The tick, or the time between updates, to interpolate dots smoothly. There is no way to get it besides diffing `state.t`.
- Particles have no ids in `state`, so a pick can only be a point. `wb-select` on `particles` with an index would be unstable from tick to tick. This is a property of the state, not the contract, but it limits what `select` can mean here.
- An order or a single callback for the three properties, so an element draws once per tick rather than up to three times.

## Two packages

By the draft, each package names another's views in full. The maze UI would put its score tile beside the particles stage with `place: { splitRight: "particles.stage" }`. Either package would annotate the other through an `annotate` key in full, for example in maze: `annotate: { "particles.traces": { t: { note: "…" } }, "particles.params": { rate: { badge: … } } }`. The draft says qualified ids are allowed "in a `place` or an `annotate` key".

The draft leaves these unsaid:
- Whether a package may place against another's *tiles* (`particles.health`), or only its generated views.
- How cycles are detected across packages, and in what order the packages load when they refer to each other.
- Whose `s` and `$` a cross-package annotation's lambda reads. A badge on `particles.params` written in maze would see maze's state under the convention, which is almost never what is wanted.
- Whether there is one stage or two, which stage the "click to play" overlay and keyboard focus belong to, and what happens when both packages declare `inputs` with the same roles.
- How shared views (`events`, `diagnostics`, `editor`) are split or prefixed.
- What happens when a qualified id names a package that is absent from the page.
- Above all, how the two runs exchange anything. A coin picked up in maze producing a burst in particles is state or event flow between runs. The UI draft has no word for it, and it probably belongs to the host or the definition, not to `defineUI`.

## Files

Opened (read): `ui-draft.md`, `rules.md`, `task.md`, `check.sh`, `particles/particles.dialect.js`, `particles/particles.grammar.js`, `particles/examples/01.js`, `maze/maze.dialect.js`, `maze/maze.grammar.js`, `maze/examples/01.js`.

Written: `particles/particles.ui.js`, `particles/particles-field.js`, `maze/maze.ui.js`, `maze/maze-grid.js`, `REPORT.md`.

I listed the folder, which showed `transcript.jsonl` and `stderr.txt`, but did not open them. `check.sh` runs a checker script outside this folder. I ran it through `check.sh` and did not open it. I opened nothing else on this machine and did not search the web.
