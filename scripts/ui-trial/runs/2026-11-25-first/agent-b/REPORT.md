# UI trial report

`check.sh` reports no violations for either package (it passed on the first run). Nothing was run in a host or browser: no tile was drawn, no lambda was evaluated, and `particles-field.js` was only syntax-checked (`node --check`) and read.

## 1. Difficulty

**1 (easy)**: every item you can check maps onto a key the draft names, mostly in the form its worked example shows; only the runs chart's duration and the composition question needed thought.

## 2. Per item

1. **Fits.** `stat` "live" with `badIf` at the cap, plus separate `stat`s "cap" and "time" (`unit: "s"`).
2. **Fits.** `table` over `emitters` with `name`, `live`.
3. **Fits.** `table` over `counters` with `name`, `value`.
4. **Fits.** `check` on `s.particles.length < s.maxParticles`; its colors are the host's.
5. **Fits.** `plot`, `window: 10`.
6. **Fits, on the task's tick assumption.** `runs` on `rate`, 0 to 400, `ticks: 150`. The 5 s is only a comment: for a Program whose tick is not 1/30 s the chart covers a different time. "Programs without `rate` show nothing" is assumed, see section 4.
7. **Fits.** `particles-field` draws a canvas of dots and emits `wb-pick` in state coordinates; the text view is the fallback.
8. **Fits.** `annotate.traces.t.note` and `annotate.params.rate.badge`.
9. **Fits.** `health` is `splitRight` of `stage`; `sweep` is `tabWith: "health"`. The tables, check and plot are in `health` too.
10. **Fits.** `inputs` on `Pad`, four D-pad roles plus `a`, `b`, labeled "Dash" and "Wait".
11. **Fits.** No `stage` key, so the text view is the stage. I wrote no element.
12. **Fits.** `score` tile `splitBelow` `stage`, two `stat`s and a `check` on `s.coinsLeft === 0`. The check shows fail until then; that pass looks green is my assumption.
13. **Fits.** `plot` of `score`, `window: 30`, in the same tile.
14. Answered in section 7. Placing and annotating are partly covered; much is unsaid.

## 3. Where the draft misled you

Nothing led me to a declaration the checker refused. One sentence could mislead:

- "A lambda that reads `$.rate` shows nothing for a Program without `rate`." The task's "Programs without `rate` simply show nothing" sounds like this rule, but in item 6 the dependency is `runs`' `param: "rate"`, and its `y` lambda does not read `$`. The draft does not say what a `runs` chart does when the param is missing.

## 4. What you guessed

- **`runs` without the param:** the host shows nothing (or an empty chart) and does not error.
- **`runs` range against the Program's param:** `from: 0, to: 400` is used as written, even if a Program declares a narrower `min`/`max`. The draft says clamping only for `wb-param`.
- **`runs.steps`:** 9, giving values 50 apart (assuming both ends are included).
- **"Against the cap":** a second `stat` for `maxParticles`. I did not build a "n / cap" string, since the draft does not say which string operations the Runtime Subset allows.
- **Where unplaced items go:** the task places only "the readouts" and the chart of runs. I counted tables, check and plot as readouts.
- **Sizes and titles:** 0.3 and 0.35; "Health", "Rate sweep", "Score"; all labels.
- **Maze tile id `score`:** allowed alongside a state key of the same name.
- **`grid`:** `listOf("string")`. The draft shows only lists of objects, though `listOf(shape)` covers it.
- **Coordinates:** state coordinates are the particles' `x, y` in `bounds`, origin top left, y down (matching the text view).
- **Element:** shadow DOM, canvas sized to `bounds` and shrunk with CSS to fit, 2 px dots, the inherited text color, and a handler for properties set before the element is defined.

## 5. Gaps

Smallest first.

1. **Item 6: `runs` cannot be given a duration in seconds**, or read the Program's tick. `ticks: 150` is right only at 1/30 s, while `plot.window` is already in seconds.
2. **Item 14: cross-package composition is largely unspecified** (section 7).

## 6. The element contract

For the one element, properties in and `wb-pick` out were enough: it needs only `state.bounds` and `state.particles`, and ignores `params` and `text`. There was nothing more I wanted to send. Particle size is not drawn because the host's state does not carry it; that is the package's state, not the contract.

The draft leaves these to each element author:

- Whether the host may set properties before the module defines the tag (I handled it).
- The order `state`, `params`, `text` are set in, so an element using several cannot tell when a tick's update is complete.
- How the stage element is sized, and whether it learns of resizes or theme colors.
- What a host does with `wb-pick` beyond, presumably, logging it in `events`.

## 7. Two packages

**Placing the maze's score tile beside the particles stage.** In `maze.ui.js`, name the other view in full:

```js
score: { title: "Score", place: { splitRight: "particles.stage", size: 0.3 }, body: [ … ] }
```

**Annotating each other's views.** The other view's full name is the `annotate` key, with the usual inner keys. The maze would write `annotate: { "particles.params": { rate: { note: "…" } } }`, and particles would write `annotate: { "maze.traces": { score: { note: "…" } } }`. Only `traces` and `params` take annotations, so neither can annotate the other's stage or tiles. This trial's page holds one package, so both forms are errors here and neither is in my files.

**Unsaid:**

- **Whose data a cross-package lambda sees.** Does a `badge` on `particles.params` get the particles' `s` and `$`, or the maze's?
- **Checking.** `defineUI` takes one builder, so how are a foreign view id, path or param name checked? How is a dependency declared, and what happens when the other package is absent?
- **Reading across.** No component can take a value from another package's state, so a maze tile cannot show a live particle count.
- **Conflicts.** Two annotations on one key, two tiles splitting the same view (order and shares), and `place` cycles across packages.
- **Foreign tiles.** `particles.health` is a named example, but it is only implicit that it can be a `place` target.
- **Page views.** `editor`, `agent` and `book` belong to the page, yet "a bare id is your own". How a UI names them in a two-package page is unclear.
- **Stages and inputs.** Are there two stages? Which has focus, and what if both packages claim the same roles?
- **Behavior.** "Coins burst into particles" needs one run to tell the other something. The UI API gives no such channel, and says nothing about whether the Dialects or Programs can.

## 8. Files

Opened or read:

- `ui-draft.md`, `rules.md`, `task.md`, `check.sh`
- `particles/particles.dialect.js`, `particles/particles.grammar.js`, `particles/examples/01.js`
- `maze/maze.dialect.js`, `maze/maze.grammar.js`, `maze/examples/01.js`

I opened nothing else. I listed the directory and the two `examples/` folders; the listing showed `stderr.txt` and `transcript.jsonl`, which I did not open. Running `check.sh` executes a checker outside this directory and sets a log path inside it; I opened neither the checker nor the log. I wrote `particles/particles.ui.js`, `particles/particles-field.js`, `maze/maze.ui.js` and this report.
