# Report: UI trial, particles and maze

## 1. Difficulty

3 of 5. Every declaration checks and each item of `task.md` has a place in the draft. What cost the most effort was choosing the state bounds the draft requires and writing the particles stage element by hand, which the checker cannot verify.

## 2. Per item

1. **Live particles against the cap, red when full; time.** Fits. Stat `live` with `max` and a `badIf` for "full"; stat `time` with unit `s`.
2. **Each emitter's live count.** Fits. Table over `emitters`, columns `name` and `live`.
3. **Each counter's value.** Fits. Table over `counters`, columns `name` and `value`.
4. **Check: green while under the cap.** Fits. `check` "under cap", `particles.length < maxParticles`.
5. **Plot of live particles, last 10 s.** Fits. `plot`, `window: 10`.
6. **Chart of runs, live after 5 s, rate 0 to 400.** Fits. `runs`, `param: "rate"`, `from: 0`, `to: 400`, `seconds: 5`, `steps: 9`. The tick is the Program's own (1/30). A Program without `rate` shows an empty chart, as the draft says.
7. **Stage that draws every particle; click reports a pick.** Fits. Custom element `particles-field` in `particles/particles-field.js`, emitting `pick`. Its contract is read by hand only; I did not run it in a browser.
8. **Note on the `t` trace; "hot" badge on `rate` above 300.** Fits. `annotate.traces.t.note`; `annotate.params.rate.badge` reads `$.rate`.
9. **Layout: readouts beside the stage, chart of runs in a tab with it.** Fits. Tile `readouts` split right of `stage` (0.25); tile `runs` tab-with `stage`.
10. **Maze inputs: D-pad and A/B mapped; A and B labelled "Dash" and "Wait".** Fits. `inputs` with object `Pad`, the four `dpad.*` roles, and `a` and `b` with labels.
11. **Maze stage: the text view is enough.** Fits. No `stage` key; the generated `stage` view shows `text(state)`. No maze element written.
12. **Score and coins-left readouts below the stage; check "all coins".** Fits. Tile `readouts` split below `stage`; stats `score` and `coins left`; check `coinsLeft === 0`.
13. **Plot of the score over the last 30 s.** Fits. `plot`, `window: 30`.
14. **Composition: maze score tile beside the particles stage; annotations across packages.** Not expressed. The draft has no way to place or annotate across packages in this trial (see section 7).

## 3. Where the draft misled you

- On `stat`: "with `max`, shown as "value / max" and red past it; red while `badIf` holds". Read alone, `max` seems to give the "full" colour. It only goes red past the cap, which never happens, so "red when full" needs `badIf: (s) => s.particles.length >= s.maxParticles`. I used that.
- On composition: "Another package's view is named in full (`fields.stage`) in a `place` or an `annotate` key", then "a qualified id is an error here". The first sentence reads as a way to do item 14, and the second withdraws it for this trial. I could not tell which one the report should rely on.

## 4. What you guessed

- **List maxima** (the draft requires `list(type, max)`): `emitters` 64, `counters` 64, `grid` 64 rows, `particles` 10000 (the Grammar's `maxParticles` upper bound). The first two and the grid cap are my choice; the Grammar sets no bound for them.
- **Counter value type**: `"f64"`, because the Grammar's environment declares every counter an f64.
- **`state` placement**: before the comment block above `text(state)`, so the comment stays above `text`.
- **Dialect imports**: I added `struct` and `list` to each Dialect's `import` line. Nothing else changed in either Dialect. A `state` using `struct` and `list` cannot be written without the import; I did not find another way.
- **Meaning of `t`**: I took it to be run time in seconds and wrote the note as "run time, in seconds". The Dialect's comment does not give the unit.
- **Runs chart**: `steps: 9` (0, 50 … 400), `seconds: 5`. The task fixed the range and time but not the step count.
- **Stat "time"**: unit `s`.
- **"Under cap"** is strict: green while `particles.length < maxParticles`.
- **Tile and element names**: tiles `readouts` and `runs` (particles), `readouts` (maze); element `particles-field`, module `./particles-field.js`.
- **Table columns**: plain row keys, with no `{ label, value }` form, because the row keys already read as labels.
- **Stage coordinates**: the element maps its canvas to `state.bounds` and reports clicks in state coordinates; it draws each particle as a 2-unit-radius dot.
- **Maze**: no custom element, because the task allows the text view.

## 5. Gaps

Smallest first. Each names the task item that needs it.

1. **Bounded lists the Grammar does not bound.** `list(type, max)` needs a maximum, but the emitter list, the counter list and the maze grid have no bound in the Grammar. I chose 64 for each; that is a number the language does not hold. Needed by items 2, 3 and 11.
2. **Cross-package placement and annotation.** Item 14 needs a maze tile placed beside `particles.stage` and an annotation on another package's view. In this trial a qualified id is refused (U003), so the item cannot be expressed. Even if it were allowed, `annotate` keys for views name a view or tile, not a path in another package's state, so `maze.traces` with a path into `maze`'s state has no defined form. Needed by item 14.
3. **Cross-package data or events.** Item 14 also describes maze coins bursting into particles. The draft has no channel from one package's state or events to another's program. Needed by item 14.

## 6. The element contract

Properties in and `wb-` events out were enough for `particles-field`: it gets `state` (with `bounds`, `particles`) and draws the field, and it sends one `wb-pick` with a point in state coordinates. Nothing I wanted was missing. The element never needed `params` or `text`, and I did not write anything that uses `value`. I could not verify this against a host; the element is untested in a browser.

## 7. Two packages

The draft gives one page per package and no composition rule, so a maze's score tile cannot be placed beside the particles stage as the draft stands. The nearest form would be `place: { splitRight: "particles.stage" }` in `maze.ui.js`. That is the full-name form the draft allows, but this trial refuses it (U003), so it cannot be checked here. The draft also leaves unsaid: which package's `defineUI` a page uses when two are loaded; how tile ids from two packages avoid collisions; how an annotation names a path in another package's state; how a maze coin event could reach the particles Program at all, since each package's state is its own; and whether two stages would share the `customElements` registry without clashing.

## 8. Files

Files opened: `ui-draft.md`, `rules.md`, `task.md`, `particles/particles.dialect.js`, `particles/particles.grammar.js`, `particles/examples/01.js`, `maze/maze.dialect.js`, `maze/maze.grammar.js`, `maze/examples/01.js`.

I did not open anything else. The directory listing showed `transcript.jsonl` and `stderr.txt` in the workspace root; I did not open either. I ran `check.sh` (not read), which reported no violations for either package.

Files written: `particles/particles.dialect.js` (state and import line), `maze/maze.dialect.js` (state and import line), `particles/particles.ui.js`, `particles/particles-field.js`, `maze/maze.ui.js`, `REPORT.md`.
