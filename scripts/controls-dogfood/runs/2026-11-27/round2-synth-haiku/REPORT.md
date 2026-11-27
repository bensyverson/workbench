# REPORT

## 1. Difficulty

**3 of 5.** Both files are written and import under Node. The hard parts are three requirements the reference cannot fully express: the log-feeling volume, the least-delay note path, and the per-operator write-back (see the sections below).

## 2. What I built

- **`dialect.js`**: `ports.in` has three Event inputs, and `ports.out.picture` is the Draw output.
  - `notes`: `Event<{ index: f64, on: bool, velocity: f64 }>`, which matches the `triggers` record exactly.
  - `vibrato`: `Event<{ value: f64 }>`.
  - `env`: `Event<{ key: str, value: list<vec2, 8> }>`, the keyed point-list seam (`key` is added for a keyed Control).
- **`ui.js`**: `export const ui = { stage, controls, tiles, annotate }`.
  - `stage: { draw: "picture" }`. The task's export shape did not list `stage`, but the task names it, so I included it.
  - `controls.notes`: `kind: "triggers"`, `count: 12`, `first: 0`, twelve key codes (KeyA, KeyS, KeyD, KeyF, KeyG, KeyH, KeyJ, KeyK, KeyL, Semicolon, Quote, Enter), `midi: { notes: true }`, `latency: "direct"`. It is bound to the `notes` input by name.
  - `controls.vibrato`: `kind: "number"`, 0 to 1, start 0, linear, knob. It is bound to the `vibrato` input and has no source write-back.
  - `controls.ratio`: `kind: "number"`, 0.25 to 16, log curve, knob. It has no Event input, so it is part-local, and it has an `each` over `record.operators`. Each entry gives `key`, `label`, `value` and `to: "arg.<name>.operator:1.ratio"`. The argument is the second one (index 1) of the call whose Ref id is `<name>.operator` (slot `once`, so no `#<n>`).
  - `controls.env`: `kind: "points"`, `max: 8`, `x: [0, 1]`, `y: [0, 1]`, curve look. It is bound to the `env` input, and each operator's entry has `to: "arg.<name>.operator:1.env"`.
  - `tiles.synth`: `place: { splitBelow: "stage" }`, with one `row` holding the notes control, the `volume` param, the vibrato control and the ratio control.
  - `tiles.envelopes`: `place: { splitRight: "stage" }`, holding the envelope control. The task did not ask for it, but without it the envelopes are reachable only through the generated `controls` view.
  - `annotate.params.volume`: `{ look: "knob", curve: "linear" }`.
- No other files were written. I checked that both modules import with `node -e "import(...)"`, and both load.

## 3. Where the docs misled me

- **Binding rule contradicts itself.** Requirement 1 (line 15) says a Control's name "is the name of one of the Dialect's Event inputs: that is the binding, and the only one." The kinds section and requirement 8 say a Control with no input and a `to` is part-local. I followed the second reading for `ratio`, which has no input and uses `to` in every entry.
- **`defineUI` shape.** The reference's snippet is `export const <ui> = defineUI(<builder>, { controls: … })`. The task asks for `export const ui = { controls, tiles, annotate }`. I followed the task. The reference never says what `<builder>` is, so I could not call `defineUI`.
- **`curve` and `look` optional or required.** Requirement 2 writes `curve: "linear" | "log"` and `look: "slider" | "knob" | "field"` as required. The kinds table marks both `curve?` and `look?`. I set both explicitly.
- **Ref id "tag".** The reference defines Ref ids as `<tag>.<slot>`, and does not say what the tag is. The task says the id is `<name>.operator`, the first argument. I took the task's word.
- **Required keys in an `each` declaration.** Requirement 1 says the declaration holds the required keys (`min`, `max`, `value`) so an `each` Control "looks the same" as one without it. So I gave `ratio` and `env` a declaration-level `value` (1, and `[[0, 0], [1, 0]]`) which every entry overrides. The text does not say whether that fallback is needed or ignored.
- **Log curve on the volume param.** The reference says a log knob needs `min` above 0 (U012), and the task says the Program's `volume` runs from 0. So the reference's own rules refuse the log curve the task asks for. I used linear. The reference presents this as a case the author handles with "a small floor as its `min`", but that means changing the Program's param, which is not in my files.
- **Least delay.** Requirement 12 says `latency: "direct"` is accepted now but routed through the frame path until a direct runner exists. The task asks for the least delay the kit can offer, which I cannot deliver. I declared `latency: "direct"` anyway, so the declaration is right when the runner exists.

## 4. What I guessed

- **Twelve keys.** The home row has nine letter keys (A to L), and the task asks for twelve. I added Semicolon, Quote and Enter. Enter is not on the home row.
- **Ratio range** 0.25 to 16 and `curve: "log"`. The Grammar's shape for the `operator` call's `ratio` argument is not in my files, so the range is a guess. B004 would refuse a value the Grammar rejects.
- **Envelope tile** placed `splitRight` of the stage, and the vibrato knob without MIDI.
- **Placing a keyed Control with `{ kind: "control", control: "ratio" }`** I assumed it places every instance (one knob per operator). The reference does not say.
- **Declaration-level `value`s** (see section 3).
- **The envelope value** is `op.env` as built, and the record's point list is the Dialect's own shape for it (up to 8 `[x, y]` pairs).

## 5. Gaps

- **Log volume.** Needed: a log knob for the Program's `volume` (0 to 1) without its `min` at 0. The smallest change: let `annotate.params.<name>` with `curve: "log"` take its own floor, or let U012 accept a floor the annotation gives.
- **Direct latency.** Needed: a runner that takes a `latency: "direct"` Control's records at its own rate. The smallest change: name that runner in the reference, or state that until it exists `latency` is a no-op for the page.
- **`defineUI` builder.** Needed: what `<builder>` is, so `ui.js` can be wrapped in `defineUI` as the reference shows. The smallest change: one line naming the builder argument, or an example.
- **Ratio bounds.** Needed: the Grammar's shape for `operator`'s `ratio` argument, to set the Control's `min` and `max` without guessing. The smallest change: a link or a line for the call's argument shapes.
- **Keyed `control` component.** Needed: whether `{ kind: "control", control }` places every instance of a keyed Control. The smallest change: a sentence saying so.
- **Ref id tag.** Needed: where the `tag` in `<tag>.<slot>` comes from, to confirm `<name>.operator`. The smallest change: say that the tag is the call's first argument, when it is a string.
- **Node module type.** I did not add a `package.json`. Node 26 loads both `.js` files with ESM syntax as written. I did not check older Node versions.

## 6. Docs I could not reach

- Under rule R1, the reference links to files I was not allowed to open, and I did not open any of them:
  - kit/define's README (Ref ids, the `<tag>.<slot>` definition, and the `once` slot rule);
  - kit/define's `D034` (the `files` entry shape);
  - kit/page's `writeback.js`, `createHistory` and `site.js`;
  - kit/compose's documentation;
  - the glossary's Argument address definition;
  - the codes table in each module's `codes.js`.
- I used only `task.md`, `rules.md` and `reference.md`, so the reference's statements about those files are unchecked.
