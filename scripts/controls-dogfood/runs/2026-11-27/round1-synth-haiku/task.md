# Your task: the controls of an FM synthesizer

You are writing, on paper, the controls of a small FM synthesizer for a kit whose controls API is described in `reference.md` (a draft: nothing in it runs). Use only what `reference.md` says.

**The synth.** Its Dialect (domain language) has a Program written as builder calls:

```js
synth.operator("mod", { ratio: 2, level: 0.5, env: [[0, 0], [0.1, 1], [0.5, 0.6], [1, 0]] });
synth.operator("car", { ratio: 1, level: 0.8, env: [[0, 0], [0.05, 1], [0.7, 0.5], [1, 0]] });
```

A Program has two to six operators, each named by its first argument. In the kit's Ref ids, an `operator` call's id is `<name>.operator` (the slot is `once`, so there is no `#<n>`), and its second argument is argument 1 (the first is the name, argument 0). The runtime's built record is `{ operators: [{ name, ratio, level, env }, ...] }`. The Program also declares one param, `volume` (a number from 0 to 1, starting at 0.7).

**The person plays:**

- **Notes**: one input of the Dialect, struck from the keyboard's home row (twelve keys from `KeyA` upward: pick the codes), from an on-screen keyboard, and from a MIDI keyboard. Each record says which note, whether it is on or off, and how hard it was struck (a MIDI velocity; keys send a fixed one). The synth must be played with the least delay the kit can offer.
- **Three knobs**: master volume (the param `volume`, log-feeling), each operator's frequency ratio (one knob per operator, so a Program with four operators shows four, and when the person lets go of one, the new ratio is written back into that operator's call in the source), and vibrato depth (state the runtime keeps, 0 to 1, no source involved).
- **An envelope**: each operator's `env`, edited as a point list (times 0 to 1 along x, levels 0 to 1 along y, at most 8 points), live.

**Write:**

1. `dialect.js`: `export const ports = { in: { ... }, out: { picture: { seam: "Draw", note: "..." } } };`, the Event inputs the synth needs, each with `seam` and `note`.
2. `ui.js`: `export const ui = { controls: { ... }, tiles: { ... }, annotate: { ... } };` with the controls above, and a tile that places the note control and the knobs together under the stage (the stage is `stage: { draw: "picture" }`).

Then write `REPORT.md` as `rules.md` says. Where `reference.md` is unclear, wrong, or cannot say what you need, that is the most useful thing you can report.

**Reading the documents.** Read long documents with your file-reading tool, by offset and limit, not with `cat`.
