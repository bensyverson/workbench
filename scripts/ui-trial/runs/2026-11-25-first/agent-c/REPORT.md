# UI trial report

## 1. Difficulty

**2 (easy).** Both UIs map onto the draft's components and keys, and `check.sh` passes on both packages; the two hard spots were item 6 (the chart of runs counts ticks, not seconds) and item 14 (the composition question, which the draft cannot express for a second package).

## 2. Per item

1. **fits.** `stat` "live" with a lambda `value` and `badIf` (red at the cap); `stat` "time" with `value: "t"` and `unit: "s"`. In `particles.ui.js`, tile `health`.
2. **fits.** `table` over `emitters`, columns `"name"` and `"live"`.
3. **fits.** `table` over `counters`, columns `"name"` and `"value"`.
4. **fits.** `check` "under the cap", `expect: (s) => s.particles.length < s.maxParticles`.
5. **fits.** `plot` "live", `y` a lambda, `window: 10`.
6. **partly fits.** `runs` with `param: "rate"`, `from: 0`, `to: 400`, `ticks: 150`, `y` the live count. The draft takes `ticks`, not seconds, so "5 seconds" is written as 150 ticks: right only for the 1/30 s tick the task gives. A Program with another `.tick` would get the wrong run length, and the component cannot read the Program's tick. Programs without `rate`: the draft does not say what happens (see 4 and 5).
7. **fits.** `stage` names `particles-field`, module `./particles-field.js`, `emits: ["pick"]`. The element dispatches `wb-pick` with `{ x, y }` in state coordinates. Module written: `particles/particles-field.js`.
8. **fits.** `annotate.traces.t.note` is "seconds since start"; `annotate.params.rate.badge` is `($.rate > 300 ? "hot" : null)`.
9. **fits.** Tile `health` is `splitRight: "stage"` (its readouts); tile `sweep` (the chart of runs) is `tabWith: "health"`.
10. **fits.** `inputs.object: "Pad"`; the six buttons match the Dialect's `Pad` members; roles `dpad.*`, `a`, `b`; labels "Dash" and "Wait".
11. **fits.** No `stage` key, so the generated `stage` is the text view. No maze element written (the task makes it optional).
12. **fits.** Tile `status` is `splitBelow: "stage"`, holding stats "score" and "coins left" and the check "all coins" (`s.coinsLeft === 0`).
13. **fits.** `plot` "score", `y: "score"`, `window: 30`, in tile `status`.
14. **not expressed.** See section 7.

## 3. Where the draft misled you

- The components table gives `plot`'s and `runs`'s `y` as "a number", but the lambda convention table lists `y` among the `(s, $) => …` keys. Read with "Wherever a component takes a value, give a path or a lambda", it accepts both. The two passages do not say so directly.
- "Two packages in one page" says another package's view "is named in full (`fields.stage`) in a `place` or an `annotate` key", which reads like a working form for item 14. Only the parenthesis says a qualified id is an error in this trial. I read the parenthesis as decisive and did not use the form.

## 4. What you guessed

- `runs`: `steps: 9` (0, 50 … 400); the task gives no count.
- `runs`: `ticks: 150` (5 s ÷ 1/30 s).
- Tile sizes: `size: 0.3` for `health` and for `status`.
- The score plot sits in tile `status` with the readouts, not in its own tile.
- Labels: "live", "time", "score", "coins left", "under the cap", "all coins", "Live after 5 s, by rate". Chart label and tile titles are mine.
- Table `limit`: omitted (the draft gives no default).
- `runs` with a `param` that a Program does not declare: I expected the chart to show nothing, as the task says. The draft does not say how this is handled.
- Element `particles-field`: draws on setting `state`; canvas sized to `bounds` in state units; dots of radius 1.5; shadow DOM; the click maps to state coordinates by scaling to the canvas's displayed box; `customElements.define` is guarded by `customElements.get` against a second load. `params` and `text` are stored and not drawn.
- Badge lambda `(s, $) => …` ignores `s`.
- Maze `grid` declared `listOf("string")`; maze `state` declares exactly the members that `text(state)` reads.
- The `===` operator in the maze check's lambda: I assumed the Runtime Subset has it. The checker passes it but does not type it.
- The particles `counters` value declared `"number"` (the Dialect's `bump` counters are f64).
- The checker and my reading cover the declarations. Nothing ran in a host: no element was loaded, and the click mapping was not tried in a browser.

## 5. Gaps

Smallest first:

1. **Item 6.** `runs` counts `ticks` and cannot say "5 seconds", nor read the Program's `.tick`. Needed: a run length in seconds, or a read of the Program's tick. Written as 150 ticks; marked partly fits.
2. **Item 6.** The draft does not say what a `runs` chart shows when its `param` is not in a Program. Needed: the rule written down (annotate's "skipped" rule covers only annotate).
3. **Item 14.** No way for one package's run to hand anything to another (a coin burst into particles): the `wb-` events go to the host, the element events are only `pick`, `select` and `param`, and no shared state exists.
4. **Item 14.** Qualified ids are refused in this trial, so no cross-package `place` or `annotate` can be written to test. Needed: a trial with two packages, or the rule for how two packages' tiles share one layout.
5. **Item 14.** A traces key is a path in the package's own `state`. Needed: whether a path into another package's state is allowed in `annotate`, and whether a lambda may read another package's state.

No gap blocked items 1–5 and 7–13.

## 6. The element contract

Properties in (`state`, `params`, `text`) and `wb-pick` out were enough for `particles-field`. What I wanted and lacked:

- The element's own displayed size, or the host's rule for sizing it. The pick maps the click by `getBoundingClientRect`, which assumes the host lays the element out with a box of some size; the draft does not say.
- Nothing else. The element needs no keys, no focus, and no `value` (the stage gets none). The task asks for no hover or drag, so no further events were needed.

## 7. Two packages

Item 14, in prose. The maze would place its score tile beside the particles stage with `place: { splitRight: "particles.stage" }`, on the draft's rule that another package's view is named in full. But the draft also says this trial's page holds one package, so the form is an error here. I did not write it. Particles could annotate a maze trace with a qualified `traces` key, `"maze.score"`, which the draft neither allows nor forbids. For coins that burst into particles, the maze's run would have to drive the particles' state or send an event to it; the draft has neither (the element events go to the host, and no cross-package event or shared state exists). The draft leaves unsaid: whether the two packages' tiles share one layout tree; whether `tabWith` may cross packages; whether a lambda may read another package's state in `s`; which package's tick runs first; and which state the host hands a view that names both packages.

## 8. Files

Read, in full: `ui-draft.md`, `rules.md`, `task.md`, `check.sh`, `particles/particles.dialect.js`, `particles/particles.grammar.js`, `particles/examples/01.js`, `maze/maze.dialect.js`, `maze/maze.grammar.js`, `maze/examples/01.js`.

Listed but not opened: a directory listing of `agent-c` showed `transcript.jsonl` and `stderr.txt`, which the brief does not name. I did not open them. I opened nothing else.

Ran: `check.sh`, which runs `/Users/ben/git/workbench/scripts/ui-trial/check.js` and writes `log.jsonl`. I did not open that script. Final run: "no violations" for both packages.

Written: `particles/particles.ui.js`, `particles/particles-field.js`, `maze/maze.ui.js`, `REPORT.md`. The Dialect, Grammar and example files are unchanged.
