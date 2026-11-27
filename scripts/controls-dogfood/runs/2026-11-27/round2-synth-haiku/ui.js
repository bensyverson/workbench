// The synth's UI: Controls bound by name to the Dialect's inputs, the stage, the tiles, and annotations.

export const ui = {
  stage: { draw: "picture" },

  controls: {
    // Twelve keys on the home row (plus Enter as the twelfth), a MIDI keyboard's notes.
    // latency "direct" asks for the least delay; until a direct runner exists it travels the frame path.
    notes: {
      kind: "triggers",
      label: "Notes",
      count: 12,
      first: 0,
      keys: [
        "KeyA", "KeyS", "KeyD", "KeyF", "KeyG", "KeyH",
        "KeyJ", "KeyK", "KeyL", "Semicolon", "Quote", "Enter",
      ],
      midi: { notes: true },
      latency: "direct",
    },

    // Vibrato depth: runtime state, no source involved.
    vibrato: {
      kind: "number",
      label: "Vibrato",
      min: 0,
      max: 1,
      value: 0,
      curve: "linear",
      look: "knob",
    },

    // One ratio knob per operator. Part-local: no Event input, so `to` is required in every entry.
    // The release writes the new ratio into that operator's call (argument 1 of `<name>.operator`).
    ratio: {
      kind: "number",
      label: "Ratio",
      min: 0.25,
      max: 16,
      value: 1,
      curve: "log",
      look: "knob",
      each: (record) =>
        record.operators.map((op) => ({
          key: op.name,
          label: `${op.name} ratio`,
          value: op.ratio,
          to: `arg.${op.name}.operator:1.ratio`,
        })),
    },

    // One envelope point list per operator, live through the `env` input, written back on release.
    env: {
      kind: "points",
      label: "Envelope",
      max: 8,
      x: [0, 1],
      y: [0, 1],
      value: [[0, 0], [1, 0]],
      look: "curve",
      each: (record) =>
        record.operators.map((op) => ({
          key: op.name,
          label: `${op.name} envelope`,
          value: op.env,
          to: `arg.${op.name}.operator:1.env`,
        })),
    },
  },

  tiles: {
    synth: {
      title: "Synth",
      place: { splitBelow: "stage" },
      body: [
        {
          kind: "row",
          items: [
            { kind: "control", control: "notes" },
            { kind: "param", param: "volume" },
            { kind: "control", control: "vibrato" },
            { kind: "control", control: "ratio" },
          ],
        },
      ],
    },
    envelopes: {
      title: "Envelopes",
      place: { splitRight: "stage" },
      body: [{ kind: "control", control: "env" }],
    },
  },

  // Master volume is the Program's param `volume` (0 to 1). Its log curve is refused (min is 0),
  // so it is linear here.
  annotate: {
    params: {
      volume: { look: "knob", curve: "linear" },
    },
  },
};
