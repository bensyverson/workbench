# REPORT

## Difficulty

3 of 5. Both files were quick to write and load under Node. The hard part is that three bindings (the radius grip's `each`, the radius clamp, and the glass pick's `to`) rest on readings of `reference.md` that it does not settle, so I could not check them against the kit.

## What I built

- **`dialect.js`**: `ports.in` has two Event inputs. `caption` is `Event<{ value: str }>`. `glass` is `Event<{ value: str, nd: f64, vd: f64 }>`, the record a `pick` makes when it carries `nd` and `vd`. `ports.out` has `bench` and `chart`, both with seam `"Draw"`. `files` names one data file, `glasses`, which points at `glasses.csv`. No pointer input: grips are drawn and dragged by the host, so the drag does not go through a Dialect input.
- **`ui.js`**: a plain `export const ui = {...}` with four parts.
  - `stage: { draw: "bench" }`.
  - `controls.caption`: a `text` control, `max: 120`, one line, bound to the `caption` input.
  - `controls.glass`: a `pick` over file `glasses`, key `name`, show `name, nd, vd`, `map: { x: "vd", y: "nd" }` (an Abbe scatter), `carry: { nd: "f64", vd: "f64" }`, start value `"BK7"`, and `to: "arg.bench.lens#0:0.glass"`, so a release writes the first lens's glass literal.
  - `grips.radius`: one grip per lens (`each: "lenses"`), at `[cx + r, cy]` (the right edge), `kind: "length"`, `axis: [1, 0]`, and `to: "arg." + radiusTarget`. The drag runs along the axis.
  - `tiles.chart`: a `view` of the `chart` Draw output, with `place: { tabWith: "stage" }`, so the bench and the chart are tabs of one group.

Both modules import cleanly with `node -e "import(...)"` (Node v26.13.1). I have not run them against a kit, since none is in the folder.

## Where the docs misled me

- **`defineUI` vs the task's shape.** The reference declares a UI as `export const <ui> = defineUI(<builder>, {...})`. The task asks for a plain `export const ui = {...}`, and no builder is named anywhere. I followed the task.
- **`tabWith` target.** The reference says `tabWith` names "a view or tile". The bench is `ui.stage`, which is neither, so I named `"stage"`. I read it as a name the stage answers to, and the reference does not say that.
- **Grip `each` needs a max.** Section 7 and U018 say `each` must be "a state list with a max". The lens list `lenses` has no max in the task, so as written U018 would refuse it.
- **Grip clamp.** Section 7 says constraints come from the target's own declaration (the argument's Grammar shape, or a param's `min`/`max`). A Grip has no `min` or `max` key, and U018 refuses unknown keys, so the 5..80 range cannot be stated on the grip. I read the reference as putting it in the lens builder, which the task does not ask me to write.
- **Control `to` form.** The kind table lists `to?` for every kind. Section 1 gives `to` only inside `each` entries, as a value. Section 8 says "a `to` makes the Control commit on release, as a Grip does", but a Grip's `to` is a function of `(item, s, $)`. The reference does not say whether a top-level Control `to` is a string or a function.
- **Build time vs runtime state.** `each` on a Control is build-time code over the built record, while `radiusTarget` and `glassTarget` exist only in runtime state. The reference gives no way for a Control's target to come from state, so I wrote the glass target as a static address. The task's `glassTarget` is therefore not used.
- **Seam for Draw outputs.** The reference speaks of a "Draw output" but never names its seam. I used `"Draw"` as the task asks.
- **`place`.** The reference says `place` is "declared today", but never says which object carries it (a tile, a view component, or the UI).

## What I guessed

- **`files` entry shape.** The reference says `file` names an entry of `files` ("csv or json") but gives no shape for an entry. I wrote the bare path string `glasses.csv`.
- **Radius target text.** I read `radiusTarget` as the Argument address without the `arg.` prefix, so the grip's `to` adds it. If the runtime already includes `arg.`, the prefix doubles.
- **Handle position and axis.** The handle sits at `[cx + r, cy]` and moves along `[1, 0]`, so the optical axis is taken as horizontal.
- **Abbe axes.** `vd` goes on x and `nd` on y, in the usual Abbe layout. The reference does not say.
- **Start glass.** `"BK7"`, the first lens's starting glass.
- **Static glass address.** `"arg.bench.lens#0:0.glass"` follows the Ref id rule (`<instance>.<slot>#<n>:<i>.<key>`) with n = 0, i = 0. The task says the first lens is enough.
- **Caption placement.** The caption and glass controls have no tile of their own. They appear in the generated `controls` view. Only the chart has a tile.
- **Node module type.** The folder has no `package.json`, so these `.js` files load as ES modules only through Node's syntax detection. I did not add a `package.json`, because the reference does not mention one.

## Gaps

1. **`files` entry shape.** Needed: how an entry in `files` names its format and its file, and how csv column types (`name`, `nd`, `vd`) are declared. Smallest change: one sentence and one example entry in the reference.
2. **Grip range.** Needed: a way for a lens's radius to be clamped to 5..80 at the grip. Smallest change: either `min` and `max` keys on a Grip, or a statement that the builder's declared range is what the grip uses, with an example.
3. **Grip over an unbounded list.** Needed: `each` on a list with no `max`, such as `lenses`. Smallest change: allow it, or say what `max` the list needs.
4. **Control `to` form.** Needed: whether a top-level `to` on a Control is a string or a function `(record, s, $)`, and whether it can read state. Smallest change: one line in the kind table saying which.
5. **Name for the stage in `tabWith`.** Needed: how a tab group names the stage, which is not a view or tile. Smallest change: say the stage is a valid `tabWith` target, or name the stage's place.
6. **UI declaration form.** Needed: whether a plain object `export const ui = {...}` is accepted, and where `defineUI`'s builder comes from when it is used. Smallest change: one sentence and one example.
7. **Radius target text.** Needed: whether `radiusTarget` and `glassTarget` already include the `arg.` prefix. Smallest change: an example value in the reference.
8. **Seam name for Draw outputs.** Needed: the seam name for a Draw output. Smallest change: name it in the reference.
9. **Where `place` lives.** Needed: which object (tile, view component or UI) carries `place: { tabWith }`. Smallest change: one example.

## Docs I could not reach

None were needed in the folder. The reference names kit/define's Ref ids, kit/seam's `compareSeams`, kit/compose's documentation, Grammar's `data("number", ...)`, and kit/package's `loadPackage`. None of these is in the folder, and I did not open anything outside it.
