import { defineDialect, exact, list } from "kit/define";

// A scoreboard's strip of lamps that light up and fade. The other half of the seams docs' worked example.
export const boardDialect = defineDialect({
  name: "board",
  numberType: "f64",
  spaces: { lamp: { instance: "Lamp" } },
  objects: {
    Lamp: { label: "a lamp (l)", members: { index: "f64", level: { value: "f64", write: true } } },
    In: { label: "the inputs (inp)", members: {} },
  },
  globals: { inp: "In" },
  targets: { js: { accepts: "*", compare: exact() } },
  slots: {
    // called once per flash record, with the lamp it lands on; may change that lamp's level
    glow: { params: ["Lamp"], returns: "void", space: "lamp", body: "block", may: ["write Lamp"] },
  },
  state: { lamps: "f64", lit: "f64", shift: "f64", levels: list("f64", 256) },
  frames: {
    lamp: {
      dims: 1,
      note: "lamps from left to right; lamp 0's center is at 0, lamp 1's at 1",
      extent: (record) => ({ min: [-0.5], max: [record.lamps - 0.5] }),
    },
  },
  ports: {
    in: {
      flash: {
        seam: "Event<{ pos: point1@lamp, strength: f64 }>",
        note: "lights the lamp nearest pos; glow lambdas read the record as hit, and strength is 0 to 1",
        delivery: "reliable",
        record: { name: "hit", slots: ["glow"] },
      },
      drift: { seam: "f64@lamp/s", default: 0, note: "how fast the lit pattern scrolls right, in lamps per second" },
      fade: { seam: "f64@s", default: 0.5, note: "how long a lit lamp takes to go dark" },
    },
    out: {
      full: { seam: "bool", from: (s) => s.lit === s.lamps, note: "every lamp is lit" },
    },
  },
  inputs: { object: "In", name: "inp" },
  text: (s) => s.levels.map((v) => (v > 0.5 ? "#" : v > 0 ? "+" : ".")).join(""),
});
