# Report

## Difficulty

2 — both declarations fit the draft almost directly and checked clean on the first run; the open questions were about wording (what "beside" and "it" mean, what the Runtime Subset allows in a UI lambda), not about missing API.

## Per item

1. **Partly fits.** `live` is a stat `(s) => s.particles.length` with `badIf` `length >= maxParticles`. Next to it are a `cap` stat (`maxParticles`) and a `time` stat (`t`, unit `s`). "Against the cap" became two stats side by side in a `row`, not one readout like "312 / 500": a stat has no "of max", and I did not assume a UI lambda can build a string.
2. **Fits.** A table over `emitters` with columns `name`, `live`.
3. **Fits.** A table over `counters` with columns `name`, `value`.
4. **Fits.** A check, `expect: (s) => s.particles.length < s.maxParticles`.
5. **Fits.** A plot with `y: (s) => s.particles.length`, `window: 10`. (The generated `traces` view cannot show it, because no number in `state` holds the live count.)
6. **Fits.** `runs`: `param: "rate"`, `from: 0`, `to: 400`, `steps: 9`, `seconds: 5`, `y: (s) => s.particles.length`. The draft runs each Program at its own tick, which is 1/30 s in the example.
7. **Fits.** `stage: { element: "particles-stage", module: "./particles-stage.js", emits: ["pick"] }`. The module draws to a canvas (sized with a ResizeObserver, letterboxed to `bounds`) and sends a `wb-pick` in state coordinates when clicked.
8. **Fits.** `annotate.traces.t.note`, and `annotate.params.rate.badge: (s, $) => ($.rate > 300 ? "hot" : null)`.
9. **Fits.** Tile `readouts` uses `splitRight: "stage"` (size 0.3). Tile `sweep` (the chart of runs) uses `tabWith: "readouts"`.
10. **Fits.** `inputs.object: "Pad"`. The six buttons get roles `dpad.*`, `a` (label "Dash") and `b` (label "Wait").
11. **Fits.** No `stage` key, so the stage is the text view. I wrote no custom element.
12. **Fits.** Tile `score` uses `splitBelow: "stage"`. In a `row` it holds a `score` stat, a `coins left` stat and the check "all coins", `(s) => s.coinsLeft === 0`.
13. **Fits.** A plot with `y: "score"`, `window: 30`, in the same tile.
14. Answered under **Two packages**.

## Where the draft misled you

Nothing actually led me wrong. Two places came close:
- "`stage` | the run, drawn | your `stage` element, else the text view". I read this as: the view id `stage` exists even when a package declares no `stage`, so the maze can place a tile with `splitBelow: "stage"`. The checker accepted it. But the components table says "Required: the text view", and with no stage element there could just as well be two views (`stage` and `text`) showing the same string, or one. The draft does not say which.
- "`value` (a number or string)" on `stat`, together with "a Runtime Lambda in the Runtime Subset (as in your Dialect)". This suggests a lambda could return `"312 / 500"`. But the Dialect's Runtime Subset (numberType `f64`, no string type) gives no sign that string concatenation or `toFixed` is allowed, and "the checker cannot type a lambda's result" means the checker would not tell me. So I stayed away from it.

## What you guessed

- **"Beside the stage"** (item 9): `splitRight`, size 0.3.
- **"In a tab with it"** (item 9): "it" taken to mean the readouts tile, so `tabWith: "readouts"`. `tabWith: "stage"` would also pass the checker.
- **`steps: 9`** for the sweep (0, 50, …, 400). The task gives no count.
- **`limit: 100`** on both tables. The task gives none; leaving it out would also be legal.
- **`size: 0.3`** for the maze score tile below the stage.
- **The Runtime Subset in UI lambdas** allows `===`, `>=`, the ternary, `.length` on a state list, and the literal `null` (the draft names `null` for badges). I avoided strings and assumed `.length` is allowed on lists in `s` (the draft says "A list's length is `s.bodies.length`").
- **`listOf("string")`** for the maze `grid`. The draft says `listOf(shape)` and `"string"` is a shape.
- **Element upgrade**: "read any already set when the element upgrades". I re-ran own properties set before upgrade through the accessors in `connectedCallback`, in the host's order (`params`, `text`, `state`).
- **Pick coordinates**: the element maps the click through the same letterbox it draws with, so `{x, y}` lands in `bounds` units and can fall outside the box if the click lands in the margin. The draft does not say whether a pick must lie inside the box.
- **No stage element for the maze.** The task allows one; the text view is enough.

