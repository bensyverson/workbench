# REPORT

## 1. Difficulty

**4 of 5.** Both files are written and import under Node. The hard part is that several shapes the task needs (the tile body, the placement under the stage, the write-back of a point list, and log volume over 0 to 1) are either absent from `reference.md` or contradict its rules.

## 2. What I built

**`dialect.js`**: `ports.in` has two Event inputs, both named for what they carry.
- `notes`: `Event<{ index: f64, on: bool, velocity: f64 }>`, the same seam as a `triggers` Control makes, so no U016 misfit.
- `vibrato`: `Event<{ value: f64 }>`, the seam a `number` Control makes.
- `ports.out.picture`: `Draw`, the stage.

**`ui.js`**:
- `stage: { draw: "picture" }`. The task skeleton did not list this key, but the reference puts the stage declaration in the UI, so I added it.
- `controls.notes`: kind `triggers`, `count: 12`, `keys` = KeyA through KeyL (the twelve codes from KeyA upward, read as the alphabetical run A to L), `midi: { notes: true }`, `latency: "direct"`. The reference says `direct` travels the frame path until a direct runner exists, so this is frame latency for now.
- `controls.vibrato`: kind `number`, 0 to 1, bound by name to the `vibrato` Event input.
- `controls.ratio`: kind `number` with `each` over `record.operators`. Each entry has `key` (the operator name), `value` (its ratio), and `to: "arg.<name>.operator:1.ratio"`. That is the Ref id `<name>.operator`, argument 1, path `.ratio`. This is a part-local Control: its name is not an Event input, and it has `to` per entry.
- `controls.env`: kind `points`, `max: 8`, x and y each 0 to 1, with `each` giving `to: "arg.<name>.operator:1.env"` per operator. Also part-local.
- `tiles.play`: the note control, the `volume` param, the vibrato control, and the ratio control, in that order.
- `annotate.params.volume`: `{ look: "knob", curve: "log" }`. The volume param itself is generated (0 to 1, starting at 0.7 from the Program).

I checked the modules by importing them: the exports load, and calling `ratio.each` on a sample record returns entries with string `to` values.

## 3. Where the docs misled me

- **Log volume cannot span 0 to 1.** The kind table says `curve: "log"` with `min` at or below 0 is U017. The volume param is 0 to 1. The annotate route gains `curve` for params, but the reference does not say whether that route runs the U017 check. I wrote the annotate and did not resolve it. If it is checked, volume cannot be log-feeling over 0 to 1 at all.
- **A point list's write-back is not in the table.** `to: "arg.…:1.env"` reaches an `ArrayExpression`. The write-back table covers literal numbers, strings and booleans, `$.<name>`, and refusals. It has no row for an array literal, so a release on `env` would be refused as "anything else". The write-back section says a point list is "live" and `to` commits it, which the table does not support.
- **Tile shape and placement.** The reference names the component objects (`{ kind: "control", control }`, `{ kind: "param", param }`, `{ kind: "view", draw }`) and `place: { tabWith }`. It does not say how a tile is written (its body key), nor how a tile is placed below the stage. The split directions exist but are not named. I wrote the tile body as a plain list. This is invented shape, not reference shape.
- **Where `to` lives.** The rule is "a Control whose name is not an Event input must have `to`". For `ratio` and `env` the `to` is per `each` entry, not on the declaration. The reference's `each` entries list `to?`, so I took that as valid, but the declaration-level rule reads as if the top-level declaration needs `to`.
- **Top-level kind keys for `each` Controls.** The kind keys (`min`, `max`, `value`) appear at the top level of `ratio` and `env` as well as per entry. The reference's U017 "missing key" check could fail a declaration that omits them at the top level. I included them to be safe.
- **Ref ids for literal arguments.** The reference says kit/define gives Ref ids to a call's lambdas. The task says an `operator` call has the id `<name>.operator`, and the address scheme follows from that. The reference does not confirm that a call whose arguments are literals gets a Ref id, so I relied on the task's statement.
- **Note delay.** "The least delay the kit can offer" is `latency: "direct"`. The reference says that is frame latency until a runner exists, so the requirement is not met yet.

## 4. What I guessed

- **Notes codes:** KeyA through KeyL (twelve consecutive codes in the alphabetical run A to L), not the home row (A S D F G H J K L plus Semicolon, Quote, and one more). "Twelve keys from KeyA upward" could also mean the home row.
- **Note index meaning:** index 0 is KeyA and index 11 is KeyL, and the Dialect maps index to pitch. The Program has no pitch field, so the pitch mapping is the Dialect's (not given here).
- **Velocity:** `velocity` is 0 to 1, keys send 1, and MIDI is velocity / 127, taken from the triggers adapter rules.
- **Vibrato:** default start value 0, linear, knob look. The task gave only the range.
- **Ratio range:** min 0.25, max 16, default 1. The task gave no range. A ratio outside it would be a U017 failure at lower.
- **Envelope default:** `[[0, 0], [1, 0]]` at the top level (only used if an operator has no env). Look `curve`.
- **Envelope placement:** I did not put the envelope in the tile, since the task names only the note control and the knobs. It reaches the generated `controls` view only.
- **Label texts:** "Notes", "Vibrato", "Ratio", "Envelope", and `<name> ratio` / `<name> envelope` per instance.

## 5. Gaps

- **Tile body and placement.** Needed: the key that holds a tile's components, and a way to say a tile sits under the stage. Smallest change: name the tile body key and one placement key (for example, the split direction names and the tile's position relative to a view).
- **Point-list write-back.** Needed: a row in the write-back table for a whole array literal (replace its span with the printed points, as a number row does), so that `points` with `to` can commit. Smallest change: one row for an `ArrayExpression` of numeric arrays.
- **Log curve at zero.** Needed: a log curve that accepts a minimum of 0 (or a stated taper), or a statement that `annotate.params` `curve: "log"` is not checked by U017. Smallest change: either of these.
- **Declaration-level `to` and kind keys on `each` Controls.** Needed: a one-line statement that a Control's `to` on each entries satisfies the "must have `to`" rule, and that `min`/`max`/`value` are required at the top level or are optional there.
- **Ref id for literal-argument calls.** Needed: confirmation that every builder call (not only calls with lambdas) has the Ref id `<instance>.<slot>`, so that `arg.mod.operator:1.ratio` reaches a literal.
- **Direct latency.** Needed: the direct runner, for `latency: "direct"` on notes to mean what the task asks.

## 6. Docs I could not reach

None. I read only `task.md`, `rules.md` and `reference.md` in this folder, and I found no link in them that points outside it. I did not open anything outside it.
