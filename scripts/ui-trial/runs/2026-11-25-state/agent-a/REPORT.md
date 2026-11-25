# Report: second UI trial (agent-a)

## 1. Difficulty

2 of 5. Each task item mapped onto one component or key. The hard parts were a few small choices the draft leaves open (list maxima, which tile "it" means, whether `null` is a valid tone) and the composition question.

## 2. Per item

1. **Fits.** A `stat` with `value: (s) => s.particles.length`, `max: "maxParticles"` and `badIf: (s) => s.particles.length >= s.maxParticles`, plus a `stat` on `"t"` with unit `s`. I needed `badIf` because `max` alone turns red only *past* the cap, and the task asks for red when the system is *full*, which is at the cap.
2. **Fits.** A `table` over `"emitters"` with columns `name` and `live`.
3. **Fits.** A `table` over `"counters"` with columns `name` and `value`.
4. **Fits.** A `check` with `expect: (s) => s.particles.length < s.maxParticles`.
5. **Fits.** A `plot` with `y: (s) => s.particles.length` and `window: 10`.
6. **Fits.** A `runs` with `param: "rate"`, `from: 0`, `to: 400`, `steps: 9`, `seconds: 5` and `y: (s) => s.particles.length`. The 1/30 s tick is the Program's own, as the draft says, so the UI states nothing about it.
7. **Fits.** `stage: { element: "particles-dots", module: "./particles-dots.js", emits: ["pick"] }`. The module is a canvas that draws a dot per particle inside the box, and a click dispatches `wb-pick` in state coordinates.
8. **Fits.** `annotate.traces.t.note` and `annotate.params.rate.badge: (s, $) => ($.rate > 300 ? "hot" : null)`.
9. **Fits, with a guess.** The `readouts` tile is `splitRight: "stage"` and the `sweep` tile is `tabWith: "readouts"`. I read "it" as the readouts tile (see Guesses).
10. **Fits.** `inputs.object: "Pad"` with six buttons. The D-pad roles are `dpad.*`, `a` has the label "Dash" and `b` has the label "Wait".
11. **Fits.** There is no `stage` key, so the stage is `text(state)`. I added no grid element.
12. **Fits.** A `score` tile at `splitBelow: "stage"`, holding `stat`s on `"score"` and `"coinsLeft"` and a `check` "all coins" with `expect: (s) => s.coinsLeft === 0`.
13. **Fits.** A `plot` with `y: "score"` and `window: 30`.
14. Answered in prose in section 7.

## 3. Where the draft misled you

- `stat`: "with `max`, shown as "value / max" and red past it". I first took `max` to cover "red when the system is full". But a particle system that is full sits *at* its cap and never goes past it, so `max` alone would never turn red. I added `badIf`. This is not a gap, but the wording invites the mistake.
- On annotations, the draft says "`badge` (a string, or a lambda giving a string or `null` for none), `tone` (… or a lambda giving one)". I first wrote a matching `tone` lambda that returned `null` below 300, by analogy with `badge`. The draft says `null` only for `badge`, so I removed the `tone`. The checker would have accepted it either way, because it does not type lambda results.
- "You add one key to each Dialect, its `state`; you change nothing else". Declaring `state` with `struct` and `list` also means adding those two names to each Dialect's `kit/define` import. The draft's orbits example shows that import, so I followed it, but the "nothing else" rule technically forbids it.

## 4. What you guessed