## Gaps

Smallest first:
1. **A stat "of" a maximum** (item 1). The task wants live particles against the cap in one readout, red when full. There is no `max`/`of` key on `stat`, and no confirmed way to format "a / b". Done as two stats.
2. **A named derived value** (items 1, 4, 5, 6). `s.particles.length` is written five times. There is no way to declare it once, e.g. `derive: { live: (s) => s.particles.length }`, and use it as a path. Such a value could also feed `traces`, which today misses the system's most important number because the state holds the list, not its length.
3. **Saying what the `text`/`stage` views are when a package has no stage element** (item 11/12). The draft should state that `stage` always exists as a place target.
4. **Where pad buttons go** (item 10). `pad` is generated and can be a `place` target, but the draft does not say where the host puts it by default. Not strictly needed.

None of these blocked an item outright. Item 1 is the only one that ends up "partly fits".

## The element contract

Enough for `particles-stage`. `state` gives `bounds` and every particle, the click becomes `wb-pick {x, y}`, and the ResizeObserver rule covers sizing. What I would have liked:
- **A size per particle.** Particles have `size` (and `heat` from a `.field`), but the host's state gives only `{x, y}`, so every dot is drawn the same. That is the state contract, not the element contract.
- **Param ranges.** `params` is `{ name: value }` only. An element that wanted to send a `wb-param` (e.g. drag to set `wind`) would not know min/max. The host clamps, so it works, but the element cannot draw a sensible control.
- **Any reply to a pick.** `wb-pick` goes out and nothing comes back: no "picked" state, and no other view (the `events` log aside) reacts to it. It is not clear what a pick is for beyond logging.
- **A theme** (colors for light/dark). The element hard-codes its colors.

## Two packages

By the draft, a page with both packages names each one's views by package. The maze UI would place its score tile next to the particles stage with `place: { splitRight: "particles.stage" }`, and its own views stay bare (`stage` means `maze.stage`). Either package annotates the other by qualifying the annotate key: the maze could write `annotate: { "particles.traces": { t: { note: "…" } } }` or `"particles.params": { rate: { … } }`. (This trial refuses qualified ids, so neither form is checked.)

What the draft leaves unsaid:
- How a page comes to hold two packages, and how one UI knows the other is present. What happens to a `place` naming `particles.stage` when particles is not loaded? Is it skipped, as an unknown annotate key is, or is it an error?
- Whether a lambda in one package's annotation of the other sees that other package's state and params (`s`, `$`) or its own. Nothing says which, and the checker could not know the other state's shape.
- How the two runs are tied together. "Coins burst into particles" needs an event or shared state across packages: a maze coin pickup becoming a particles spawn. The UI draft has no cross-package channel. `wb-*` events go to the host, and inputs belong to one package's object.
- Which package's `inputs` own the keys, and which stage gets "click to play" focus when both have stages.
- Whether `place` cycles and tile ids are checked across packages, and what decides layout order when both UIs split the same view.
- Whether there is one `params`, `traces` and `pad` view per package (likely, given `orbits.stage`) and what the page's shared views (`editor`, `agent`, `book`) show for two Programs.

## Files

Opened (read): `ui-draft.md`, `rules.md`, `task.md`, `check.sh`, `particles/particles.dialect.js`, `particles/particles.grammar.js`, `particles/examples/01.js`, `maze/maze.dialect.js`, `maze/maze.grammar.js`, `maze/examples/01.js`.

Written: `particles/particles.ui.js`, `particles/particles-stage.js`, `maze/maze.ui.js`, `REPORT.md`.

I ran `check.sh` as instructed. It invokes a node script outside this folder, which I did not open. A directory listing also showed `stderr.txt`, `transcript.jsonl` and later `log.jsonl` in the folder; I did not open them. I opened nothing else and did no web search.
