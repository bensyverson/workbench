# UI trial report: particles and maze

## 1. Difficulty

2 (easy): every item of `task.md` has a clean form in the draft except the stat for "live against the cap", and the element module was short; the one real friction was the element contract, not the declaration.

## 2. Per item

1. Live particles against the cap, red when full, and the time: **partly fits**. Time is a `stat` (`unit: "s"`); live is a `stat` red via `badIf` when `live >= maxParticles`. The cap is a second `stat`, because a `stat` cannot show "live of cap" as one readout.
2. Each emitter's live count, one row per emitter: **fits** (`table` over `emitters`, columns `name`, `live`).
3. Each counter's value, one row per counter: **fits** (`table` over `counters`, columns `name`, `value`).
4. Check that stays green while under the cap: **fits** (`check`, `live < maxParticles`).
5. Plot of live particles over the last 10 seconds: **fits** (`plot`, `y` a lambda returning `particles.length`, `window: 10`).
6. Chart of runs, live after 5 s, `rate` from 0 to 400: **fits**. `runs` with `param: "rate"`, `from: 0`, `to: 400`, `seconds: 5`, `steps: 9`, `y` reading `particles.length`. The tick is the Program's own (its example says `tick(1/30)`); the draft gives no key to set it from the UI, which the draft's text says is intended. A Program without `rate` shows an empty chart, as the draft says.
7. Stage drawing every particle as a dot, click reports a pick: **fits**. `stage: { element: "particles-field", module: "./particles-field.js", emits: ["pick"] }`; the module is `particles/particles-field.js`.
8. Note on the `t` trace; badge on `rate` reading "hot" above 300: **fits**. `annotate.traces.t.note`; `annotate.params.rate.badge: (s, $) => ($.rate > 300 ? "hot" : null)`.
9. Readouts beside the stage, chart of runs in a tab with it: **fits**. Readouts `splitRight: "stage"`; the live plot `splitBelow: "readouts"`; runs `tabWith: "stage"`.
10. Inputs (D-pad and A/B, mapped to roles, A "Dash", B "Wait"): **fits**. `inputs.object: "Pad"`, six buttons, roles `dpad.*`, `a`, `b`.
11. Stage as the text view: **fits**. No `stage` key; the generated `stage` view is the text view.
12. Score and coins-left readouts below the stage, check "all coins": **fits**. Tile `readouts` `splitBelow: "stage"`; `stat` score, `stat` coins left, `check` `coinsLeft === 0`.
13. Plot of score over the last 30 seconds: **fits** (`plot`, `y: "score"`, `window: 30`).
14. Composition (the maze's coins burst into particles on one page): **not expressed**. The draft does not say how a package reads another's state or events; see section 7.

## 3. Where the draft misled you

- The worked orbits example uses a bare `abs(...)` inside lambdas: `badIf: (s) => abs(s.energy - s.startEnergy) > 1`. Neither of my two Dialects gives a bare `abs` (particles has `Math.abs`; maze has no math at all), and the draft does not say whether `abs` is one of the Runtime Subset's globals. I wrote `s.coinsLeft === 0`-style lambdas and nothing needing `abs`, so the checker did not settle it. I read the example as the thing to copy, and it is not clear that it is valid as written.
- The `stat` section says it shows "a readout; red while `badIf` holds" and nothing about a fraction. The task's "against the cap" reads naturally as "n of cap", and the draft's examples give no way to show that. I did not expect this from the text; I found it only when writing item 1.

## 4. What you guessed

- `t` is seconds: the particles Dialect's `tick` is "seconds per tick", so I wrote the trace note as "run time, in seconds" and gave the time stat `unit: "s"`.
- Layout: readouts `splitRight` of the stage with `size: 0.3`; the live plot `splitBelow` the readouts; the runs chart `tabWith: "stage"` (I read "it" in item 9 as the stage, not the readouts).
- `runs`: `steps: 9` (0, 50, …, 400); `seconds: 5`.
- Badge test: `$.rate > 300` (strictly above). Check and stat: "under cap" as `<`, "full" as `>=`.
- Stat lambdas take `(s)` only, since no `$` is read there.
- Tables have no `limit`: the draft does not say what the default is, so I left it out.
- Maze: `grid` is `listOf("string")`; the readouts tile is `splitBelow: "stage"` with `size: 0.35`; the "all coins" check uses `===`.
- Maze D-pad buttons have no `label`: the draft says a button with no label gets an on-screen button with a key the host picks, so I gave the D-pad no label.
- Element `particles-field`: shadow DOM with a canvas; state coordinates map from the canvas's box by its bounds; dots drawn at radius 1.5 state units; `ResizeObserver` for redraw; a property set before the module defined the tag is re-set through its setter.

## 5. Gaps

Smallest first, each with the task item that needs it.

1. A readout of a value against a cap (item 1): a `stat` cannot show "live of cap" (a fraction or a bar), so I used two `stat`s.
2. A way to say what a `runs` chart's tick is (item 6): the draft says the Program's tick is used; I did not need more, but a UI that wants to state "1/30 s" must rely on the Program. Not a gap for this trial; recorded for completeness.
3. Cross-package state and events (item 14): the draft gives a package's lambdas only its own `state`, and the only events out are `wb-pick`, `wb-select`, `wb-param`, with no event from one package to another. A maze whose coins burst into particles needs one of those, and the draft has neither.
4. Defaults the draft leaves unsaid (items 2, 3, 6): the default `limit` of a table, the default `steps` of `runs`. Documentation gaps, not capability gaps.

## 6. The element contract

The contract sufficed for the one element I wrote: properties `state` and `params` and `text` in, `wb-pick` out with `bubbles` and `composed`. The element needed the bounds to map a click into state coordinates; they are in `state.bounds`, so nothing else was needed. I wanted to know whether the element's own box size is available as a property (the draft says the element fills a box the host lays out, and the element measures it itself with `getBoundingClientRect` and `ResizeObserver`); the draft does not say whether that is the right way, which is a guess I made. No `wb-select` or `wb-param` was needed.

## 7. Two packages

The maze's score tile could sit beside the particles stage with a qualified place, `place: { splitRight: "particles.stage" }`, since the draft says another package's view is named in full in a `place`. The draft also allows a qualified key in `annotate`, so the maze could annotate `particles.params` (for `rate`) and the particles package could annotate `maze.traces`. But the draft does not say what a trace key that names a path inside another package's `state` means, since each package's `state` is its own. It does not say how a coin burst would reach the particles package: a package's lambdas see only its own state, and there is no event from one package into another. It also does not say how two packages' tiles are ordered when both place against the same view. The draft states the composition only in its title (two packages in one page), not the mechanism.

## 8. Files

Opened and read (the first two sets, as the trial allows):
- `ui-draft.md`
- `rules.md`
- `task.md`
- `particles/particles.dialect.js`
- `particles/particles.grammar.js`
- `particles/examples/01.js`
- `maze/maze.dialect.js`
- `maze/maze.grammar.js`
- `maze/examples/01.js`

Written: `particles/particles.ui.js`, `particles/particles-field.js`, `maze/maze.ui.js`, `REPORT.md`.

Run: `check.sh` (run once; output "no violations" for both packages). I did not open `check.sh`.

Seen in the folder listing but not opened: `transcript.jsonl` and `stderr.txt` (both in `agent-f`). I did not read them.

I opened nothing else, and did not search the web.