- **List maxima** in `state`: `particles` at 10000 (the Grammar's upper bound on `maxParticles`), `emitters` and `counters` at 64 each, and the maze `grid` at 256 rows. Neither the Dialect nor the task gives a maximum for emitters, counters or grid rows.
- **Number types:** `maxParticles`, `live`, `score`, `coinsLeft` and `player.x`/`y` are all `"f64"`. The Dialects have no integer type, and the draft offers none.
- **Maze `grid`** is `list("str", 256)`, a list of scalars. The draft's examples only show lists of `struct`s, but its text allows `list(type, max)` with any type.
- **"in a tab with it"** in item 9: I placed the runs chart as a tab with the readouts tile, not with the stage.
- **`runs.steps`:** 9, which gives rate steps of 50 from 0 to 400.
- **Tile `size`:** 0.3 for both tiles. **Table `limit`:** 64, matching each list's maximum.
- **`null` in a lambda:** I assumed the Runtime Subset accepts the `null` literal, because the draft names it for `badge`.
- **Stage drawing:** dots have a fixed 1.5 px radius, and the box is fitted to the element with its aspect ratio kept. The pick's `(x, y)` is the inverse of that fit, so it can fall outside the box if the click lands in the letterbox. The draft does not say whether picks must lie inside the bounds.
- **Late properties:** for properties the host set before the tag was defined, the element re-applies own properties in `connectedCallback`, in the host's order (`params`, `text`, `state`).
- **Maze:** I wrote no grid element. Item 11 says the text view is enough.

## 5. Gaps

Smallest first.

1. **An integer type for state** (items 1 and 12). Counts and the cap are declared `"f64"`, so `s.coinsLeft === 0` relies on exact float equality. It works, but the declaration cannot say "count".
2. **Whether `tone` may be `null`** (item 8, optional extra). The draft gives `null` for `badge` but not for `tone`, so "warn only above 300" cannot be said for sure.
3. **No bound for list maxima** (R3, all lists). Some list sizes are only known per Program (`maxParticles`, the grid's size), but `list(type, max)` needs a constant. I picked ceilings, which an over-large Program would break.
4. **What a pick does** (item 7). The stage can emit `wb-pick`, but the draft only says it shows up in the `events` log. No component or lambda can read "the last pick", so the click has no visible effect beyond the log. The task asks only that it be reported, so item 7 still fits.

Nothing in the task needed a key, kind or event the draft lacks.

## 6. The element contract

It was enough for `particles-dots`. `state` gives the bounds and the particle positions, and `wb-pick` with `{ x, y }` in state coordinates is exactly what item 7 asks for. Things I wanted but could not have:

- **Per-particle size or colour.** These are fields the Program has (`size`, `heat`), but the state comment hands only `{ x, y }`, so every dot looks the same. That is a limit of the Dialect's state, not of the contract.
- **The host's theme colours** (or a CSS-variable convention), so the canvas matches the page. I hard-coded two colours.
- **Pick feedback:** a way to learn what the host did with a pick, for example a property echoing the last pick, so the element can mark it.
- **The guarantee about late properties** forces the "re-apply own properties on upgrade" boilerplate. The host could set them only after `customElements.whenDefined`, or the draft could spell out the idiom.

## 7. Two packages

Under the draft's rules, the maze UI would place its score tile with `place: { splitRight: "particles.stage" }`. Another package's view is named in full in a `place`, and a bare id is the maze's own. To annotate the other package's views, it would use a qualified key in `annotate`, for example `annotate: { "particles.traces": { t: { note: "…" } }, "particles.params": { rate: { badge: … } } }`. Particles would do the same with `maze.traces` or `maze.params`.

The draft leaves these questions open:

- **Which state a lambda sees.** Does a lambda in the maze's annotation of `particles.params` get the particles state and params, or the maze's? The checker types `s` against the maze Dialect only.
- **Which Dialect's globals apply.** For example, can the maze, which has no `Math`, call `Math` in an annotation on particles?
- **How qualified annotation keys look.** Does a qualified view go as the `annotate` key (`"particles.traces"`), or nested by package?
- **Whether the generated views are per package.** Each package has `params`, `traces`, `events`, `pad` and `text`; can two `pad`s exist, and do two packages' inputs share roles and keys?
- **Which stage gets focus.** "Click to play" covers which stage?
- **Clashing tile ids.** What happens when two packages use the same tile id?
- **How a coin bursts into particles.** Nothing in the draft lets one package's run feed the other's. There are no cross-package events or state, so `wb-pick` or `wb-param` from one stage cannot reach the other package, and a maze coin cannot spawn particles. Composition covers layout and annotation, not behaviour.
- **Load and placement order.** Is a `place` into a package that is not on the page an error or skipped, and do cycles span packages?

## 8. Files

I opened these files, all inside `/private/tmp/3d093c96-ui2/agent-a`:

- `ui-draft.md`, `rules.md`, `task.md`, `check.sh`
- `particles/particles.dialect.js`, `particles/particles.grammar.js`, `particles/examples/01.js`
- `maze/maze.dialect.js`, `maze/maze.grammar.js`, `maze/examples/01.js`

I wrote `particles/particles.ui.js`, `particles/particles-dots.js`, `maze/maze.ui.js` and this report, and edited the two Dialects. I opened nothing else. `check.sh` runs a checker outside the folder (`/Users/ben/git/workbench/scripts/ui-trial/check.js`); I ran it through `check.sh` but did not open it.
