import { defineDialect, exact } from "kit/define";

// A step sequencer: lanes of notes struck on the steps of a looping pattern. The worked example of the seams
// relay's docs (seams.md, runtime.md): every snippet there is cut from this package, the board package and the
// light-show glue, which test/example.test.js checks and runs.
export const drumsDialect = defineDialect({
  name: "drums",
  numberType: "f64",
  spaces: { pattern: { pure: true } },
  objects: { In: { label: "the inputs (inp)", members: {} } },
  globals: { inp: "In" },
  targets: { js: { accepts: "*", compare: exact() } },
  slots: {
    // how loud a note on this step is, 0 to 1
    accent: { params: ["f64"], returns: "f64", space: "pattern" },
  },
  state: { step: "f64", tempo: "f64", playing: "bool" },
  frames: {
    step: {
      dims: 1,
      note: "steps of the pattern, in order; step 0 is the first, and a step is one tick of the sequencer",
      extent: (record) => ({ min: [-0.5], max: [record.length - 0.5] }),
    },
  },
  ports: {
    out: {
      hit: { seam: "Event<{ lane: str, when: point1@step, loud: f64 }>", note: "one record per note struck this step: its lane's name, the step it falls on, and how loud it is, 0 to 1" },
      tempo: { seam: "f64@step/s", from: "tempo", note: "how fast the pattern plays, in steps per second" },
      playing: { seam: "bool", from: "playing", note: "false while muted" },
    },
    in: {
      mute: { seam: "bool", default: false, note: "while true, no note is struck" },
    },
  },
  inputs: { object: "In", name: "inp" },
  text: (s) => `step ${s.step} at ${s.tempo} steps/s${s.playing ? "" : " (muted)"}`,
});
