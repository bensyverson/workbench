# UI trial report

## 1. Difficulty

2 of 5: items 1 to 13 map almost directly onto the draft (both packages passed `check.sh` on the first run), and the thought went into the element's upgrade and sizing details and into composition.

## 2. Per item

1. Fits: `live` stat with `badIf` at the cap, `cap` stat beside it, `time` stat. "Against the cap" is two adjacent stats.
2. Fits: table over `"emitters"`, columns `name`, `live`.
3. Fits: table over `"counters"`, columns `name`, `value`.
4. Fits: check `s.particles.length < s.maxParticles`.
5. Fits: plot of `s.particles.length`, `window: 10`.
6. Fits: `runs` on `rate`, 0 to 400, `seconds: 5`. The tick is the Program's, so nothing declares 1/30 s. A Program whose `rate` range is narrower than 0 to 400 gets clamped, repeated points.
7. Fits: `particles-dots` canvas element, `emits: ["pick"]`. Not run in a browser; only syntax-checked (`node --check`).
8. Fits: `note` on trace `t`, `badge` lambda on param `rate`.
9. Fits: `readouts` split right of `stage`; `sweep` as a tab with `readouts`.
10. Fits: `inputs` on `Pad`, four D-pad roles plus `a` and `b`, labelled "Dash" and "Wait".
11. Fits: no `stage`, so the text view is the stage. I wrote no maze element.
12. Fits: two stats and a check in a tile split below `stage`. The check passes when `coinsLeft === 0`; its colors are the host's.
13. Fits: plot of `"score"`, `window: 30`.
14. Answered in section 7. Placing is expressible; annotating is only partly specified. Neither can be checked here.

## 3. Where the draft misled you

Nothing led me to a wrong declaration. Two passages are open to a wrong reading:

- "Another package's view is named in full (`fields.stage`) in a `place` or an `annotate` key." The `annotate` section says "Views that take annotations: `traces` ... and `params`". The example `fields.stage` suggests that a stage can be annotated. The valid `annotate` form would presumably be `"fields.traces"`, which is never shown.
- "**Size:** the element fills the box the host lays out for the view; the host sets no size." A custom element is `display: inline` by default, so it does not fill a box unless it styles itself. I set `:host{display:block;width:100%;height:100%}` in the shadow root. The draft should say whether the element or the host does this.

## 4. What you guessed

- "A tab with it" (task item 9, not the draft): "it" is the readouts tile, not the stage.
- Tile ids, titles, labels, split sizes (0.3 and 0.35), and the use of `row` for the stats.
- `runs.steps`: 9, giving a point every 50.
- `badge` returning `null` below the threshold, with "above 300" read as `> 300`.
- The maze check and plot share the score tile; the task places only the readouts.
- `grid` is `listOf("string")`. The draft shows only lists of objects, though "or `listOf(shape)`" allows it and the checker accepts it.
- No `pad` or other generated view needs declaring or placing; the host lays them out.
- In the element: letterbox to keep the box's aspect ratio; y grows downward (as in `text(state)`); draw in the host's computed `color`; fixed 2 px dot radius; skip particles outside the box; ignore clicks in the letterbox margin; install the `state` setter over an early-set own property in `connectedCallback`.

## 5. Gaps

Items 1 to 13 needed nothing the draft lacks. For item 14, smallest first:

1. A worked form for a cross-package `annotate` key (such as `"particles.params"`), including what the inner keys, paths and lambdas' `s` and `$` refer to (item 14).
2. A way for `defineUI` to know the other package, so that a qualified id, path or param can be checked. It receives only its own builder (item 14).
3. Rules for the other package being absent, for load order, for `place` cycles across packages, and for two packages annotating the same key (item 14).
4. Rules for page-level sharing: which stage and generated views exist per package, who gets key focus, and how two `inputs` declarations share keys, roles and the on-screen pad (item 14).
5. Any way for one package's run to affect or read another's ("coins burst into particles"). This is probably outside the UI API, but nothing says where it belongs (item 14).

## 6. The element contract

Properties in and `wb-` events out were enough for the one element, `particles-dots`. It reads only `state` (box and positions), and sends `wb-pick`. Setting `state` last gives a clear moment to draw.

What the contract leaves to the author or does not say:

- No theme or color is passed in. I used the inherited CSS `color`, which assumes the host sets a readable one, and a theme change is only picked up on the next draw.
- Who makes the element a sized block (see section 3).
- What the host does with `wb-pick` beyond, presumably, logging it in `events`. Picks cannot be inputs, so the Program never sees one.

I had nothing else I wanted to pass or send.

## 7. Two packages

**Placing the score tile beside the particles stage.** In the maze UI, give the tile a qualified `place`:

```js
score: { title: "Score", place: { splitRight: "particles.stage", size: 0.2 }, body: [ … ] }
```

Bare ids stay the maze's own. This trial's checker rejects the qualified form, so I did not put it in the file.

**Annotating each other's views.** Only `traces` and `params` take annotations, so neither package can annotate the other's stage or tiles. From "named in full ... in an `annotate` key", I infer:

```js
// in the maze UI
annotate: { "particles.params": { rate: { note: "driven by coin bursts" } } }
// in the particles UI
annotate: { "maze.traces": { score: { tone: "good" } } }
```

**Left unsaid:**

- Whether the inner keys (`rate`, `score`) resolve against the other package's params and state, and whether a `badge` or `tone` lambda sees the other package's `s` and `$` or the annotator's.
- How a qualified name, path or param is validated when `defineUI` gets only its own builder, and whether the error comes at definition or at page load.
- What happens when the named package is not on the page: skipped, as a missing key is, or refused.
- Who wins when both packages annotate one key, or each places a tile against the other, including cycles and `size` shares of another package's view.
- Whether each package gets its own `stage`, `text`, `params`, `traces`, `pad` and `events`, and how the two are arranged by default. "Each package's views and tiles are named by the package" implies so, but `editor`, `agent` and `book` are the page's.
- How focus, keys and gamepad buttons are shared if both declare `inputs`.
- Whether the two runs share a clock, and how one could cause events in the other. A tile can only read its own package's state, so a maze tile beside the particles stage cannot show particle counts.

Element tags do not clash, because each is prefixed with its package name.

## 8. Files

Opened, all under `/private/tmp/3d093c96-ui2/agent-e`:

- `ui-draft.md`, `rules.md`, `task.md`, `check.sh`
- `particles/particles.dialect.js`, `particles/particles.grammar.js`, `particles/examples/01.js`
- `maze/maze.dialect.js`, `maze/maze.grammar.js`, `maze/examples/01.js`

Written: `particles/particles.ui.js`, `particles/particles-dots.js`, `maze/maze.ui.js`, `REPORT.md`.

I opened nothing else and did not search the web. Running `check.sh` executes a checker script outside the folder, which I did not open. I saw `stderr.txt` and `transcript.jsonl` in the directory listing and did not open them. The session also supplied user instructions and a memory-folder path in its context automatically; I opened no files for them.
