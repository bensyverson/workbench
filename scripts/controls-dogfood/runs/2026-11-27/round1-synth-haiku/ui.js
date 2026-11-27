// UI for the FM synth: controls, the tile under the stage, and annotations.
export const ui = {
  stage: { draw: "picture" },

  controls: {
    // Notes: twelve keys, KeyA..KeyL, each one a note (index 0..11).
    notes: {
      kind: "triggers",
      label: "Notes",
      count: 12,
      keys: ["KeyA", "KeyB", "KeyC", "KeyD", "KeyE", "KeyF", "KeyG", "KeyH", "KeyI", "KeyJ", "KeyK", "KeyL"],
      midi: { notes: true },
      latency: "direct",
    },

    // Vibrato depth: state the runtime keeps; no source involved.
    vibrato: {
      kind: "number",
      label: "Vibrato",
      min: 0,
      max: 1,
      value: 0,
      curve: "linear",
      look: "knob",
    },

    // One ratio knob per operator; a release writes the literal into that operator's call.
    ratio: {
      kind: "number",
      label: "Ratio",
      min: 0.25,
      max: 16,
      value: 1,
      curve: "linear",
      look: "knob",
      each: (record) =>
        record.operators.map((op) => ({
          key: op.name,
          label: `${op.name} ratio`,
          value: op.ratio,
          to: `arg.${op.name}.operator:1.ratio`,
        })),
    },

    // One envelope per operator, as a point list; a release writes the literal into that operator's call.
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

  // The note control and the knobs together, placed under the stage.
  tiles: {
    play: [
      { kind: "control", control: "notes" },
      { kind: "param", param: "volume" },
      { kind: "control", control: "vibrato" },
      { kind: "control", control: "ratio" },
    ],
  },

  annotate: {
    params: {
      volume: { look: "knob", curve: "log" },
    },
  },
};
