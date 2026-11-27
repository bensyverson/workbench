# The hand checks, per leg

Each leg's hand-in is checked by the draft's rules (`project/2026-11-27-controls-draft.md`). `check.js` runs the ones marked **[script]**; the rest are read by hand, and the findings doc records each result. A code names the draft's diagnostic the rule would raise.

## Every leg

- C1 **[script]** Each Control name is an Event input of the Dialect, or the Control has `to` (U015).
- C2 **[script]** Each Control's kind exists and has only its kind's keys, with the required ones (U017).
- C3 **[script]** The record the kind makes fits the input's seam: fields, types, enum options, list lengths, and `key` for an `each` Control (U016).
- C4 **[script]** Ranges: `min` below `max`, `value` inside, `curve: "log"` with `min` above 0, `perFrame` a whole number of at least 1, `latency` only `"direct"` (U017).
- C5 **[script]** Key codes match `KeyboardEvent.code`'s form; MIDI numbers are 0..127; `keys` of a trigger set do not outnumber `count`.
- C6 **[script]** Tiles are `{ title?, place: { <one direction>: <view or tile> }, body: [...] }`; components name declared Controls and actions; `view` names a Draw output (U014, U020, U003).
- C7 **[script]** No retired mechanism (`inputs`, `emits`, `role`, `pad` as a place).
- C8 By hand: nothing in the hand-in is a key, kind, option or code the reference does not list (R2), and every Gap names a real need.
- C9 By hand: the REPORT has the six sections of `rules.md` in order.

## game (Sonnet)

- G1 **[script]** The pad and the two buttons are Controls bound by name; the pad's `grid` names only its own buttons, once each.
- G2 By hand: the pad and the two buttons are separate Controls (the task says they "sit beside the pad"), or the report says why they are one.
- G3 By hand: `keys` has arrows and WASD for the four directions, and two other codes for the buttons, with no code on two buttons; `gamepad` names the directions.
- G4 By hand: `perFrame` is left alone, or raised for a stated reason (the draft says it counts records).
- G5 **[script]** `preset-lines.js` calls `examplePreset` with `ui` and no explicit wires.
- G6 **[script]** `glue-lines.js` wires `page.out.<control>` to an input of the same name for every Control that has an input, `score`'s `reset` included. By hand: it shows both parts' pictures.

## synth (Haiku)

- S1 **[script]** One `triggers` Control for notes, with `count`, `keys`, `midi: { notes: true }` and `latency: "direct"`, on an input of the seam `Event<{ index: f64, on: bool, velocity: f64 }>` or one that takes less of it.
- S2 **[script]** Per-operator Controls use `each`, a unique string `key` per instance, and `to` in the form `arg.<name>.operator:1.<key>` that reaches a real argument of the sample Program (H011 otherwise).
- S3 **[script]** The envelope is a `points` Control (`max` at most 8, `x` and `y` from 0 to 1).
- S4 By hand: the volume is the param, annotated (`look`, `curve`), with a legal log curve (U012: log needs a minimum above 0).
- S5 By hand: the vibrato depth has an input and no `to`.
- S6 By hand: the on-screen keyboard and MIDI are one Control's adapters (no second note Control), and a tile places the note control and the knobs.

## lens (Haiku)

- L1 **[script]** The Grip is `kind: "length"` with `axis`, `at` and `to` lambdas; `at` gives a point and `to` gives a target string that reaches the radius argument of the sample item (L003, H011).
- L2 **[script]** The Grip has no keys of its own beyond the list (U018), and `stage.draw` names a Draw output.
- L3 **[script]** The text entry is a `text` Control on an input whose seam takes `{ value: str }`.
- L4 **[script]** The picker is a `pick` over a declared file, with `key`, `show` and `carry` columns, and its input takes what it carries (U016, U017).
- L5 **[script]** Two tabs: a tile placed `tabWith` the stage, holding a `view` of the other Draw output.
- L6 By hand: the radius range (5 to 80) is not invented as a Grip key; the report says where it lives.
